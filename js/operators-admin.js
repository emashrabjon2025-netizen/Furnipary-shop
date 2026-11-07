// Admin: operatorlar — qo'shish, reyting, Telegram'ga ulash, lidlarni taqsimlash, skriptlar
import { ADMIN_UIDS, firebaseConfig } from "./config.js";
import { db, auth, collection, doc, setDoc, updateDoc, onSnapshot, onAuthStateChanged, writeBatch } from "./firebase.js";
import { $, escapeHtml as esc, toast, formatPrice } from "./util.js";
import { DEFAULT_SCRIPTS } from "./scripts.js";
import { areaOf } from "./areas.js";

const CLOSED = ["Sotildi", "Rad etdi"];
let ops = [];
let couriers = [];
let leads = [];
let sales = [];
let scripts = {};
let usdRate = 12050;
let botName = "";
let unsub = [];

const pad = (n) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const ms = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : v ? Date.parse(v) || 0 : 0);
const monthOf = (l) => String(l.assignedAt || l.date || "").slice(0, 7);
const toSom = (a, cur) => (cur === "$" ? (Number(a) || 0) * usdRate : Number(a) || 0);
const mln = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " mln" : Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ")) + " so'm";
const mins = (m) => (m === null ? "—" : m < 60 ? `${Math.round(m)} daq` : `${(m / 60).toFixed(1)} soat`);

$("#opMonth").value = today().slice(0, 7);
$("#opMonth").addEventListener("change", render);

function stats(o, month) {
  const L = leads.filter((l) => l.assignedTo === o.id && monthOf(l) === month);
  const S = sales.filter((s) => s.operator === o.id && (s.date || "").slice(0, 7) === month && s.status !== "Bekor qilindi");
  const sold = L.filter((l) => l.stage === "Sotildi").length;
  const lost = L.filter((l) => l.stage === "Rad etdi");
  const closed = sold + lost.length;
  const rts = L.filter((l) => l.contactedAt && ms(l.createdAt)).map((l) => (ms(l.contactedAt) - ms(l.createdAt)) / 60000).filter((x) => x >= 0);
  const within5 = rts.filter((x) => x <= 5).length;
  const reasons = {};
  lost.forEach((l) => (reasons[l.lostReason || "—"] = (reasons[l.lostReason || "—"] || 0) + 1));
  const openAll = leads.filter((l) => l.assignedTo === o.id && !CLOSED.includes(l.stage));
  return {
    leads: L.length,
    contacted: L.filter((l) => l.contactedAt).length,
    sold,
    conv: closed ? Math.round((sold / closed) * 100) : 0,
    revenue: S.reduce((a, s) => a + toSom(s.amount, s.currency), 0),
    avg: rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null,
    fast: rts.length ? Math.round((within5 / rts.length) * 100) : null,
    attempts: L.length ? (L.reduce((a, l) => a + (Number(l.attempts) || 0), 0) / L.length).toFixed(1) : "0",
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 3),
    open: openAll.length,
    late: openAll.filter((l) => l.nextCall && l.nextCall < today()).length,
    waiting: openAll.filter((l) => l.stage === "Yangi" && !l.contactedAt).length,
  };
}

function render() {
  const month = $("#opMonth").value || today().slice(0, 7);
  const rows = ops.map((o) => ({ o, s: stats(o, month) })).sort((a, b) => b.s.revenue - a.s.revenue || b.s.sold - a.s.sold);
  const medal = ["🥇", "🥈", "🥉"];
  $("#opRank").innerHTML = ops.length
    ? `<div class="ttable-wrap"><table class="ttable">
        <thead><tr><th>Operator</th><th>Lid</th><th>Sotildi</th><th>Konv.</th><th>Savdo</th><th>O'rt. javob</th><th>5 daq ichida</th></tr></thead>
        <tbody>${rows
          .map(
            ({ o, s }, i) => `<tr class="${o.active === false ? "muted" : ""}"><td>${medal[i] || ""} <b>${esc(o.name)}</b></td><td>${s.leads}</td><td>${s.sold}</td><td>${s.conv}%</td><td>${mln(s.revenue)}</td><td class="${s.avg !== null && s.avg > 5 ? "neg" : "pos"}">${mins(s.avg)}</td><td>${s.fast === null ? "—" : s.fast + "%"}</td></tr>`
          )
          .join("")}</tbody></table></div>`
    : `<p class="muted">Hali operator yo'q. Pastdagi formadan qo'shing — keyin yangi lidlar unga avtomatik biriktiriladi.</p>`;

  const un = leads.filter((l) => !l.assignedTo && !CLOSED.includes(l.stage));
  const active = ops.filter((o) => o.active !== false);
  $("#opUnassigned").innerHTML = un.length && active.length ? `<button class="pill late" id="opSpread">👤 Biriktirilmagan ochiq lidlar: ${un.length} — operatorlarga taqsimlash</button>` : "";

  $("#opCards").innerHTML = rows
    .map(({ o, s }) => {
      const link = botName ? `https://t.me/${botName}?start=op_${o.id}` : "";
      return `<div class="panel op-admin ${o.active === false ? "off" : ""}">
        <div class="opa-head"><h2>👤 ${esc(o.name)}</h2>
          <label class="switch"><input type="checkbox" data-active="${o.id}" ${o.active !== false ? "checked" : ""}> faol</label></div>
        <p class="muted small">${esc(o.email || "")}</p>
        <div class="mgrid">
          <div><small>Ochiq lidlar</small><b>${s.open}</b></div>
          <div><small>Kutayotgan yangi</small><b class="${s.waiting ? "neg" : ""}">${s.waiting}</b></div>
          <div><small>Kechikkan qo'ng'iroq</small><b class="${s.late ? "neg" : ""}">${s.late}</b></div>
          <div><small>O'rt. urinish</small><b>${s.attempts}</b></div>
        </div>
        ${s.reasons.length ? `<p class="small">❌ Ko'p rad etish sababi: ${s.reasons.map(([r, n]) => `${esc(r)} (${n})`).join(", ")}</p>` : ""}
        <p class="small">${o.tgChat ? `✈️ Telegram ulangan${o.tgName ? ` (@${esc(o.tgName)})` : ""} — yangi lid va eslatmalar unga boradi` : `✈️ Telegram ulanmagan. ${link ? `Operator shu havolani ochib <b>Start</b> bossin:<br><a href="${link}" target="_blank" rel="noopener">${link}</a> <button class="pill" type="button" data-copy="${link}">nusxalash</button>` : "Bot nomini olishning iloji bo'lmadi."}`}</p>
        <div class="btn-row"><button class="btn btn-sm btn-line" type="button" data-move="${o.id}" ${s.open ? "" : "disabled"}>↪ Ochiq lidlarini boshqalarga o'tkazish</button></div>
      </div>`;
    })
    .join("");
  renderCouriers();
}

const fmtM = (n, cur) => (cur === "$" ? formatPrice(n) : mln(n));
function renderCouriers() {
  const t = today();
  const open = sales.filter((x) => !["Yetkazildi", "Bekor qilindi"].includes(x.status));
  const un = open.filter((x) => !x.courier);
  const act = couriers.filter((c) => c.active !== false);
  $("#crUnassigned").innerHTML = act.length
    ? `<span class="muted small">Dastavkaga faqat siz kuryer biriktirgan sotuvlar tushadi: <b>Sotuvlar</b> → sotuvni oching → <b>🚚 Kuryer</b>. Kuryersiz ochiq sotuvlar: ${un.length} ta.</span>`
    : "";
  $("#crCards").innerHTML = couriers
    .map((c) => {
      const mine = sales.filter((x) => x.courier === c.id && x.status !== "Bekor qilindi");
      const todo = mine.filter((x) => x.status !== "Yetkazildi");
      const todayN = todo.filter((x) => (x.deliveryDate || x.date || t) <= t);
      const late = todo.filter((x) => (x.deliveryDate || x.date || t) < t);
      const done = mine.filter((x) => x.status === "Yetkazildi" && x.deliveredAt && new Date(x.deliveredAt).toISOString().slice(0, 7) === t.slice(0, 7));
      const doneToday = done.filter((x) => new Date(x.deliveredAt + 5 * 3600e3).toISOString().slice(0, 10) === t);
      const got = (cur) => doneToday.filter((x) => (x.currency === "$") === (cur === "$")).reduce((a, x) => a + (Number(x.amount) || 0), 0);
      const areas = {};
      todayN.forEach((x) => (areas[areaOf(x)] = (areas[areaOf(x)] || 0) + 1));
      return `<div class="panel op-admin ${c.active === false ? "off" : ""}">
        <div class="opa-head"><h2>🚚 ${esc(c.name)}</h2><label class="switch"><input type="checkbox" data-cactive="${c.id}" ${c.active !== false ? "checked" : ""}> faol</label></div>
        <p class="muted small">${esc(c.email || "")}</p>
        <div class="mgrid">
          <div><small>Bugun yetkazish</small><b>${todayN.length}</b></div>
          <div><small>Kechikkan</small><b class="${late.length ? "neg" : ""}">${late.length}</b></div>
          <div><small>Bugun yetkazdi</small><b>${doneToday.length}</b></div>
          <div><small>Bu oy yetkazdi</small><b>${done.length}</b></div>
        </div>
        ${Object.keys(areas).length ? `<p class="small">📍 Bugun: ${Object.entries(areas).map(([a, n]) => `${esc(a)} (${n})`).join(", ")}</p>` : ""}
        ${got("som") || got("$") ? `<p class="small">💵 Bugun yetkazgan mahsulotlar summasi: <b>${[got("som") ? fmtM(got("som")) : "", got("$") ? formatPrice(got("$")) : ""].filter(Boolean).join(" + ")}</b></p>` : ""}
      </div>`;
    })
    .join("");
}

async function spread(list, exceptId) {
  const active = ops.filter((o) => o.active !== false && o.id !== exceptId);
  if (!active.length) return toast("Faol operator yo'q", "err");
  const load = Object.fromEntries(active.map((o) => [o.id, leads.filter((l) => l.assignedTo === o.id && !CLOSED.includes(l.stage)).length]));
  const batch = writeBatch(db);
  list.forEach((l) => {
    const o = active.slice().sort((a, b) => load[a.id] - load[b.id])[0];
    load[o.id]++;
    batch.update(doc(db, "crmLeads", l.id), { assignedTo: o.id, assignedName: o.name || "", assignedAt: new Date().toISOString() });
  });
  await batch.commit();
  toast(`${list.length} ta lid taqsimlandi`);
}

document.addEventListener("click", async (e) => {
  if (e.target.id === "opSpread") {
    const un = leads.filter((l) => !l.assignedTo && !CLOSED.includes(l.stage));
    if (confirm(`${un.length} ta lid operatorlarga teng taqsimlansinmi?`)) await spread(un).catch((err) => toast(err.message, "err"));
  }
  const mv = e.target.closest("[data-move]");
  if (mv) {
    const o = ops.find((x) => x.id === mv.dataset.move);
    const list = leads.filter((l) => l.assignedTo === o.id && !CLOSED.includes(l.stage));
    if (confirm(`${o.name}ning ${list.length} ta ochiq lidi boshqa operatorlarga o'tkazilsinmi?`)) await spread(list, o.id).catch((err) => toast(err.message, "err"));
  }
  if (e.target.id === "crAssign") {
    const c = couriers.find((x) => x.id === $("#crPick").value);
    const un = sales.filter((x) => !["Yetkazildi", "Bekor qilindi"].includes(x.status) && !x.courier);
    if (c && confirm(`${un.length} ta yetkazish ${c.name}ga biriktirilsinmi?`)) {
      const batch = writeBatch(db);
      un.forEach((x) => batch.update(doc(db, "crmSales", x.id), { courier: c.id, courierName: c.name || "" }));
      await batch.commit().then(() => toast(`${un.length} ta yetkazish biriktirildi`)).catch((err) => toast(err.message, "err"));
    }
  }
  const cp = e.target.closest("[data-copy]");
  if (cp) {
    navigator.clipboard?.writeText(cp.dataset.copy).then(() => toast("Havola nusxalandi — operatorga yuboring"));
  }
});
document.addEventListener("change", async (e) => {
  const ca = e.target.closest("[data-cactive]");
  if (ca) {
    await updateDoc(doc(db, "crmCouriers", ca.dataset.cactive), { active: ca.checked }).catch((err) => toast(err.message, "err"));
    return toast(ca.checked ? "Kuryer faollashtirildi" : "Kuryer o'chirildi — endi kira olmaydi");
  }
  const a = e.target.closest("[data-active]");
  if (!a) return;
  try {
    await updateDoc(doc(db, "crmOperators", a.dataset.active), { active: a.checked });
    toast(a.checked ? "Operator faollashtirildi" : "Operator o'chirildi — endi kira olmaydi va unga yangi lid tushmaydi");
  } catch (err) {
    toast(err.message, "err");
  }
});

// ---- Xodim qo'shish (Firebase Auth REST — admin sessiyasi o'zgarmaydi) ----
async function signUp(email, password) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
  });
  const j = await r.json();
  if (!r.ok) {
    const code = (j.error && j.error.message) || "xato";
    throw new Error(code === "EMAIL_EXISTS" ? "Bu email allaqachon ro'yxatdan o'tgan" : /WEAK_PASSWORD/.test(code) ? "Parol kamida 6 belgi" : code);
  }
  return j.localId;
}
$("#crAdd").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const btn = e.target.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    const uid = await signUp(f.email.value.trim(), f.password.value);
    await setDoc(doc(db, "crmCouriers", uid), { name: f.name.value.trim(), email: f.email.value.trim(), active: true, createdAt: Date.now() });
    alert(`Kuryer qo'shildi.\n\nKirish: furnipart-shop.vercel.app/dastavka\nEmail: ${f.email.value.trim()}\nParol: ${f.password.value}\n\nShu ma'lumotni kuryerga yuboring.`);
    e.target.reset();
  } catch (err) {
    toast("Qo'shib bo'lmadi: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

$("#opAdd").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const btn = e.target.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: f.email.value.trim(), password: f.password.value, returnSecureToken: false }),
    });
    const j = await r.json();
    if (!r.ok) {
      const code = j.error && j.error.message;
      throw new Error(code === "EMAIL_EXISTS" ? "Bu email allaqachon ro'yxatdan o'tgan" : code === "WEAK_PASSWORD : Password should be at least 6 characters" ? "Parol kamida 6 belgi" : code || "xato");
    }
    await setDoc(doc(db, "crmOperators", j.localId), { name: f.name.value.trim(), email: f.email.value.trim(), active: true, createdAt: Date.now() });
    toast(`✅ ${f.name.value.trim()} qo'shildi`);
    alert(`Operator qo'shildi.\n\nKirish: furnipart-shop.vercel.app/operator\nEmail: ${f.email.value.trim()}\nParol: ${f.password.value}\n\nShu ma'lumotni operatorga yuboring.`);
    e.target.reset();
  } catch (err) {
    toast("Qo'shib bo'lmadi: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

// ---- Skriptlar ----
const sf = $("#scriptForm").elements;
const fillScript = () => (sf.txt.value = scripts[sf.k.value] || DEFAULT_SCRIPTS[sf.k.value] || "");
sf.k.addEventListener("change", fillScript);
$("#scriptReset").addEventListener("click", () => (sf.txt.value = DEFAULT_SCRIPTS[sf.k.value] || ""));
$("#scriptForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await setDoc(doc(db, "crmSettings", "scripts"), { [sf.k.value]: sf.txt.value.trim() }, { merge: true });
    toast("Skript saqlandi");
  } catch (err) {
    toast(err.message, "err");
  }
});

function start() {
  unsub.forEach((u) => u());
  unsub = [
    onSnapshot(collection(db, "crmOperators"), (s) => {
      ops = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    }, (err) => ($("#opRank").innerHTML = `<p class="danger">Operatorlarni o'qib bo'lmadi. Firebase → Firestore → Rules'ni yangilang. (${esc(err.code || err.message)})</p>`)),
    onSnapshot(collection(db, "crmLeads"), (s) => {
      leads = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    }, () => {}),
    onSnapshot(collection(db, "crmSales"), (s) => {
      sales = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    }, () => {}),
    onSnapshot(collection(db, "crmCouriers"), (s) => {
      couriers = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    }, () => {}),
    onSnapshot(doc(db, "crmSettings", "scripts"), (d) => {
      scripts = d.exists() ? d.data() : {};
      if (document.activeElement !== sf.txt) fillScript();
    }, () => {}),
    onSnapshot(doc(db, "crmSettings", "target"), (d) => {
      if (d.exists() && Number(d.data().usdRate)) usdRate = Number(d.data().usdRate);
      render();
    }, () => {}),
  ];
  fetch("/api/remind?me=1")
    .then((r) => r.json())
    .then((j) => {
      botName = j.username || "";
      render();
    })
    .catch(() => {});
}

onAuthStateChanged(auth, (user) => {
  if (user && ADMIN_UIDS.includes(user.uid)) start();
  else {
    unsub.forEach((u) => u());
    unsub = [];
  }
});
