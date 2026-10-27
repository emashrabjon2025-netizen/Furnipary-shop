import { CATEGORIES, ADMIN_UIDS } from "./config.js";
import {
  db,
  auth,
  configured,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "./firebase.js";
import {
  $,
  $$,
  formatPrice,
  escapeHtml,
  categoryLabel,
  matchCategory,
  parsePrice,
  toast,
  compressImage,
  PLACEHOLDER_IMG,
} from "./util.js";

const XLSX_URL = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";
const STATUSES = ["Yangi", "Bog'landik", "Yuborildi", "Bekor qilindi"];

let products = [];
let orders = [];
let unsub = [];
let editingId = null;
let pickedFile = null;
let importRows = [];

const isAdmin = (user) => !!user && ADMIN_UIDS.includes(user.uid);

// ================= Kirish =================
if (!configured) {
  $("#notConfigured").hidden = false;
} else {
  onAuthStateChanged(auth, (user) => {
    unsub.forEach((u) => u());
    unsub = [];
    if (isAdmin(user)) {
      $("#loginView").hidden = true;
      $("#appView").hidden = false;
      $("#logout").hidden = false;
      startListeners();
    } else {
      if (user) {
        signOut(auth);
        $("#loginMsg").textContent = "Bu akkauntga admin panelga kirish ruxsati yo'q.";
      }
      $("#loginView").hidden = false;
      $("#appView").hidden = true;
      $("#logout").hidden = true;
    }
  });
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  $("#loginMsg").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, f.email.value.trim(), f.password.value);
  } catch (err) {
    console.error(err);
    $("#loginMsg").textContent = "Email yoki parol noto'g'ri.";
  }
});
$("#logout").addEventListener("click", () => signOut(auth));

// ================= Tablar =================
$$(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.toggle("on", x === t));
    $$(".tabpane").forEach((p) => (p.hidden = p.id !== "tab-" + t.dataset.tab));
  })
);

function startListeners() {
  unsub.push(
    onSnapshot(query(collection(db, "products"), orderBy("createdAt", "desc")), (snap) => {
      products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      $("#pCount").textContent = products.length;
      renderProducts();
    })
  );
  unsub.push(
    onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (snap) => {
      orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const n = orders.filter((o) => o.status === "Yangi").length;
      $("#oNew").textContent = n || "";
      $("#oNew").className = n ? "new" : "";
      renderOrders();
    })
  );
}

// ================= Mahsulotlar =================
const catOptions = CATEGORIES.map((c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join("");
$("#pCat").insertAdjacentHTML("beforeend", catOptions);
$("#pForm").elements.category.innerHTML = `<option value="">— tanlang —</option>` + catOptions;
$("#pCat").addEventListener("change", renderProducts);
$("#pSearch").addEventListener("input", renderProducts);

function renderProducts() {
  const cat = $("#pCat").value;
  const s = $("#pSearch").value.trim().toLowerCase();
  const list = products.filter(
    (p) => (cat === "all" || p.category === cat) && (!s || (p.name || "").toLowerCase().includes(s))
  );
  $("#pList").innerHTML = list.length
    ? list
        .map(
          (p) => `<div class="row ${p.active === false ? "off" : ""}">
        <img src="${escapeHtml(p.thumb || p.imgUrl || PLACEHOLDER_IMG)}" alt="" loading="lazy" />
        <div class="meta">
          <b>${escapeHtml(p.name)}</b>
          <small>${escapeHtml(categoryLabel(p.category))} · ${formatPrice(p.price)}${p.salePrice ? " → " + formatPrice(p.salePrice) : ""}${p.stock === 0 ? " · tugagan" : p.stock ? " · " + p.stock + " ta" : ""}${p.active === false ? " · yashirin" : ""}</small>
        </div>
        <div class="row-actions">
          <button class="icon-btn" data-edit="${p.id}" title="O'zgartirish">✎</button>
          <button class="icon-btn del" data-del="${p.id}" title="O'chirish">🗑</button>
        </div>
      </div>`
        )
        .join("")
    : `<p class="empty">Mahsulot yo'q. "+ Yangi mahsulot" yoki Excel orqali qo'shing.</p>`;
}

$("#pList").addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-edit]");
  const del = e.target.closest("[data-del]");
  if (ed) openForm(ed.dataset.edit);
  if (del) {
    const p = products.find((x) => x.id === del.dataset.del);
    if (!p || !confirm(`"${p.name}" o'chirilsinmi?`)) return;
    try {
      await deleteDoc(doc(db, "products", p.id));
      if (p.hasImage) await deleteDoc(doc(db, "productImages", p.id));
      toast("O'chirildi");
    } catch (err) {
      console.error(err);
      toast("O'chirib bo'lmadi: " + err.message, "err");
    }
  }
});

$("#newProduct").addEventListener("click", () => openForm(null));

function openForm(id) {
  const f = $("#pForm").elements;
  $("#pForm").reset();
  pickedFile = null;
  editingId = id;
  const p = id ? products.find((x) => x.id === id) : null;
  $("#pFormTitle").textContent = p ? "Mahsulotni o'zgartirish" : "Yangi mahsulot";
  if (p) {
    f.name.value = p.name || "";
    f.category.value = p.category || "";
    f.price.value = p.price || "";
    f.salePrice.value = p.salePrice || "";
    f.stock.value = p.stock ?? "";
    f.description.value = p.description || "";
    f.imgUrl.value = p.imgUrl || "";
    f.active.checked = p.active !== false;
  } else {
    f.active.checked = true;
    if ($("#pCat").value !== "all") f.category.value = $("#pCat").value;
  }
  $("#pPreview").src = p?.thumb || p?.imgUrl || PLACEHOLDER_IMG;
  $("#pDlg").showModal();
}

$("#pForm").elements.file.addEventListener("change", (e) => {
  pickedFile = e.target.files[0] || null;
  if (pickedFile) $("#pPreview").src = URL.createObjectURL(pickedFile);
});
$("#pForm").elements.imgUrl.addEventListener("change", (e) => {
  if (!pickedFile && e.target.value) $("#pPreview").src = e.target.value;
});

$("#pForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const price = parsePrice(f.price.value);
  const salePrice = parsePrice(f.salePrice.value);
  if (!f.name.value.trim()) return toast("Nomini yozing", "err");
  if (!f.category.value) return toast("Kategoriyani tanlang", "err");
  if (!price) return toast("Narxini yozing", "err");
  if (salePrice && salePrice >= price) return toast("Chegirma narxi asosiy narxdan kichik bo'lishi kerak", "err");

  const data = {
    name: f.name.value.trim(),
    category: f.category.value,
    price,
    salePrice: salePrice || null,
    stock: f.stock.value.trim() === "" ? null : parsePrice(f.stock.value),
    description: f.description.value.trim(),
    imgUrl: f.imgUrl.value.trim(),
    active: f.active.checked,
    updatedAt: serverTimestamp(),
  };

  const btn = e.target.querySelector("[type=submit]");
  btn.disabled = true;
  btn.textContent = "Saqlanmoqda…";
  try {
    const ref = editingId ? doc(db, "products", editingId) : doc(collection(db, "products"));
    let full = null;
    if (pickedFile) {
      data.thumb = await compressImage(pickedFile, 480, 0.72);
      full = await compressImage(pickedFile, 1200, 0.8);
      if (full.length > 900000) full = await compressImage(pickedFile, 1000, 0.6);
      data.hasImage = true;
    } else if (!editingId) {
      data.thumb = "";
      data.hasImage = false;
    } else {
      const old = products.find((x) => x.id === editingId);
      if (data.imgUrl && old && data.imgUrl !== (old.imgUrl || "")) {
        // yangi link berildi — eski yuklangan rasm o'rniga shu ko'rsatiladi
        data.thumb = "";
        data.hasImage = false;
        if (old.hasImage) await deleteDoc(doc(db, "productImages", editingId));
      }
    }
    if (full) await setDoc(doc(db, "productImages", ref.id), { data: full });
    if (editingId) await updateDoc(ref, data);
    else await setDoc(ref, { ...data, createdAt: serverTimestamp() });
    toast("Saqlandi");
    $("#pDlg").close();
  } catch (err) {
    console.error(err);
    toast("Saqlab bo'lmadi: " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "Saqlash";
  }
});

// ================= Buyurtmalar =================
$("#oStatus").addEventListener("change", renderOrders);

function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : null;
  if (!d) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderOrders() {
  const st = $("#oStatus").value;
  const list = orders.filter((o) => st === "all" || o.status === st);
  $("#oList").innerHTML = list.length
    ? list
        .map(
          (o) => `<div class="order" data-s="${escapeHtml(o.status)}">
      <div class="order-head">
        <b>#${o.id.slice(0, 6).toUpperCase()} · ${escapeHtml(o.name)}</b>
        <small>${fmtDate(o.createdAt)}</small>
      </div>
      <a class="phone" href="tel:${escapeHtml(o.phone)}">${escapeHtml(o.phone)}</a>
      ${o.address ? `<small>📍 ${escapeHtml(o.address)}</small>` : ""}
      ${o.comment ? `<small>💬 ${escapeHtml(o.comment)}</small>` : ""}
      <ul>${(o.items || []).map((i) => `<li>${escapeHtml(i.name)} × ${i.qty} — ${formatPrice(i.price * i.qty)}</li>`).join("")}</ul>
      <div class="order-foot">
        <b>Jami: ${formatPrice(o.total)}</b>
        <div class="row-actions">
          <select data-status="${o.id}">${STATUSES.map((s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select>
          <button class="icon-btn del" data-odel="${o.id}" title="O'chirish">🗑</button>
        </div>
      </div>
    </div>`
        )
        .join("")
    : `<p class="empty">Buyurtma yo'q.</p>`;
}

$("#oList").addEventListener("change", async (e) => {
  const sel = e.target.closest("[data-status]");
  if (!sel) return;
  try {
    await updateDoc(doc(db, "orders", sel.dataset.status), { status: sel.value });
  } catch (err) {
    toast("Saqlab bo'lmadi: " + err.message, "err");
  }
});
$("#oList").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-odel]");
  if (!b || !confirm("Buyurtma o'chirilsinmi?")) return;
  try {
    await deleteDoc(doc(db, "orders", b.dataset.odel));
  } catch (err) {
    toast("O'chirib bo'lmadi: " + err.message, "err");
  }
});

// ================= Excel / Zaxira =================
let XLSX = null;
async function loadXlsx() {
  if (!XLSX) XLSX = await import(XLSX_URL);
  return XLSX;
}

function download(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}
const stamp = () => new Date().toISOString().slice(0, 10);

const HEADERS = ["Nomi", "Kategoriya", "Narxi", "Chegirma narxi", "Tavsif", "Soni", "Rasm (link)"];

$("#exportXlsx").addEventListener("click", async () => {
  const X = await loadXlsx();
  const rows = products.map((p) => ({
    Nomi: p.name,
    Kategoriya: categoryLabel(p.category),
    Narxi: p.price,
    "Chegirma narxi": p.salePrice || "",
    Tavsif: p.description || "",
    Soni: p.stock ?? "",
    "Rasm (link)": p.imgUrl || "",
  }));
  const ws = X.utils.json_to_sheet(rows, { header: HEADERS });
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, "Mahsulotlar");
  X.writeFile(wb, `furnipart-mahsulotlar-${stamp()}.xlsx`);
});

$("#exportJson").addEventListener("click", async (e) => {
  const btn = e.target;
  btn.disabled = true;
  btn.textContent = "Tayyorlanmoqda…";
  try {
    const imgs = await getDocs(collection(db, "productImages"));
    const images = Object.fromEntries(imgs.docs.map((d) => [d.id, d.data().data]));
    const data = products.map(({ createdAt, updatedAt, ...p }) => ({ ...p, image: images[p.id] || null }));
    download(`furnipart-zaxira-${stamp()}.json`, new Blob([JSON.stringify(data)], { type: "application/json" }));
  } catch (err) {
    toast("Xatolik: " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "To'liq zaxira (rasmlar bilan)";
  }
});

$("#template").addEventListener("click", async () => {
  const X = await loadXlsx();
  const ws = X.utils.aoa_to_sheet([
    HEADERS,
    ["Mebelchilar uchun chamadon", "Shablonlar", 365000, "", "Ikkita alohida qutisi bor", 10, ""],
    ["Ortopedik matras 160x200", "Matraslar", 2500000, 2200000, "5 yil kafolat", "", ""],
  ]);
  ws["!cols"] = [{ wch: 32 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 8 }, { wch: 30 }];
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, "Mahsulotlar");
  X.writeFile(wb, "furnipart-namuna.xlsx");
});

// Sarlavhani ichki maydon nomiga moslash ("Chegirma narxi" "narx"dan oldin tekshiriladi)
function fieldOf(header) {
  const h = String(header || "").toLowerCase().trim();
  const rules = [
    ["salePrice", ["chegirma", "skidka", "скидк", "sale", "aksiya", "акци"]],
    ["name", ["nomi", "nom", "name", "назван", "наимен", "mahsulot", "товар"]],
    ["category", ["kategor", "категор", "category", "toifa", "bo'lim", "bolim"]],
    ["price", ["narx", "price", "цена", "нарх", "summa"]],
    ["description", ["tavsif", "izoh", "description", "описан", "haqida", "tafsilot"]],
    ["stock", ["soni", "miqdor", "qoldiq", "stock", "количе", "кол-во", "сони"]],
    ["imgUrl", ["rasm", "image", "фото", "img", "url", "link", "surat"]],
  ];
  for (const [field, keys] of rules) if (keys.some((k) => h.includes(k))) return field;
  return null;
}

$("#importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const X = await loadXlsx();
    const wb = X.read(await file.arrayBuffer());
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = X.utils.sheet_to_json(sheet, { defval: "" });
    importRows = raw
      .map((r) => {
        const o = {};
        for (const [k, v] of Object.entries(r)) {
          const f = fieldOf(k);
          if (f && o[f] === undefined) o[f] = v;
        }
        const row = {
          name: String(o.name ?? "").trim(),
          categoryRaw: String(o.category ?? "").trim(),
          category: matchCategory(o.category),
          price: parsePrice(o.price),
          salePrice: parsePrice(o.salePrice) || null,
          description: String(o.description ?? "").trim(),
          stock: String(o.stock ?? "").trim() === "" ? null : parsePrice(o.stock),
          imgUrl: /^https?:\/\//.test(String(o.imgUrl ?? "").trim()) ? String(o.imgUrl).trim() : "",
        };
        if (row.salePrice && row.salePrice >= row.price) row.salePrice = null;
        row.errors = [
          !row.name && "nomi yo'q",
          !row.category && `kategoriya noma'lum${row.categoryRaw ? ` ("${row.categoryRaw}")` : ""}`,
          !row.price && "narxi yo'q",
        ].filter(Boolean);
        return row;
      })
      .filter((r) => r.name || r.price || r.categoryRaw);
    renderImportPreview(file.name);
  } catch (err) {
    console.error(err);
    toast("Faylni o'qib bo'lmadi: " + err.message, "err");
  }
});

function renderImportPreview(fileName) {
  const ok = importRows.filter((r) => !r.errors.length);
  const bad = importRows.length - ok.length;
  $("#importPreview").innerHTML = `
    <p class="summary">${escapeHtml(fileName)}: ${ok.length} ta tayyor${bad ? `, <span class="bad">${bad} ta xato (yuklanmaydi)</span>` : ""}</p>
    <div class="preview-scroll"><table class="preview-table">
      <thead><tr><th>#</th><th>Nomi</th><th>Kategoriya</th><th>Narxi</th><th>Chegirma</th><th>Soni</th><th>Holat</th></tr></thead>
      <tbody>${importRows
        .map(
          (r, i) => `<tr class="${r.errors.length ? "bad" : ""}"><td>${i + 2}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.category ? categoryLabel(r.category) : r.categoryRaw)}</td><td>${r.price ? formatPrice(r.price) : ""}</td><td>${r.salePrice ? formatPrice(r.salePrice) : ""}</td><td>${r.stock ?? ""}</td><td>${r.errors.length ? escapeHtml(r.errors.join(", ")) : "✓"}</td></tr>`
        )
        .join("")}</tbody>
    </table></div>
    ${
      ok.length
        ? `<label class="check"><input type="checkbox" id="replaceAll" /> Avval eski mahsulotlarning hammasini o'chirish (${products.length} ta)</label>
           <button class="btn btn-yellow" id="doImport">${ok.length} ta mahsulotni yuklash</button>`
        : ""
    }`;
  $("#doImport")?.addEventListener("click", doImport);
}

async function deleteAllProducts() {
  const ids = products.map((p) => p.id);
  const imgIds = products.filter((p) => p.hasImage).map((p) => p.id);
  const ops = [...ids.map((id) => ["products", id]), ...imgIds.map((id) => ["productImages", id])];
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach(([c, id]) => b.delete(doc(db, c, id)));
    await b.commit();
  }
  return ids.length;
}

async function doImport(e) {
  const btn = e.target;
  const replace = $("#replaceAll")?.checked;
  const ok = importRows.filter((r) => !r.errors.length);
  if (replace && !confirm(`Eski ${products.length} ta mahsulot o'chirilib, ${ok.length} ta yangisi yuklanadi. Davom etilsinmi?`)) return;
  btn.disabled = true;
  btn.textContent = "Yuklanmoqda…";
  try {
    if (replace) await deleteAllProducts();
    for (let i = 0; i < ok.length; i += 400) {
      const b = writeBatch(db);
      ok.slice(i, i + 400).forEach(({ errors, categoryRaw, ...r }) => {
        b.set(doc(collection(db, "products")), {
          ...r,
          thumb: "",
          hasImage: false,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await b.commit();
    }
    toast(`${ok.length} ta mahsulot yuklandi`);
    $("#importPreview").innerHTML = `<p class="summary">✓ ${ok.length} ta mahsulot yuklandi. Rasmlarni "Mahsulotlar" bo'limida ✎ orqali qo'shing.</p>`;
    importRows = [];
  } catch (err) {
    console.error(err);
    toast("Xatolik: " + err.message, "err");
    btn.disabled = false;
    btn.textContent = "Qayta urinish";
  }
}

$("#deleteAll").addEventListener("click", async () => {
  if (!products.length) return toast("Mahsulot yo'q");
  const answer = prompt(`${products.length} ta mahsulot butunlay o'chiriladi. Tasdiqlash uchun O'CHIRISH deb yozing:`);
  if ((answer || "").trim().toUpperCase() !== "O'CHIRISH") return;
  try {
    const n = await deleteAllProducts();
    toast(`${n} ta mahsulot o'chirildi`);
  } catch (err) {
    toast("Xatolik: " + err.message, "err");
  }
});

// ================= Dialog =================
$$("dialog").forEach((d) =>
  d.addEventListener("click", (e) => {
    if (e.target === d || e.target.closest("[data-close]")) d.close();
  })
);
