// Admin → "🛋 Divan ombor": divan qismlari (bosh / yon / oyoq tomoni, ugolnik) kirim–sotuv–qoldiq hisobi.
// Asosiy sotuvlar (crmSales), reja va hisobotlarga ARALASHMAYDI. Qo'shimcha Firebase qoidasi talab qilmasligi uchun
// mavjud admin kolleksiyalarida, alohida prefiks bilan saqlanadi:
//   crmSettings/dvi_*  — turlar (qism + rang, narx)
//   crmSettings/dvm_*  — harakatlar: type in|sale|out, lines [{itemId, qty}], sum, date, client, note, photos
//   dvPhotos/dsi_<turId>, dvPhotos/dsm_<harakatId> — rasmlar (kerak bo'lganda yuklanadi)
import { ADMIN_UIDS } from "./config.js";
import { db, auth, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, writeBatch, onAuthStateChanged } from "./firebase.js";
import { $, escapeHtml as esc, toast, compressImage } from "./util.js";

const PARTS = { bosh: "Bosh tomoni", yon: "Yon tomoni", oyoq: "Oyoq tomoni", ugolnik: "Ugolnik", boshqa: "Boshqa" };
const PART_ORDER = ["bosh", "yon", "oyoq", "ugolnik", "boshqa"];
const TYPES = { in: "➕ Kirim", sale: "💰 Sotuv", out: "➖ Chiqim / brak" };
const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
const DEFAULTS = [
  { part: "bosh", color: "Sutli velyur", size: "170×210", price: 580000 },
  { part: "bosh", color: "Bordo koja", size: "170×210", price: 580000 },
  { part: "yon", color: "Sutli velyur", size: "210", price: 0 },
  { part: "yon", color: "Bordo koja", size: "210", price: 0 },
  { part: "oyoq", color: "Sutli velyur", size: "170", price: 0 },
  { part: "oyoq", color: "Bordo koja", size: "170", price: 0 },
  { part: "ugolnik", color: "", size: "", price: 0 },
];

let items = [];
let moves = [];
let unsub = [];
let editItem = null;
let itemPhoto = "";
let moveType = "in";
let movePhotos = [];
const photoCache = {};
const itemPhotos = {};
const COL = "crmSettings";
const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const pad = (n) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const num = (v) => Number(String(v || "").replace(/[^\d]/g, "")) || 0;
const fmt = (n) => Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ");
const som = (n) => fmt(n) + " so'm";
const fmtDate = (s) => (s ? s.split("-").reverse().join(".") : "");
const itemName = (it) => (it ? `${PARTS[it.part] || it.part}${it.color ? " — " + it.color : ""}${it.size ? " (" + it.size + ")" : ""}` : "o'chirilgan tur");
const byId = (id) => items.find((i) => i.id === id);
const colorKey = (c) =>
  String(c || "").toLowerCase().replace(/[ʻʼ'`‘’]/g, "").replace(/villur|velur|velyur/g, "velyur").replace(/malochniy|molochniy|sutli/g, "sutli").replace(/bordo|qizil/g, "qizil").replace(/kashmir|kashemir/g, "kashmir")
    .split(/[\s,·-]+/).filter(Boolean).sort().join(" ");
const sortItems = (a, b) => PART_ORDER.indexOf(a.part) - PART_ORDER.indexOf(b.part) || String(a.color || "").localeCompare(String(b.color || ""));

// qoldiq va statistika
function stats(ym) {
  const s = {};
  items.forEach((i) => (s[i.id] = { in: 0, sale: 0, out: 0, mIn: 0, mSale: 0, mOut: 0 }));
  moves.forEach((m) => {
    const inMonth = (m.date || "").startsWith(ym);
    (m.lines || []).forEach((ln) => {
      const x = s[ln.itemId];
      if (!x) return;
      const q = Number(ln.qty) || 0;
      x[m.type] += q;
      if (inMonth) x["m" + m.type[0].toUpperCase() + m.type.slice(1)] += q;
    });
  });
  Object.values(s).forEach((x) => (x.left = x.in - x.sale - x.out));
  return s;
}

function render() {
  const ym = $("#dsMonth").value || today().slice(0, 7);
  const [y, mo] = ym.split("-").map(Number);
  const st = stats(ym);
  const mMoves = moves.filter((m) => (m.date || "").startsWith(ym));
  const mSales = mMoves.filter((m) => m.type === "sale");
  const totalLeft = items.reduce((a, i) => a + Math.max(0, st[i.id].left), 0);
  const stockValue = items.reduce((a, i) => a + Math.max(0, st[i.id].left) * (Number(i.price) || 0), 0);
  const kits = mSales.filter((m) => m.kit).reduce((a, m) => a + (Number(m.kitQty) || 0), 0);
  const low = items.filter((i) => st[i.id].left <= (Number(i.min) || 0));
  $("#dsKpi").innerHTML = `
    <div><small>Omborda jami</small><b>${totalLeft} dona</b><small class="muted">≈ ${som(stockValue)}</small></div>
    <div><small>${MONTHS[mo - 1]} — kirim</small><b>${items.reduce((a, i) => a + st[i.id].mIn, 0)} dona</b></div>
    <div><small>${MONTHS[mo - 1]} — sotilgan</small><b>${items.reduce((a, i) => a + st[i.id].mSale, 0)} dona</b><small class="muted">${kits ? `shundan ${kits} komplekt` : ""}</small></div>
    <div><small>${MONTHS[mo - 1]} — sotuv summasi</small><b>${som(mSales.reduce((a, m) => a + (Number(m.sum) || 0), 0))}</b><small class="muted">${mSales.length} ta sotuv</small></div>
    ${low.length ? `<div class="neg"><small>Kam qolgan</small><b>${low.length} tur</b><small>${low.map((i) => esc(itemName(i))).slice(0, 3).join(", ")}</small></div>` : ""}`;

  const card = (i) => {
    const x = st[i.id];
    const lowCls = x.left <= (Number(i.min) || 0) ? "low" : "";
    return `<div role="button" tabindex="0" class="ds-card ${lowCls}" data-item="${i.id}">
            <button type="button" class="ds-del" data-delitem="${i.id}" aria-label="O'chirish" title="O'chirish">🗑</button>
            <span class="ds-img">${itemPhotos[i.id] ? `<img src="${itemPhotos[i.id]}" alt="" />` : `<i>${i.part === "ugolnik" ? "📐" : "🛋"}</i>`}</span>
            <span class="ds-info">
              <b>${esc(PARTS[i.part] || i.part)}</b>
              <small>${esc(i.color || "")}${i.size ? " · " + esc(i.size) : ""}</small>
              <span class="ds-left">${x.left} <small>dona qoldi</small></span>
              <small class="muted">Sotilgan: ${x.mSale} (oy) · ${x.sale} (jami) · Kirim: ${x.in}${x.out ? " · Chiqim: " + x.out : ""}</small>
            </span>
          </div>`;
  };
  const groups = new Map();
  items.forEach((i) => {
    const k = colorKey(i.color);
    if (!groups.has(k)) groups.set(k, { name: i.color || "", list: [] });
    groups.get(k).list.push(i);
  });
  const gList = [...groups.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  $("#dsGrid").innerHTML = items.length
    ? gList
        .map(([k, g]) => {
          const sum = (p) => g.list.filter((i) => i.part === p).reduce((a, i) => a + Math.max(0, st[i.id].left), 0);
          const has = (p) => g.list.some((i) => i.part === p);
          const total = g.list.reduce((a, i) => a + Math.max(0, st[i.id].left), 0);
          const sold = g.list.reduce((a, i) => a + st[i.id].mSale, 0);
          const kit = has("bosh") && has("yon") && has("oyoq") ? Math.min(sum("bosh"), Math.floor(sum("yon") / 2), sum("oyoq")) : null;
          const chips = ["bosh", "yon", "oyoq", "ugolnik", "boshqa"].filter(has).map((p) => `<span>${esc(PARTS[p])}: <b>${sum(p)}</b></span>`).join("");
          return `<details class="ds-group" open>
            <summary>
              <span class="ds-gname">🎨 ${esc(k ? g.name : "Umumiy (rangsiz)")}</span>
              <span class="ds-gsum">${total} dona · ${g.list.length} tur${sold ? ` · bu oy ${sold} sotildi` : ""}</span>
              <span class="ds-gchips">${chips}${kit !== null ? `<span class="${kit ? "ok" : "no"}">🛋 Komplekt chiqadi: <b>${kit}</b></span>` : ""}</span>
            </summary>
            <div class="ds-ggrid">${g.list.slice().sort(sortItems).map(card).join("")}</div>
          </details>`;
        })
        .join("")
    : `<div class="panel"><p>Hali tur qo'shilmagan.</p><button class="btn btn-yellow" type="button" id="dsSeed">⚡ Standart turlarni qo'shish (bosh, yon, oyoq — sutli velyur va bordo koja, ugolnik)</button></div>`;

  const f = $("#dsFilter").value;
  const list = mMoves.filter((m) => f === "all" || m.type === f).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.at || 0) - (a.at || 0));
  $("#dsMovesTitle").textContent = `🧾 Harakatlar — ${MONTHS[mo - 1]} ${y}`;
  $("#dsMoves").innerHTML = list.length
    ? `<div class="ttable-wrap"><table class="ttable"><thead><tr><th>Sana</th><th>Turi</th><th>Mahsulot</th><th>Summa</th><th></th></tr></thead><tbody>${list
        .map(
          (m) => `<tr data-move="${m.id}" class="ds-row">
          <td>${fmtDate(m.date)}</td>
          <td class="small"><span class="pill ${m.type === "in" ? "ok" : m.type === "sale" ? "today" : "late"}">${TYPES[m.type]}</span></td>
          <td class="small">${m.kit ? `<b>🛋 Komplekt × ${m.kitQty}</b> — ${esc(m.kitColor || "")}<br>` : ""}${(m.lines || []).map((ln) => `${esc(itemName(byId(ln.itemId)))} × <b>${ln.qty}</b>`).join("<br>")}${m.client ? `<br>👤 ${esc(m.client)} ${esc(m.phone || "")}` : ""}${m.note ? `<br><span class="muted">📝 ${esc(m.note)}</span>` : ""}</td>
          <td>${m.sum ? som(m.sum) : "—"}</td>
          <td>${m.photos ? "📷" : ""}</td>
        </tr>`
        )
        .join("")}</tbody></table></div>`
    : `<p class="muted">Bu oyda harakat yo'q.</p>`;
}

// ---------- Turlar ----------
function openItem(it) {
  editItem = it ? it.id : null;
  itemPhoto = it ? itemPhotos[it.id] || "" : "";
  const f = $("#dsItemForm").elements;
  $("#dsItemForm").reset();
  $("#dsItemTitle").textContent = it ? "✏️ Turni tahrirlash" : "🗂 Yangi tur";
  if (it) {
    f.part.value = it.part || "bosh";
    f.color.value = it.color || "";
    f.size.value = it.size || "";
    f.price.value = it.price ? fmt(it.price) : "";
    f.cost.value = it.cost ? fmt(it.cost) : "";
    f.min.value = it.min ?? 2;
  }
  $("#dsItemDel").hidden = !it;
  drawItemPh();
  $("#dsItemDlg").showModal();
}
function drawItemPh() {
  $("#dsItemPh").innerHTML = itemPhoto ? `<span class="ph"><img src="${itemPhoto}" alt="" /><button type="button" data-rmitemph aria-label="O'chirish">×</button></span>` : "";
}
$("#dsItemPhIn").addEventListener("change", async (e) => {
  const fl = e.target.files[0];
  e.target.value = "";
  if (!fl) return;
  try {
    itemPhoto = await compressImage(fl, 700, 0.72);
    drawItemPh();
  } catch (err) {
    toast(err.message, "err");
  }
});
$("#dsItemPh").addEventListener("click", (e) => {
  if (e.target.closest("[data-rmitemph]")) (itemPhoto = ""), drawItemPh();
});
$("#dsItemForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const data = { part: f.part.value, color: f.color.value.trim(), size: f.size.value.trim(), price: num(f.price.value), cost: num(f.cost.value), min: Number(f.min.value) || 0, hasPhoto: !!itemPhoto, updatedAt: serverTimestamp() };
  try {
    const id = editItem || newId("dvi_");
    if (itemPhoto) await setDoc(doc(db, "dvPhotos", "dsi_" + id), { images: [itemPhoto] });
    else if (editItem && itemPhotos[id]) await deleteDoc(doc(db, "dvPhotos", "dsi_" + id));
    itemPhotos[id] = itemPhoto;
    if (editItem) await updateDoc(doc(db, COL, id), data);
    else await setDoc(doc(db, COL, id), { ...data, createdAt: serverTimestamp() });
    $("#dsItemDlg").close();
    toast("✅ Saqlandi");
  } catch (err) {
    toast("Saqlanmadi: " + err.message, "err");
  }
});
async function delItem(it) {
  if (!it) return false;
  const used = moves.some((m) => (m.lines || []).some((l) => l.itemId === it.id));
  if (!confirm(`${itemName(it)} o'chirilsinmi?${used ? "\n\nDiqqat: bu turda kirim/sotuv harakatlari bor — ular tarixda «o'chirilgan tur» bo'lib qoladi." : ""}`)) return false;
  try {
    await deleteDoc(doc(db, COL, it.id));
    deleteDoc(doc(db, "dvPhotos", "dsi_" + it.id)).catch(() => {});
    toast("🗑 O'chirildi");
    return true;
  } catch (err) {
    toast("O'chmadi: " + err.message, "err");
    return false;
  }
}
$("#dsItemDel").addEventListener("click", async () => {
  if (await delItem(byId(editItem))) $("#dsItemDlg").close();
});

// ---------- Harakatlar ----------
function openMove(type, itemId) {
  moveType = type;
  movePhotos = [];
  const f = $("#dsMoveForm").elements;
  $("#dsMoveForm").reset();
  const kit = type === "kit";
  $("#dsMoveTitle").textContent = kit ? "🛋 Komplekt sotuv" : TYPES[type];
  $("#dsKitBox").hidden = !kit;
  $("#dsItemRow").hidden = kit;
  $("#dsClientRow").hidden = type === "in";
  $("#dsMoneyRow").hidden = type === "out";
  $("#dsPriceLbl").firstChild.textContent = kit ? "Narxi (1 komplekt)" : type === "in" ? "Tannarx (dona, ixtiyoriy)" : "Narxi (dona)";
  const sorted = items.slice().sort(sortItems);
  f.itemSel.innerHTML = sorted.map((i) => `<option value="${i.id}">${esc(itemName(i))}</option>`).join("");
  if (itemId) f.itemSel.value = itemId;
  const colors = [...new Set(items.filter((i) => ["bosh", "yon", "oyoq"].includes(i.part)).map((i) => i.color || ""))];
  f.kitColor.innerHTML = colors.map((c) => `<option>${esc(c)}</option>`).join("");
  f.date.value = today();
  setPrice();
  drawMovePh();
  kitInfo();
  $("#dsMoveDlg").showModal();
}
function setPrice() {
  const f = $("#dsMoveForm").elements;
  if (moveType === "kit") f.price.value = fmt(f.kitUgol.checked ? 1600000 : 1500000);
  else {
    const it = byId(f.itemSel.value);
    f.price.value = it ? fmt(moveType === "in" ? it.cost || 0 : it.price || 0) : "";
  }
  calcSum();
}
function calcSum() {
  const f = $("#dsMoveForm").elements;
  f.sum.value = fmt(num(f.price.value) * (Number(f.qty.value) || 0));
}
function kitLines() {
  const f = $("#dsMoveForm").elements;
  const n = Number(f.qty.value) || 1;
  const c = f.kitColor.value;
  const find = (p) => items.find((i) => i.part === p && (i.color || "") === c);
  const ug = items.find((i) => i.part === "ugolnik");
  const need = [
    ["bosh", find("bosh"), n],
    ["yon", find("yon"), 2 * n],
    ["oyoq", find("oyoq"), n],
  ];
  if (f.kitUgol.checked) need.push(["ugolnik", ug, 4 * n]);
  return need;
}
function kitInfo() {
  if (moveType !== "kit") return;
  const st = stats("");
  $("#dsKitInfo").innerHTML = kitLines()
    .map(([p, it, q]) => (it ? `${PARTS[p]} × ${q} <span class="${st[it.id].left < q ? "neg" : "muted"}">(omborda ${st[it.id].left})</span>` : `<span class="neg">${PARTS[p]}: bu rangda tur yo'q</span>`))
    .join(" · ");
}
$("#dsMoveForm").addEventListener("input", (e) => {
  if (["price", "qty"].includes(e.target.name)) calcSum();
  if (["qty", "kitColor", "kitUgol"].includes(e.target.name)) kitInfo();
});
$("#dsMoveForm").addEventListener("change", (e) => {
  if (e.target.name === "itemSel" || e.target.name === "kitUgol") setPrice();
  if (e.target.name === "kitColor" || e.target.name === "kitUgol") kitInfo();
});
function drawMovePh() {
  $("#dsMovePh").innerHTML = movePhotos.map((u, i) => `<span class="ph"><img src="${u}" alt="" /><button type="button" data-rmph="${i}" aria-label="O'chirish">×</button></span>`).join("");
}
$("#dsMovePhIn").addEventListener("change", async (e) => {
  for (const fl of [...e.target.files]) {
    if (movePhotos.length >= 3) break;
    try {
      movePhotos.push(await compressImage(fl, 1100, 0.7));
    } catch (err) {
      toast(err.message, "err");
    }
  }
  e.target.value = "";
  drawMovePh();
});
$("#dsMovePh").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rmph]");
  if (b) movePhotos.splice(Number(b.dataset.rmph), 1), drawMovePh();
});
$("#dsMoveForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const qty = Number(f.qty.value) || 0;
  if (qty <= 0) return toast("Sonini kiriting", "err");
  const st = stats("");
  let lines, extra = {};
  if (moveType === "kit") {
    const need = kitLines();
    const miss = need.filter(([, it]) => !it);
    if (miss.length) return toast(`${miss.map(([p]) => PARTS[p]).join(", ")} — bu rangda tur yo'q. Avval «Tur qo'shish» qiling.`, "err");
    lines = need.map(([, it, q]) => ({ itemId: it.id, qty: q }));
    extra = { kit: true, kitQty: qty, kitColor: f.kitColor.value, kitUgol: f.kitUgol.checked };
  } else {
    if (!f.itemSel.value) return toast("Turni tanlang", "err");
    lines = [{ itemId: f.itemSel.value, qty }];
  }
  if (moveType !== "in") {
    const short = lines.filter((l) => st[l.itemId] && st[l.itemId].left < l.qty);
    if (short.length && !confirm(`Omborda yetarli emas:\n${short.map((l) => `${itemName(byId(l.itemId))}: bor ${st[l.itemId].left}, kerak ${l.qty}`).join("\n")}\n\nBaribir saqlansinmi? (qoldiq minusga tushadi)`)) return;
  }
  const type = moveType === "kit" ? "sale" : moveType;
  const data = {
    type,
    lines,
    ...extra,
    date: f.date.value || today(),
    price: num(f.price.value),
    sum: type === "out" ? 0 : num(f.price.value) * qty,
    client: type === "in" ? "" : f.client.value.trim(),
    phone: type === "in" ? "" : f.phone.value.trim(),
    note: f.note.value.trim(),
    photos: movePhotos.length,
    at: Date.now(),
    createdAt: serverTimestamp(),
  };
  const btn = e.target.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    const ref = doc(db, COL, newId("dvm_"));
    if (movePhotos.length) await setDoc(doc(db, "dvPhotos", "dsm_" + ref.id), { images: movePhotos.slice(0, 3) });
    await setDoc(ref, data);
    if (movePhotos.length) photoCache[ref.id] = movePhotos.slice(0, 3);
    $("#dsMoveDlg").close();
    toast("✅ Saqlandi");
  } catch (err) {
    toast("Saqlanmadi: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

// ---------- Ko'rish ----------
async function photosOf(id) {
  if (photoCache[id]) return photoCache[id];
  const d = await getDoc(doc(db, "dvPhotos", "dsm_" + id)).catch(() => null);
  return (photoCache[id] = d && d.exists() ? d.data().images || [] : []);
}
async function viewMove(m) {
  $("#dsViewBody").innerHTML = `<h2>${TYPES[m.type]} — ${fmtDate(m.date)}</h2>
    ${m.kit ? `<p><b>🛋 Komplekt × ${m.kitQty}</b> — ${esc(m.kitColor || "")}${m.kitUgol ? " (ugolnik bilan)" : ""}</p>` : ""}
    <ul class="op-log">${(m.lines || []).map((l) => `<li>${esc(itemName(byId(l.itemId)))} × <b>${l.qty}</b></li>`).join("")}</ul>
    ${m.sum ? `<p>💵 <b>${som(m.sum)}</b>${m.price ? ` <span class="muted">(${som(m.price)} × ${m.kit ? m.kitQty : m.lines[0].qty})</span>` : ""}</p>` : ""}
    ${m.client ? `<p>👤 ${esc(m.client)} ${esc(m.phone || "")}</p>` : ""}
    ${m.note ? `<p class="muted">📝 ${esc(m.note)}</p>` : ""}
    <div class="ds-ph big" id="dsViewPh">${m.photos ? "<small class='muted'>📷 rasm yuklanmoqda…</small>" : ""}</div>
    <button class="btn btn-red btn-block" type="button" data-delmove="${m.id}" style="margin-top:12px">🗑 Harakatni o'chirish</button>`;
  $("#dsViewDlg").showModal();
  if (m.photos) {
    const ims = await photosOf(m.id);
    if ($("#dsViewPh")) $("#dsViewPh").innerHTML = ims.map((u) => `<a href="${u}" target="_blank"><img src="${u}" alt="" /></a>`).join("");
  }
}
function viewItem(it) {
  const st = stats($("#dsMonth").value || today().slice(0, 7))[it.id];
  const hist = moves.filter((m) => (m.lines || []).some((l) => l.itemId === it.id)).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 30);
  $("#dsViewBody").innerHTML = `
    ${itemPhotos[it.id] ? `<img class="ds-hero" src="${itemPhotos[it.id]}" alt="" />` : ""}
    <h2>${esc(itemName(it))}</h2>
    <div class="mgrid">
      <div><small>Qoldiq</small><b class="${st.left <= (Number(it.min) || 0) ? "neg" : ""}">${st.left} dona</b></div>
      <div><small>Jami kirim</small><b>${st.in}</b></div>
      <div><small>Sotilgan</small><b>${st.sale}</b><small class="muted">shu oy: ${st.mSale}</small></div>
      <div><small>Narxi</small><b>${it.price ? som(it.price) : "—"}</b></div>
    </div>
    <div class="op-contact" style="margin:10px 0">
      <button class="btn btn-yellow" type="button" data-quick="in">➕ Kirim</button>
      <button class="btn btn-dark" type="button" data-quick="sale">💰 Sotuv</button>
      <button class="btn btn-line" type="button" data-quick="out">➖ Chiqim</button>
      <button class="btn btn-line" type="button" data-quick="edit">✏️ Tahrir / rasm</button>
      <button class="btn btn-line" type="button" data-quick="del">🗑 O'chirish</button>
    </div>
    <h3 class="op-h">Tarix</h3>
    <ul class="op-log">${hist.map((m) => `<li>${fmtDate(m.date)} — ${TYPES[m.type]} × ${(m.lines.find((l) => l.itemId === it.id) || {}).qty}${m.kit ? " (komplekt)" : ""}${m.client ? " · " + esc(m.client) : ""}</li>`).join("") || "<li>Hali harakat yo'q</li>"}</ul>`;
  $("#dsViewBody").dataset.item = it.id;
  $("#dsViewDlg").showModal();
}
$("#dsViewBody").addEventListener("click", async (e) => {
  const q = e.target.closest("[data-quick]");
  if (q) {
    const it = byId($("#dsViewBody").dataset.item);
    $("#dsViewDlg").close();
    if (q.dataset.quick === "del") return delItem(it);
    return q.dataset.quick === "edit" ? openItem(it) : openMove(q.dataset.quick, it.id);
  }
  const d = e.target.closest("[data-delmove]");
  if (d && confirm("Bu harakat o'chirilsinmi? Qoldiq qayta hisoblanadi.")) {
    try {
      const b = writeBatch(db);
      b.delete(doc(db, COL, d.dataset.delmove));
      b.delete(doc(db, "dvPhotos", "dsm_" + d.dataset.delmove));
      await b.commit();
      $("#dsViewDlg").close();
      toast("O'chirildi");
    } catch (err) {
      toast(err.message, "err");
    }
  }
});

// ---------- Tugmalar ----------
$("#dsIn").addEventListener("click", () => (items.length ? openMove("in") : toast("Avval tur qo'shing", "err")));
$("#dsSale").addEventListener("click", () => (items.length ? openMove("sale") : toast("Avval tur qo'shing", "err")));
$("#dsOut").addEventListener("click", () => (items.length ? openMove("out") : toast("Avval tur qo'shing", "err")));
$("#dsKit").addEventListener("click", () => (items.length ? openMove("kit") : toast("Avval tur qo'shing", "err")));
$("#dsItemAdd").addEventListener("click", () => openItem(null));
$("#dsMonth").addEventListener("change", render);
$("#dsFilter").addEventListener("change", render);
$("#dsGrid").addEventListener("click", async (e) => {
  if (e.target.closest("#dsSeed")) {
    try {
      const b = writeBatch(db);
      DEFAULTS.forEach((d) => b.set(doc(db, COL, newId("dvi_")), { ...d, cost: 0, min: 2, hasPhoto: false, createdAt: serverTimestamp() }));
      await b.commit();
      toast("✅ Standart turlar qo'shildi — endi rasmlarini qo'ying");
    } catch (err) {
      toast("Qo'shilmadi: " + err.message, "err");
    }
    return;
  }
  const del = e.target.closest("[data-delitem]");
  if (del) return delItem(byId(del.dataset.delitem));
  const c = e.target.closest("[data-item]");
  if (c) viewItem(byId(c.dataset.item));
});
$("#dsMoves").addEventListener("click", (e) => {
  const r = e.target.closest("[data-move]");
  if (r) viewMove(moves.find((m) => m.id === r.dataset.move));
});

function permErr(err) {
  if (/permission|insufficient/i.test(err.message || "")) {
    $("#dsErr").innerHTML = `<div class="warn">⚠️ Ma'lumotni o'qib bo'lmadi: ${esc(err.message)}</div>`;
  }
}

function start() {
  if (unsub.length) return;
  $("#dsMonth").value = today().slice(0, 7);
  unsub.push(
    onSnapshot(collection(db, COL), (s) => {
      const all = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      items = all.filter((x) => x.id.startsWith("dvi_"));
      moves = all.filter((x) => x.id.startsWith("dvm_"));
      render();
      // tur rasmlarini bir marta yuklab olamiz
      items.filter((i) => i.hasPhoto && itemPhotos[i.id] === undefined).forEach((i) => {
        itemPhotos[i.id] = "";
        getDoc(doc(db, "dvPhotos", "dsi_" + i.id))
          .then((d) => {
            itemPhotos[i.id] = d.exists() ? (d.data().images || [])[0] || "" : "";
            render();
          })
          .catch(() => {});
      });
    }, permErr)
  );
}
onAuthStateChanged(auth, (user) => {
  if (user && ADMIN_UIDS.includes(user.uid)) start();
  else {
    unsub.forEach((u) => u());
    unsub = [];
  }
});
