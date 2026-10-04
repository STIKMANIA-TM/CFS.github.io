const STORAGE_KEY = "stikmania_motor_v1";
const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Otro"];

let db;

const DEFAULT_DB = {
  settings: {
    reserveMode: "fixed_per_sale",
    reserveValue: 0,
    allowNegativeStock: false,
    material: {
      name: "Vinilo",
      unit: "hoja",
      initial: 40,
      minStock: 10,
      criticalStock: 5,
      cost: 0
    }
  },
  products: [
    {
      id: "prod_1",
      name: "Sticker individual",
      price: 0,
      cost: 0,
      materialPerUnit: 1,
      active: true
    },
    {
      id: "prod_2",
      name: "Pack 3 stickers",
      price: 0,
      cost: 0,
      materialPerUnit: 3,
      active: true
    }
  ],
  clients: [],
  operations: []
};

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
  if (!db.settings.material) db.settings.material = clone(DEFAULT_DB.settings.material);
  if (!db.products) db.products = [];
  if (!db.clients) db.clients = [];
  if (!db.operations) db.operations = [];

  if (typeof db.settings.reserveMode === "undefined") db.settings.reserveMode = "fixed_per_sale";
  if (typeof db.settings.reserveValue === "undefined") db.settings.reserveValue = 0;
  if (typeof db.settings.allowNegativeStock === "undefined") db.settings.allowNegativeStock = false;
}

function saveDB() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function fmt(n) {
  return "$" + (Number(n) || 0).toLocaleString("es-MX", {
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
  document.querySelector(`.tab[data-view="${view}"]`).classList.add("active");
}

/* =============================
   STOCK / MONEY / RESERVE
============================= */

function getStock() {
  const material = db.settings.material;

  let completedIn = 0;
  let completedOut = 0;
  let reserved = 0;
  let pendingIn = 0;

  db.operations.forEach((op) => {
    if (op.operationStatus === "cancelada") return;

    if (op.type === "purchase") {
      const qty = Number(op.quantity) || 0;

      if (op.operationStatus === "completada") completedIn += qty;
      if (op.operationStatus === "pendiente") pendingIn += qty;
    }

    if (op.type === "sale") {
      const consumption = Number(op.materialConsumption) || 0;

      if (op.operationStatus === "completada") completedOut += consumption;
      if (op.operationStatus === "pendiente") reserved += consumption;
    }
  });

  const physical = round2(material.initial + completedIn - completedOut);
  const available = round2(physical - reserved);

  return {
    physical,
    reserved,
    available,
    pendingIn,
    minStock: Number(material.minStock) || 0,
    criticalStock: Number(material.criticalStock) || 0
  };
}

function calculateReserveFull(op) {
  const mode = db.settings.reserveMode;
  const value = Number(db.settings.reserveValue) || 0;

  if (mode === "none" || value <= 0) return 0;

  if (mode === "fixed_per_sale") {
    return round2(value);
  }

  if (mode === "fixed_per_unit") {
    return round2(value * (Number(op.quantity) || 0));
  }

  if (mode === "percent_revenue") {
    return round2((Number(op.total) || 0) * value / 100);
  }

  if (mode === "percent_profit") {
    const total = Number(op.total) || 0;
    const cost = Number(op.costTotal) || 0;
    const profit = Math.max(total - cost, 0);
    return round2(profit * value / 100);
  }

  return 0;
}

function getReserveFromPaid(op, paidAmount) {
  const full = typeof op.reserveAmount === "number"
    ? op.reserveAmount
    : calculateReserveFull(op);

  const total = Number(op.total) || 0;
  const paid = Number(paidAmount) || 0;

  if (total <= 0 || paid <= 0) return 0;

  return round2(full * (paid / total));
}

function getMoney() {
  const byMethod = {
    Efectivo: 0,
    Transferencia: 0,
    Tarjeta: 0,
    Otro: 0
  };

  let total = 0;
  let fund = 0;

  db.operations.forEach((op) => {
    if (op.operationStatus === "cancelada") return;

    let paid = 0;

    if (op.paymentStatus === "pagado") paid = Number(op.total) || 0;
    if (op.paymentStatus === "anticipo") paid = Number(op.amountPaid) || 0;

    paid = round2(paid);
    if (paid <= 0) return;

    const method = byMethod[op.paymentMethod] !== undefined ? op.paymentMethod : "Otro";

    if (op.type === "sale") {
      byMethod[method] = round2(byMethod[method] + paid);
      total = round2(total + paid);
      fund = round2(fund + getReserveFromPaid(op, paid));
    } else {
      byMethod[method] = round2(byMethod[method] - paid);
      total = round2(total - paid);

      if (op.type === "purchase" && op.useFund) {
        fund = round2(fund - paid);
      }
    }
  });

  return { byMethod, total, fund };
}

function getPendingCounts() {
  return {
    sales: db.operations.filter((op) => op.type === "sale" && op.operationStatus === "pendiente").length,
    purchases: db.operations.filter((op) => op.type === "purchase" && op.operationStatus === "pendiente").length,
    expenses: db.operations.filter((op) => op.type === "expense" && op.operationStatus === "pendiente").length
  };
}

/* =============================
   RENDER GENERAL
============================= */

function renderAll() {
  renderPaymentMethods();
  renderDashboard();
  renderOperations();
  renderProducts();
  renderSettings();
  renderProductSelect();
  renderClientList();
}

function renderPaymentMethods() {
  const current = $("paymentMethod").value;

  $("paymentMethod").innerHTML = PAYMENT_METHODS
    .map((m) => `<option value="${m}">${m}</option>`)
    .join("");

  if (PAYMENT_METHODS.includes(current)) {
    $("paymentMethod").value = current;
  }

  $("paymentMethodsList").innerHTML = PAYMENT_METHODS
    .map((m) => `<span class="badge blue">${m}</span>`)
    .join(" ");
}

function renderDashboard() {
  const stock = getStock();
  const money = getMoney();
  const counts = getPendingCounts();
  const material = db.settings.material;

  $("dashTotal").textContent = fmt(money.total);
  $("dashEfectivo").textContent = fmt(money.byMethod.Efectivo);
  $("dashTransferencia").textContent = fmt(money.byMethod.Transferencia);
  $("dashTarjeta").textContent = fmt(money.byMethod.Tarjeta);
  $("dashOtro").textContent = fmt(money.byMethod.Otro);
  $("dashFund").textContent = fmt(money.fund);
  $("dashStock").textContent = `${stock.available} ${material.unit}(s)`;

  const alerts = [];

  if (stock.physical < 0) {
    alerts.push(`<div class="alert danger">Stock físico negativo: ${stock.physical} ${material.unit}(s).</div>`);
  }

  if (stock.available <= stock.criticalStock) {
    alerts.push(`<div class="alert danger">Stock crítico. Disponible: ${stock.available} ${material.unit}(s).</div>`);
  } else if (stock.available <= stock.minStock) {
    alerts.push(`<div class="alert warning">Stock bajo. Disponible: ${stock.available} ${material.unit}(s).</div>`);
  }

  if (money.fund < 0) {
    alerts.push(`<div class="alert danger">El fondo de reposición está negativo: ${fmt(money.fund)}.</div>`);
  }

  if (counts.sales > 0) {
    alerts.push(`<div class="alert info">Tienes ${counts.sales} venta(s) pendiente(s).</div>`);
  }

  if (counts.purchases > 0) {
    alerts.push(`<div class="alert info">Tienes ${counts.purchases} compra(s)/reposición(es) pendiente(s).</div>`);
  }

  $("alerts").innerHTML = alerts.join("") || `<div class="alert info">Sin alertas importantes.</div>`;

  $("stockDetail").innerHTML = `
    <div class="stock-line"><span>Material</span><strong>${esc(material.name)}</strong></div>
    <div class="stock-line"><span>Stock físico</span><strong>${stock.physical} ${material.unit}(s)</strong></div>
    <div class="stock-line"><span>Stock apartado</span><strong>${stock.reserved} ${material.unit}(s)</strong></div>
    <div class="stock-line"><span>Stock disponible</span><strong>${stock.available} ${material.unit}(s)</strong></div>
    <div class="stock-line"><span>Compras por recibir</span><strong>${stock.pendingIn} ${material.unit}(s)</strong></div>
    <div class="stock-line"><span>Stock mínimo</span><strong>${stock.minStock} ${material.unit}(s)</strong></div>
    <div class="stock-line"><span>Stock crítico</span><strong>${stock.criticalStock} ${material.unit}(s)</strong></div>
  `;

  $("opsSummary").innerHTML = `
    <div class="stock-line"><span>Ventas pendientes</span><strong>${counts.sales}</strong></div>
    <div class="stock-line"><span>Compras pendientes</span><strong>${counts.purchases}</strong></div>
    <div class="stock-line"><span>Gastos pendientes</span><strong>${counts.expenses}</strong></div>
    <div class="stock-line"><span>Fondo reposición</span><strong>${fmt(money.fund)}</strong></div>
    <div class="stock-line"><span>Saldo total</span><strong>${fmt(money.total)}</strong></div>
  `;

  const pending = db.operations
    .filter((op) => op.operationStatus === "pendiente")
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8);

  $("pendingList").innerHTML = pending.length
    ? pending.map(operationCard).join("")
    : `<div class="muted">Sin operaciones pendientes.</div>`;
}

function renderOperations() {
  const filter = $("filterOps").value;

  let ops = [...db.operations].sort((a, b) => b.createdAt - a.createdAt);

  if (filter === "pending") ops = ops.filter((op) => op.operationStatus === "pendiente");
  if (filter === "completed") ops = ops.filter((op) => op.operationStatus === "completada");
  if (filter === "canceled") ops = ops.filter((op) => op.operationStatus === "cancelada");
  if (filter === "sale") ops = ops.filter((op) => op.type === "sale");
  if (filter === "purchase") ops = ops.filter((op) => op.type === "purchase");
  if (filter === "expense") ops = ops.filter((op) => op.type === "expense");

  $("operationsList").innerHTML = ops.length
    ? ops.map(operationCard).join("")
    : `<div class="muted">No hay operaciones para este filtro.</div>`;
}

function operationBadges(op) {
  const type = op.type === "sale" ? "Venta" : op.type === "purchase" ? "Compra" : "Gasto";

  const operation =
    op.operationStatus === "completada"
      ? `<span class="badge green">Completada</span>`
      : op.operationStatus === "cancelada"
        ? `<span class="badge red">Cancelada</span>`
        : `<span class="badge yellow">Pendiente</span>`;

  const payment =
    op.paymentStatus === "pagado"
      ? `<span class="badge green">Pagado</span>`
      : op.paymentStatus === "anticipo"
        ? `<span class="badge blue">Anticipo</span>`
        : `<span class="badge gray">Pago pendiente</span>`;

  return `<span class="badge gray">${type}</span>${operation}${payment}`;
}

function operationCard(op) {
  const material = db.settings.material;

  let title = "";
  let meta = "";

  if (op.type === "sale") {
    title = `Venta${op.clientName ? ": " + esc(op.clientName) : ""}`;
    meta = [
      `Fecha: ${op.date}`,
      `Entrega: ${op.deliveryDate || "-"}`,
      `Producto: ${esc(op.productName)}`,
      `Cantidad: ${op.quantity}`,
      `Total: ${fmt(op.total)}`,
      `Consumo: ${op.materialConsumption} ${material.unit}(s)`,
      op.notes ? `Notas: ${esc(op.notes)}` : ""
    ].filter(Boolean).join("\n");
  }

  if (op.type === "purchase") {
    title = `Compra${op.supplier ? ": " + esc(op.supplier) : ""}`;
    meta = [
      `Fecha: ${op.date}`,
      `Cantidad: ${op.quantity} ${material.unit}(s)`,
      `Total: ${fmt(op.total)}`,
      op.useFund ? "Usa fondo reposición" : "No usa fondo",
      op.notes ? `Notas: ${esc(op.notes)}` : ""
    ].filter(Boolean).join("\n");
  }

  if (op.type === "expense") {
    title = `Gasto${op.concept ? ": " + esc(op.concept) : ""}`;
    meta = [
      `Fecha: ${op.date}`,
      `Total: ${fmt(op.total)}`,
      op.notes ? `Notas: ${esc(op.notes)}` : ""
    ].filter(Boolean).join("\n");
  }

  let actions = "";

  if (op.operationStatus === "pendiente") {
    actions += `<button class="btn primary" onclick="markOperationCompleted('${op.id}')">Completar</button>`;
  }

  if (op.operationStatus !== "cancelada" && op.paymentStatus !== "pagado") {
    actions += `<button class="btn" onclick="markOperationPaid('${op.id}')">Marcar pagado</button>`;
  }

  if (op.operationStatus !== "cancelada") {
    actions += `<button class="btn danger" onclick="cancelOperation('${op.id}')">Cancelar</button>`;
  }

  actions += `<button class="btn ghost" onclick="deleteOperation('${op.id}')">Eliminar</button>`;

  return `
    <div class="op-card">
      <div class="op-top">
        <div>
          <div class="op-title">${title}</div>
          <div>${operationBadges(op)}</div>
        </div>
        <strong>${fmt(op.total)}</strong>
      </div>
      <div class="op-meta">${meta}</div>
      <div class="op-actions">${actions}</div>
    </div>
  `;
}

/* =============================
   PRODUCTS
============================= */

function renderProducts() {
  const list = [...db.products].sort((a, b) => a.name.localeCompare(b.name));

  $("productList").innerHTML = list.length
    ? list.map((p) => `
      <div class="list-item">
        <div class="info">
          <strong>${esc(p.name)}</strong>
          <div class="muted">
            Precio: ${fmt(p.price)} · Costo: ${fmt(p.cost)} · Hojas: ${p.materialPerUnit}
          </div>
          <div>
            ${p.active ? `<span class="badge green">Activo</span>` : `<span class="badge gray">Inactivo</span>`}
          </div>
        </div>
        <div class="actions">
          <button class="btn" onclick="editProduct('${p.id}')">Editar</button>
          <button class="btn danger" onclick="deleteProduct('${p.id}')">Borrar</button>
        </div>
      </div>
    `).join("")
    : `<div class="muted">No hay productos cargados.</div>`;
}

function saveProduct() {
  const id = $("productId").value;
  const name = $("prodName").value.trim();
  const price = Number($("prodPrice").value) || 0;
  const cost = Number($("prodCost").value) || 0;
  const materialPerUnit = Number($("prodMaterial").value) || 0;
  const active = $("prodActive").checked;

  if (!name) return alert("El producto necesita nombre.");
  if (price <= 0) return alert("El precio de venta debe ser mayor a 0.");
  if (materialPerUnit <= 0) return alert("Las hojas por unidad deben ser mayores a 0.");

  if (id) {
    const product = db.products.find((p) => p.id === id);
    if (!product) return;

    product.name = name;
    product.price = round2(price);
    product.cost = round2(cost);
    product.materialPerUnit = round2(materialPerUnit);
    product.active = active;
  } else {
    db.products.push({
      id: uid(),
      name,
      price: round2(price),
      cost: round2(cost),
      materialPerUnit: round2(materialPerUnit),
      active
    });
  }

  saveDB();
  renderAll();
  resetProductForm();
}

function editProduct(id) {
  const product = db.products.find((p) => p.id === id);
  if (!product) return;

  $("productFormTitle").textContent = "Editar producto / pack";
  $("productId").value = product.id;
  $("prodName").value = product.name;
  $("prodPrice").value = product.price;
  $("prodCost").value = product.cost;
  $("prodMaterial").value = product.materialPerUnit;
  $("prodActive").checked = product.active;

  switchView("products");
}

function deleteProduct(id) {
  if (!confirm("¿Borrar este producto?")) return;

  db.products = db.products.filter((p) => p.id !== id);
  saveDB();
  renderAll();
  resetProductForm();
}

function resetProductForm() {
  $("productFormTitle").textContent = "Nuevo producto / pack";
  $("productId").value = "";
  $("prodName").value = "";
  $("prodPrice").value = "";
  $("prodCost").value = "";
  $("prodMaterial").value = "";
  $("prodActive").checked = true;
}

function renderProductSelect() {
  const select = $("saleProduct");
  const current = select.value;

  const activeProducts = db.products
    .filter((p) => p.active)
    .sort((a, b) => a.name.localeCompare(b.name));

  select.innerHTML = `
    <option value="">Selecciona producto</option>
    ${activeProducts.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}
    <option value="custom">Personalizado</option>
  `;

  if ([...select.options].some((o) => o.value === current)) {
    select.value = current;
  }
}

function renderClientList() {
  $("clientList").innerHTML = db.clients
    .map((c) => `<option value="${esc(c.name)}">`)
    .join("");
}

/* =============================
   SETTINGS
============================= */

function renderSettings() {
  const material = db.settings.material;

  $("materialName").value = material.name;
  $("materialUnit").value = material.unit;
  $("materialInitial").value = material.initial;
  $("materialCost").value = material.cost;
  $("materialMin").value = material.minStock;
  $("materialCritical").value = material.criticalStock;

  $("reserveMode").value = db.settings.reserveMode;
  $("reserveValue").value = db.settings.reserveValue;
  $("allowNegativeStock").checked = db.settings.allowNegativeStock;
}

function saveMaterialSettings() {
  db.settings.material.name = $("materialName").value.trim() || "Vinilo";
  db.settings.material.unit = $("materialUnit").value.trim() || "hoja";
  db.settings.material.initial = Number($("materialInitial").value) || 0;
  db.settings.material.cost = Number($("materialCost").value) || 0;
  db.settings.material.minStock = Number($("materialMin").value) || 0;
  db.settings.material.criticalStock = Number($("materialCritical").value) || 0;

  saveDB();
  renderAll();
  alert("Material actualizado.");
}

function saveRules() {
  db.settings.reserveMode = $("reserveMode").value;
  db.settings.reserveValue = Number($("reserveValue").value) || 0;
  db.settings.allowNegativeStock = $("allowNegativeStock").checked;

  saveDB();
  renderAll();
  alert("Reglas actualizadas.");
}

function resetApp() {
  if (!confirm("Esto reiniciará toda la app. ¿Continuar?")) return;

  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

/* =============================
   MODAL OPERATION
============================= */

function openOperationModal(type) {
  $("opType").value = type;
  resetOperationForm(type);
  opTypeChanged();
  $("operationModal").classList.add("active");
}

function closeOperationModal() {
  $("operationModal").classList.remove("active");
}

function opTypeChanged() {
  const type = $("opType").value;

  $("saleSection").classList.toggle("hidden", type !== "sale");
  $("purchaseSection").classList.toggle("hidden", type !== "purchase");
  $("expenseSection").classList.toggle("hidden", type !== "expense");

  $("modalTitle").textContent =
    type === "sale"
      ? "Nueva venta"
      : type === "purchase"
        ? "Nueva compra / reposición"
        : "Nuevo gasto";

  updateAllPreviews();
}

function resetOperationForm(type) {
  $("opDate").value = todayISO();
  $("opStatus").value = "pendiente";
  $("opNotes").value = "";

  $("paymentMethod").value = "Efectivo";
  $("paymentStatus").value = "pendiente";
  $("paymentAmountPaid").value = "";
  $("paymentAmountPaid").disabled = true;

  if (type === "sale") {
    $("saleClient").value = "";
    $("saleContact").value = "";
    $("saleChannel").value = "WhatsApp";
    $("saleDeliveryDate").value = todayISO();
    $("saleProduct").value = "";
    $("saleProductName").value = "";
    $("saleQuantity").value = 1;
    $("saleUnitPrice").value = "";
    $("saleCostUnit").value = "";
    $("saleMaterialPerUnit").value = 1;
    $("saleDiscount").value = 0;
  }

  if (type === "purchase") {
    $("purchaseSupplier").value = "";
    $("purchaseQuantity").value = 1;
    $("purchaseUnitCost").value = "";
    $("purchaseUseFund").checked = false;
  }

  if (type === "expense") {
    $("expenseConcept").value = "";
    $("expenseAmount").value = "";
  }

  updateAllPreviews();
}

function productChanged() {
  const value = $("saleProduct").value;

  if (value === "custom") {
    $("saleProductName").value = "";
    updateSalePreview();
    return;
  }

  const product = db.products.find((p) => p.id === value);

  if (product) {
    $("saleProductName").value = product.name;
    $("saleUnitPrice").value = product.price;
    $("saleCostUnit").value = product.cost;
    $("saleMaterialPerUnit").value = product.materialPerUnit;
  }

  updateSalePreview();
}

function getSaleTotal() {
  const qty = Number($("saleQuantity").value) || 0;
  const price = Number($("saleUnitPrice").value) || 0;
  const discount = Number($("saleDiscount").value) || 0;

  return round2(Math.max(qty * price - discount, 0));
}

function updateSalePreview() {
  const qty = Number($("saleQuantity").value) || 0;
  const price = Number($("saleUnitPrice").value) || 0;
  const costUnit = Number($("saleCostUnit").value) || 0;
  const materialPerUnit = Number($("saleMaterialPerUnit").value) || 0;
  const discount = Number($("saleDiscount").value) || 0;

  const total = getSaleTotal();
  const consumption = round2(qty * materialPerUnit);
  const costTotal = round2(qty * costUnit);
  const margin = round2(total - costTotal);

  const stock = getStock();
  const enough = db.settings.allowNegativeStock || stock.available >= consumption;

  const reserve = calculateReserveFull({
    quantity: qty,
    total,
    costTotal
  });

  const text = [
    `Total venta: ${fmt(total)}`,
    `Consumo material: ${consumption} hoja(s)`,
    `Stock disponible: ${stock.available} hoja(s)`,
    `Costo estimado: ${fmt(costTotal)}`,
    `Margen estimado: ${fmt(margin)}`,
    `Fondo reposición estimado: ${fmt(reserve)}`,
    enough ? "" : "⚠️ Stock insuficiente para esta venta."
  ].filter(Boolean).join("\n");

  $("salePreview").textContent = text;
  $("salePreview").classList.toggle("error", !enough);

  updatePaymentTotal();
}

function updatePurchasePreview() {
  const qty = Number($("purchaseQuantity").value) || 0;
  const unitCost = Number($("purchaseUnitCost").value) || 0;
  const total = round2(qty * unitCost);

  $("purchasePreview").textContent = [
    `Total compra: ${fmt(total)}`,
    `Entrarán: ${qty} hoja(s)`
  ].join("\n");

  updatePaymentTotal();
}

function updateExpensePreview() {
  const amount = Number($("expenseAmount").value) || 0;

  $("expensePreview").textContent = `Total gasto: ${fmt(amount)}`;

  updatePaymentTotal();
}

function getCurrentTotal() {
  const type = $("opType").value;

  if (type === "sale") return getSaleTotal();

  if (type === "purchase") {
    const qty = Number($("purchaseQuantity").value) || 0;
    const unitCost = Number($("purchaseUnitCost").value) || 0;
    return round2(qty * unitCost);
  }

  if (type === "expense") {
    return round2(Number($("expenseAmount").value) || 0);
  }

  return 0;
}

function updatePaymentTotal() {
  const total = getCurrentTotal();

  $("paymentTotal").textContent = `Total operación: ${fmt(total)}`;

  const status = $("paymentStatus").value;
  const amountInput = $("paymentAmountPaid");

  if (status === "pagado") {
    amountInput.value = total;
    amountInput.disabled = true;
  } else if (status === "anticipo") {
    amountInput.disabled = false;
  } else {
    amountInput.value = 0;
    amountInput.disabled = true;
  }
}

function paymentStatusChanged() {
  updatePaymentTotal();
}

function updateAllPreviews() {
  const type = $("opType").value;

  if (type === "sale") updateSalePreview();
  if (type === "purchase") updatePurchasePreview();
  if (type === "expense") updateExpensePreview();
}

/* =============================
   SAVE OPERATION
============================= */

function upsertClient(name, contact, channel) {
  const existing = db.clients.find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );

  if (existing) {
    existing.contact = contact;
    existing.channel = channel;
  } else {
    db.clients.push({
      id: uid(),
      name,
      contact,
      channel
    });
  }
}

function saveOperation() {
  const type = $("opType").value;
  const date = $("opDate").value;
  const operationStatus = $("opStatus").value;
  const notes = $("opNotes").value.trim();
  const paymentMethod = $("paymentMethod").value;
  const paymentStatus = $("paymentStatus").value;

  if (!date) return alert("Selecciona la fecha.");
  if (!paymentMethod) return alert("Selecciona método de pago.");

  const op = {
    id: uid(),
    createdAt: Date.now(),
    type,
    date,
    operationStatus,
    paymentMethod,
    paymentStatus,
    notes,
    total: 0,
    amountPaid: 0
  };

  if (type === "sale") {
    const clientName = $("saleClient").value.trim();
    const clientContact = $("saleContact").value.trim();
    const clientChannel = $("saleChannel").value;
    const deliveryDate = $("saleDeliveryDate").value;
    const productName = $("saleProductName").value.trim();
    const quantity = Number($("saleQuantity").value) || 0;
    const unitPrice = Number($("saleUnitPrice").value) || 0;
    const costUnit = Number($("saleCostUnit").value) || 0;
    const materialPerUnit = Number($("saleMaterialPerUnit").value) || 0;
    const discount = Number($("saleDiscount").value) || 0;

    if (!clientName) return alert("El cliente es obligatorio.");
    if (!deliveryDate) return alert("La fecha de entrega es obligatoria.");
    if (!productName) return alert("El nombre del producto/pack es obligatorio.");
    if (quantity <= 0) return alert("La cantidad debe ser mayor a 0.");
    if (unitPrice <= 0) return alert("El precio unitario debe ser mayor a 0.");
    if (materialPerUnit <= 0) return alert("Las hojas por unidad deben ser mayores a 0.");
    if (discount < 0) return alert("El descuento no puede ser negativo.");

    const total = getSaleTotal();
    const costTotal = round2(quantity * costUnit);
    const consumption = round2(quantity * materialPerUnit);
    const stock = getStock();

    if (!db.settings.allowNegativeStock && stock.available < consumption) {
      return alert(
        `Stock insuficiente.\n\nNecesitas: ${consumption} hoja(s)\nDisponible: ${stock.available} hoja(s)\n\nRegistra primero una compra/reposición o ajusta el pedido.`
      );
    }

    op.clientName = clientName;
    op.clientContact = clientContact;
    op.clientChannel = clientChannel;
    op.deliveryDate = deliveryDate;
    op.productName = productName;
    op.quantity = round2(quantity);
    op.unitPrice = round2(unitPrice);
    op.discount = round2(discount);
    op.total = total;
    op.costUnit = round2(costUnit);
    op.costTotal = costTotal;
    op.materialId = "vinilo";
    op.materialPerUnit = round2(materialPerUnit);
    op.materialConsumption = consumption;
    op.reserveAmount = calculateReserveFull(op);

    upsertClient(clientName, clientContact, clientChannel);
  }

  if (type === "purchase") {
    const supplier = $("purchaseSupplier").value.trim();
    const quantity = Number($("purchaseQuantity").value) || 0;
    const unitCost = Number($("purchaseUnitCost").value) || 0;

    if (!supplier) return alert("El proveedor es obligatorio.");
    if (quantity <= 0) return alert("La cantidad debe ser mayor a 0.");
    if (unitCost < 0) return alert("El costo unitario no puede ser negativo.");

    op.supplier = supplier;
    op.materialId = "vinilo";
    op.quantity = round2(quantity);
    op.unitCost = round2(unitCost);
    op.total = round2(quantity * unitCost);
    op.useFund = $("purchaseUseFund").checked;
  }

  if (type === "expense") {
    const concept = $("expenseConcept").value.trim();
    const amount = Number($("expenseAmount").value) || 0;

    if (!concept) return alert("El concepto del gasto es obligatorio.");
    if (amount <= 0) return alert("El monto del gasto debe ser mayor a 0.");

    op.concept = concept;
    op.total = round2(amount);
  }

  if (paymentStatus === "pagado") {
    op.amountPaid = op.total;
  } else if (paymentStatus === "anticipo") {
    op.amountPaid = round2(Number($("paymentAmountPaid").value) || 0);

    if (op.amountPaid <= 0 || op.amountPaid > op.total) {
      return alert("El anticipo debe ser mayor a 0 y menor o igual al total.");
    }
  } else {
    op.amountPaid = 0;
  }

  db.operations.push(op);
  saveDB();
  renderAll();
  closeOperationModal();
}

/* =============================
   OPERATION ACTIONS
============================= */

function getOperation(id) {
  return db.operations.find((op) => op.id === id);
}

function markOperationCompleted(id) {
  const op = getOperation(id);
  if (!op || op.operationStatus !== "pendiente") return;

  if (op.type === "sale") {
    const stock = getStock();

    if (!db.settings.allowNegativeStock && stock.physical < op.materialConsumption) {
      return alert(
        `No hay stock físico suficiente para completar la venta.\n\nNecesitas: ${op.materialConsumption}\nFísico: ${stock.physical}`
      );
    }
  }

  op.operationStatus = "completada";

  if (op.type === "sale") {
    op.deliveryStatus = "entregada";
  }

  saveDB();
  renderAll();
}

function markOperationPaid(id) {
  const op = getOperation(id);
  if (!op || op.operationStatus === "cancelada") return;

  op.paymentStatus = "pagado";
  op.amountPaid = op.total;

  saveDB();
  renderAll();
}

function cancelOperation(id) {
  const op = getOperation(id);
  if (!op || op.operationStatus === "cancelada") return;

  if (!confirm("¿Cancelar esta operación? Se revertirá su efecto en cálculos.")) return;

  op.operationStatus = "cancelada";

  saveDB();
  renderAll();
}

function deleteOperation(id) {
  if (!confirm("¿Eliminar definitivamente esta operación?")) return;

  db.operations = db.operations.filter((op) => op.id !== id);

  saveDB();
  renderAll();
}

/* =============================
   BACKUP
============================= */

function exportData() {
  const blob = new Blob([JSON.stringify(db, null, 2)], {
    type: "application/json"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `stikmania_motor_${todayISO()}.json`;
  a.click();
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

/* =============================
   INIT
============================= */

loadDB();
renderAll();