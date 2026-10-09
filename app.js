const DEFAULT_RATE = 873.87;
const DEFAULT_UPDATED = "hoy";
const BCV_API_URL = "https://bcv.today/api/v1/rate.json";
const BCV_REFRESH_MS = 30 * 60 * 1000;
const WHATSAPP_NUMBER = "584167615673";

const API_BASE = "/api/catalog";

let state = {
  rate: Number(localStorage.getItem("teresita_rate") || DEFAULT_RATE),
  updated: localStorage.getItem("teresita_rate_updated") || DEFAULT_UPDATED,
  forceOpen: false,
  products: [],
};
let category = "Todos";
let query = "";
let adminUnlocked = false;
let cart = {};
try {
  const savedCart = JSON.parse(localStorage.getItem("teresita_cart") || "{}");
  if (savedCart && typeof savedCart === "object" && !Array.isArray(savedCart)) cart = savedCart;
} catch (_) {
  cart = {};
}

function saveCart() {
  localStorage.setItem("teresita_cart", JSON.stringify(cart));
  updateCartUI();
}

function cartCount() {
  return Object.values(cart).reduce((sum, item) => sum + item.qty, 0);
}

function cartTotal() {
  return Object.values(cart).reduce((sum, item) => sum + (Number(item.priceUsd) || 0) * item.qty, 0);
}

function addToCart(productId) {
  const product = state.products.find(p => p.id === productId && p.active !== false);
  if (!product) return;
  if (product.soldOut) { alert("Este producto está agotado por ahora."); return; }
  const key = String(productId);
  if (!cart[key]) cart[key] = { id: product.id, name: product.name, priceUsd: Number(product.priceUsd) || 0, image: product.image || "", qty: 0 };
  cart[key].qty += 1;
  cart[key].priceUsd = Number(product.priceUsd) || 0;
  cart[key].name = product.name;
  cart[key].image = product.image || "";
  saveCart();
  showCartToast(product.name);
}

function changeCartQty(id, delta) {
  const key = String(id);
  if (!cart[key]) return;
  cart[key].qty += delta;
  if (cart[key].qty <= 0) delete cart[key];
  saveCart();
  renderCart();
}

function removeFromCart(id) {
  delete cart[String(id)];
  saveCart();
  renderCart();
}

function clearCart() {
  cart = {};
  saveCart();
  renderCart();
}

function updateCartUI() {
  const count = cartCount();
  const badge = $("#cartCount");
  if (badge) { badge.textContent = count; badge.hidden = count === 0; }
  const total = $("#cartTotalTop");
  if (total) total.textContent = moneyUsd(cartTotal());
}

function showCartToast(name) {
  const toast = $("#cartToast");
  if (!toast) return;
  toast.textContent = `✓ ${name} agregado al carrito`;
  toast.classList.add("show");
  clearTimeout(window.__cartToastTimer);
  window.__cartToastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function openCart() {
  if (document.body.classList.contains("store-closed")) return;
  openModal(`
    <button class="close" id="cartClose">×</button>
    <div class="cart-head"><div><span class="eyebrow">TU PEDIDO</span><h2>🛒 Mi carrito</h2></div><strong id="cartHeadTotal">${moneyUsd(cartTotal())}</strong></div>
    <div id="cartItems"></div>
    <div class="checkout-fields">
      <label for="customerName">Tu nombre <span class="required-label">* obligatorio</span></label>
      <input id="customerName" class="checkout-input" type="text" maxlength="60" placeholder="Ej. María" autocomplete="name" required>
      <label for="paymentMethod">Método de pago <span class="required-label">* obligatorio</span></label>
      <select id="paymentMethod" class="checkout-input" required>
        <option value="">Selecciona cómo pagarás</option>
        <option value="Pago Móvil">📱 Pago Móvil</option>
        <option value="Punto de Venta">💳 Punto de Venta</option>
      </select>
      <div id="paymentInfo" class="payment-info" hidden></div>
      <div class="checkout-total-box">
        <div><span>Total en dólares</span><strong id="cartModalTotalUsd">${moneyUsd(cartTotal())}</strong></div>
        <div><span>Total a pagar en bolívares</span><strong id="cartModalTotalBs">${moneyBs(cartTotal() * state.rate)}</strong></div>
        <small>Calculado con la tasa BCV de Bs. ${new Intl.NumberFormat("es-VE", {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(state.rate)}</small>
      </div>
      <label for="customerNote">Nota para la tienda <span>(opcional)</span></label>
      <textarea id="customerNote" class="checkout-input checkout-note" maxlength="240" placeholder="Ej. Quiero confirmar disponibilidad."></textarea>
    </div>
    <div class="cart-footer">
      <div><span>Total estimado</span><strong id="cartModalTotal">${moneyUsd(cartTotal())} · ${moneyBs(cartTotal() * state.rate)}</strong></div>
      <div class="cart-actions">
        <button class="btn secondary" id="clearCartBtn">Vaciar carrito</button>
        <button class="btn primary" id="whatsappCheckout" ${cartCount() === 0 ? "disabled" : ""}>Ir a WhatsApp 💬</button>
      </div>
    </div>
    <p class="cart-note">Al pulsar “Ir a WhatsApp” se abrirá un chat con el resumen completo de tu pedido para que la tienda pueda confirmarlo.</p>
  `);
  $("#cartClose").onclick = closeModal;
  $("#clearCartBtn").onclick = clearCart;
  $("#whatsappCheckout").onclick = checkoutWhatsApp;
  $("#paymentMethod").onchange = renderPaymentInfo;
  renderPaymentInfo();
  renderCart();
}

function renderCart() {
  const box = $("#cartItems");
  if (!box) return;
  const items = Object.values(cart);
  if (!items.length) {
    box.innerHTML = `<div class="cart-empty"><div>🛒</div><b>Tu carrito está vacío</b><span>Agrega productos para preparar tu pedido.</span></div>`;
  } else {
    box.innerHTML = items.map(item => `
      <div class="cart-item">
        <div class="cart-item-icon">${item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : "🛍️"}</div>
        <div class="cart-item-info"><b>${escapeHtml(item.name)}</b><small>${moneyUsd(item.priceUsd)} c/u</small></div>
        <div class="cart-qty"><button data-cart-minus="${item.id}">−</button><b>${item.qty}</b><button data-cart-plus="${item.id}">+</button></div>
        <strong class="cart-item-total">${moneyUsd(item.priceUsd * item.qty)}</strong>
        <button class="cart-remove" data-cart-remove="${item.id}" aria-label="Eliminar ${escapeHtml(item.name)}">×</button>
      </div>`).join("");
  }
  const totalUsd = moneyUsd(cartTotal());
  const totalBs = moneyBs(cartTotal() * state.rate);
  if ($("#cartHeadTotal")) $("#cartHeadTotal").textContent = totalUsd;
  if ($("#cartModalTotal")) $("#cartModalTotal").textContent = `${totalUsd} · ${totalBs}`;
  if ($("#cartModalTotalUsd")) $("#cartModalTotalUsd").textContent = totalUsd;
  if ($("#cartModalTotalBs")) $("#cartModalTotalBs").textContent = totalBs;
  const rateLabel = document.querySelector("#cartModalTotalBs")?.parentElement?.parentElement?.querySelector("small");
  if (rateLabel) rateLabel.textContent = `Calculado con la tasa BCV de Bs. ${new Intl.NumberFormat("es-VE", {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(state.rate)}`;
  const checkout = $("#whatsappCheckout");
  if (checkout) checkout.disabled = items.length === 0;
  document.querySelectorAll("[data-cart-minus]").forEach(b => b.onclick = () => changeCartQty(Number(b.dataset.cartMinus), -1));
  document.querySelectorAll("[data-cart-plus]").forEach(b => b.onclick = () => changeCartQty(Number(b.dataset.cartPlus), 1));
  document.querySelectorAll("[data-cart-remove]").forEach(b => b.onclick = () => removeFromCart(Number(b.dataset.cartRemove)));
}

function renderPaymentInfo() {
  const select = $("#paymentMethod");
  const box = $("#paymentInfo");
  if (!select || !box) return;
  const method = select.value;
  if (method === "Pago Móvil") {
    box.hidden = false;
    box.innerHTML = `<div class="payment-info-title">📱 Datos de Pago Móvil</div><div class="payment-info-row"><span>Teléfono</span><b>0412-1666870</b></div><div class="payment-info-row"><span>País</span><b>Vzla.</b></div><div class="payment-info-amount">Debes pagar: <strong>${moneyBs(cartTotal() * state.rate)}</strong></div>`;
  } else if (method === "Punto de Venta") {
    box.hidden = false;
    box.innerHTML = `<div class="payment-info-title">💳 Punto de Venta</div><div class="payment-info-amount">Monto a pagar: <strong>${moneyBs(cartTotal() * state.rate)}</strong></div><small>El pago se realizará en el punto de venta de la tienda.</small>`;
  } else {
    box.hidden = true;
    box.innerHTML = "";
  }
}

function checkoutWhatsApp() {
  if (document.body.classList.contains("store-closed")) { alert("La tienda está cerrada. Abrimos a las 8:00 AM (hora de Venezuela)."); return; }
  normalizeCart();
  const items = Object.values(cart);
  if (!items.length) { alert("Agrega al menos un producto al carrito."); return; }

  const name = (($('#customerName')?.value || '').trim()).slice(0, 60);
  const paymentMethod = $('#paymentMethod')?.value || '';
  const note = (($('#customerNote')?.value || '').trim()).slice(0, 240);
  if (!name) { alert("Por favor, coloca tu nombre para continuar."); $("#customerName")?.focus(); return; }
  if (!paymentMethod) { alert("Por favor, selecciona un método de pago para continuar."); $("#paymentMethod")?.focus(); return; }
  const unavailable = items.find(item => state.products.find(p => p.id === item.id)?.soldOut);
  if (unavailable) { alert(`“${unavailable.name}” está agotado. Quítalo del carrito para continuar.`); return; }
  if (!confirm("Importante: Variedades Teresita NO cuenta con delivery. Debes retirar tu pedido personalmente en la tienda. ¿Deseas continuar a WhatsApp?")) return;
  const lines = items.map(item => `• ${item.name} x${item.qty}`).join("\n");
  const totalUsd = moneyUsd(cartTotal());
  const totalBs = moneyBs(cartTotal() * state.rate);
  const noteLine = note ? `\nNota: ${note}` : '';
  const paymentLine = paymentMethod === "Pago Móvil" ? `\nPago Móvil: 04121666870` : '';
  const message = `Hola 👋 Soy ${name}.\n\n${lines}\n\nTotal: ${totalUsd} / ${totalBs}\nPago: ${paymentMethod}${paymentLine}${noteLine}`;

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  const opened = window.open(url, "_blank");
  if (!opened) window.location.href = url;
}

const cats = [
  ["Todos","🛍️"],
  ["Combos y Refrescos","🥤"],
  ["Charcutería","🧀"],
  ["Fármacos","💊"],
  ["Chucherías","🍿"],
  ["Víveres","🍚"],
  ["Higiene","🧼"]
];

const $ = s => document.querySelector(s);
const localProducts = () => window.PRODUCTS || [];

async function apiRequest(action, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = sessionStorage.getItem("teresita_admin_token");
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}?action=${encodeURIComponent(action)}`, {
    ...options,
    headers,
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || `Error ${response.status}`);
  return data;
}

function serverProduct(item) {
  return {
    id: Number(item.id),
    name: item.name,
    category: item.category,
    priceUsd: Number(item.price_usd ?? item.priceUsd ?? 0),
    priceBs: item.price_bs === null || item.price_bs === undefined || item.price_bs === "" ? null : Number(item.price_bs),
    soldOut: item.sold_out === true || item.soldOut === true,
    icon: item.icon || "📦",
    active: item.active !== false,
    image: item.image_url || item.image || ""
  };
}

async function loadPublicStore() {
  try {
    const data = await apiRequest("public");
    if (Array.isArray(data.products) && data.products.length) {
      state.products = data.products.map(serverProduct);
      if (data.settings) {
        if (data.settings.rate) state.rate = Number(data.settings.rate);
        state.updated = data.settings.updated_label || state.updated || "hoy";
        state.forceOpen = data.settings.force_open === true;
        saveLocalSettings();
      }
      return true;
    }
  } catch (_) {}
  return false;
}

async function loadAdminStore() {
  const data = await apiRequest("list");
  if (Array.isArray(data.products) && data.products.length) {
    state.products = data.products.map(serverProduct);
  }
  if (data.settings) {
    if (data.settings.rate) state.rate = Number(data.settings.rate);
    state.updated = data.settings.updated_label || state.updated || "hoy";
    state.forceOpen = data.settings.force_open === true;
    saveLocalSettings();
  }
  normalizeCart();
  render();
  return data;
}

async function saveProductGlobal(item) {
  await apiRequest("save-product", {
    method: "POST",
    body: JSON.stringify({ product: {
      id: item.id, name: item.name, category: item.category,
      priceUsd: Number(item.priceUsd) || 0, icon: item.icon || "📦",
      active: item.active !== false, image_url: item.image || null,
      priceBs: item.priceBs === null || item.priceBs === undefined || item.priceBs === "" ? null : Number(item.priceBs),
      soldOut: item.soldOut === true
    }})
  });
}

async function publishCatalogGlobal() {
  const data = await apiRequest("publish", {
    method: "POST",
    body: JSON.stringify({
      products: state.products.map(p => ({
        id: p.id, name: p.name, category: p.category,
        priceUsd: Number(p.priceUsd) || 0, icon: p.icon || "📦",
        active: p.active !== false, image_url: p.image || null,
        priceBs: p.priceBs === null || p.priceBs === undefined || p.priceBs === "" ? null : Number(p.priceBs),
        soldOut: p.soldOut === true
      })),
      rate: state.rate,
      updated: state.updated
    })
  });
  return data;
}

function normalizeCart() {
  const valid = {};
  for (const [key, raw] of Object.entries(cart || {})) {
    const id = Number(raw?.id ?? key);
    const product = state.products.find(p => p.id === id && p.active !== false && !p.soldOut);
    const qty = Math.max(0, Math.floor(Number(raw?.qty) || 0));
    if (!product || !qty) continue;
    valid[String(id)] = {
      id: product.id,
      name: product.name,
      priceUsd: Number(product.priceUsd) || 0,
      image: product.image || "",
      qty
    };
  }
  cart = valid;
  localStorage.setItem("teresita_cart", JSON.stringify(cart));
}

function moneyUsd(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(n) || 0);
}

// Regla de precios de la tienda:
// 703 se queda en 703; 705-709 suben a 710; 710 se queda en 710.
// Solo redondeamos hacia la siguiente decena cuando la última cifra es 5 o más.
function roundStorePrice(n) {
  const value = Math.max(0, Math.floor(Number(n) || 0));
  const lastDigit = value % 10;
  return lastDigit >= 5 ? value + (10 - lastDigit) : value;
}

function moneyBs(n) {
  return "Bs. " + new Intl.NumberFormat("es-VE", {
    maximumFractionDigits: 0
  }).format(roundStorePrice(n));
}

function formatRateUpdated(dateText) {
  if (!dateText || dateText === "hoy") return "hoy";
  const parts = String(dateText).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return String(dateText);
}

async function updateBCVRate({silent = false} = {}) {
  try {
    const response = await fetch(`${BCV_API_URL}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });
    if (!response.ok) throw new Error(`BCV HTTP ${response.status}`);

    const data = await response.json();
    const rate = Number(data?.USD);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("La tasa BCV recibida no es válida.");

    const effectiveDate = data?.effective_date || data?.date || new Date().toISOString().slice(0, 10);
    const changed = Math.abs(state.rate - rate) > 0.000001;
    state.rate = rate;
    state.updated = formatRateUpdated(effectiveDate);
    saveLocalSettings();
    render();

    setConnectionStatus(changed
      ? `BCV actualizado automáticamente · Bs. ${rate.toFixed(2)} por $1`
      : `BCV al día · Bs. ${rate.toFixed(2)} por $1`
    );
    return true;
  } catch (error) {
    setConnectionStatus("BCV: no se pudo actualizar · usando la última tasa guardada");
    if (!silent) alert("No se pudo actualizar la tasa BCV. Se mantendrá la última tasa disponible.");
    return false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[c]));
}


function renderCategories() {
  $("#categories").innerHTML = cats.map(([name, icon]) =>
    `<button class="cat ${name === category ? "active" : ""}" data-cat="${escapeHtml(name)}">${icon} ${escapeHtml(name)}</button>`
  ).join("");

  document.querySelectorAll(".cat").forEach(b => {
    b.onclick = () => {
      category = b.dataset.cat;
      render();
    };
  });
}

function filtered() {
  const q = query.trim().toLowerCase();
  return state.products.filter(p =>
    p.active !== false &&
    (category === "Todos" || p.category === category) &&
    (!q ||
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q))
  );
}

function render() {
  $("#rateText").textContent =
    "Bs. " + new Intl.NumberFormat("es-VE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(state.rate);

  $("#updatedText").textContent =
    state.updated === "hoy" ? "Actualizado hoy" : "Actualizado " + state.updated;

  const list = filtered();

  $("#count").textContent =
    `${list.length} producto${list.length === 1 ? "" : "s"}`;

  $("#sectionTitle").textContent =
    query
      ? `Resultados para “${escapeHtml(query)}”`
      : category === "Todos"
        ? "Todos los productos"
        : category;

  $("#clearSearch").hidden = !query;
  renderCategories();

  $("#products").innerHTML = list.map(p => `
    <article class="product ${/coca[- ]?cola\s*2\s*l/i.test(p.name) ? "best-seller" : ""} ${p.soldOut ? "product-sold-out" : ""}">
      ${p.soldOut ? `<div class="sold-out-ribbon">AGOTADO</div>` : (/coca[- ]?cola\s*2\s*l/i.test(p.name) ? `<div class="best-seller-ribbon">Más vendido</div>` : "")}
      <div class="product-icon ${p.image ? "has-image" : ""}">${p.image ? `<img class="product-image" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">` : (p.icon || "📦")}</div>
      <div class="product-meta">
        <div>
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="product-cat">${escapeHtml(p.category)}</div>
        </div>
        <div class="prices">
          <div class="usd">${moneyUsd(p.priceUsd)}</div>
          <div class="bs">${p.priceBs !== null && p.priceBs !== undefined && Number.isFinite(Number(p.priceBs)) ? moneyBs(p.priceBs) : moneyBs(p.priceUsd * state.rate)}</div>
        </div>
      </div>
      <button class="order-btn-mini add-cart-btn" data-add-cart="${p.id}" type="button" ${p.soldOut ? "disabled" : ""}>
        ${p.soldOut ? "Producto agotado" : "🛒 Agregar al carrito"}
      </button>
    </article>
  `).join("");

  $("#empty").hidden = list.length !== 0;
  document.querySelectorAll("[data-add-cart]").forEach(b => {
    b.onclick = () => addToCart(Number(b.dataset.addCart));
  });
  updateCartUI();
}

function setConnectionStatus(msg) {
  const el = $("#connectionStatus");
  if (el) el.textContent = msg;
}

function openModal(content) {
  $("#modalContent").innerHTML = content;
  $("#modal").hidden = false;
  $("#modal").setAttribute("aria-hidden", "false");
}

function closeModal() {
  $("#modal").hidden = true;
  $("#modal").setAttribute("aria-hidden", "true");
}

function saveLocalSettings() {
  localStorage.setItem("teresita_rate", String(state.rate));
  localStorage.setItem("teresita_rate_updated", state.updated);
}

function saveLocalProducts() {
  localStorage.setItem("teresita_products", JSON.stringify(state.products));
}

function resetLocalProducts() {
  state.products = localProducts().map(p => ({ ...p }));
  localStorage.removeItem("teresita_products");
}

function compressProductImage(file, maxSize = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Selecciona una imagen válida."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("No se pudo leer la imagen."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    reader.readAsDataURL(file);
  });
}

function adminLogin() {
  openModal(`
    <button class="close" id="mclose">×</button>
    <h2>Administración</h2>
    <p>Entra para gestionar el catálogo que verán todos los clientes.</p>
    <div class="field">
      <label>CONTRASEÑA</label>
      <input id="adminPassword" type="password" autocomplete="current-password" placeholder="Contraseña">
    </div>
    <div id="loginError" class="form-error"></div>
    <div class="modal-actions">
      <button class="btn secondary" id="cancel">Cancelar</button>
      <button class="btn primary" id="login">Entrar</button>
    </div>
  `);
  $("#mclose").onclick = closeModal;
  $("#cancel").onclick = closeModal;
  const login = async () => {
    const password = $("#adminPassword").value;
    $("#login").disabled = true;
    try {
      const data = await apiRequest("login", { method: "POST", body: JSON.stringify({ password }) });
      sessionStorage.setItem("teresita_admin_token", data.token);
      adminUnlocked = true;
      await loadAdminStore();
      adminPanel();
    } catch (error) {
      $("#loginError").textContent = error.message || "Contraseña incorrecta.";
      $("#adminPassword").select();
      $("#login").disabled = false;
    }
  };
  $("#login").onclick = login;
  $("#adminPassword").onkeydown = e => { if (e.key === "Enter") login(); };
  $("#adminPassword").focus();
}

function adminPanel() {
  if (!adminUnlocked) return adminLogin();
  openModal(`
    <button class="close" id="mclose">×</button>
    <h2>Panel de tienda</h2>
    <p>Los cambios publicados aquí se guardan en la nube y los verán todos los clientes.</p>
    <div class="notice">☁️ <b>Catálogo global:</b> precios, imágenes y productos se sincronizan para todos.</div>
    <div class="modal-grid">
      <div class="field"><label>TASA BCV (BS/$)</label><input id="rate" type="number" step="0.01" value="${state.rate}"></div>
      <div class="field"><label>FECHA / ETIQUETA</label><input id="date" value="${escapeHtml(state.updated)}"></div>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" id="refreshBCV">↻ Actualizar BCV</button>
      <button class="btn secondary" id="saveRate">Guardar tasa</button>
      <button class="btn secondary" id="publishCatalog">☁ Publicar catálogo</button>
      <button class="btn primary" id="productsAdmin">Editar productos</button>
      <button class="btn ${state.forceOpen ? "secondary" : "primary"}" id="toggleForceOpen">${state.forceOpen ? "✓ Desactivar cierre automático" : "🌙 Activar horario de cierre"}</button>
      <button class="btn secondary" id="lockAdmin">Bloquear</button>
    </div>
    <p class="admin-global-note">Si otro cliente entra o recarga la web, recibirá estos mismos cambios.</p>
  `);
  $("#mclose").onclick = closeModal;
  $("#saveRate").onclick = saveRate;
  $("#refreshBCV").onclick = async () => {
    $("#refreshBCV").disabled = true;
    $("#refreshBCV").textContent = "Actualizando…";
    const ok = await updateBCVRate();
    if (ok) await saveSettingsGlobal();
    adminPanel();
  };
  $("#saveRate").onclick = saveRate;
  $("#publishCatalog").onclick = async () => {
    const btn = $("#publishCatalog");
    btn.disabled = true; btn.textContent = "Publicando…";
    try { await publishCatalogGlobal(); alert("Catálogo publicado para todos los clientes."); }
    catch (e) { alert(e.message || "No se pudo publicar el catálogo."); }
    adminPanel();
  };
  $("#productsAdmin").onclick = async () => { try { await loadAdminStore(); productEditor(); } catch (e) { alert(e.message); } };
  $("#toggleForceOpen").onclick = async () => {
    const btn = $("#toggleForceOpen");
    btn.disabled = true;
    const previous = state.forceOpen;
    state.forceOpen = !state.forceOpen;
    btn.textContent = "Guardando…";
    try {
      await saveSettingsGlobal();
      updateClosingNotice();
      alert(state.forceOpen
        ? "Horario de cierre desactivado. La tienda permanecerá disponible incluso fuera del horario habitual para todos los clientes."
        : "Horario automático activado. La tienda volverá a mostrar el aviso de cierre según el horario de Venezuela.");
    } catch (e) {
      state.forceOpen = previous;
      alert(e.message || "No se pudo guardar el ajuste. Ejecuta primero el SQL actualizado en Supabase.");
    }
    adminPanel();
  };
  $("#lockAdmin").onclick = () => { adminUnlocked = false; sessionStorage.removeItem("teresita_admin_token"); closeModal(); };
}

async function saveSettingsGlobal() {
  await apiRequest("save-settings", {
    method: "POST",
    body: JSON.stringify({ rate: state.rate, updated: state.updated, forceOpen: state.forceOpen })
  });
  saveLocalSettings();
}

async function saveRate() {
  const r = Number($("#rate").value);
  if (!r || r <= 0) { alert("Escribe una tasa válida."); return; }
  state.rate = r;
  state.updated = $("#date").value.trim() || "hoy";
  try {
    await saveSettingsGlobal();
    render();
    alert("Tasa actualizada para todos los clientes.");
  } catch (e) {
    alert(e.message || "No se pudo guardar la tasa en la nube.");
  }
}

function productEditor() {
  if (!adminUnlocked) return adminLogin();

  openModal(`
    <button class="close" id="mclose">×</button>
    <h2>Administrar catálogo</h2>
    <p>Administra precios, imágenes y visibilidad. Cada cambio se publica en la nube para todos.</p>

    <div class="admin-tools">
      <input id="adminSearch" placeholder="Buscar producto o categoría" autocomplete="off">
      <select id="adminCategory">
        <option value="Todos">Todas las categorías</option>
        ${cats.filter(([name]) => name !== "Todos").map(([name]) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}
      </select>
      <button class="mini" id="resetCatalog">Restaurar catálogo</button>
    </div>

    <div class="admin-stats" id="adminStats"></div>
    <div class="admin-list" id="adminList"></div>

    <div class="modal-actions">
      <button class="btn secondary" id="backAdmin">Volver</button>
    </div>
  `);

  $("#mclose").onclick = adminPanel;
  $("#backAdmin").onclick = adminPanel;

  const draw = () => {
    const q = $("#adminSearch").value.toLowerCase().trim();
    const selectedCategory = $("#adminCategory").value;
    const filteredAdmin = state.products.filter(p =>
      (selectedCategory === "Todos" || p.category === selectedCategory) &&
      (p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
    );

    const activeCount = state.products.filter(p => p.active !== false).length;
    const imageCount = state.products.filter(p => !!p.image).length;
    $("#adminStats").innerHTML = `
      <span class="admin-stat">${state.products.length} productos</span>
      <span class="admin-stat">${activeCount} visibles</span>
      <span class="admin-stat">${imageCount} con imagen</span>
      <span class="admin-stat">${state.products.length - activeCount} ocultos</span>
    `;

    if (!filteredAdmin.length) {
      $("#adminList").innerHTML = `<p style="text-align:center;color:var(--muted);margin-top:20px;">No hay resultados.</p>`;
      return;
    }

    $("#adminList").innerHTML = filteredAdmin.map(p => `
      <div class="admin-product ${p.active === false ? "status-off" : ""}">
        <div class="admin-product-thumb">
          ${p.image ? `<img src="${escapeHtml(p.image)}" alt="">` : escapeHtml(p.icon || "📦")}
        </div>
        <div class="admin-product-main">
          <div class="admin-product-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
          <div class="admin-product-category">${escapeHtml(p.category)} · ${p.active === false ? "Oculto" : "Visible"} · ${p.soldOut ? "Agotado" : "Disponible"}</div>
          <label class="upload-label" style="margin-top:8px;">
            📷 ${p.image ? "Cambiar imagen" : "Agregar imagen"}
            <input type="file" accept="image/png,image/jpeg,image/webp" data-upload="${p.id}">
          </label>
        </div>
        <div class="admin-product-controls">
          <input type="number" step="0.01" min="0" data-price="${p.id}" value="${Number(p.priceUsd) || 0}" aria-label="Precio de ${escapeHtml(p.name)}">
          <small style="color:var(--muted);font-size:10px;">Precio USD</small>
          <input type="number" step="1" min="0" data-price-bs="${p.id}" value="${p.priceBs ?? ""}" placeholder="Automático" aria-label="Precio Bs de ${escapeHtml(p.name)}">
          <small style="color:var(--muted);font-size:10px;">Precio Bs (opcional)</small>
        </div>
        <div class="admin-product-actions">
          <button class="mini" data-save="${p.id}">Guardar</button>
          <button class="mini" data-toggle="${p.id}">${p.active === false ? "Mostrar" : "Ocultar"}</button>
          <button class="mini ${p.soldOut ? "danger" : ""}" data-soldout="${p.id}">${p.soldOut ? "Marcar disponible" : "Marcar agotado"}</button>
          ${p.image ? `<button class="mini danger" data-remove-image="${p.id}">Quitar imagen</button>` : ""}
        </div>
      </div>
    `).join("");

    document.querySelectorAll("[data-upload]").forEach(input => {
      input.onchange = async () => {
        const id = Number(input.dataset.upload);
        const item = state.products.find(x => x.id === id);
        const file = input.files && input.files[0];
        if (!item || !file) return;
        try {
          if (file.size > 8 * 1024 * 1024) {
            alert("La imagen es demasiado grande. Usa una de máximo 8 MB.");
            input.value = "";
            return;
          }
          const compressed = await compressProductImage(file);
          const data = await apiRequest("upload-image", {
            method: "POST",
            body: JSON.stringify({ id, dataUrl: compressed })
          });
          item.image = data.image_url || "";
          saveLocalProducts();
          render();
          draw();
        } catch (error) {
          alert(error.message || "No se pudo guardar la imagen.");
        }
      };
    });

    document.querySelectorAll("[data-save]").forEach(button => {
      button.onclick = async () => {
        const id = Number(button.dataset.save);
        const input = document.querySelector(`[data-price="${id}"]`);
        const price = parseFloat(input.value);
        const bsInput = document.querySelector(`[data-price-bs="${id}"]`);
        const bsRaw = bsInput?.value.trim() ?? "";
        const item = state.products.find(x => x.id === id);
        if (!item || price < 0 || Number.isNaN(price) || (bsRaw !== "" && (!Number.isFinite(Number(bsRaw)) || Number(bsRaw) < 0))) {
          alert("Por favor, introduce un precio válido.");
          return;
        }
        item.priceUsd = price;
        item.priceBs = bsRaw === "" ? null : Number(bsRaw);
        try {
          await saveProductGlobal(item);
          saveLocalProducts();
          normalizeCart();
          render();
        } catch (error) {
          alert(error.message || "No se pudo guardar el producto en la nube.");
          return;
        }
        button.style.background = "#16a34a";
        button.style.color = "white";
        button.textContent = "¡Guardado!";
        setTimeout(() => {
          button.style.background = "var(--soft)";
          button.style.color = "var(--brand)";
          button.textContent = "Guardar";
        }, 1200);
      };
    });

    document.querySelectorAll("[data-soldout]").forEach(button => {
      button.onclick = async () => {
        const id = Number(button.dataset.soldout);
        const item = state.products.find(x => x.id === id);
        if (!item) return;
        item.soldOut = !item.soldOut;
        try {
          await saveProductGlobal(item);
          saveLocalProducts();
          normalizeCart();
          render();
          draw();
        } catch (error) {
          item.soldOut = !item.soldOut;
          alert(error.message || "No se pudo actualizar el estado del producto.");
        }
      };
    });

    document.querySelectorAll("[data-toggle]").forEach(button => {
      button.onclick = async () => {
        const id = Number(button.dataset.toggle);
        const item = state.products.find(x => x.id === id);
        if (!item) return;
        item.active = item.active === false;
        try { await saveProductGlobal(item); } catch (error) { item.active = item.active === false; alert(error.message || "No se pudo publicar el cambio."); return; }
        saveLocalProducts();
        normalizeCart();
        render();
        draw();
      };
    });

    document.querySelectorAll("[data-remove-image]").forEach(button => {
      button.onclick = async () => {
        const id = Number(button.dataset.removeImage);
        const item = state.products.find(x => x.id === id);
        if (!item) return;
        try {
          await apiRequest("remove-image", { method: "POST", body: JSON.stringify({ id }) });
          item.image = "";
          saveLocalProducts();
          render();
          draw();
        } catch (error) { alert(error.message || "No se pudo quitar la imagen."); }
      };
    });
  };

  $("#adminSearch").oninput = draw;
  $("#adminCategory").onchange = draw;
  $("#resetCatalog").onclick = async () => {
    if (!confirm("¿Restaurar todos los productos a los valores originales? Se perderán precios, imágenes y cambios guardados en este navegador.")) return;
    resetLocalProducts();
    normalizeCart();
    try { await publishCatalogGlobal(); alert("Catálogo restaurado y publicado para todos."); }
    catch (error) { alert(error.message || "No se pudo publicar el catálogo restaurado."); }
    render();
    draw();
  };
  draw();
}

async function loadStore() {
  const savedProducts = localStorage.getItem("teresita_products");
  try {
    state.products = savedProducts ? JSON.parse(savedProducts) : localProducts().map(p => ({ ...p }));
  } catch { state.products = localProducts().map(p => ({ ...p })); }
  normalizeCart();
  setConnectionStatus("Conectando con la tienda…");
  render();
  const cloudLoaded = await loadPublicStore();
  if (cloudLoaded) {
    normalizeCart();
    saveLocalProducts();
    render();
    setConnectionStatus("Catálogo sincronizado · cambios globales activos");
  } else {
    setConnectionStatus("Catálogo local · publica el catálogo desde Administración para sincronizarlo");
  }
  await updateBCVRate({ silent: true });
  window.setInterval(() => updateBCVRate({ silent: true }), BCV_REFRESH_MS);
  window.setInterval(async () => {
    const ok = await loadPublicStore();
    if (ok) { normalizeCart(); saveLocalProducts(); render(); }
  }, 60 * 1000);
}

$("#modal").addEventListener("click", e => {
  if (e.target.id === "modal") closeModal();
});

$("#search").addEventListener("input", e => {
  query = e.target.value;
  render();
});

$("#clearSearch").onclick = () => {
  $("#search").value = "";
  query = "";
  render();
  $("#search").focus();
};

$("#themeBtn").onclick = () => {
  document.body.classList.toggle("dark");
  $("#themeBtn").textContent =
    document.body.classList.contains("dark") ? "☾" : "☼";
};

$("#assistantBtn").onclick = openAssistant;
$("#adminBtn").onclick = adminLogin;
$("#cartBtn").onclick = openCart;
$("#openCartOrder").onclick = openCart;
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("#modal").hidden) closeModal();
});

// Horario de la tienda: 08:00 a 20:00, hora de Venezuela (America/Caracas).
// Durante el cierre se ocultan todos los accesos de WhatsApp y se muestra la cuenta regresiva.
let storeWasClosed = null;
let audioContext = null;
let audioUnlocked = false;

function unlockStoreAudio() {
  if (audioUnlocked) return;
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
    audioUnlocked = true;
  } catch (_) {}
}

function playStoreSound(type) {
  if (!audioUnlocked || !audioContext) return;
  try {
    const ctx = audioContext;
    const now = ctx.currentTime;
    const notes = type === "close" ? [523.25, 392] : [392, 523.25, 659.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.07, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.24);
    });
  } catch (_) {}
}

function getCaracasParts() {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Caracas",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date());
  return Object.fromEntries(formatted.map(({ type, value }) => [type, value]));
}

function updateClosingNotice() {
  const notice = $("#closingNotice");
  const countdown = $("#openingCountdown");
  if (!notice || !countdown) return;

  const parts = getCaracasParts();
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  const isClosed = !state.forceOpen && (hour >= 20 || hour < 8);

  if (storeWasClosed !== null && storeWasClosed !== isClosed) {
    playStoreSound(isClosed ? "close" : "open");
  }
  storeWasClosed = isClosed;
  document.body.classList.toggle("store-closed", isClosed);
  notice.hidden = !isClosed;

  if (!isClosed) return;

  // Convertimos la fecha/hora de Caracas a una escala UTC equivalente.
  const currentUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    hour, minute, second
  );

  // 08:00 Caracas equivale a 12:00 UTC.
  let targetUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12, 0, 0
  );
  if (hour >= 20) targetUtc += 24 * 60 * 60 * 1000;

  const remaining = Math.max(0, targetUtc - currentUtc);
  const totalSeconds = Math.floor(remaining / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const sec = String(totalSeconds % 60).padStart(2, "0");
  countdown.textContent = `${h}:${m}:${sec}`;
}

// Los navegadores bloquean audio automático hasta que el visitante interactúa.
document.addEventListener("pointerdown", unlockStoreAudio, { once: true, passive: true });
document.addEventListener("keydown", unlockStoreAudio, { once: true });

function openTutorial(force = false) {
  if (!force && localStorage.getItem("teresita_tutorial_seen") === "1") return;
  openModal(`
    <button class="close" id="tutorialClose">×</button>
    <div class="tutorial-hero">🛍️</div>
    <span class="eyebrow">BIENVENIDO</span>
    <h2>Cómo comprar en Variedades Teresita</h2>
    <div class="tutorial-steps">
      <div><b>1</b><span>Busca el producto o entra en una categoría.</span></div>
      <div><b>2</b><span>Pulsa <strong>Agregar al carrito</strong> y ajusta las cantidades.</span></div>
      <div><b>3</b><span>En el carrito coloca tu nombre y elige cómo pagar.</span></div>
      <div><b>4</b><span>Revisa el total en $ y Bs. y envía el pedido por WhatsApp.</span></div>
    </div>
    <button class="btn primary tutorial-main-btn" id="tutorialStart">¡Entendido! 🛒</button>
    <label class="tutorial-check"><input id="tutorialRemember" type="checkbox" checked> No mostrar de nuevo</label>
  `);
  const finish = () => {
    if ($("#tutorialRemember")?.checked) localStorage.setItem("teresita_tutorial_seen", "1");
    closeModal();
  };
  $("#tutorialClose").onclick = finish;
  $("#tutorialStart").onclick = finish;
}

$("#helpBtn")?.addEventListener("click", () => openTutorial(true));

updateClosingNotice();
setInterval(updateClosingNotice, 1000);

loadStore().then(() => setTimeout(() => openTutorial(false), 500));


// Asistente de ayuda local para preguntas frecuentes; no necesita una API externa.
let assistantMessages = [];
function openAssistant() {
  assistantMessages = [{ from: "bot", text: "¡Hola! 👋 Soy el asistente de Variedades Teresita. Puedo ayudarte con precios, pedidos, pagos y retiro en tienda. ¿Qué quieres saber?" }];
  renderAssistant();
}
function assistantReply(text) {
  const q = text.toLowerCase();
  if (/delivery|domicilio|env[ií]o|entrega/.test(q)) return "Por ahora no contamos con delivery. Los pedidos se retiran personalmente en la tienda.";
  if (/horario|abren|abierto|cierran|cerrado/.test(q)) return "Nuestro horario es de 8:00 a. m. a 8:00 p. m., hora de Venezuela.";
  if (/pago m[oó]vil|pago movil|tel[eé]fono|0412/.test(q)) return "Aceptamos Pago Móvil. Teléfono: 0412-1666870. País: Venezuela. El carrito muestra el monto en bolívares.";
  if (/punto de venta|tarjeta|d[eé]bito/.test(q)) return "También puedes pagar por Punto de Venta al retirar tu pedido en la tienda.";
  if (/d[oó]lar|bol[ií]var|bs\.?|tasa|bcv|precio/.test(q)) return "Mostramos los precios en dólares y bolívares. Los precios en bolívares se calculan con la tasa BCV, salvo que la tienda indique un precio manual.";
  if (/pedido|comprar|carrito|whatsapp|pedir/.test(q)) return "Agrega los productos al carrito, escribe tu nombre, selecciona el método de pago y pulsa Ir a WhatsApp para enviar el pedido.";
  if (/agotado|disponible|stock/.test(q)) return "Si un producto aparece como AGOTADO, no se puede agregar al carrito por el momento.";
  if (/ubicaci[oó]n|direcci[oó]n|d[oó]nde queda/.test(q)) return "No tengo la dirección exacta registrada aquí. Escríbenos por WhatsApp y te ayudaremos con la ubicación.";
  return "Puedo ayudarte con horarios, precios, pagos, pedidos y retiro en tienda. Si necesitas algo específico, escríbenos por WhatsApp para que el equipo te ayude.";
}
function renderAssistant() {
  openModal(`<button class="close" id="assistantClose">×</button><h2>✦ Asistente Teresita</h2><p>Pregúntame sobre pedidos, precios, pagos o retiro.</p><div class="assistant-chat" id="assistantChat">${assistantMessages.map(m => `<div class="assistant-bubble ${m.from}">${escapeHtml(m.text)}</div>`).join("")}</div><form class="assistant-form" id="assistantForm"><input id="assistantInput" maxlength="300" placeholder="Escribe tu duda…" autocomplete="off" required><button class="btn primary" type="submit">Enviar</button></form><div id="assistantRating" class="assistant-rating" hidden><b>¿Te ayudó el asistente?</b><div><button class="mini" data-rating="5">⭐ Muy bien</button><button class="mini" data-rating="3">🙂 Más o menos</button><button class="mini" data-rating="1">🙁 No me ayudó</button></div><small id="assistantThanks"></small></div>`);
  $("#assistantClose").onclick = closeModal;
  $("#assistantForm").onsubmit = e => {
    e.preventDefault(); const input = $("#assistantInput"); const text = input.value.trim(); if (!text) return;
    assistantMessages.push({from:"user",text},{from:"bot",text:assistantReply(text)}); renderAssistant();
    const chat = $("#assistantChat"); chat.scrollTop = chat.scrollHeight;
  };
  if (assistantMessages.length >= 5) $("#assistantRating").hidden = false;
  document.querySelectorAll("[data-rating]").forEach(btn => btn.onclick = () => {
    $("#assistantThanks").textContent = "¡Gracias por calificar la atención!";
    document.querySelectorAll("[data-rating]").forEach(b => b.disabled = true);
  });
}
