import { SHOP, CATEGORIES, firebaseConfig } from "./config.js";
import {
  db,
  configured,
  collection,
  doc,
  getDoc,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "./firebase.js";
import {
  $,
  $$,
  formatPrice,
  escapeHtml,
  categoryLabel,
  effectivePrice,
  toast,
  normalizePhone,
  PLACEHOLDER_IMG,
} from "./util.js";

let products = [];
// ?k=matras kabi link bilan kirilsa, shu kategoriya ochiladi
const startCat = new URLSearchParams(location.search).get("k");
let activeCat = CATEGORIES.some((c) => c.id === startCat) ? startCat : "all";
let searchText = "";
let cart = loadCart();

// ---------- Do'kon ma'lumotlari ----------
$("#footAddress").textContent = SHOP.address;
$("#footPhone").textContent = SHOP.phone;
$("#footPhone").href = SHOP.phoneHref;
$("#heroPhone").href = SHOP.phoneHref;
$("#footInsta").href = SHOP.instagram;
$("#footTg").href = SHOP.telegram;

// ---------- Kategoriyalar ----------
function renderChips() {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
  products.forEach((p) => (counts[p.category] = (counts[p.category] || 0) + 1));
  const chips = [{ id: "all", label: "Barchasi", n: products.length }, ...CATEGORIES.map((c) => ({ ...c, n: counts[c.id] || 0 }))];
  $("#chips").innerHTML = chips
    .map(
      (c) =>
        `<button class="chip ${c.id === activeCat ? "on" : ""}" data-cat="${c.id}" role="tab" aria-selected="${c.id === activeCat}">${escapeHtml(c.label)}<span>${c.n}</span></button>`
    )
    .join("");
}
$("#chips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat]");
  if (!b) return;
  activeCat = b.dataset.cat;
  renderChips();
  renderGrid();
});
$("#search").addEventListener("input", (e) => {
  searchText = e.target.value.trim().toLowerCase();
  renderGrid();
});

// ---------- Mahsulotlar ----------
function imgOf(p) {
  return p.thumb || p.imgUrl || PLACEHOLDER_IMG;
}

function priceHtml(p) {
  const eff = effectivePrice(p);
  if (eff !== p.price) {
    return `<span class="price">${formatPrice(eff)}</span><s class="old">${formatPrice(p.price)}</s>`;
  }
  return `<span class="price">${formatPrice(p.price)}</span>`;
}

function renderGrid() {
  const list = products.filter(
    (p) =>
      (activeCat === "all" || p.category === activeCat) &&
      (!searchText || `${p.name} ${p.description || ""}`.toLowerCase().includes(searchText))
  );
  const empty = $("#empty");
  if (!list.length) {
    $("#grid").innerHTML = "";
    empty.hidden = false;
    empty.textContent = products.length
      ? "Bu bo'yicha mahsulot topilmadi."
      : "Mahsulotlar tez orada qo'shiladi. Savollar bo'lsa, qo'ng'iroq qiling: " + SHOP.phone;
    return;
  }
  empty.hidden = true;
  $("#grid").innerHTML = list
    .map((p) => {
      const sale = effectivePrice(p) !== p.price;
      const out = p.stock === 0;
      return `<article class="card" data-id="${p.id}">
        <button class="card-img" data-open="${p.id}" aria-label="${escapeHtml(p.name)}">
          <img src="${escapeHtml(imgOf(p))}" alt="" loading="lazy" />
          ${sale ? `<span class="badge">Chegirma</span>` : ""}
          ${out ? `<span class="badge badge-dark">Tugagan</span>` : ""}
        </button>
        <div class="card-body">
          <small class="cat">${escapeHtml(categoryLabel(p.category))}</small>
          <h3 data-open="${p.id}">${escapeHtml(p.name)}</h3>
          <div class="prices">${priceHtml(p)}</div>
          <button class="btn btn-yellow btn-sm" data-add="${p.id}" ${out ? "disabled" : ""}>${out ? "Tugagan" : "Savatga"}</button>
        </div>
      </article>`;
    })
    .join("");
}

$("#grid").addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add) return addToCart(add.dataset.add);
  const open = e.target.closest("[data-open]");
  if (open) openProduct(open.dataset.open);
});

async function openProduct(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  history.replaceState(null, "", "#p=" + id);
  const out = p.stock === 0;
  $("#productBody").innerHTML = `
    <div class="pd-img"><img id="pdImg" src="${escapeHtml(imgOf(p))}" alt="${escapeHtml(p.name)}" /></div>
    <small class="cat">${escapeHtml(categoryLabel(p.category))}</small>
    <h2>${escapeHtml(p.name)}</h2>
    <div class="prices big">${priceHtml(p)}</div>
    ${p.description ? `<p class="pd-desc">${escapeHtml(p.description).replace(/\n/g, "<br>")}</p>` : ""}
    <ul class="perks"><li>${escapeHtml(SHOP.delivery)}</li>${p.category === "matras" ? "<li>5 yil kafolat</li>" : ""}</ul>
    <div class="pd-actions">
      <button class="btn btn-yellow" data-add="${p.id}" ${out ? "disabled" : ""}>${out ? "Tugagan" : "Savatga qo'shish"}</button>
      <a class="btn btn-dark" href="${SHOP.phoneHref}">Qo'ng'iroq</a>
    </div>`;
  $("#productBody [data-add]")?.addEventListener("click", () => {
    addToCart(p.id);
    $("#productDlg").close();
  });
  $("#productDlg").showModal();
  if (p.hasImage) {
    try {
      const snap = await getDoc(doc(db, "productImages", p.id));
      if (snap.exists() && $("#pdImg")) $("#pdImg").src = snap.data().data;
    } catch (_) {
      /* kichik rasm qoladi */
    }
  }
}
$("#productDlg").addEventListener("close", () => {
  if (location.hash.startsWith("#p=")) history.replaceState(null, "", location.pathname);
});

// ---------- Savat ----------
function loadCart() {
  try {
    return JSON.parse(localStorage.getItem("fp_cart") || "[]");
  } catch (_) {
    return [];
  }
}
function saveCart() {
  try {
    localStorage.setItem("fp_cart", JSON.stringify(cart));
  } catch (_) {}
  updateCartCount();
}
function updateCartCount() {
  const n = cart.reduce((s, i) => s + i.qty, 0);
  const el = $("#cartCount");
  el.textContent = n;
  el.hidden = n === 0;
}
function addToCart(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  const row = cart.find((i) => i.id === id);
  if (row) row.qty += 1;
  else cart.push({ id, qty: 1 });
  saveCart();
  toast(`"${p.name}" savatga qo'shildi`);
}
function cartLines() {
  return cart
    .map((i) => {
      const p = products.find((x) => x.id === i.id);
      return p ? { ...i, p, price: effectivePrice(p) } : null;
    })
    .filter(Boolean);
}

function renderCart() {
  const lines = cartLines();
  if (!lines.length) {
    $("#cartItems").innerHTML = `<p class="empty">Savat bo'sh. Katalogdan mahsulot tanlang.</p>`;
    $("#cartFooter").innerHTML = "";
    return;
  }
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  $("#cartItems").innerHTML = lines
    .map(
      (l) => `<div class="line">
      <img src="${escapeHtml(imgOf(l.p))}" alt="" />
      <div class="line-info"><b>${escapeHtml(l.p.name)}</b><span>${formatPrice(l.price)}</span></div>
      <div class="qty">
        <button data-dec="${l.id}" aria-label="Kamaytirish">−</button><span>${l.qty}</span><button data-inc="${l.id}" aria-label="Ko'paytirish">+</button>
      </div>
    </div>`
    )
    .join("");
  $("#cartFooter").innerHTML = `
    <div class="total"><span>Jami:</span><b>${formatPrice(total)}</b></div>
    <form id="orderForm" class="order-form" novalidate>
      <h3>Buyurtma berish</h3>
      <label>Ismingiz<input name="name" required maxlength="60" autocomplete="name" /></label>
      <label>Telefon raqam<input name="phone" required inputmode="tel" placeholder="+998 90 123 45 67" autocomplete="tel" /></label>
      <label>Manzil (viloyat, shahar)<input name="address" maxlength="120" placeholder="Masalan: Farg'ona, Marg'ilon" /></label>
      <label>Izoh<textarea name="comment" rows="2" maxlength="300"></textarea></label>
      <button class="btn btn-yellow btn-block" type="submit">Buyurtmani yuborish</button>
      <p class="hint">Buyurtmadan so'ng siz bilan bog'lanamiz. ${escapeHtml(SHOP.delivery)}. <span style="opacity:.4">v6</span></p>
    </form>`;
  $("#orderForm").addEventListener("submit", submitOrder);
}

$("#cartItems").addEventListener("click", (e) => {
  const inc = e.target.closest("[data-inc]");
  const dec = e.target.closest("[data-dec]");
  if (!inc && !dec) return;
  const id = (inc || dec).dataset[inc ? "inc" : "dec"];
  const row = cart.find((i) => i.id === id);
  if (!row) return;
  row.qty += inc ? 1 : -1;
  if (row.qty <= 0) cart = cart.filter((i) => i.id !== id);
  saveCart();
  renderCart();
});

$("#cartOpen").addEventListener("click", () => {
  renderCart();
  $("#cartDlg").showModal();
});

async function submitOrder(e) {
  e.preventDefault();
  const form = e.target;
  const f = form.elements;
  const name = f.name.value.trim();
  const phone = normalizePhone(f.phone.value);
  if (name.length < 2) return toast("Ismingizni yozing", "err");
  if (!phone) return toast("Telefon raqamni to'g'ri yozing: +998 XX XXX XX XX", "err");
  const lines = cartLines();
  if (!lines.length) return;
  const order = {
    name,
    phone,
    address: f.address.value.trim(),
    comment: f.comment.value.trim(),
    items: lines.map((l) => ({ id: l.id, name: l.p.name, price: l.price, qty: l.qty })),
    total: lines.reduce((s, l) => s + l.price * l.qty, 0),
    status: "Yangi",
    createdAt: serverTimestamp(),
  };
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Yuborilmoqda…";
  try {
    const ref = await createOrderRest(order);
    fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...order, createdAt: undefined, id: ref.id }),
    }).catch(() => {});
    cart = [];
    saveCart();
    $("#cartItems").innerHTML = `<div class="done">
      <div class="done-ico">✓</div>
      <h3>Buyurtmangiz qabul qilindi!</h3>
      <p>Raqam: <b>#${ref.id.slice(0, 6).toUpperCase()}</b>. Tez orada siz bilan bog'lanamiz.</p>
      <a class="btn btn-dark" href="${SHOP.phoneHref}">${escapeHtml(SHOP.phone)}</a>
    </div>`;
    $("#cartFooter").innerHTML = "";
  } catch (err) {
    console.error(err);
    toast("Yuborib bo'lmadi (" + (err.code || "xato") + "). Iltimos, qo'ng'iroq qiling: " + SHOP.phone, "err");
    btn.disabled = false;
    btn.textContent = "Buyurtmani yuborish";
  }
}

// Buyurtmani Firestore REST API orqali yozish: aniq javob (yoki xato) qaytaradi, qotib qolmaydi.
function fsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
  return { mapValue: { fields: fsFields(v) } };
}
function fsFields(o) {
  const f = {};
  Object.entries(o).forEach(([k, v]) => (f[k] = fsValue(v)));
  return f;
}
async function createOrderRest(order) {
  const { createdAt, ...data } = order;
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const rnd = crypto.getRandomValues(new Uint8Array(20));
  const id = Array.from(rnd, (n) => abc[n % abc.length]).join("");
  const base = `projects/${firebaseConfig.projectId}/databases/(default)/documents`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/${base}:commit?key=${firebaseConfig.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          writes: [
            {
              update: { name: `${base}/orders/${id}`, fields: fsFields(data) },
              updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
              currentDocument: { exists: false },
            },
          ],
        }),
      }
    );
    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try {
        const j = await res.json();
        msg = (j.error && (j.error.status || j.error.message)) || msg;
      } catch (_) {}
      const e = new Error(msg);
      e.code = msg;
      throw e;
    }
    return { id };
  } catch (err) {
    if (err.name === "AbortError") err.code = "internet sekin / javob yo'q";
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Dialoglar ----------
$$("dialog").forEach((d) => {
  d.addEventListener("click", (e) => {
    if (e.target === d || e.target.closest("[data-close]")) d.close();
  });
});

window.addEventListener("hashchange", () => {
  const m = location.hash.match(/^#p=(.+)$/);
  if (m && !$("#productDlg").open) openProduct(m[1]);
});

// ---------- Yuklash ----------
// Tayyor kataloglar (/catalog/*.json) — bazaga qo'shilmagan bo'lsa ham saytda ko'rinadi.
// Bazada shu ID yoki nomdagi mahsulot bo'lsa, bazadagisi ishlatiladi (admin o'zgartirishi/yashirishi mumkin).
const CATALOGS = ["higold-oshxona", "higold-garderob"];
let catalogItems = [];
async function loadCatalogs() {
  const all = await Promise.all(
    CATALOGS.map((k) =>
      fetch(`/catalog/${k}.json`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => d.items || [])
        .catch(() => [])
    )
  );
  catalogItems = all.flat().map((it) => ({
    salePrice: null,
    stock: null,
    thumb: "",
    hasImage: false,
    active: true,
    ...it,
    imgUrl: (it.imgUrl || "").replace(/^https?:\/\/furnipart-shop\.vercel\.app/, ""),
  }));
}
renderChips();
updateCartCount();
if (!configured) {
  $("#grid").innerHTML = "";
  $("#empty").hidden = false;
  $("#empty").textContent = "Sayt sozlanmoqda…";
} else {
  let dbAll = [];
  let dbReady = false;
  const refresh = () => {
    const seenIds = new Set(dbAll.map((p) => p.id));
    const seenNames = new Set(dbAll.map((p) => (p.name || "").trim().toLowerCase()));
    const extra = catalogItems.filter(
      (it) => !seenIds.has(it.id) && !seenNames.has(it.name.trim().toLowerCase())
    );
    products = [...dbAll.filter((p) => p.active !== false), ...extra];
    if (!products.length && !dbReady) return;
    renderChips();
    renderGrid();
    updateCartCount();
    const m = location.hash.match(/^#p=(.+)$/);
    if (m && !$("#productDlg").open) openProduct(m[1]);
  };
  loadCatalogs().then(refresh);
  const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
  onSnapshot(
    q,
    (snap) => {
      dbAll = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      dbReady = true;
      refresh();
    },
    (err) => {
      console.error(err);
      dbReady = true;
      refresh();
      if (!products.length) {
        $("#grid").innerHTML = "";
        $("#empty").hidden = false;
        $("#empty").textContent = "Mahsulotlarni yuklab bo'lmadi. Sahifani yangilang.";
      }
    }
  );
}
