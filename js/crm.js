// =====================================================================
//  FURNIPART — CRM (admin panel ichida)
//  Bo'limlar: Hisobot · Lidlar · Mijozlar · Sotuvlar
//  Firestore kolleksiyalari: crmLeads, crmClients, crmSales, crmSettings
// =====================================================================
import { ADMIN_UIDS, CATEGORIES } from "./config.js";
import {
  db,
  auth,
  configured,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  onAuthStateChanged,
} from "./firebase.js";
import { $, $$, escapeHtml, categoryLabel, parsePrice, parseCount, toast, normalizePhone as uzPhone } from "./util.js";

// O'zbek raqamlarini +998… ko'rinishiga keltiradi, chet el raqamlarini (+7, +972…) ham qabul qiladi
function normalizePhone(raw) {
  const head = (String(raw || "").match(/^[\s+\d()\-.]+/) || [""])[0];
  const d = head.replace(/\D/g, "");
  const uz = uzPhone(d);
  if (uz) return uz;
  if (d.length >= 10 && d.length <= 15) return "+" + d;
  return null;
}

const XLSX_URL = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";

export const SOURCES = ["Instagram", "Telegram", "Sayt", "Qo'ng'iroq", "Do'kon", "Tavsiya", "Boshqa"];
export const LEAD_STAGES = ["Yangi", "Bog'lanildi", "O'ylab ko'radi", "Sotildi", "Rad etdi"];
export const SALE_STATUSES = ["Yangi", "Tayyorlanmoqda", "Yo'lda", "Yetkazildi", "Bekor qilindi"];
const CLOSED = ["Sotildi", "Rad etdi"];
export const LOST_REASONS = ["Qimmat", "Yetkazib berish / uzoq", "Raqobatchidan oldi", "Javob bermadi", "Hozir kerak emas", "Kerakli mahsulot yo'q", "Shunchaki so'radi", "Boshqa"];

// Mijoz turlari va qayta taklif oralig'i (oxirgi xariddan keyin, kun)
export const CLIENT_TYPES = ["Oddiy xaridor", "Mebelchi", "Diler / do'kon"];
const REPEAT_DAYS = { "Oddiy xaridor": 150, Mebelchi: 30, "Diler / do'kon": 21 };
const MEBELCHI_KEYS = ["klipsa", "derjatel", "shablon", "chamadon", "petlya", "stanok", "lazer", "konduktor", "legirovka", "planka", "mebel yig", "mebelchi", "mebel"];
function guessType(text) {
  const t = String(text || "").toLowerCase();
  return MEBELCHI_KEYS.some((k) => t.includes(k)) ? "Mebelchi" : "Oddiy xaridor";
}
const addDays = (ymdStr, n) => {
  const d = new Date(ymdStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
};

// Viloyat/shahar nomini bir xil ko'rinishga keltiradi ("Тошкент вилояти", "toshkent jome krug" → "Toshkent")
const REGIONS = [
  ["Toshkent", ["toshken", "тошкен", "ташкен", "tashkent", "yashnobod", "chirchiq", "чирчик", "chilonzor"]],
  ["Farg'ona", ["farg", "fergana", "фарг", "ферган", "marg", "марғ", "марг", "quvasoy", "toytepa"]],
  ["Qo'qon", ["qo'qon", "qoʻqon", "qo‘qon", "kokand", "кукон", "қўқон", "коканд", "qoqon"]],
  ["Andijon", ["andij", "андиж", "shahrixon", "asaka"]],
  ["Namangan", ["namang", "наманг", "chust", "чуст", "uchqo'rg", "uchkurg", "pop"]],
  ["Samarqand", ["samarq", "samark", "самарк", "самарқ"]],
  ["Buxoro", ["buxor", "bukhar", "бухор", "бухар", "gijduv", "g'ijduv"]],
  ["Qashqadaryo", ["qarshi", "карши", "қарши", "qashqa", "shahrisabz"]],
  ["Surxondaryo", ["surxon", "термиз", "termiz", "angor"]],
  ["Sirdaryo", ["sirdaryo", "сирдар", "guliston", "гулистон"]],
  ["Jizzax", ["jizzax", "жиззах"]],
  ["Navoiy", ["navoiy", "навоий"]],
  ["Xorazm", ["xorazm", "urganch", "урганч", "xiva"]],
  ["Qoraqalpog'iston", ["nukus", "нукус", "qoraqalp"]],
  ["Chet el", ["астана", "astana", "moskva", "москва", "rossiya", "qozog"]],
];
function regionOf(t) {
  const s = String(t || "").toLowerCase();
  if (!s.trim()) return "Ko'rsatilmagan";
  return (REGIONS.find(([, keys]) => keys.some((k) => s.includes(k))) || ["Boshqa"])[0];
}
// "Klipsa · Divan bosh tomoni" → ["klipsa", "divan bosh tomoni"]
const interestsOf = (t) =>
  String(t || "")
    .split(/\s·\s|,|\+/)
    .map((x) => x.replace(/×\s*\d+/, "").trim())
    .filter((x) => x.length > 1)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1));
const DEFAULT_TARGET = 150;

let leads = [];
let clients = [];
let sales = [];
let settings = { monthlyTarget: DEFAULT_TARGET, targetCategory: "matras" };
let unsub = [];
let editLeadId = null;
let editClientId = null;
let editSaleId = null;
let saleFromLead = null;

// ---------- yordamchi funksiyalar ----------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd();
const thisMonth = () => today().slice(0, 7);
const phoneId = (p) => String(p || "").replace(/\D/g, "");
const fmtDate = (s) => (s ? s.split("-").reverse().join(".") : "");
const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
const monthName = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const opts = (arr, sel) => arr.map((v) => `<option${v === sel ? " selected" : ""}>${escapeHtml(v)}</option>`).join("");
const catOpts = (sel) =>
  CATEGORIES.map((c) => `<option value="${c.id}"${c.id === sel ? " selected" : ""}>${escapeHtml(c.label)}</option>`).join("") +
  `<option value="boshqa"${sel === "boshqa" ? " selected" : ""}>Boshqa</option>`;

function money(n, cur) {
  const v = Math.round(Number(n) || 0);
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (v < 0 ? "−" : "") + (cur === "so'm" ? s + " so'm" : "$" + s);
}
function sumByCur(list, field = "amount") {
  const r = {};
  list.forEach((s) => {
    const c = s.currency || "$";
    r[c] = (r[c] || 0) + (Number(s[field]) || 0);
  });
  return r;
}
const curText = (obj) => Object.entries(obj).filter(([, v]) => v).map(([c, v]) => money(v, c)).join(" + ") || money(0, "$");
const telLink = (p) => (p ? `<a class="phone" href="tel:${escapeHtml(p)}">${escapeHtml(p)}</a>` : `<span class="muted">tel. yo'q</span>`);

// ================= Ulanish =================
if (configured) {
  onAuthStateChanged(auth, (user) => {
    unsub.forEach((u) => u());
    unsub = [];
    if (user && ADMIN_UIDS.includes(user.uid)) start();
  });
}

function onErr(where) {
  return (err) => {
    console.error(where, err);
    const box = $("#crmRulesWarn");
    if (box) box.hidden = false;
  };
}

// Havola orqali tayyor sotuv formasi: /admin#sotuv?name=..&product=..&category=divan&qty=..&amount=..&paid=..&currency=so'm
function openFromHash() {
  const h = decodeURIComponent(location.hash || "");
  if (!h.startsWith("#sotuv")) return;
  const q = new URLSearchParams(location.hash.split("?")[1] || "");
  history.replaceState(null, "", location.pathname);
  $$(".tab").forEach((x) => x.classList.toggle("on", x.dataset.tab === "sales"));
  $$(".tabpane").forEach((p) => (p.hidden = p.id !== "tab-sales"));
  openSale(null, { name: q.get("name") || "", phone: q.get("phone") || "", interest: q.get("product") || "", address: q.get("address") || "" });
  const f = $("#saleForm").elements;
  if (q.get("category")) f.category.value = q.get("category");
  if (q.get("qty")) f.qty.value = q.get("qty");
  if (q.get("amount")) f.amount.value = q.get("amount");
  if (q.get("paid")) f.paid.value = q.get("paid");
  if (q.get("currency")) f.currency.value = q.get("currency");
  if (q.get("note")) f.note.value = q.get("note");
  updateRest();
}

function start() {
  setTimeout(openFromHash, 300);
  unsub.push(
    onSnapshot(query(collection(db, "crmLeads"), orderBy("createdAt", "desc")), (snap) => {
      leads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderLeads();
      renderReport();
    }, onErr("leads"))
  );
  unsub.push(
    onSnapshot(query(collection(db, "crmClients"), orderBy("createdAt", "desc")), (snap) => {
      clients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderClients();
      renderReport();
      $("#clientList").innerHTML = clients
        .map((c) => `<option value="${escapeHtml(c.phone || "")}">${escapeHtml(c.name || "")}</option>`)
        .join("");
    }, onErr("clients"))
  );
  unsub.push(
    onSnapshot(query(collection(db, "crmSales"), orderBy("date", "desc")), (snap) => {
      sales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderSales();
      renderClients();
      renderReport();
    }, onErr("sales"))
  );
  unsub.push(
    onSnapshot(doc(db, "crmSettings", "main"), (d) => {
      if (d.exists()) settings = { ...settings, ...d.data() };
      renderReport();
    }, onErr("settings"))
  );
}

// ================= HISOBOT =================
$("#rMonth").value = thisMonth();
$("#rMonth").addEventListener("change", renderReport);

function bars(rows, colorFn) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return rows.length
    ? rows
        .map(
          ([label, v, extra]) => `<div class="bar-row">
        <span>${escapeHtml(label)}</span>
        <div class="bar"><i style="width:${(v / max) * 100}%;${colorFn ? "background:" + colorFn(label) : ""}"></i></div>
        <b>${v}${extra ? ` <small>${extra}</small>` : ""}</b>
      </div>`
        )
        .join("")
    : `<p class="muted">Ma'lumot yo'q</p>`;
}

function renderReport() {
  const ym = $("#rMonth").value || thisMonth();
  $("#rTitle").textContent = monthName(ym);
  const mSales = sales.filter((s) => (s.date || "").startsWith(ym) && s.status !== "Bekor qilindi");
  const mLeads = leads.filter((l) => (l.date || "").startsWith(ym));
  const mClients = clients.filter((c) => (c.date || "").startsWith(ym));

  // Reja
  const tCat = settings.targetCategory || "matras";
  const target = Number(settings.monthlyTarget) || DEFAULT_TARGET;
  const done = mSales.filter((s) => s.category === tCat).reduce((a, s) => a + (Number(s.qty) || 0), 0);
  const pct = Math.min(100, Math.round((done / target) * 100));
  const [y, m] = ym.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCur = ym === thisMonth();
  const dayNow = isCur ? new Date().getDate() : daysInMonth;
  const daysLeft = isCur ? daysInMonth - dayNow + 1 : 0;
  const perDay = daysLeft > 0 ? Math.ceil(Math.max(0, target - done) / daysLeft) : 0;
  const expected = Math.round((target * dayNow) / daysInMonth);

  $("#rPlan").innerHTML = `
    <div class="plan-top">
      <div><small>Reja: ${escapeHtml(categoryLabel(tCat))}</small><div class="big-num">${done}<span> / ${target}</span></div></div>
      <button class="btn btn-sm btn-line" id="editTarget" type="button">Rejani o'zgartirish</button>
    </div>
    <div class="progress"><i style="width:${pct}%"></i><em style="left:${Math.min(100, (expected / target) * 100)}%" title="Bugungacha bo'lishi kerak: ${expected}"></em></div>
    <p class="muted">${pct}% bajarildi${
      isCur
        ? done >= target
          ? " · 🎉 Reja bajarildi!"
          : ` · qolgan ${daysLeft} kunda kuniga ~${perDay} ta kerak · bugungacha ${expected} ta bo'lishi kerak edi ${done >= expected ? "✅" : "⚠️"}`
        : ""
    }</p>`;

  const conv = mLeads.length ? Math.round((mLeads.filter((l) => l.stage === "Sotildi").length / mLeads.length) * 100) : 0;
  const paid = sumByCur(mSales, "paid");
  const total = sumByCur(mSales, "amount");
  const debt = {};
  Object.keys(total).forEach((c) => (debt[c] = (total[c] || 0) - (paid[c] || 0)));
  $("#rKpis").innerHTML = [
    ["Sotuvlar", mSales.length],
    ["Sotuv summasi", curText(total)],
    ["Olingan pul (zaklad + to'lovlar)", curText(paid)],
    ["Qoldiq (mijozlar berishi kerak)", curText(debt)],
    ["Yangi lidlar", mLeads.length],
    ["Konversiya", conv + "%"],
    ["Yangi mijozlar", mClients.length],
  ]
    .map(([k, v]) => `<div class="kpi"><small>${k}</small><b>${v}</b></div>`)
    .join("");

  // Bugungi qo'ng'iroqlar
  const t = today();
  const calls = leads
    .filter((l) => !CLOSED.includes(l.stage) && l.nextCall && l.nextCall <= t)
    .sort((a, b) => a.nextCall.localeCompare(b.nextCall));
  $("#rCalls").innerHTML = calls.length
    ? calls
        .map(
          (l) => `<div class="mini-row">
        <div><b>${escapeHtml(l.name || "Nomsiz")}</b> <small class="muted">${escapeHtml(l.interest || "")}</small><br>${telLink(l.phone)}</div>
        <span class="pill ${l.nextCall < t ? "late" : ""}">${l.nextCall < t ? "kechikdi · " + fmtDate(l.nextCall) : "bugun"}</span>
      </div>`
        )
        .join("")
    : `<p class="muted">Bugun qo'ng'iroq qilinadigan lid yo'q 👍</p>`;

  // Manbalar va kategoriyalar
  const bySrc = SOURCES.map((s) => {
    const all = mLeads.filter((l) => l.source === s);
    const won = all.filter((l) => l.stage === "Sotildi").length;
    return [s, all.length, all.length ? `· ${won} sotildi` : ""];
  }).filter((r) => r[1]);
  $("#rSources").innerHTML = bars(bySrc);

  const cats = [...CATEGORIES.map((c) => c.id), "boshqa"];
  const byCat = cats
    .map((c) => [c === "boshqa" ? "Boshqa" : categoryLabel(c), mSales.filter((s) => s.category === c).reduce((a, s) => a + (Number(s.qty) || 0), 0)])
    .filter((r) => r[1]);
  $("#rCats").innerHTML = bars(byCat);

  // Kunlik grafik
  const perDayArr = Array.from({ length: daysInMonth }, (_, i) => {
    const d = `${ym}-${pad(i + 1)}`;
    return mSales.filter((s) => s.date === d && s.category === tCat).reduce((a, s) => a + (Number(s.qty) || 0), 0);
  });
  const mx = Math.max(1, ...perDayArr);
  $("#rDaily").innerHTML = perDayArr
    .map((v, i) => `<div class="col" title="${i + 1}-kun: ${v} ta"><i style="height:${(v / mx) * 100}%"></i><small>${(i + 1) % 5 === 0 || i === 0 ? i + 1 : ""}</small></div>`)
    .join("");

  // Lid voronkasi (barcha ochiq lidlar)
  $("#rFunnel").innerHTML = bars(LEAD_STAGES.map((s) => [s, mLeads.filter((l) => l.stage === s).length]));

  // Qayta taklif vaqti kelgan mijozlar
  const dueList = clients.filter(followDue).sort((a, b) => followUpDate(a).localeCompare(followUpDate(b)));
  $("#rRepeat").innerHTML = dueList.length
    ? dueList
        .slice(0, 10)
        .map(
          (c) => `<div class="mini-row"><div><b>${escapeHtml(c.name || "Nomsiz")}</b> <small class="muted">${escapeHtml(clientType(c))}</small><br>${telLink(c.phone)}</div><span class="pill late">${fmtDate(followUpDate(c))}</span></div>`
        )
        .join("") + (dueList.length > 10 ? `<p class="muted">… yana ${dueList.length - 10} ta (Mijozlar → "Qayta taklif vaqti kelgan")</p>` : "")
    : `<p class="muted">Hozircha yo'q. Mebelchilarga oxirgi xariddan 30 kun, dilerlarga 21 kun, oddiy xaridorlarga 150 kun o'tgach shu yerda chiqadi.</p>`;

  // Rad etish sabablari (shu oyda rad etilganlar)
  const lost = leads.filter((l) => l.stage === "Rad etdi" && (l.lostDate || l.date || "").startsWith(ym));
  $("#rLost").innerHTML = lost.length
    ? bars(
        [...LOST_REASONS, ""]
          .map((r) => [r || "Sababi yozilmagan", lost.filter((l) => (l.lostReason || "") === r).length])
          .filter((x) => x[1])
          .sort((a, b) => b[1] - a[1])
      )
    : `<p class="muted">Bu oyda rad etilgan lid yo'q</p>`;

  // Mahsulotlar va viloyatlar bo'yicha lidlar (qavsda — sotilgani)
  const group = (keyFn) => {
    const m = new Map();
    mLeads.forEach((l) =>
      [].concat(keyFn(l)).forEach((k) => {
        const g = m.get(k) || { n: 0, won: 0 };
        g.n++;
        if (l.stage === "Sotildi") g.won++;
        m.set(k, g);
      })
    );
    return [...m.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 8)
      .map(([k, g]) => [k, g.n, g.won ? `· ${g.won} sotildi (${Math.round((g.won / g.n) * 100)}%)` : ""]);
  };
  $("#rProducts").innerHTML = bars(group((l) => (interestsOf(l.interest).length ? interestsOf(l.interest) : ["Ko'rsatilmagan"])));
  $("#rRegions").innerHTML = bars(group((l) => regionOf(l.region)));
}

document.addEventListener("click", async (e) => {
  if (!e.target.closest("#editTarget")) return;
  const v = prompt(
    `Oylik reja (${categoryLabel(settings.targetCategory || "matras")}, dona):`,
    settings.monthlyTarget || DEFAULT_TARGET
  );
  if (v === null) return;
  const n = parseCount(v);
  if (!n) return toast("Son kiriting", "err");
  try {
    await setDoc(doc(db, "crmSettings", "main"), { monthlyTarget: n, targetCategory: settings.targetCategory || "matras" }, { merge: true });
    toast("Reja saqlandi");
  } catch (err) {
    toast("Saqlanmadi: " + err.message, "err");
  }
});

// ================= LIDLAR =================
$("#lSource").insertAdjacentHTML("beforeend", opts(SOURCES));
$("#lStage").insertAdjacentHTML("beforeend", opts(LEAD_STAGES));
["#lSource", "#lStage", "#lSearch"].forEach((s) => $(s).addEventListener("input", renderLeads));

function renderLeads() {
  const src = $("#lSource").value;
  const st = $("#lStage").value;
  const q = $("#lSearch").value.trim().toLowerCase();
  const t = today();
  const list = leads.filter(
    (l) =>
      (src === "all" || l.source === src) &&
      (st === "all" ? true : st === "open" ? !CLOSED.includes(l.stage) : l.stage === st) &&
      (!q || `${l.name} ${l.phone} ${l.interest} ${l.note} ${l.region} ${l.instagram}`.toLowerCase().includes(q))
  );
  const open = leads.filter((l) => !CLOSED.includes(l.stage)).length;
  $("#lCount").textContent = open || "";
  $("#leadList").innerHTML = list.length
    ? list
        .map(
          (l) => `<div class="order crm-card" data-s="${escapeHtml(l.stage)}">
        <div class="order-head">
          <b>${escapeHtml(l.name || "Nomsiz")}</b>
          <small>${escapeHtml(l.source || "")} · ${fmtDate(l.date)}</small>
        </div>
        ${telLink(l.phone)}
        ${l.region ? `<div class="muted">📍 ${escapeHtml(l.region)}</div>` : ""}
        ${(l.ctype || guessType(l.interest)) !== "Oddiy xaridor" ? `<div><span class="pill type">🔧 ${escapeHtml(l.ctype || guessType(l.interest))}</span></div>` : ""}
        ${l.interest ? `<div>🛏 ${escapeHtml(l.interest)}</div>` : ""}
        ${l.instagram ? `<div><a class="muted" href="https://instagram.com/${encodeURIComponent(l.instagram)}" target="_blank" rel="noopener">@${escapeHtml(l.instagram)}</a></div>` : ""}
        ${l.note ? `<div class="muted">${escapeHtml(l.note)}</div>` : ""}
        ${l.stage === "Rad etdi" && l.lostReason ? `<div><span class="pill late">✖ ${escapeHtml(l.lostReason)}</span>${l.lostNote ? ` <small class="muted">${escapeHtml(l.lostNote)}</small>` : ""}</div>` : ""}
        ${
          l.nextCall && !CLOSED.includes(l.stage)
            ? `<div><span class="pill ${l.nextCall < t ? "late" : l.nextCall === t ? "today" : ""}">📞 ${fmtDate(l.nextCall)}</span></div>`
            : ""
        }
        <div class="order-foot">
          <select data-lstage="${l.id}">${opts(LEAD_STAGES, l.stage)}</select>
          <div class="row-actions">
            ${l.stage !== "Sotildi" ? `<button class="btn btn-sm btn-yellow" data-lsell="${l.id}">💰 Sotuv</button>` : ""}
            <button class="icon-btn" data-ledit="${l.id}" title="O'zgartirish">✎</button>
            <button class="icon-btn del" data-ldel="${l.id}" title="O'chirish">🗑</button>
          </div>
        </div>
      </div>`
        )
        .join("")
    : `<p class="empty">Lid yo'q. "+ Yangi lid" tugmasi bilan qo'shing.</p>`;
}

$("#newLead").addEventListener("click", () => openLead(null));
$("#leadForm").elements.stage.addEventListener("change", (e) => ($("#lostWrap").hidden = e.target.value !== "Rad etdi"));

function openLead(id) {
  editLeadId = id;
  const l = leads.find((x) => x.id === id) || {};
  const f = $("#leadForm").elements;
  $("#leadTitle").textContent = id ? "Lidni o'zgartirish" : "Yangi lid";
  f.name.value = l.name || "";
  f.phone.value = l.phone || "";
  f.source.innerHTML = opts(SOURCES, l.source || "Instagram");
  f.stage.innerHTML = opts(LEAD_STAGES, l.stage || "Yangi");
  f.lostReason.innerHTML = `<option value="">— tanlang —</option>` + opts(LOST_REASONS, l.lostReason || "");
  $("#lostWrap").hidden = f.stage.value !== "Rad etdi";
  f.interest.value = l.interest || "";
  f.region.value = l.region || "";
  f.instagram.value = l.instagram || "";
  f.ctype.innerHTML = opts(CLIENT_TYPES, l.ctype || guessType(l.interest));
  f.nextCall.value = l.nextCall || "";
  f.note.value = l.note || "";
  $("#leadDlg").showModal();
}

$("#leadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const phone = f.phone.value.trim() ? normalizePhone(f.phone.value) : "";
  if (phone === null) return toast("Telefon raqam noto'g'ri (masalan 90 123 45 67)", "err");
  const data = {
    name: f.name.value.trim(),
    phone,
    source: f.source.value,
    stage: f.stage.value,
    lostReason: f.stage.value === "Rad etdi" ? f.lostReason.value : "",
    interest: f.interest.value.trim(),
    region: f.region.value.trim(),
    instagram: f.instagram.value.trim().replace(/^@/, ""),
    ctype: f.ctype.value,
    nextCall: f.nextCall.value || "",
    note: f.note.value.trim(),
    updatedAt: serverTimestamp(),
  };
  if (!data.name && !data.phone) return toast("Ism yoki telefon kiriting", "err");
  if (data.stage === "Rad etdi" && !data.lostReason) return toast("Rad etish sababini tanlang", "err");
  if (data.stage === "Rad etdi") data.lostDate = leads.find((l) => l.id === editLeadId)?.lostDate || today();
  try {
    if (editLeadId) await updateDoc(doc(db, "crmLeads", editLeadId), data);
    else await addDoc(collection(db, "crmLeads"), { ...data, date: today(), createdAt: serverTimestamp() });
    $("#leadDlg").close();
    toast("Lid saqlandi");
  } catch (err) {
    toast("Saqlanmadi: " + err.message, "err");
  }
});

// Rad etish sababini so'raydi. Bekor qilinsa — null
function askReason(name, current) {
  return new Promise((resolve) => {
    const dlg = $("#reasonDlg");
    $("#reasonWho").textContent = name || "Mijoz";
    $("#reasonBtns").innerHTML = LOST_REASONS.map(
      (r) => `<button type="button" class="btn btn-line${r === current ? " on" : ""}" data-reason="${escapeHtml(r)}">${escapeHtml(r)}</button>`
    ).join("");
    $("#reasonNote").value = "";
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      dlg.close();
      resolve(v);
    };
    $("#reasonBtns").onclick = (e) => {
      const b = e.target.closest("[data-reason]");
      if (b) finish({ lostReason: b.dataset.reason, lostNote: $("#reasonNote").value.trim() });
    };
    dlg.addEventListener("close", () => finish(null), { once: true });
    dlg.showModal();
  });
}

$("#leadList").addEventListener("change", async (e) => {
  const sel = e.target.closest("[data-lstage]");
  if (!sel) return;
  const lead = leads.find((l) => l.id === sel.dataset.lstage);
  let extra = {};
  if (sel.value === "Rad etdi") {
    const r = await askReason(lead?.name, lead?.lostReason);
    if (!r) return renderLeads();
    extra = { ...r, lostDate: today() };
  }
  try {
    await updateDoc(doc(db, "crmLeads", sel.dataset.lstage), { stage: sel.value, ...extra, updatedAt: serverTimestamp() });
    if (sel.value === "Sotildi") openSale(null, leads.find((l) => l.id === sel.dataset.lstage));
  } catch (err) {
    toast("Saqlanmadi: " + err.message, "err");
  }
});

$("#leadList").addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-ledit]");
  const del = e.target.closest("[data-ldel]");
  const sell = e.target.closest("[data-lsell]");
  if (ed) openLead(ed.dataset.ledit);
  if (sell) openSale(null, leads.find((l) => l.id === sell.dataset.lsell));
  if (del && confirm("Lid o'chirilsinmi?")) {
    try {
      await deleteDoc(doc(db, "crmLeads", del.dataset.ldel));
    } catch (err) {
      toast(err.message, "err");
    }
  }
});

// ================= MIJOZLAR =================
$("#cSearch").addEventListener("input", renderClients);
$("#cSort").addEventListener("change", renderClients);

function clientSales(c) {
  return sales.filter((s) => (c.phone && s.phone === c.phone) || s.clientId === c.id);
}

// Mijoz turi: qo'lda tanlangan yoki xaridlaridan taxmin qilingan
function clientType(c) {
  if (c.ctype) return c.ctype;
  const lead = c.phone && leads.find((l) => l.phone === c.phone && l.ctype);
  if (lead) return lead.ctype;
  return guessType(clientSales(c).map((s) => s.product).join(" "));
}
// Qayta taklif sanasi: oxirgi xarid + tur bo'yicha kun. Qilingan bo'lsa (followDone) — keyingisi
function followUpDate(c) {
  const cs = clientSales(c).filter((s) => s.status !== "Bekor qilindi");
  if (!cs.length) return "";
  const last = cs.map((s) => s.date || "").sort().pop();
  let due = addDays(last, REPEAT_DAYS[clientType(c)] || 150);
  if (c.followDone && c.followDone >= due) due = addDays(c.followDone, REPEAT_DAYS[clientType(c)] || 150);
  return due;
}
const followDue = (c) => {
  const d = followUpDate(c);
  return d && d <= today();
};

$("#cType").insertAdjacentHTML("beforeend", CLIENT_TYPES.map((t) => `<option>${escapeHtml(t)}</option>`).join(""));
$("#cType").addEventListener("change", renderClients);

function renderClients() {
  const q = $("#cSearch").value.trim().toLowerCase();
  const sort = $("#cSort").value;
  const ty = $("#cType").value;
  let list = clients
    .filter((c) => !q || `${c.name} ${c.phone} ${c.address} ${c.note}`.toLowerCase().includes(q))
    .filter((c) => ty === "all" || (ty === "due" ? followDue(c) : clientType(c) === ty))
    .map((c) => {
      const cs = clientSales(c).filter((s) => s.status !== "Bekor qilindi");
      return { ...c, _n: cs.length, _sum: sumByCur(cs), _last: cs[0]?.date || "", _type: clientType(c), _fu: followUpDate(c) };
    });
  const dueN = clients.filter(followDue).length;
  $("#cDue").textContent = dueN ? `🔁 Qayta taklif vaqti kelgan: ${dueN} ta` : "";
  $("#cDue").hidden = !dueN;
  if (sort === "sales") list.sort((a, b) => b._n - a._n);
  if (sort === "last") list.sort((a, b) => b._last.localeCompare(a._last));
  if (sort === "name") list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  $("#cCount").textContent = clients.length || "";
  $("#clientsList").innerHTML = list.length
    ? list
        .map(
          (c) => `<div class="row crm-row" data-cedit="${c.id}">
        <div class="avatar">${escapeHtml((c.name || "?").trim()[0] || "?").toUpperCase()}</div>
        <div class="meta">
          <b>${escapeHtml(c.name || "Nomsiz")}</b>
          <small>${escapeHtml(c.phone || "tel. yo'q")}${c.address ? " · " + escapeHtml(c.address) : ""}</small>
          <small>${c._n ? `${c._n} ta xarid · ${curText(c._sum)} · oxirgi ${fmtDate(c._last)}` : "xarid yo'q"}</small>
          <div class="pills">${c._type !== "Oddiy xaridor" ? `<span class="pill type">🔧 ${escapeHtml(c._type)}</span>` : ""}${
            c._fu ? `<span class="pill ${c._fu <= today() ? "late" : ""}">🔁 ${c._fu <= today() ? "qayta taklif vaqti keldi" : "qayta taklif " + fmtDate(c._fu)}</span>` : ""
          }</div>
        </div>
        <div class="row-actions">
          ${c.phone ? `<a class="icon-btn" href="tel:${escapeHtml(c.phone)}" title="Qo'ng'iroq">📞</a>` : ""}
        </div>
      </div>`
        )
        .join("")
    : `<p class="empty">Mijoz yo'q. Sotuv qo'shganingizda mijoz avtomatik yaratiladi.</p>`;
}

$("#newClient").addEventListener("click", () => openClient(null));
$("#clientsList").addEventListener("click", (e) => {
  if (e.target.closest("a")) return;
  const r = e.target.closest("[data-cedit]");
  if (r) openClient(r.dataset.cedit);
});

function openClient(id) {
  editClientId = id;
  const c = clients.find((x) => x.id === id) || {};
  const f = $("#clientForm").elements;
  $("#clientTitle").textContent = id ? c.name || "Mijoz" : "Yangi mijoz";
  f.name.value = c.name || "";
  f.phone.value = c.phone || "";
  f.address.value = c.address || "";
  f.source.innerHTML = opts(SOURCES, c.source || "Do'kon");
  f.ctype.innerHTML = opts(CLIENT_TYPES, id ? clientType(c) : "Oddiy xaridor");
  f.note.value = c.note || "";
  const cs = id ? clientSales(c) : [];
  const fu = id ? followUpDate(c) : "";
  $("#clientHistory").innerHTML = id
    ? `<h3>Xaridlar tarixi</h3>` +
      (cs.length
        ? cs
            .map(
              (s) => `<div class="mini-row"><div><b>${escapeHtml(s.product || categoryLabel(s.category))}</b> × ${s.qty || 1}<br><small class="muted">${fmtDate(s.date)} · ${escapeHtml(s.status)}</small></div><div class="row-actions"><b>${money(s.amount, s.currency)}</b><button class="icon-btn del" type="button" data-sdel="${s.id}" title="Xaridni o'chirish">🗑</button></div></div>`
            )
            .join("")
        : `<p class="muted">Hali xarid yo'q</p>`) +
      (fu
        ? `<p class="muted">🔁 Qayta taklif: <b>${fmtDate(fu)}</b>${fu <= today() ? ` — vaqti keldi` : ""}${c.followDone ? ` · oxirgi marta ${fmtDate(c.followDone)} da bog'lanilgan` : ""}</p>
           ${fu <= today() ? `<button class="btn btn-sm btn-line" type="button" id="clientFollow">✅ Qayta taklif qildim</button>` : ""}`
        : "") +
      `<div class="btn-row"><button class="btn btn-sm btn-yellow" type="button" id="clientSell">+ Sotuv qo'shish</button>
       <button class="btn btn-sm btn-red" type="button" id="clientDel">Mijozni o'chirish</button></div>`
    : "";
  $("#clientDlg").showModal();
}

$("#clientDlg").addEventListener("click", async (e) => {
  const c = clients.find((x) => x.id === editClientId);
  const sd = e.target.closest("[data-sdel]");
  if (sd) {
    if (await deleteSale(sd.dataset.sdel)) setTimeout(() => openClient(editClientId), 400);
    return;
  }
  if (e.target.closest("#clientFollow") && c) {
    try {
      await updateDoc(doc(db, "crmClients", c.id), { followDone: today(), updatedAt: serverTimestamp() });
      toast("Belgilandi. Keyingi eslatma: " + fmtDate(addDays(today(), REPEAT_DAYS[clientType(c)] || 150)));
      setTimeout(() => openClient(c.id), 300);
    } catch (err) {
      toast(err.message, "err");
    }
    return;
  }
  if (e.target.closest("#clientSell") && c) {
    $("#clientDlg").close();
    openSale(null, { name: c.name, phone: c.phone, clientId: c.id, address: c.address });
  }
  if (e.target.closest("#clientDel") && c && confirm("Mijoz o'chirilsinmi? (sotuvlari qoladi)")) {
    try {
      await deleteDoc(doc(db, "crmClients", c.id));
      $("#clientDlg").close();
    } catch (err) {
      toast(err.message, "err");
    }
  }
});

$("#clientForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const phone = f.phone.value.trim() ? normalizePhone(f.phone.value) : "";
  if (phone === null) return toast("Telefon raqam noto'g'ri", "err");
  const data = {
    name: f.name.value.trim(),
    phone,
    address: f.address.value.trim(),
    source: f.source.value,
    ctype: f.ctype.value,
    note: f.note.value.trim(),
    updatedAt: serverTimestamp(),
  };
  if (!data.name) return toast("Ism kiriting", "err");
  try {
    if (editClientId) await updateDoc(doc(db, "crmClients", editClientId), data);
    else {
      const dup = phone && clients.find((c) => c.phone === phone);
      if (dup) return toast(`Bu raqam bilan mijoz bor: ${dup.name}`, "err");
      const ref = phone ? doc(db, "crmClients", phoneId(phone)) : doc(collection(db, "crmClients"));
      await setDoc(ref, { ...data, date: today(), createdAt: serverTimestamp() });
    }
    $("#clientDlg").close();
    toast("Mijoz saqlandi");
  } catch (err) {
    toast("Saqlanmadi: " + err.message, "err");
  }
});

// Sotuvda mijozni topadi yoki yangisini yaratadi
async function upsertClient({ name, phone, address, source, ctype }) {
  let c = phone ? clients.find((x) => x.phone === phone) : clients.find((x) => x.name === name && !x.phone);
  if (c) {
    const patch = {};
    if (address && !c.address) patch.address = address;
    if (name && !c.name) patch.name = name;
    if (ctype && !c.ctype) patch.ctype = ctype;
    if (Object.keys(patch).length) await updateDoc(doc(db, "crmClients", c.id), patch);
    return c.id;
  }
  const ref = phone ? doc(db, "crmClients", phoneId(phone)) : doc(collection(db, "crmClients"));
  await setDoc(ref, {
    name: name || "Nomsiz",
    phone: phone || "",
    address: address || "",
    source: source || "Do'kon",
    ctype: ctype || guessType(name),
    note: "",
    date: today(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ================= SOTUVLAR =================
$("#sStatus").insertAdjacentHTML("beforeend", opts(SALE_STATUSES));
$("#sMonth").value = thisMonth();
["#sStatus", "#sMonth", "#sSearch"].forEach((s) => $(s).addEventListener("input", renderSales));

function renderSales() {
  const st = $("#sStatus").value;
  const ym = $("#sMonth").value;
  const q = $("#sSearch").value.trim().toLowerCase();
  const list = sales.filter(
    (s) =>
      (st === "all" ? true : st === "debt" ? s.status !== "Bekor qilindi" && (Number(s.amount) || 0) > (Number(s.paid) || 0) : st === "open" ? !["Yetkazildi", "Bekor qilindi"].includes(s.status) : s.status === st) &&
      (!ym || (s.date || "").startsWith(ym)) &&
      (!q || `${s.name} ${s.phone} ${s.product} ${s.address}`.toLowerCase().includes(q))
  );
  const open = sales.filter((s) => !["Yetkazildi", "Bekor qilindi"].includes(s.status)).length;
  $("#sCount").textContent = open || "";
  const valid = list.filter((s) => s.status !== "Bekor qilindi");
  $("#sSummary").innerHTML = list.length
    ? (() => {
        const t = sumByCur(valid), pd = sumByCur(valid, "paid"), r = {};
        Object.keys(t).forEach((c) => (r[c] = (t[c] || 0) - (pd[c] || 0)));
        return `${valid.length} ta sotuv · jami ${curText(t)}<br>olingan ${curText(pd)} · <span class="bad">qoldiq ${curText(r)}</span>`;
      })()
    : "";
  $("#salesList").innerHTML = list.length
    ? list
        .map((s) => {
          const debt = (Number(s.amount) || 0) - (Number(s.paid) || 0);
          return `<div class="order crm-card" data-s="${escapeHtml(s.status)}">
        <div class="order-head">
          <b>${escapeHtml(s.name || "Nomsiz")}</b>
          <small>${fmtDate(s.date)}</small>
        </div>
        ${telLink(s.phone)}
        <div>🛏 <b>${escapeHtml(s.product || categoryLabel(s.category))}</b> × ${s.qty || 1} <small class="muted">· ${escapeHtml(s.category === "boshqa" ? "Boshqa" : categoryLabel(s.category))}</small></div>
        ${s.address ? `<div class="muted">📍 ${escapeHtml(s.address)}</div>` : ""}
        ${s.note ? `<div class="muted">${escapeHtml(s.note)}</div>` : ""}
        <div class="pay-box">
          <div><small>Jami</small><b>${money(s.amount, s.currency)}</b></div>
          <div><small>Zaklad / berdi</small><b>${money(s.paid, s.currency)}</b></div>
          <div class="${debt > 0 ? "late" : "ok"}"><small>Qoldiq</small><b>${debt > 0 ? money(debt, s.currency) : "✅ to'landi"}</b></div>
        </div>
        ${
          debt > 0 && s.status !== "Bekor qilindi"
            ? `<button class="btn btn-sm btn-line" data-spay="${s.id}">💵 Qoldiqdan to'lov qo'shish</button>`
            : ""
        }
        ${(s.payments || []).length ? `<small class="muted">To'lovlar: ${s.payments.map((x) => `${fmtDate(x.date)} — ${money(x.amount, s.currency)}`).join(" · ")}</small>` : ""}
        <div class="order-foot">
          <select data-sstatus="${s.id}">${opts(SALE_STATUSES, s.status)}</select>
          <div class="row-actions">
            <button class="icon-btn" data-sedit="${s.id}" title="O'zgartirish">✎</button>
            <button class="icon-btn del" data-sdel="${s.id}" title="O'chirish">🗑</button>
          </div>
        </div>
      </div>`;
        })
        .join("")
    : `<p class="empty">Bu oyda sotuv yo'q. "+ Yangi sotuv" bilan qo'shing.</p>`;
}

$("#newSale").addEventListener("click", () => openSale(null));

function openSale(id, prefill) {
  editSaleId = id;
  saleFromLead = prefill && prefill.id && leads.some((l) => l.id === prefill.id) ? prefill.id : null;
  const s = sales.find((x) => x.id === id) || {};
  const p = prefill || {};
  const f = $("#saleForm").elements;
  $("#saleTitle").textContent = id ? "Sotuvni o'zgartirish" : "Yangi sotuv";
  $("#saleDel").hidden = !id;
  f.phone.value = s.phone ?? p.phone ?? "";
  f.name.value = s.name ?? p.name ?? "";
  f.address.value = s.address ?? p.address ?? p.region ?? "";
  f.product.value = s.product ?? p.interest ?? "";
  f.category.innerHTML = catOpts(s.category || "matras");
  f.qty.value = s.qty ?? 1;
  f.amount.value = s.amount ?? 0;
  f.currency.value = s.currency || "$";
  f.paid.value = s.paid ?? 0;
  updateRest();
  f.date.value = s.date || today();
  f.status.innerHTML = opts(SALE_STATUSES, s.status || "Yangi");
  f.note.value = s.note || "";
  $("#saleDlg").showModal();
}

$("#saleDel").addEventListener("click", async () => {
  if (editSaleId && (await deleteSale(editSaleId))) $("#saleDlg").close();
});

function updateRest() {
  const f = $("#saleForm").elements;
  const r = parsePrice(f.amount.value) - parsePrice(f.paid.value);
  f.rest.value = r > 0 ? money(r, f.currency.value) : "0";
}
["amount", "paid", "currency"].forEach((n) => $("#saleForm").elements[n].addEventListener("input", updateRest));
["amount", "paid"].forEach((n) => $("#saleForm").elements[n].addEventListener("focus", (e) => e.target.value === "0" && e.target.select()));

// Telefon kiritilganda mavjud mijoz ma'lumotini to'ldiradi
$("#saleForm").elements.phone.addEventListener("change", (e) => {
  const ph = normalizePhone(e.target.value);
  const c = ph && clients.find((x) => x.phone === ph);
  const f = $("#saleForm").elements;
  if (c) {
    if (!f.name.value) f.name.value = c.name || "";
    if (!f.address.value) f.address.value = c.address || "";
    toast("Mijoz topildi: " + c.name);
  }
});

$("#saleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const phone = f.phone.value.trim() ? normalizePhone(f.phone.value) : "";
  if (phone === null) return toast("Telefon raqam noto'g'ri", "err");
  const amount = parsePrice(f.amount.value);
  const data = {
    phone,
    name: f.name.value.trim(),
    address: f.address.value.trim(),
    product: f.product.value.trim(),
    category: f.category.value,
    qty: parseCount(f.qty.value) || 1,
    amount,
    currency: f.currency.value,
    paid: parsePrice(f.paid.value),
    date: f.date.value || today(),
    status: f.status.value,
    note: f.note.value.trim(),
    updatedAt: serverTimestamp(),
  };
  if (!data.name && !data.phone) return toast("Mijoz ismi yoki telefonini kiriting", "err");
  if (data.paid > data.amount && data.amount > 0) return toast("Zaklad sotuv summasidan katta bo'lishi mumkin emas", "err");
  if (!editSaleId) data.deposit = data.paid;
  const btn = e.target.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    const lead = saleFromLead && leads.find((l) => l.id === saleFromLead);
    data.clientId = await upsertClient({ name: data.name, phone, address: data.address, source: lead?.source, ctype: lead ? lead.ctype || guessType(lead.interest) : guessType(data.product) });
    if (editSaleId) await updateDoc(doc(db, "crmSales", editSaleId), data);
    else {
      const ref = await addDoc(collection(db, "crmSales"), { ...data, leadId: saleFromLead || "", createdAt: serverTimestamp() });
      if (saleFromLead) await updateDoc(doc(db, "crmLeads", saleFromLead), { stage: "Sotildi", saleId: ref.id, updatedAt: serverTimestamp() });
    }
    $("#saleDlg").close();
    toast("Sotuv saqlandi");
  } catch (err) {
    toast("Saqlanmadi: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

$("#salesList").addEventListener("change", async (e) => {
  const sel = e.target.closest("[data-sstatus]");
  if (!sel) return;
  try {
    await updateDoc(doc(db, "crmSales", sel.dataset.sstatus), { status: sel.value, updatedAt: serverTimestamp() });
  } catch (err) {
    toast(err.message, "err");
  }
});

$("#salesList").addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-sedit]");
  const del = e.target.closest("[data-sdel]");
  if (ed) openSale(ed.dataset.sedit);
  const pay = e.target.closest("[data-spay]");
  if (pay) {
    const s = sales.find((x) => x.id === pay.dataset.spay);
    const rest = (Number(s.amount) || 0) - (Number(s.paid) || 0);
    const v = prompt(`${s.name || "Mijoz"} qancha to'ladi?\nQoldiq: ${money(rest, s.currency)}`, rest);
    if (v === null) return;
    const n = parsePrice(v);
    if (!n || n <= 0) return toast("Summani kiriting", "err");
    if (n > rest) return toast("Qoldiqdan ko'p bo'lishi mumkin emas", "err");
    try {
      await updateDoc(doc(db, "crmSales", s.id), {
        paid: (Number(s.paid) || 0) + n,
        payments: [...(s.payments || []), { date: today(), amount: n }],
        updatedAt: serverTimestamp(),
      });
      toast(n === rest ? "To'liq to'landi ✅" : "To'lov qo'shildi");
    } catch (err) {
      toast(err.message, "err");
    }
  }
  if (del) deleteSale(del.dataset.sdel);
});

// Xaridni o'chiradi: hisobot, mijoz tarixi va qarzlar avtomatik qayta hisoblanadi
async function deleteSale(id) {
  const s = sales.find((x) => x.id === id);
  if (!s) return;
  const txt = `${s.name || "Mijoz"}: ${s.product || categoryLabel(s.category)} × ${s.qty || 1} — ${money(s.amount, s.currency)}`;
  if (!confirm(`Xarid o'chirilsinmi?\n${txt}\n\nU umumiy hisobotdan ham olib tashlanadi.`)) return false;
  try {
    await deleteDoc(doc(db, "crmSales", id));
    const lead = leads.find((l) => l.saleId === id || (s.leadId && l.id === s.leadId));
    if (lead) await updateDoc(doc(db, "crmLeads", lead.id), { stage: "Bog'lanildi", saleId: "", updatedAt: serverTimestamp() });
    toast("Xarid o'chirildi");
    return true;
  } catch (err) {
    toast(err.message, "err");
    return false;
  }
}

// ================= Excel'ga eksport =================
$("#crmExport").addEventListener("click", async () => {
  try {
    const XLSX = await import(XLSX_URL);
    const wb = XLSX.utils.book_new();
    const sheet = (rows, name) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
    sheet(
      sales.map((s) => ({
        Sana: s.date, Mijoz: s.name, Telefon: s.phone, Mahsulot: s.product,
        Kategoriya: s.category === "boshqa" ? "Boshqa" : categoryLabel(s.category), Soni: s.qty,
        Summa: s.amount, Zaklad: s.deposit ?? "", "Jami to'langan": s.paid, Qoldiq: (Number(s.amount) || 0) - (Number(s.paid) || 0), Valyuta: s.currency, Holat: s.status, Manzil: s.address, Izoh: s.note,
      })),
      "Sotuvlar"
    );
    sheet(
      clients.map((c) => {
        const cs = clientSales(c).filter((s) => s.status !== "Bekor qilindi");
        return { Ism: c.name, Telefon: c.phone, Manzil: c.address, Manba: c.source, "Xaridlar soni": cs.length, Jami: curText(sumByCur(cs)), Izoh: c.note, Qo_shilgan: c.date };
      }),
      "Mijozlar"
    );
    sheet(
      leads.map((l) => ({
        Sana: l.date, Ism: l.name, Telefon: l.phone, Viloyat: l.region, Manba: l.source, Mahsulot: l.interest, Instagram: l.instagram,
        Bosqich: l.stage, "Keyingi qo'ng'iroq": l.nextCall, Izoh: l.note,
      })),
      "Lidlar"
    );
    XLSX.writeFile(wb, `FURNIPART-CRM-${today()}.xlsx`);
  } catch (err) {
    toast("Excel yaratilmadi: " + err.message, "err");
  }
});

// ================= Lidlarni Excel / Google Sheets'dan import =================
// Ustunlar: Sana, Ism, Telefon, Viloyat, Mahsulot, Manba, Holat, Izoh, Instagram, Keyingi qo'ng'iroq
const pick = (r, ...keys) => {
  for (const k of Object.keys(r)) {
    const kk = k.toLowerCase().trim();
    if (keys.some((x) => kk.startsWith(x))) return r[k];
  }
  return "";
};
function toYmd(v) {
  if (v instanceof Date && !isNaN(v)) return ymd(v);
  if (typeof v === "number") return ymd(new Date(Math.round((v - 25569) * 864e5)));
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) {
    // "10/31/2026" (oy/kun) yoki "31.10.2026" (kun.oy)
    let [, a, b, y] = m;
    const [mo, d] = s.includes("/") && Number(a) <= 12 ? [a, b] : [b, a];
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  return "";
}
function mapStage(v) {
  const t = String(v || "").toLowerCase();
  if (!t || t.startsWith("yangi")) return "Yangi";
  if (t.includes("bog")) return "Bog'lanildi";
  if (t.includes("o'yla") || t.includes("oyla") || t.includes("o‘yla")) return "O'ylab ko'radi";
  if (t.includes("sotil") || t.includes("sotdi")) return "Sotildi";
  if (t.includes("bekor") || t.includes("rad")) return "Rad etdi";
  return "Yangi";
}
function mapSource(v) {
  const t = String(v || "").toLowerCase();
  const hit = [["insta", "Instagram"], ["telegram", "Telegram"], ["sayt", "Sayt"], ["site", "Sayt"], ["qo'ng", "Qo'ng'iroq"], ["dokon", "Do'kon"], ["do'kon", "Do'kon"], ["tavsiya", "Tavsiya"]].find(([k]) => t.includes(k));
  return hit ? hit[1] : t ? "Boshqa" : "Instagram";
}

$("#leadImport").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const XLSX = await import(XLSX_URL);
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    const known = new Set(leads.map((l) => l.phone).filter(Boolean));
    const fresh = new Map();
    let dup = 0;
    for (const r of rows) {
      const rawPhone = String(pick(r, "telefon", "phone", "tel") || "");
      const phone = normalizePhone(rawPhone) || "";
      const name = String(pick(r, "ism", "name", "mijoz") || "").trim();
      if (!phone && !name) continue;
      const extra = rawPhone.replace(/^[\s+\d()\-.]+/, "").trim();
      const note = [String(pick(r, "izoh", "note") || "").trim(), extra].filter(Boolean).join(" · ");
      const lead = {
        name,
        phone,
        region: String(pick(r, "viloyat", "manzil", "shahar") || "").trim(),
        interest: String(pick(r, "mahsulot", "qiziq") || "").trim(),
        source: mapSource(pick(r, "manba", "source")),
        stage: mapStage(pick(r, "holat", "bosqich", "status")),
        note,
        instagram: String(pick(r, "instagram") || "").trim().replace(/^@/, ""),
        nextCall: toYmd(pick(r, "keyingi")),
        date: toYmd(pick(r, "sana", "date")) || today(),
      };
      if (!lead.name && lead.instagram) lead.name = "@" + lead.instagram;
      lead.ctype = guessType(lead.interest);
      if (phone && known.has(phone)) { dup++; continue; }
      const key = phone || "n:" + name;
      const prev = fresh.get(key);
      if (prev) {
        // bir xil raqam qayta yozilgan bo'lsa — bitta lidga birlashtiriladi
        dup++;
        if (lead.interest && !prev.interest.includes(lead.interest)) prev.interest = [prev.interest, lead.interest].filter(Boolean).join(" · ");
        if (lead.stage !== "Rad etdi") prev.stage = lead.stage;
        prev.note = [prev.note, lead.note].filter(Boolean).join(" · ");
        prev.name = prev.name || lead.name;
      } else fresh.set(key, lead);
    }
    const list = [...fresh.values()];
    if (!list.length) return toast(dup ? `Hammasi allaqachon bor (${dup} ta takroriy)` : "Faylda lid topilmadi", "err");
    if (!confirm(`${list.length} ta yangi lid qo'shilsinmi?${dup ? `\n(${dup} ta takroriy/mavjud raqam o'tkazib yuborildi)` : ""}`)) return;
    for (let i = 0; i < list.length; i += 400) {
      const b = writeBatch(db);
      list.slice(i, i + 400).forEach((l) => b.set(doc(collection(db, "crmLeads")), { ...l, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
      await b.commit();
    }
    toast(`${list.length} ta lid qo'shildi ✅`);
  } catch (err) {
    console.error(err);
    toast("Import bo'lmadi: " + err.message, "err");
  }
});

// ================= GURUHGA XABAR =================
const TEMPLATES = {
  Mebelchi: "Assalomu alaykum! FURNIPART'dan yozyapmiz. Mebelchilar uchun yangi mahsulotlar keldi: shablonlar, klipsalar, petlyalar. Ulgurji narxlar bor. Ro'yxat va narxlarni yuboraymi?",
  "Oddiy xaridor": "Assalomu alaykum! FURNIPART premium'dan yozyapmiz. Sizga xizmat qilganimizdan xursandmiz. Hozir matras va mebel furniturasiga maxsus taklifimiz bor. Qiziqsangiz, javob yozing.",
  "Diler / do'kon": "Assalomu alaykum! FURNIPART'dan. Yangi partiya keldi, dilerlar uchun narxlar yangilandi. Prays-listni yuboraymi?",
  due: "Assalomu alaykum! FURNIPART'dan yozyapmiz. Oldingi xaridingiz bo'yicha hammasi joyidami? Sizga yana kerakli narsa bo'lsa, maxsus narx qilib beramiz.",
  all: "Assalomu alaykum! FURNIPART premium'dan yozyapmiz. Yangi mahsulotlar va chegirmalar haqida bilishni xohlaysizmi?",
};
const BC_GROUPS = [
  ["Mebelchi", "🔧 Mebelchilar (mijoz + lid)"],
  ["Diler / do'kon", "🏪 Dilerlar / do'konlar"],
  ["Oddiy xaridor", "🏠 Oddiy xaridorlar (xarid qilganlar)"],
  ["due", "🔁 Qayta taklif vaqti kelganlar"],
  ["lost", "❌ Rad etgan lidlar (qimmat / hozir kerak emas)"],
  ["all", "👥 Barcha mijozlar"],
];
$("#bcGroup").innerHTML = BC_GROUPS.map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join("");

function bcRecipients(g) {
  const m = new Map();
  const add = (x) => x.phone && !m.has(x.phone) && m.set(x.phone, x);
  if (g === "all") clients.forEach((c) => add({ name: c.name, phone: c.phone, kind: "client", id: c.id, last: c.lastMsg }));
  else if (g === "due") clients.filter(followDue).forEach((c) => add({ name: c.name, phone: c.phone, kind: "client", id: c.id, last: c.lastMsg }));
  else if (g === "lost")
    leads
      .filter((l) => l.stage === "Rad etdi" && ["Qimmat", "Hozir kerak emas", "Javob bermadi"].includes(l.lostReason))
      .forEach((l) => add({ name: l.name, phone: l.phone, kind: "lead", id: l.id, last: l.lastMsg, extra: l.lostReason }));
  else {
    clients.filter((c) => clientType(c) === g).forEach((c) => add({ name: c.name, phone: c.phone, kind: "client", id: c.id, last: c.lastMsg }));
    if (g !== "Oddiy xaridor")
      leads
        .filter((l) => (l.ctype || guessType(l.interest)) === g && l.stage !== "Sotildi")
        .forEach((l) => add({ name: l.name, phone: l.phone, kind: "lead", id: l.id, last: l.lastMsg, extra: l.interest }));
  }
  return [...m.values()];
}

function renderBroadcast() {
  const g = $("#bcGroup").value;
  const list = bcRecipients(g);
  const text = $("#bcText").value;
  const enc = encodeURIComponent(text);
  const sent = list.filter((r) => r.last === today()).length;
  $("#bcInfo").textContent = `${list.length} ta qabul qiluvchi${sent ? ` · bugun ${sent} tasiga yuborildi` : ""}`;
  $("#bcList").innerHTML = list.length
    ? list
        .map((r) => {
          const d = r.phone.replace(/\D/g, "");
          return `<div class="mini-row bc-row ${r.last === today() ? "sent" : ""}">
        <div><b>${escapeHtml(r.name || "Nomsiz")}</b> <small class="muted">${r.kind === "lead" ? "lid" : "mijoz"}${r.extra ? " · " + escapeHtml(String(r.extra).slice(0, 40)) : ""}</small><br><small>${escapeHtml(r.phone)}${r.last ? ` · oxirgi xabar ${fmtDate(r.last)}` : ""}</small></div>
        <div class="row-actions">
          <a class="icon-btn" data-bcsent="${r.kind}:${r.id}" href="sms:${escapeHtml(r.phone)}&body=${enc}" title="SMS">💬</a>
          <a class="icon-btn" data-bcsent="${r.kind}:${r.id}" href="https://wa.me/${d}?text=${enc}" target="_blank" rel="noopener" title="WhatsApp">🟢</a>
          <a class="icon-btn" data-bcsent="${r.kind}:${r.id}" href="https://t.me/+${d}" target="_blank" rel="noopener" title="Telegram (matnni nusxalab qo'ying)">✈️</a>
        </div>
      </div>`;
        })
        .join("")
    : `<p class="muted">Bu guruhda telefon raqamli hech kim yo'q</p>`;
}

$("#bcOpen").addEventListener("click", () => {
  $("#bcGroup").value = $("#cType").value === "all" ? "Mebelchi" : $("#cType").value;
  $("#bcText").value = TEMPLATES[$("#bcGroup").value] || TEMPLATES.all;
  renderBroadcast();
  $("#bcDlg").showModal();
});
$("#bcGroup").addEventListener("change", () => {
  $("#bcText").value = TEMPLATES[$("#bcGroup").value] || TEMPLATES.all;
  renderBroadcast();
});
$("#bcText").addEventListener("input", renderBroadcast);

$("#bcCopy").addEventListener("click", async () => {
  const list = bcRecipients($("#bcGroup").value);
  try {
    await navigator.clipboard.writeText($("#bcText").value);
    toast("Matn nusxalandi — Telegram'da qo'ying");
  } catch {
    toast(`${list.length} ta raqam — matnni qo'lda nusxalang`, "err");
  }
});
$("#bcPhones").addEventListener("click", async () => {
  const phones = bcRecipients($("#bcGroup").value).map((r) => r.phone).join("\n");
  try {
    await navigator.clipboard.writeText(phones);
    toast("Raqamlar nusxalandi");
  } catch {
    prompt("Raqamlar:", phones.replace(/\n/g, ", "));
  }
});

// Xabar tugmasi bosilganda — "bugun yuborildi" deb belgilaymiz
$("#bcList").addEventListener("click", async (e) => {
  const a = e.target.closest("[data-bcsent]");
  if (!a) return;
  if (a.title.startsWith("Telegram")) navigator.clipboard?.writeText($("#bcText").value).catch(() => {});
  const [kind, id] = a.dataset.bcsent.split(":");
  try {
    await updateDoc(doc(db, kind === "lead" ? "crmLeads" : "crmClients", id), { lastMsg: today() });
  } catch (err) {
    console.error(err);
  }
  setTimeout(renderBroadcast, 300);
});
