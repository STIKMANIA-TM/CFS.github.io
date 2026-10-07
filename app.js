const STORAGE_KEY = "stikmania_finanzas_stock_v1";

const DEFAULT_DB = {
  settings: {
    currencyCode: "USD",
    currencySymbol: "$",
    autoBackup: true,
    defaultMargin: 60,
    defaultStickersPerSheet: 4,

    paymentMethods: [
      "Efectivo",
      "Transferencia",
      "Tarjeta Tropical",
      "Tarjeta Clásica",
      "Saldo Móvil"
    ],

    pillars: [
      "Inversión",
      "Comida",
      "Ahorro"
    ],

    businessLines: [
      "General",
      "Web",
      "Venta de stickers"
    ],

    distribution: {
      "Inversión": 40,
      "Comida": 30,
      "Ahorro": 30
    }
  },

  materials: [
    {
      id: "vinyl",
      name: "Vinilo",
      sheetsPerPack: 20,
      minStock: 10,
      currentStock: 40,
      avgCostPerSheet: 0.6,
      lastPurchaseCostPerPack: 12,
      lastPurchaseDate: null
    },
    {
      id: "photo_paper",
      name: "Papel Fotográfico Adhesivo",
      sheetsPerPack: 20,
      minStock: 10,
      currentStock: 20,
      avgCostPerSheet: 0.5,
      lastPurchaseCostPerPack: 10,
      lastPurchaseDate: null
    }
  ],

  movements: [],
  inventoryMovements: []
};

let db;

const $ = (id) => document.getElementById(id);

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    db = clone(DEFAULT_DB);
    return;
  }
  try {
    db = JSON.parse(raw);
    normalizeDB();
  } catch (err) {
    db = clone(DEFAULT_DB);
  }
}

function normalizeDB() {
  if (!db.settings) db.settings = clone(DEFAULT_DB.settings);
  if (!db.movements) db.movements = [];
  if (!db.materials) db.materials = clone(DEFAULT_DB.materials);
  if (!db.inventoryMovements) db.inventoryMovements = [];

  if (!db.settings.currencyCode) db.settings.currencyCode = "USD";
  if (!db.settings.currencySymbol) db.settings.currencySymbol = "$";
  if (typeof db.settings.autoBackup === "undefined") db.settings.autoBackup = true;
  if (typeof db.settings.defaultMargin === "undefined") db.settings.defaultMargin = 60;
  if (typeof db.settings.defaultStickersPerSheet === "undefined") db.settings.defaultStickersPerSheet = 4;

  if (!Array.isArray(db.settings.paymentMethods)) {
    db.settings.paymentMethods = clone(DEFAULT_DB.settings.paymentMethods);
  }
  if (!Array.isArray(db.settings.pillars)) {
    db.settings.pillars = clone(DEFAULT_DB.settings.pillars);
  }
  if (!Array.isArray(db.settings.businessLines)) {
    db.settings.businessLines = clone(DEFAULT_DB.settings.businessLines);
  }
  if (!db.settings.distribution || typeof db.settings.distribution !== "object") {
    db.settings.distribution = clone(DEFAULT_DB.settings.distribution);
  }

  db.settings.pillars.forEach((pillar) => {
    if (typeof db.settings.distribution[pillar] === "undefined") {
      db.settings.distribution[pillar] = 0;
    }
  });

  Object.keys(db.settings.distribution).forEach((key) => {
    if (!db.settings.pillars.includes(key)) {
      delete db.settings.distribution[key];
    }
  });
}

function saveDB() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function fmt(n) {
  return db.settings.currencySymbol + (Number(n) || 0).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function uid() {
  return String(Date.now()) + "_" + Math.floor(Math.random() * 99999);
}

function esc(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function switchView(view) {
  document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((el) => el.classList.remove("active"));
  $(view).classList.add("active");
  document.querySelector('.tab[data-view="' + view + '"]').classList.add("active");
}

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function inPeriod(dateStr, period) {
  if (period === "all") return true;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();

  if (period === "today") return dateStr === todayISO();

  if (period === "week") {
    const start = getStartOfWeek(now);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  }

  if (period === "month") {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }

  if (period === "year") {
    return d.getFullYear() === now.getFullYear();
  }

  return true;
}

function getFilteredMovements() {
  const period = $("periodFilter").value;
  return db.movements
    .filter((m) => inPeriod(m.date, period))
    .sort((a, b) => b.createdAt - a.createdAt);
}

function getMaterial(id) {
  return db.materials.find((m) => m.id === id);
}

function buildAllocations(amount) {
  const alloc = {};
  const dist = db.settings.distribution || {};
  let sum = 0;

  db.settings.pillars.forEach((pillar) => {
    sum += Number(dist[pillar] || 0);
  });

  if (sum <= 0) {
    alloc[db.settings.pillars[0]] = round2(amount);
    return alloc;
  }

  db.settings.pillars.forEach((pillar) => {
    const pct = Number(dist[pillar] || 0);
    if (pct > 0) {
      alloc[pillar] = round2(amount * pct / sum);
    }
  });

  let allocated = Object.values(alloc).reduce((a, b) => round2(a + b), 0);
  let diff = round2(amount - allocated);

  if (diff !== 0) {
    const keys = Object.keys(alloc);
    const first = keys.length ? keys[0] : db.settings.pillars[0];
    alloc[first] = round2((alloc[first] || 0) + diff);
  }

  return alloc;
}

function downloadBackup(prefix) {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  const ts = new Date()
    .toISOString()
    .replaceAll(":", "")
    .replaceAll("T", "_")
    .split(".")[0];
  a.href = URL.createObjectURL(blob);
  a.download = "stikmania_backup_" + prefix + "_" + ts + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function backupIfAuto() {
  if (db.settings.autoBackup) {
    downloadBackup("auto");
  }
}

function renderAll() {
  renderMethodBalances();
  renderCapital();
  renderProfit();
  renderLineSummary();
  renderStockAlerts();
  renderMovements();
  renderInventorySummary();
  renderMaterialsList();
  renderInventoryMovements();
  renderSettings();
  renderMaterialSelects();
  renderCalcMaterialSelect();
}

function renderMethodBalances() {
  const filtered = getFilteredMovements();
  const methodsSet = new Set(db.settings.paymentMethods);
  filtered.forEach((m) => methodsSet.add(m.method));

  const balances = {};
  methodsSet.forEach((method) => {
    balances[method] = 0;
  });

  let total = 0;

  filtered.forEach((m) => {
    const delta = m.type === "income" ? Number(m.amount) : -Number(m.amount);
    balances[m.method] = round2((balances[m.method] || 0) + delta);
    total = round2(total + delta);
  });

  let html =
    '<div class="card kpi"><span class="label">Saldo total</span><strong>' +
    fmt(total) +
    "</strong></div>";

  Object.keys(balances).forEach((method) => {
    html +=
      '<div class="card kpi"><span class="label">' +
      esc(method) +
      "</span><strong>" +
      fmt(balances[method]) +
      "</strong></div>";
  });

  $("methodBalances").innerHTML = html;
}

function renderCapital() {
  const filtered = getFilteredMovements();
  const capital = {};

  db.settings.pillars.forEach((pillar) => {
    capital[pillar] = 0;
  });

  filtered.forEach((m) => {
    if (m.type === "income" && m.allocations) {
      Object.entries(m.allocations).forEach(([pillar, value]) => {
        if (!(pillar in capital)) capital[pillar] = 0;
        capital[pillar] = round2(capital[pillar] + Number(value || 0));
      });
    }

    if (m.type === "expense" && m.pillar) {
      if (!(m.pillar in capital)) capital[m.pillar] = 0;
      capital[m.pillar] = round2(capital[m.pillar] - Number(m.amount || 0));
    }
  });

  let html = "";
  Object.entries(capital).forEach(([pillar, value]) => {
    html +=
      '<div class="stock-line"><span>' +
      esc(pillar) +
      "</span><strong>" +
      fmt(value) +
      "</strong></div>";
  });

  $("capitalList").innerHTML = html || '<div class="muted">Sin pilares.</div>';
}

function renderProfit() {
  const filtered = getFilteredMovements().filter((m) => m.type === "income");
  let gross = 0;
  let cost = 0;

  filtered.forEach((m) => {
    gross = round2(gross + Number(m.amount || 0));
    cost = round2(cost + Number(m.cost || 0));
  });

  const net = round2(gross - cost);

  $("profitGross").textContent = fmt(gross);
  $("profitCost").textContent = fmt(cost);
  $("profitNet").textContent = fmt(net);
  $("profitNet").style.color = net >= 0 ? "var(--success)" : "var(--danger)";
}

function renderLineSummary() {
  const filtered = getFilteredMovements().filter((m) => m.type === "income");
  const lines = {};

  filtered.forEach((m) => {
    const line = m.line || "General";
    lines[line] = round2((lines[line] || 0) + Number(m.amount || 0));
  });

  let html = "";
  Object.entries(lines)
    .sort((a, b) => b[1] - a[1])
    .forEach(([line, amount]) => {
      html +=
        '<div class="stock-line"><span>' +
        esc(line) +
        "</span><strong>" +
        fmt(amount) +
        "</strong></div>";
    });

  $("lineSummary").innerHTML =
    html || '<div class="muted">Sin ingresos en este periodo.</div>';
}

function renderStockAlerts() {
  let html = "";

  db.materials.forEach((mat) => {
    if (mat.currentStock <= mat.minStock * 0.5) {
      html +=
        '<div class="alert danger">⚠️ Stock crítico: ' +
        esc(mat.name) +
        " — quedan " +
        mat.currentStock +
        " hojas (mínimo: " +
        mat.minStock +
        ")</div>";
    } else if (mat.currentStock <= mat.minStock) {
      html +=
        '<div class="alert warning">⚠️ Stock bajo: ' +
        esc(mat.name) +
        " — quedan " +
        mat.currentStock +
        " hojas (mínimo: " +
        mat.minStock +
        ")</div>";
    }
  });

  $("stockAlerts").innerHTML = html || '<div class="alert info">Sin alertas de stock.</div>';
}

function renderMovements() {
  const filtered = getFilteredMovements();

  if (!filtered.length) {
    $("movementsList").innerHTML =
      '<div class="muted">No hay movimientos en este periodo.</div>';
    return;
  }

  let html = "";

  filtered.forEach((m) => {
    const typeLabel = m.type === "income" ? "Ingreso" : "Gasto";
    const title =
      m.type === "income"
        ? "Ingreso STIKMANIA · " + esc(m.line || "General")
        : "Gasto · " + esc(m.pillar || "-");

    const amountClass = m.type === "income" ? "green" : "red";

    const costLine =
      m.type === "income" && Number(m.cost || 0) > 0
        ? "Costo: " + fmt(m.cost)
        : "";

    const consumeLine = m.consumedMaterial
      ? "Consumió: " + m.consumedSheets + " hojas de " + esc(m.consumedMaterialName || "")
      : "";

    const metaLines = [
      "Fecha: " + esc(m.date),
      "Cliente: " + esc(m.client || "-"),
      costLine,
      consumeLine,
      "Notas: " + esc(m.notes)
    ].filter(Boolean);

    html += `
      <div class="op-card">
        <div class="op-top">
          <div>
            <div class="op-title">${title}</div>
            <div>
              <span class="badge gray">${typeLabel}</span>
              <span class="badge blue">${esc(m.method)}</span>
            </div>
          </div>
          <strong style="color: var(--${amountClass})">
            ${m.type === "income" ? "+" : "-"}${fmt(m.amount)}
          </strong>
        </div>
        <div class="op-meta">${metaLines.join("\n")}</div>
        <div class="op-actions">
          <button class="btn danger" data-action="deleteMovement" data-id="${m.id}">
            Eliminar
          </button>
        </div>
      </div>
    `;
  });

  $("movementsList").innerHTML = html;
}

function renderInventorySummary() {
  let totalValue = 0;
  let totalSheets = 0;

  db.materials.forEach((mat) => {
    totalValue += mat.currentStock * mat.avgCostPerSheet;
    totalSheets += mat.currentStock;
  });

  totalValue = round2(totalValue);

  const html = `
    <div class="card kpi">
      <span class="label">Valor del inventario</span>
      <strong>${fmt(totalValue)}</strong>
    </div>
    <div class="card kpi">
      <span class="label">Total de hojas</span>
      <strong>${totalSheets}</strong>
    </div>
    <div class="card kpi">
      <span class="label">Materiales</span>
      <strong>${db.materials.length}</strong>
    </div>
  `;

  $("inventorySummary").innerHTML = html;
}

function renderMaterialsList() {
  let html = "";

  db.materials.forEach((mat) => {
    let stockClass = "";
    if (mat.currentStock <= mat.minStock * 0.5) {
      stockClass = "critical-stock";
    } else if (mat.currentStock <= mat.minStock) {
      stockClass = "low-stock";
    }

    const costPerPack = round2(mat.avgCostPerSheet * mat.sheetsPerPack);
    const margin = db.settings.defaultMargin;
    const suggestedPackPrice = round2(costPerPack / (1 - margin / 100));

    html += `
      <div class="material-card ${stockClass}">
        <div class="material-header">
          <span class="material-name">${esc(mat.name)}</span>
          <div class="actions">
            <button class="btn" data-action="editMaterial" data-id="${mat.id}">Editar</button>
            <button class="btn danger" data-action="deleteMaterial" data-id="${mat.id}">Borrar</button>
          </div>
        </div>
        <div class="material-stats">
          <div class="material-stat">
            <div class="label">Stock actual</div>
            <div class="value">${mat.currentStock} hojas</div>
          </div>
          <div class="material-stat">
            <div class="label">Stock mínimo</div>
            <div class="value">${mat.minStock} hojas</div>
          </div>
          <div class="material-stat">
            <div class="label">Costo por hoja</div>
            <div class="value">${fmt(mat.avgCostPerSheet)}</div>
          </div>
          <div class="material-stat">
            <div class="label">Costo por paquete</div>
            <div class="value">${fmt(costPerPack)}</div>
          </div>
          <div class="material-stat">
            <div class="label">Precio sugerido/paquete</div>
            <div class="value">${fmt(suggestedPackPrice)}</div>
          </div>
          <div class="material-stat">
            <div class="label">Hojas por paquete</div>
            <div class="value">${mat.sheetsPerPack}</div>
          </div>
        </div>
      </div>
    `;
  });

  html += `
    <div class="btn-row">
      <button class="btn primary" id="btnAddMaterial">Agregar material</button>
    </div>
  `;

  $("materialsList").innerHTML = html;

  const addBtn = $("btnAddMaterial");
  if (addBtn) {
    addBtn.addEventListener("click", openMaterialModal);
  }
}

function renderInventoryMovements() {
  const sorted = [...db.inventoryMovements].sort((a, b) => b.createdAt - a.createdAt);

  if (!sorted.length) {
    $("inventoryMovementsList").innerHTML =
      '<div class="muted">Sin movimientos de inventario.</div>';
    return;
  }

  let html = "";

  sorted.forEach((mov) => {
    const mat = getMaterial(mov.materialId);
    const matName = mat ? mat.name : "Material eliminado";

    const typeLabels = {
      purchase: "Compra",
      consumption: "Consumo",
      waste: "Merma",
      adjustment: "Ajuste"
    };

    const typeLabel = typeLabels[mov.type] || mov.type;
    const sign = mov.type === "purchase" ? "+" : "-";
    const badgeClass = mov.type === "purchase" ? "green" : "red";

    const costLine =
      mov.type === "purchase"
        ? "Costo: " + fmt(mov.costPerPack) + " × " + mov.packs + " paquetes = " + fmt(mov.costPerPack * mov.packs)
        : "";

    const metaLines = [
      "Fecha: " + esc(mov.date),
      costLine,
      mov.supplier ? "Proveedor: " + esc(mov.supplier) : "",
      "Notas: " + esc(mov.notes)
    ].filter(Boolean);

    html += `
      <div class="op-card">
        <div class="op-top">
          <div>
            <div class="op-title">${typeLabel} · ${esc(matName)}</div>
            <div>
              <span class="badge ${badgeClass}">${typeLabel}</span>
              <span class="badge gray">${sign}${Math.abs(mov.sheets)} hojas</span>
            </div>
          </div>
        </div>
        <div class="op-meta">${metaLines.join("\n")}</div>
        <div class="op-actions">
          <button class="btn danger" data-action="deleteInventoryMovement" data-id="${mov.id}">
            Eliminar
          </button>
        </div>
      </div>
    `;
  });

  $("inventoryMovementsList").innerHTML = html;
}

function renderSettings() {
  $("currencyCode").value = db.settings.currencyCode;
  $("currencySymbol").value = db.settings.currencySymbol;
  $("autoBackup").checked = !!db.settings.autoBackup;
  $("defaultMargin").value = db.settings.defaultMargin;
  $("defaultStickersPerSheet").value = db.settings.defaultStickersPerSheet;

  $("paymentMethodsList").innerHTML =
    db.settings.paymentMethods
      .map((method) => {
        return `
          <div class="list-item">
            <div class="info">${esc(method)}</div>
            <div class="actions">
              <button class="btn danger" data-action="deleteMethod" data-value="${encodeURIComponent(method)}">
                Borrar
              </button>
            </div>
          </div>
        `;
      })
      .join("") || '<div class="muted">Sin métodos de pago.</div>';

  $("pillarsList").innerHTML =
    db.settings.pillars
      .map((pillar) => {
        return `
          <div class="list-item">
            <div class="info">${esc(pillar)}</div>
            <div class="actions">
              <button class="btn" data-action="renamePillar" data-value="${encodeURIComponent(pillar)}">
                Renombrar
              </button>
              <button class="btn danger" data-action="deletePillar" data-value="${encodeURIComponent(pillar)}">
                Borrar
              </button>
            </div>
          </div>
        `;
      })
      .join("") || '<div class="muted">Sin pilares.</div>';

  $("businessLinesList").innerHTML =
    db.settings.businessLines
      .map((line) => {
        return `
          <div class="list-item">
            <div class="info">${esc(line)}</div>
            <div class="actions">
              <button class="btn danger" data-action="deleteLine" data-value="${encodeURIComponent(line)}">
                Borrar
              </button>
            </div>
          </div>
        `;
      })
      .join("") || '<div class="muted">Sin líneas.</div>';

  $("distributionInputs").innerHTML = db.settings.pillars
    .map((pillar, idx) => {
      return `
        <div class="form-group">
          <label>${esc(pillar)} (%)</label>
          <input type="number" id="dist_${idx}" min="0" max="100" step="0.01"
            value="${Number(db.settings.distribution[pillar] || 0)}">
        </div>
      `;
    })
    .join("");
}

function renderMaterialSelects() {
  const options = db.materials
    .map((mat) => '<option value="' + mat.id + '">' + esc(mat.name) + "</option>")
    .join("");

  $("pMaterial").innerHTML = options;
  $("wMaterial").innerHTML = options;
  $("mConsumeMaterialId").innerHTML = options;
}

function renderCalcMaterialSelect() {
  const options = db.materials
    .map((mat) => '<option value="' + mat.id + '">' + esc(mat.name) + "</option>")
    .join("");

  $("calcMaterial").innerHTML = options;
  $("calcStickersPerSheet").value = db.settings.defaultStickersPerSheet;
  $("calcMargin").value = db.settings.defaultMargin;
}

function renderModalSelects() {
  $("mMethod").innerHTML = db.settings.paymentMethods
    .map((method) => '<option value="' + esc(method) + '">' + esc(method) + "</option>")
    .join("");

  $("mLine").innerHTML = db.settings.businessLines
    .map((line) => '<option value="' + esc(line) + '">' + esc(line) + "</option>")
    .join("");

  $("mPillar").innerHTML = db.settings.pillars
    .map((pillar) => '<option value="' + esc(pillar) + '">' + esc(pillar) + "</option>")
    .join("");
}

function updateModalVisibility() {
  const type = $("mType").value;

  if (type === "income") {
    $("modalTitle").textContent = "Nuevo ingreso STIKMANIA";
    $("mLineGroup").classList.remove("hidden");
    $("mPillarGroup").classList.add("hidden");
    $("mMaterialGroup").classList.remove("hidden");
  } else {
    $("modalTitle").textContent = "Nuevo gasto";
    $("mLineGroup").classList.add("hidden");
    $("mPillarGroup").classList.remove("hidden");
    $("mMaterialGroup").classList.add("hidden");
    $("mConsumeDetails").classList.add("hidden");
    $("mConsumeMaterial").checked = false;
  }

  updateMovementPreview();
}

function updateMovementPreview() {
  const type = $("mType").value;
  const amount = Number($("mAmount").value) || 0;

  if (type === "income") {
    const alloc = buildAllocations(amount);
    let text = "Distribución automática del ingreso STIKMANIA:\n";

    Object.entries(alloc).forEach(([pillar, value]) => {
      text += pillar + ": " + fmt(value) + "\n";
    });

    if ($("mConsumeMaterial").checked) {
      const matId = $("mConsumeMaterialId").value;
      const sheets = Number($("mConsumeSheets").value) || 0;
      const mat = getMaterial(matId);

      if (mat && sheets > 0) {
        const cost = round2(sheets * mat.avgCostPerSheet);
        text += "\nConsumirá " + sheets + " hojas de " + mat.name + " (costo: " + fmt(cost) + ")";

        if (sheets > mat.currentStock) {
          text += "\n⚠️ Stock insuficiente. Disponible: " + mat.currentStock + " hojas";
        }
      }
    }

    $("movementPreview").textContent = text;
  } else {
    $("movementPreview").textContent = "El gasto se asignará al pilar seleccionado.";
  }
}

function updatePurchasePreview() {
  const matId = $("pMaterial").value;
  const packs = Number($("pPacks").value) || 0;
  const costPerPack = Number($("pCostPerPack").value) || 0;
  const mat = getMaterial(matId);

  if (!mat || packs <= 0 || costPerPack <= 0) {
    $("purchasePreview").textContent = "Completa los datos para ver el resumen.";
    return;
  }

  const totalSheets = packs * mat.sheetsPerPack;
  const totalCost = round2(packs * costPerPack);
  const costPerSheet = round2(costPerPack / mat.sheetsPerPack);

  const currentStockValue = mat.currentStock * mat.avgCostPerSheet;
  const newStockValue = totalCost;
  const newTotalSheets = mat.currentStock + totalSheets;
  const newAvgCostPerSheet = newTotalSheets > 0
    ? round2((currentStockValue + newStockValue) / newTotalSheets)
    : 0;

  let text = "Resumen de compra:\n";
  text += "Total hojas: " + totalSheets + "\n";
  text += "Costo total: " + fmt(totalCost) + "\n";
  text += "Costo por hoja: " + fmt(costPerSheet) + "\n";
  text += "\nStock después de la compra:\n";
  text += "Hojas: " + newTotalSheets + "\n";
  text += "Nuevo costo promedio por hoja: " + fmt(newAvgCostPerSheet);

  $("purchasePreview").textContent = text;
}

function openMovementModal(type) {
  renderModalSelects();
  $("mType").value = type;
  $("mDate").value = todayISO();
  $("mAmount").value = "";
  $("mCost").value = "";
  $("mClient").value = "";
  $("mNotes").value = "";
  $("mConsumeMaterial").checked = false;
  $("mConsumeDetails").classList.add("hidden");
  $("mConsumeSheets").value = "";

  if (db.settings.paymentMethods.length) {
    $("mMethod").value = db.settings.paymentMethods[0];
  }
  if (db.settings.businessLines.length) {
    $("mLine").value = db.settings.businessLines[0];
  }
  if (db.settings.pillars.length) {
    $("mPillar").value = db.settings.pillars[0];
  }

  updateModalVisibility();
  $("movementModal").classList.add("active");
}

function closeMovementModal() {
  $("movementModal").classList.remove("active");
}

function openPurchaseModal() {
  renderMaterialSelects();

  $("pDate").value = todayISO();
  $("pPacks").value = "1";
  $("pCostPerPack").value = "";
  $("pSupplier").value = "";
  $("pNotes").value = "";

  if (db.settings.paymentMethods.length) {
    $("pMethod").innerHTML = db.settings.paymentMethods
      .map((method) => '<option value="' + esc(method) + '">' + esc(method) + "</option>")
      .join("");
  }

  updatePurchasePreview();
  $("purchaseModal").classList.add("active");
}

function closePurchaseModal() {
  $("purchaseModal").classList.remove("active");
}

function openWasteModal() {
  renderMaterialSelects();
  $("wDate").value = todayISO();
  $("wSheets").value = "";
  $("wNotes").value = "";
  $("wasteModal").classList.add("active");
}

function closeWasteModal() {
  $("wasteModal").classList.remove("active");
}

function openMaterialModal() {
  $("materialModalTitle").textContent = "Agregar material";
  $("matName").value = "";
  $("matSheetsPerPack").value = "20";
  $("matMinStock").value = "10";
  $("materialModal").classList.add("active");
  $("materialModal").dataset.editId = "";
}

function closeMaterialModal() {
  $("materialModal").classList.remove("active");
}

function saveMovement() {
  const type = $("mType").value;
  const date = $("mDate").value;
  const method = $("mMethod").value;
  const amount = Number($("mAmount").value) || 0;
  const cost = Number($("mCost").value) || 0;
  const client = $("mClient").value.trim();
  const notes = $("mNotes").value.trim();

  if (!date) return alert("Selecciona la fecha.");
  if (!method) return alert("Selecciona un método de pago.");
  if (amount <= 0) return alert("El monto debe ser mayor a 0.");
  if (!notes) return alert("Las notas son obligatorias.");

  const movement = {
    id: uid(),
    createdAt: Date.now(),
    type,
    date,
    method,
    amount: round2(amount),
    cost: round2(cost),
    client,
    notes,
    source: "STIKMANIA",
    line: null,
    pillar: null,
    allocations: null,
    consumedMaterial: null,
    consumedMaterialName: null,
    consumedSheets: 0
  };

  if (type === "income") {
    movement.line = $("mLine").value || "General";
    movement.allocations = buildAllocations(amount);

    if ($("mConsumeMaterial").checked) {
      const matId = $("mConsumeMaterialId").value;
      const sheets = Number($("mConsumeSheets").value) || 0;
      const mat = getMaterial(matId);

      if (mat && sheets > 0) {
        if (sheets > mat.currentStock) {
          return alert(
            "Stock insuficiente de " + mat.name + ".\nDisponible: " + mat.currentStock + " hojas\nNecesitas: " + sheets + " hojas"
          );
        }

        movement.consumedMaterial = matId;
        movement.consumedMaterialName = mat.name;
        movement.consumedSheets = sheets;
      }
    }
  } else {
    movement.pillar = $("mPillar").value;
    if (!movement.pillar) return alert("Selecciona un pilar.");
  }

  db.movements.push(movement);

  if (movement.consumedMaterial && movement.consumedSheets > 0) {
    const mat = getMaterial(movement.consumedMaterial);
    mat.currentStock = round2(mat.currentStock - movement.consumedSheets);

    db.inventoryMovements.push({
      id: uid(),
      createdAt: Date.now(),
      date,
      materialId: movement.consumedMaterial,
      type: "consumption",
      sheets: movement.consumedSheets,
      notes: "Consumo por venta: " + notes,
      linkedMovementId: movement.id
    });
  }

  saveDB();
  renderAll();
  closeMovementModal();
  backupIfAuto();
}

function savePurchase() {
  const date = $("pDate").value;
  const method = $("pMethod").value;
  const matId = $("pMaterial").value;
  const packs = Number($("pPacks").value) || 0;
  const costPerPack = Number($("pCostPerPack").value) || 0;
  const supplier = $("pSupplier").value.trim();
  const notes = $("pNotes").value.trim();

  if (!date) return alert("Selecciona la fecha.");
  if (!matId) return alert("Selecciona un material.");
  if (packs <= 0) return alert("La cantidad de paquetes debe ser mayor a 0.");
  if (costPerPack <= 0) return alert("El costo por paquete debe ser mayor a 0.");
  if (!notes) return alert("Las notas son obligatorias.");

  const mat = getMaterial(matId);
  if (!mat) return alert("Material no encontrado.");

  const totalSheets = packs * mat.sheetsPerPack;
  const totalCost = round2(packs * costPerPack);
  const costPerSheet = round2(costPerPack / mat.sheetsPerPack);

  const currentStockValue = mat.currentStock * mat.avgCostPerSheet;
  const newTotalSheets = mat.currentStock + totalSheets;
  const newAvgCostPerSheet = newTotalSheets > 0
    ? round2((currentStockValue + totalCost) / newTotalSheets)
    : 0;

  mat.currentStock = newTotalSheets;
  mat.avgCostPerSheet = newAvgCostPerSheet;
  mat.lastPurchaseCostPerPack = costPerPack;
  mat.lastPurchaseDate = date;

  const movement = {
    id: uid(),
    createdAt: Date.now(),
    type: "expense",
    date,
    method,
    amount: totalCost,
    cost: 0,
    client: supplier,
    notes: notes,
    source: null,
    line: null,
    pillar: null,
    allocations: null,
    consumedMaterial: null,
    consumedMaterialName: null,
    consumedSheets: 0,
    isMaterialPurchase: true
  };

  db.movements.push(movement);

  db.inventoryMovements.push({
    id: uid(),
    createdAt: Date.now(),
    date,
    materialId: matId,
    type: "purchase",
    sheets: totalSheets,
    packs,
    costPerPack,
    supplier,
    notes,
    linkedMovementId: movement.id
  });

  saveDB();
  renderAll();
  closePurchaseModal();
  backupIfAuto();
}

function saveWaste() {
  const date = $("wDate").value;
  const matId = $("wMaterial").value;
  const sheets = Number($("wSheets").value) || 0;
  const notes = $("wNotes").value.trim();

  if (!date) return alert("Selecciona la fecha.");
  if (!matId) return alert("Selecciona un material.");
  if (sheets <= 0) return alert("La cantidad de hojas debe ser mayor a 0.");
  if (!notes) return alert("Las notas son obligatorias.");

  const mat = getMaterial(matId);
  if (!mat) return alert("Material no encontrado.");

  if (sheets > mat.currentStock) {
    return alert(
      "No puedes descontar más hojas de las que hay en stock.\nDisponible: " + mat.currentStock + " hojas"
    );
  }

  mat.currentStock = round2(mat.currentStock - sheets);

  db.inventoryMovements.push({
    id: uid(),
    createdAt: Date.now(),
    date,
    materialId: matId,
    type: "waste",
    sheets,
    notes
  });

  saveDB();
  renderAll();
  closeWasteModal();
  backupIfAuto();
}

function saveMaterial() {
  const name = $("matName").value.trim();
  const sheetsPerPack = Number($("matSheetsPerPack").value) || 20;
  const minStock = Number($("matMinStock").value) || 10;

  if (!name) return alert("Escribe el nombre del material.");
  if (sheetsPerPack <= 0) return alert("Las hojas por paquete deben ser mayores a 0.");
  if (minStock < 0) return alert("El stock mínimo no puede ser negativo.");

  const editId = $("materialModal").dataset.editId;

  if (editId) {
    const mat = getMaterial(editId);
    if (!mat) return;

    mat.name = name;
    mat.sheetsPerPack = sheetsPerPack;
    mat.minStock = minStock;
  } else {
    db.materials.push({
      id: uid(),
      name,
      sheetsPerPack,
      minStock,
      currentStock: 0,
      avgCostPerSheet: 0,
      lastPurchaseCostPerPack: 0,
      lastPurchaseDate: null
    });
  }

  saveDB();
  renderAll();
  closeMaterialModal();
  backupIfAuto();
}

function editMaterial(id) {
  const mat = getMaterial(id);
  if (!mat) return;

  $("materialModalTitle").textContent = "Editar material";
  $("matName").value = mat.name;
  $("matSheetsPerPack").value = mat.sheetsPerPack;
  $("matMinStock").value = mat.minStock;
  $("materialModal").dataset.editId = id;
  $("materialModal").classList.add("active");
}

function deleteMaterial(id) {
  const mat = getMaterial(id);
  if (!mat) return;

  if (mat.currentStock > 0) {
    return alert("No puedes borrar un material con stock existente. Registra una merma primero.");
  }

  if (!confirm("¿Borrar el material '" + mat.name + "'?")) return;

  db.materials = db.materials.filter((m) => m.id !== id);
  saveDB();
  renderAll();
  backupIfAuto();
}

function deleteMovement(id) {
  if (!confirm("¿Eliminar este movimiento?")) return;

  const mov = db.movements.find((m) => m.id === id);
  if (!mov) return;

  if (mov.consumedMaterial && mov.consumedSheets > 0) {
    const mat = getMaterial(mov.consumedMaterial);
    if (mat) {
      mat.currentStock = round2(mat.currentStock + mov.consumedSheets);
    }
  }

  db.movements = db.movements.filter((m) => m.id !== id);
  db.inventoryMovements = db.inventoryMovements.filter((m) => m.linkedMovementId !== id);

  saveDB();
  renderAll();
  backupIfAuto();
}

function deleteInventoryMovement(id) {
  if (!confirm("¿Eliminar este movimiento de inventario? Esta acción NO revierte los cambios de stock.")) return;

  db.inventoryMovements = db.inventoryMovements.filter((m) => m.id !== id);
  saveDB();
  renderAll();
  backupIfAuto();
}

function calculatePrices() {
  const matId = $("calcMaterial").value;
  const stickersPerSheet = Number($("calcStickersPerSheet").value) || 1;
  const margin = Number($("calcMargin").value) || 0;

  const mat = getMaterial(matId);
  if (!mat) return;

  if (stickersPerSheet <= 0) return alert("Stickers por hoja debe ser mayor a 0.");
  if (margin < 0 || margin > 100) return alert("El margen debe estar entre 0 y 100.");

  const costPerSheet = mat.avgCostPerSheet;
  const costPerSticker = round2(costPerSheet / stickersPerSheet);
  const pricePerSticker = round2(costPerSticker / (1 - margin / 100));

  const costPerPack = round2(costPerSheet * mat.sheetsPerPack);
  const pricePerPack = round2(costPerPack / (1 - margin / 100));

  const html = `
    <div class="stock-line">
      <span>Costo por hoja</span>
      <strong>${fmt(costPerSheet)}</strong>
    </div>
    <div class="stock-line">
      <span>Costo por sticker</span>
      <strong>${fmt(costPerSticker)}</strong>
    </div>
    <div class="stock-line">
      <span>Precio sugerido por sticker</span>
      <strong style="color: var(--success)">${fmt(pricePerSticker)}</strong>
    </div>
    <div class="stock-line">
      <span>Costo por paquete (${mat.sheetsPerPack} hojas)</span>
      <strong>${fmt(costPerPack)}</strong>
    </div>
    <div class="stock-line">
      <span>Precio sugerido por paquete</span>
      <strong style="color: var(--success)">${fmt(pricePerPack)}</strong>
    </div>
    <div class="stock-line">
      <span>Ganancia por sticker</span>
      <strong>${fmt(round2(pricePerSticker - costPerSticker))}</strong>
    </div>
    <div class="stock-line">
      <span>Ganancia por paquete</span>
      <strong>${fmt(round2(pricePerPack - costPerPack))}</strong>
    </div>
  `;

  $("priceResults").innerHTML = html;
}

function addPaymentMethod() {
  const value = $("newMethod").value.trim();
  if (!value) return alert("Escribe un método de pago.");
  if (db.settings.paymentMethods.includes(value)) return alert("Ese método ya existe.");

  db.settings.paymentMethods.push(value);
  $("newMethod").value = "";
  saveDB();
  renderAll();
}

function deletePaymentMethod(value) {
  const used = db.movements.some((m) => m.method === value);
  if (used) return alert("No se puede borrar porque hay movimientos con ese método.");

  db.settings.paymentMethods = db.settings.paymentMethods.filter((m) => m !== value);
  saveDB();
  renderAll();
}

function addPillar() {
  const value = $("newPillar").value.trim();
  if (!value) return alert("Escribe un pilar.");
  if (db.settings.pillars.includes(value)) return alert("Ese pilar ya existe.");

  db.settings.pillars.push(value);
  db.settings.distribution[value] = 0;
  $("newPillar").value = "";
  saveDB();
  renderAll();
}

function renamePillar(oldName) {
  const newName = prompt("Nuevo nombre del pilar:", oldName);
  if (!newName || newName === oldName) return;
  if (db.settings.pillars.includes(newName)) return alert("Ese pilar ya existe.");

  const idx = db.settings.pillars.indexOf(oldName);
  if (idx === -1) return;

  db.settings.pillars[idx] = newName;

  if (typeof db.settings.distribution[oldName] !== "undefined") {
    db.settings.distribution[newName] = db.settings.distribution[oldName];
    delete db.settings.distribution[oldName];
  }

  db.movements.forEach((m) => {
    if (m.pillar === oldName) m.pillar = newName;
    if (m.allocations && typeof m.allocations[oldName] !== "undefined") {
      m.allocations[newName] = m.allocations[oldName];
      delete m.allocations[oldName];
    }
  });

  saveDB();
  renderAll();
}

function deletePillar(value) {
  const used = db.movements.some((m) => {
    return (
      m.pillar === value ||
      (m.allocations && typeof m.allocations[value] !== "undefined")
    );
  });

  if (used) return alert("No se puede borrar porque hay movimientos usando ese pilar.");

  if (Number(db.settings.distribution[value] || 0) > 0) {
    return alert("Ese pilar tiene porcentaje en la distribución. Ponlo en 0% antes de borrarlo.");
  }

  db.settings.pillars = db.settings.pillars.filter((p) => p !== value);
  delete db.settings.distribution[value];
  saveDB();
  renderAll();
}

function addLine() {
  const value = $("newLine").value.trim();
  if (!value) return alert("Escribe una línea.");
  if (db.settings.businessLines.includes(value)) return alert("Esa línea ya existe.");

  db.settings.businessLines.push(value);
  $("newLine").value = "";
  saveDB();
  renderAll();
}

function deleteLine(value) {
  const used = db.movements.some((m) => m.line === value);
  if (used) return alert("No se puede borrar porque hay movimientos con esa línea.");

  db.settings.businessLines = db.settings.businessLines.filter((l) => l !== value);
  saveDB();
  renderAll();
}

function saveGeneralSettings() {
  db.settings.currencyCode = $("currencyCode").value.trim().toUpperCase() || "USD";
  db.settings.currencySymbol = $("currencySymbol").value.trim() || "$";
  db.settings.autoBackup = $("autoBackup").checked;
  saveDB();
  renderAll();
}

function saveInventoryDefaults() {
  const margin = Number($("defaultMargin").value) || 60;
  const stickersPerSheet = Number($("defaultStickersPerSheet").value) || 4;

  if (margin < 0 || margin > 100) return alert("El margen debe estar entre 0 y 100.");
  if (stickersPerSheet <= 0) return alert("Stickers por hoja debe ser mayor a 0.");

  db.settings.defaultMargin = margin;
  db.settings.defaultStickersPerSheet = stickersPerSheet;

  saveDB();
  renderAll();
}

function saveDistribution() {
  const newDist = {};
  let sum = 0;

  db.settings.pillars.forEach((pillar, idx) => {
    const input = $("dist_" + idx);
    const value = Number(input ? input.value : 0);
    newDist[pillar] = value;
    sum += value;
  });

  if (Math.abs(sum - 100) > 0.01) {
    return alert("La suma de la distribución debe ser 100%. Suma actual: " + sum + "%");
  }

  db.settings.distribution = newDist;
  saveDB();
  renderAll();
}

function exportData() {
  downloadBackup("manual");
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      db = JSON.parse(e.target.result);
      normalizeDB();
      saveDB();
      renderAll();
      alert("Datos importados correctamente.");
    } catch (err) {
      alert("Archivo inválido.");
    }
  };

  reader.readAsText(file);
  event.target.value = "";
}

function resetApp() {
  if (!confirm("Esto reiniciará la app a valores de fábrica. ¿Continuar?")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function initEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  $("periodFilter").addEventListener("change", renderAll);

  $("btnNewIncome").addEventListener("click", () => openMovementModal("income"));
  $("btnNewExpense").addEventListener("click", () => openMovementModal("expense"));
  $("btnNewPurchase").addEventListener("click", openPurchaseModal);

  $("btnNewIncome2").addEventListener("click", () => openMovementModal("income"));
  $("btnNewExpense2").addEventListener("click", () => openMovementModal("expense"));
  $("btnNewPurchase2").addEventListener("click", openPurchaseModal);

  $("btnNewPurchase3").addEventListener("click", openPurchaseModal);
  $("btnNewWaste").addEventListener("click", openWasteModal);

  $("btnCloseMovement").addEventListener("click", closeMovementModal);
  $("btnSaveMovement").addEventListener("click", saveMovement);

  $("btnClosePurchase").addEventListener("click", closePurchaseModal);
  $("btnSavePurchase").addEventListener("click", savePurchase);

  $("btnCloseWaste").addEventListener("click", closeWasteModal);
  $("btnSaveWaste").addEventListener("click", saveWaste);

  $("btnCloseMaterial").addEventListener("click", closeMaterialModal);
  $("btnSaveMaterial").addEventListener("click", saveMaterial);

  $("mType").addEventListener("change", updateModalVisibility);
  $("mAmount").addEventListener("input", updateMovementPreview);
  $("mPillar").addEventListener("change", updateMovementPreview);
  $("mLine").addEventListener("change", updateMovementPreview);
  $("mConsumeMaterial").addEventListener("change", () => {
    $("mConsumeDetails").classList.toggle("hidden", !$("mConsumeMaterial").checked);
    updateMovementPreview();
  });
  $("mConsumeMaterialId").addEventListener("change", updateMovementPreview);
  $("mConsumeSheets").addEventListener("input", updateMovementPreview);

  $("pMaterial").addEventListener("change", updatePurchasePreview);
  $("pPacks").addEventListener("input", updatePurchasePreview);
  $("pCostPerPack").addEventListener("input", updatePurchasePreview);

  $("btnCalculatePrice").addEventListener("click", calculatePrices);

  $("btnSaveGeneral").addEventListener("click", saveGeneralSettings);
  $("btnSaveInventoryDefaults").addEventListener("click", saveInventoryDefaults);
  $("btnSaveDistribution").addEventListener("click", saveDistribution);

  $("btnAddMethod").addEventListener("click", addPaymentMethod);
  $("btnAddPillar").addEventListener("click", addPillar);
  $("btnAddLine").addEventListener("click", addLine);

  $("btnExportTop").addEventListener("click", exportData);
  $("btnExportSettings").addEventListener("click", exportData);

  $("fileImportTop").addEventListener("change", importData);
  $("fileImportSettings").addEventListener("change", importData);

  $("btnResetApp").addEventListener("click", resetApp);

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const value = decodeURIComponent(btn.dataset.value || "");

    if (action === "deleteMovement") deleteMovement(id);
    if (action === "deleteMethod") deletePaymentMethod(value);
    if (action === "renamePillar") renamePillar(value);
    if (action === "deletePillar") deletePillar(value);
    if (action === "deleteLine") deleteLine(value);
    if (action === "editMaterial") editMaterial(id);
    if (action === "deleteMaterial") deleteMaterial(id);
    if (action === "deleteInventoryMovement") deleteInventoryMovement(id);
  });
}

loadDB();
renderAll();
initEvents();