// Matras sotuvi paneli: mijozlar bazasi, qo'ng'iroqlar, sotuv, 5 yillik kafolat, oylik reja.
import {
  db,
  auth,
  collection,
  doc,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  increment,
  writeBatch,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "./firebase.js";
import { ADMIN_UIDS } from "./config.js";
import { $, $$, escapeHtml as esc, toast, normalizePhone } from "./util.js";
import { areaOf } from "./areas.js";

const STATUSES = ["Yangi", "Gaplashildi", "Jarayonda", "Oldi", "Doimiy mijoz", "Rad etdi"];
const ST_ICON = { Yangi: "🆕", Gaplashildi: "📞", Jarayonda: "⏳", Oldi: "✅", "Doimiy mijoz": "⭐", "Rad etdi": "✖" };
const DEFAULT_PLAN = 150;
const XLSX_URL = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";

let me = null;
let clients = [];
let sales = [];
let plan = DEFAULT_PLAN;
let view = "today";
let chip = "all";
let q = "";
let openId = null;
let unsub = [];

// ---------- yordamchilar ----------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd();
const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const addYears = (s, n) => {
  const d = new Date(s + "T12:00:00");
  d.setFullYear(d.getFullYear() + n);
  return ymd(d);
};
const ms = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : v ? Date.parse(v) || 0 : 0);
const digits = (p) => String(normalizePhone(p) || p || "").replace(/\D/g, "");
const num = (s) => Number(String(s ?? "").replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, "")) || 0;
const fmt = (n, cur) => {
  const t = String(Math.round((Number(n) || 0) * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return cur === "$" ? `$${t}` : `${t} so'm`;
};
const fmtDate = (s) => (s ? s.split("-").reverse().join(".") : "");
const norm = (s) => String(s || "").toLowerCase().replace(/[ʻʼ'`‘’]/g, "");
const guessKind = (name) => (/mebel|okkin|interior|kedr|saroy|prestij|model|kosmos|lion|enzo|alido|karona|kalo|malik|amin|frimebel|aristokrat|trend/i.test(name) ? "Mebel do'kon" : "Shaxsiy mijoz");
const monthSales = () => sales.filter((s) => (s.date || "").slice(0, 7) === today().slice(0, 7) && s.status !== "Bekor qilindi");

// ---------- kirish ----------
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  $("#loginMsg").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, f.email.value.trim(), f.password.value);
  } catch (_) {
    $("#loginMsg").textContent = "Email yoki parol noto'g'ri";
  }
});
$("#logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  unsub.forEach((u) => u());
  unsub = [];
  if (!user) {
    me = null;
    $("#loginView").hidden = false;
    $("#appView").hidden = true;
    $("#logout").hidden = true;
    return;
  }
  const isAdm = ADMIN_UIDS.includes(user.uid);
  let p = isAdm ? { name: "Admin", active: true } : null;
  if (!p)
    try {
      const s = await getDoc(doc(db, "crmMatras", user.uid));
      p = s.exists() ? s.data() : null;
    } catch (_) {}
  if (!p || p.active === false) {
    $("#loginMsg").textContent = "Bu akkaunt matras sotuvchisi sifatida qo'shilmagan yoki o'chirilgan. Rahbaringizga murojaat qiling.";
    await signOut(auth);
    return;
  }
  me = { uid: user.uid, name: p.name || user.email, admin: isAdm };
  $("#opName").textContent = "🛏 " + me.name;
  $("#loginView").hidden = true;
  $("#appView").hidden = false;
  $("#logout").hidden = false;
  start();
});

function start() {
  const err = (e) => {
    console.error(e);
    $("#mtList").innerHTML = `<p class="panel danger">Ma'lumotni o'qib bo'lmadi. Firebase qoidalarini yangilash kerak (rahbaringizga ayting).</p>`;
  };
  unsub = [
    onSnapshot(collection(db, "matrasClients"), (snap) => {
      clients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
      if (openId && $("#mtDlg").open) renderCard();
    }, err),
    onSnapshot(me.admin ? query(collection(db, "crmSales"), where("category", "==", "matras")) : query(collection(db, "crmSales"), where("seller", "==", me.uid)), (snap) => {
      sales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      $("#mtModels").innerHTML = [...new Set(sales.map((s) => s.model).filter(Boolean))].map((m) => `<option value="${esc(m)}">`).join("");
      render();
      if (openId && $("#mtDlg").open) renderCard();
    }, () => {}),
    onSnapshot(doc(db, "crmSettings", "matras"), (d) => {
      plan = (d.exists() && Number(d.data().plan)) || DEFAULT_PLAN;
      render();
    }, () => {}),
  ];
}

// ---------- reja va ko'rsatkichlar ----------
function renderTop() {
  const ms_ = monthSales();
  const sold = ms_.reduce((a, s) => a + (Number(s.qty) || 1), 0);
  const pct = Math.min(100, Math.round((sold / plan) * 100));
  const d = new Date();
  const daysLeft = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1;
  const need = Math.max(0, plan - sold);
  $("#mtPlan").innerHTML = `
    <div class="mt-plan-top"><b>📊 Oylik reja: ${sold} / ${plan} matras</b>${me.admin ? ` <button class="chip" type="button" id="mtPlanEdit">✏️ Rejani o'zgartirish</button>` : ""}</div>
    <div class="mt-bar"><i style="width:${pct}%"></i></div>
    <small class="muted">${pct}% bajarildi${need ? ` · qolgan ${daysLeft} kunda kuniga ~${Math.ceil(need / daysLeft)} ta kerak` : " · reja bajarildi 🎉"}</small>`;
  const som = ms_.filter((s) => s.currency !== "$").reduce((a, s) => a + (Number(s.amount) || 0), 0);
  const usd = ms_.filter((s) => s.currency === "$").reduce((a, s) => a + (Number(s.amount) || 0), 0);
  const inProc = clients.reduce((a, c) => a + (Number(c.inProcess) || 0), 0);
  const due = clients.filter(isDue).length;
  $("#mtKpi").innerHTML = `
    <div><small>Bu oy sotuv</small><b>${[usd ? fmt(usd, "$") : "", som ? fmt(som) : ""].filter(Boolean).join(" + ") || "0"}</b></div>
    <div><small>Jarayonda</small><b>${inProc} ta</b></div>
    <div><small>Mijozlar</small><b>${clients.length}</b></div>
    <div><small>Bugun qo'ng'iroq</small><b class="${due ? "neg" : ""}">${due}</b></div>`;
}
$("#mtPlan").addEventListener("click", async (e) => {
  if (e.target.id !== "mtPlanEdit") return;
  const n = Number(prompt("Oylik reja (matras soni):", String(plan)));
  if (!n || n < 1) return;
  await setDoc(doc(db, "crmSettings", "matras"), { plan: Math.round(n) }, { merge: true }).then(() => toast("Reja saqlandi")).catch((er) => toast(er.message, "err"));
});

// ---------- ro'yxatlar ----------
const isDue = (c) => !["Rad etdi"].includes(c.status) && c.nextCall && c.nextCall <= today();
const match = (c) => !q || norm(`${c.name} ${c.phone} ${c.phone2 || ""} ${c.address || ""} ${c.note || ""}`).includes(norm(q)) || (digits(q).length >= 4 && digits(c.phone).includes(digits(q)));

function clientRow(c) {
  const late = c.nextCall && c.nextCall < today();
  return `<button type="button" class="op-card ${isDue(c) ? "new" : ""} ${late ? "late" : ""}" data-open="${c.id}">
    <span class="oc-top"><b>${esc(c.name || "Nomsiz")}</b><span class="pill st-${STATUSES.indexOf(c.status || "Yangi")}">${ST_ICON[c.status || "Yangi"] || ""} ${esc(c.status || "Yangi")}</span></span>
    <span class="oc-mid">${esc(c.phone || "")}${c.address ? ` · 📍 ${esc(c.address)}` : ""}</span>
    <span class="oc-bot"><small>${esc(c.kind || "")}${c.nextCall ? ` · 📞 ${c.nextCall === today() ? "bugun" : late ? "kechikdi " + fmtDate(c.nextCall) : fmtDate(c.nextCall)}` : ""}</small><small>${Number(c.bought) ? `🛏 ${c.bought} ta oldi` : ""}${Number(c.inProcess) ? ` · ⏳ ${c.inProcess}` : ""}</small></span>
  </button>`;
}

function render() {
  if (!me) return;
  renderTop();
  $("#nToday").textContent = clients.filter(isDue).length || "";
  $("#nAll").textContent = clients.length || "";
  const list = $("#mtList");
  if (view === "today" || view === "all") {
    let base = view === "today" ? clients.filter(isDue) : clients.slice();
    if (view === "all") {
      const counts = {};
      clients.forEach((c) => (counts[c.status || "Yangi"] = (counts[c.status || "Yangi"] || 0) + 1));
      $("#mtChips").innerHTML = [`<button class="chip ${chip === "all" ? "on" : ""}" data-chip="all">Hammasi ${clients.length}</button>`]
        .concat(STATUSES.filter((s) => counts[s]).map((s) => `<button class="chip ${chip === s ? "on" : ""}" data-chip="${esc(s)}">${ST_ICON[s]} ${esc(s)} ${counts[s]}</button>`))
        .join("");
      if (chip !== "all") base = base.filter((c) => (c.status || "Yangi") === chip);
    } else $("#mtChips").innerHTML = "";
    base = base.filter(match).sort((a, b) => (view === "today" ? (a.nextCall || "").localeCompare(b.nextCall || "") : ms(b.updatedAt || b.createdAt) - ms(a.updatedAt || a.createdAt)));
    list.innerHTML = base.length
      ? base.map(clientRow).join("")
      : `<p class="empty">${view === "today" ? "Bugunga qo'ng'iroq qolmadi 👏 Mijozlar bo'limidan yangi mijozlarga qo'ng'iroq qiling." : q ? "Topilmadi" : "Mijoz yo'q — ➕ Mijoz qo'shish yoki 📥 Excel'dan qo'shing."}</p>`;
  } else if (view === "sales") {
    $("#mtChips").innerHTML = "";
    const arr = sales
      .filter((s) => s.status !== "Bekor qilindi")
      .filter((s) => !q || norm(`${s.name} ${s.phone} ${s.model} ${s.size}`).includes(norm(q)))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    list.innerHTML = arr.length
      ? arr
          .map(
            (s) => `<div class="op-card mt-sale"><span class="oc-top"><b>${esc(s.name || "")}</b><small>${fmtDate(s.date)}</small></span>
            <span class="oc-int">🛏 ${esc(s.model || s.product || "")}${s.size ? " · " + esc(s.size) : ""}${Number(s.qty) > 1 ? ` × ${s.qty}` : ""}</span>
            <span class="oc-bot"><small>${esc(s.phone || "")}${me.admin && s.sellerName ? ` · 👤 ${esc(s.sellerName)}` : ""}</small><b>${fmt(s.amount, s.currency)}</b></span></div>`
          )
          .join("")
      : `<p class="empty">Hali sotuv yo'q</p>`;
  } else if (view === "warranty") {
    $("#mtChips").innerHTML = "";
    const arr = sales
      .filter((s) => s.status !== "Bekor qilindi")
      .filter((s) => !q || norm(`${s.name} ${s.phone} ${s.model}`).includes(norm(q)) || (digits(q).length >= 4 && digits(s.phone).includes(digits(q))))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    list.innerHTML =
      `<p class="muted small">Mijoz kafolat bilan kelsa — telefon raqamini qidiruvga yozing.</p>` +
      (arr.length
        ? arr
            .map((s) => {
              const until = s.warrantyUntil || addYears(s.date || today(), 5);
              const ok = until >= today();
              return `<div class="op-card"><span class="oc-top"><b>${esc(s.name || "")}</b><span class="pill ${ok ? "ok" : "late"}">${ok ? "🛡 amalda" : "tugagan"}</span></span>
              <span class="oc-int">🛏 ${esc(s.model || s.product || "")}${s.size ? " · " + esc(s.size) : ""}</span>
              <span class="oc-bot"><small>${esc(s.phone || "")} · olingan ${fmtDate(s.date)}</small><small>kafolat ${fmtDate(until)} gacha</small></span></div>`;
            })
            .join("")
        : `<p class="empty">Topilmadi</p>`);
  }
}

$("#mtTabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-v]");
  if (!b) return;
  view = b.dataset.v;
  $$("#mtTabs .tab").forEach((x) => x.classList.toggle("on", x === b));
  render();
});
$("#mtQ").addEventListener("input", (e) => {
  q = e.target.value.trim();
  if (q && view === "today") {
    view = "all";
    $$("#mtTabs .tab").forEach((x) => x.classList.toggle("on", x.dataset.v === "all"));
  }
  render();
});
$("#mtChips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-chip]");
  if (!b) return;
  chip = b.dataset.chip;
  render();
});
$("#mtList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-open]");
  if (!b) return;
  openId = b.dataset.open;
  renderCard();
  $("#mtDlg").showModal();
});

// ---------- mijoz kartasi ----------
function renderCard() {
  const c = clients.find((x) => x.id === openId);
  if (!c) return $("#mtDlg").close();
  const d = digits(c.phone);
  const hello = encodeURIComponent(`Assalomu alaykum${c.name ? ", " + c.name.split(/[ (—-]/)[0] : ""}! FURNIPART premium'dan. Yangi matraslarimiz keldi — ortopedik, 5 yil kafolat. Narxlarini yuboraymi?`);
  const mySales = sales.filter((s) => s.matrasClientId === c.id || (s.phone && digits(s.phone) === d)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const log = (c.callLog || []).slice(-6).reverse();
  $("#mtBody").innerHTML = `
    <h2>${esc(c.name || "Nomsiz")}</h2>
    <p class="muted">${esc(c.kind || "")}${c.address ? ` · 📍 ${esc(c.address)}` : ""}</p>
    <p>📱 <a href="tel:+${d}">${esc(c.phone)}</a>${c.phone2 ? ` · <a href="tel:+${digits(c.phone2)}">${esc(c.phone2)}</a>` : ""}</p>
    <div class="op-contact">
      <a class="btn btn-yellow" href="tel:+${d}" data-ch="📞 qo'ng'iroq">📞 Qo'ng'iroq</a>
      <a class="btn btn-line" href="tg://resolve?phone=${d}&text=${hello}" data-ch="✈️ Telegram">✈️ Telegram</a>
      <a class="btn btn-line" href="sms:+${d}&body=${hello}" data-ch="💬 SMS">💬 SMS</a>
      <a class="btn btn-line" href="https://wa.me/${d}?text=${hello}" target="_blank" rel="noopener" data-ch="🟢 WhatsApp">🟢 WhatsApp</a>
    </div>
    <h3 class="op-h">Holati</h3>
    <div class="mt-status">${STATUSES.map((s) => `<button type="button" class="chip ${s === (c.status || "Yangi") ? "on" : ""}" data-st="${esc(s)}">${ST_ICON[s]} ${esc(s)}</button>`).join("")}</div>
    <div class="mt-row">
      <span>⏳ Jarayonda (matras)</span>
      <span class="mt-step"><button type="button" class="chip" data-inp="-1">−</button><b>${Number(c.inProcess) || 0}</b><button type="button" class="chip" data-inp="1">+</button></span>
    </div>
    <div class="mt-row"><span>🛏 Jami olgan</span><b>${Number(c.bought) || 0} ta</b></div>
    <label class="op-next">Keyingi qo'ng'iroq
      <span class="mt-dates"><input type="date" id="mtNext" value="${esc(c.nextCall || "")}" /><button type="button" class="chip" data-nd="1">ertaga</button><button type="button" class="chip" data-nd="3">3 kun</button><button type="button" class="chip" data-nd="7">1 hafta</button></span>
    </label>
    <label class="op-note">Izoh<textarea id="mtNote" rows="3" maxlength="1000">${esc(c.note || "")}</textarea></label>
    <div class="btn-row"><button class="btn btn-dark btn-sm" type="button" id="mtSave">Saqlash</button><button class="btn btn-line btn-sm" type="button" id="mtEdit">✏️ Tahrirlash</button>${me.admin ? `<button class="btn btn-line btn-sm" type="button" id="mtDel">🗑 O'chirish</button>` : ""}</div>
    <button class="btn btn-yellow btn-block mt-sell" type="button" id="mtSell">💰 Sotuv qo'shish</button>
    ${mySales.length ? `<h3 class="op-h">Xaridlari</h3>${mySales.map((s) => `<div class="mt-buy"><span>🛏 ${esc(s.model || s.product || "")}${s.size ? " · " + esc(s.size) : ""}${Number(s.qty) > 1 ? ` × ${s.qty}` : ""}<br><small class="muted">${fmtDate(s.date)} · 🛡 ${fmtDate(s.warrantyUntil || addYears(s.date || today(), 5))} gacha</small></span><b>${fmt(s.amount, s.currency)}</b></div>`).join("")}` : ""}
    ${log.length ? `<h3 class="op-h">Tarix</h3><ul class="op-log">${log.map((a) => `<li>${new Date(a.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} — ${esc(a.t)}</li>`).join("")}</ul>` : ""}
  `;
}

async function patchClient(id, data, msg) {
  try {
    await updateDoc(doc(db, "matrasClients", id), { ...data, updatedAt: serverTimestamp() });
    if (msg) toast(msg);
    return true;
  } catch (err) {
    toast("Saqlanmadi: " + err.message, "err");
    return false;
  }
}

$("#mtBody").addEventListener("click", async (e) => {
  const c = clients.find((x) => x.id === openId);
  if (!c) return;
  const ch = e.target.closest("[data-ch]");
  if (ch) {
    const upd = { calls: increment(1), lastCallAt: Date.now(), callLog: arrayUnion({ at: Date.now(), t: ch.dataset.ch }) };
    if ((c.status || "Yangi") === "Yangi") upd.status = "Gaplashildi";
    patchClient(c.id, upd);
    return;
  }
  const st = e.target.closest("[data-st]");
  if (st) {
    const s = st.dataset.st;
    const upd = { status: s, callLog: arrayUnion({ at: Date.now(), t: `holat: ${s}` }) };
    if (s === "Jarayonda" && !Number(c.inProcess)) upd.inProcess = 1;
    if (s === "Rad etdi") upd.nextCall = "";
    return patchClient(c.id, upd, `${ST_ICON[s]} ${s}`);
  }
  const inp = e.target.closest("[data-inp]");
  if (inp) {
    const v = Math.max(0, (Number(c.inProcess) || 0) + Number(inp.dataset.inp));
    return patchClient(c.id, { inProcess: v, ...(v && (c.status || "Yangi") !== "Jarayonda" && !["Oldi", "Doimiy mijoz"].includes(c.status) ? { status: "Jarayonda" } : {}) });
  }
  const nd = e.target.closest("[data-nd]");
  if (nd) {
    $("#mtNext").value = addDays(Number(nd.dataset.nd));
    return patchClient(c.id, { nextCall: $("#mtNext").value }, `📞 Keyingi qo'ng'iroq: ${fmtDate($("#mtNext").value)}`);
  }
  if (e.target.id === "mtSave") return patchClient(c.id, { nextCall: $("#mtNext").value || "", note: $("#mtNote").value.trim() }, "Saqlandi");
  if (e.target.id === "mtEdit") return openClientForm(c);
  if (e.target.id === "mtDel") {
    if (!confirm(`${c.name} bazadan o'chirilsinmi?`)) return;
    await deleteDoc(doc(db, "matrasClients", c.id)).then(() => toast("O'chirildi")).catch((er) => toast(er.message, "err"));
    $("#mtDlg").close();
    return;
  }
  if (e.target.id === "mtSell") {
    $("#slForm").reset();
    $("#slWho").textContent = `${c.name} · ${c.phone}`;
    $("#slDlg").showModal();
  }
});

// ---------- sotuv ----------
$("#slForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const c = clients.find((x) => x.id === openId);
  if (!c) return;
  const f = e.target.elements;
  const amount = num(f.amount.value);
  if (!amount) return toast("Summani yozing", "err");
  const qty = Number(f.qty.value) || 1;
  const date = today();
  const btn = e.target.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    await addDoc(collection(db, "crmSales"), {
      name: c.name || "",
      phone: c.phone || "",
      address: c.address || "",
      product: `Matras ${f.model.value.trim()}${f.size.value.trim() ? " " + f.size.value.trim() : ""}`,
      model: f.model.value.trim(),
      size: f.size.value.trim(),
      category: "matras",
      qty,
      amount,
      paid: num(f.paid.value),
      currency: f.currency.value === "so'm" ? "so'm" : "$",
      note: f.note.value.trim(),
      date,
      warrantyUntil: addYears(date, 5),
      status: "Yangi",
      source: "Matras panel",
      matrasClientId: c.id,
      seller: me.uid,
      sellerName: me.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const already = sales.some((s) => s.matrasClientId === c.id);
    await patchClient(c.id, {
      bought: increment(qty),
      inProcess: Math.max(0, (Number(c.inProcess) || 0) - qty),
      status: already || Number(c.bought) ? "Doimiy mijoz" : "Oldi",
      lastBuy: date,
      nextCall: addDays(30),
      callLog: arrayUnion({ at: Date.now(), t: `💰 sotuv: ${qty} ta, ${fmt(amount, f.currency.value)}` }),
    });
    $("#slDlg").close();
    toast("💰 Sotuv saqlandi — barakalla!");
  } catch (err) {
    toast("Saqlanmadi: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

// ---------- mijoz qo'shish / tahrirlash ----------
let editId = null;
function openClientForm(c) {
  editId = c ? c.id : null;
  const f = $("#clForm").elements;
  $("#clForm").reset();
  f.status.innerHTML = STATUSES.map((s) => `<option>${esc(s)}</option>`).join("");
  $("#clTitle").textContent = c ? "✏️ Mijozni tahrirlash" : "➕ Yangi mijoz";
  if (c) {
    f.name.value = c.name || "";
    f.phone.value = c.phone || "";
    f.phone2.value = c.phone2 || "";
    f.address.value = c.address || "";
    f.kind.value = c.kind || "Shaxsiy mijoz";
    f.status.value = c.status || "Yangi";
    f.note.value = c.note || "";
  }
  $("#clDlg").showModal();
}
$("#mtAdd").addEventListener("click", () => openClientForm(null));
$("#clForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const phone = normalizePhone(f.phone.value);
  if (!phone) return toast("Telefon raqam noto'g'ri", "err");
  const dup = clients.find((x) => x.id !== editId && digits(x.phone) === digits(phone));
  if (dup) return toast(`Bu raqam bazada bor: ${dup.name}`, "err");
  const data = {
    name: f.name.value.trim(),
    phone,
    phone2: normalizePhone(f.phone2.value) || f.phone2.value.trim(),
    address: f.address.value.trim(),
    kind: f.kind.value,
    status: f.status.value,
    note: f.note.value.trim(),
    updatedAt: serverTimestamp(),
  };
  try {
    if (editId) await updateDoc(doc(db, "matrasClients", editId), data);
    else await addDoc(collection(db, "matrasClients"), { ...data, bought: 0, inProcess: 0, nextCall: today(), createdBy: me.uid, createdAt: serverTimestamp() });
    $("#clDlg").close();
    toast(editId ? "Saqlandi" : `✅ ${data.name} qo'shildi`);
  } catch (err) {
    toast("Saqlanmadi: " + err.message, "err");
  }
});

// ---------- Excel ----------
const pickCol = (row, ...keys) => {
  const k = Object.keys(row).find((h) => keys.some((x) => norm(h).includes(x)));
  return k ? row[k] : "";
};
$("#mtImport").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const XLSX = await import(XLSX_URL);
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // Sarlavha qatorini topish ("Mijoz ismi", "Telefon" yozilgan qator)
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const hi = raw.findIndex((r) => r.some((x) => /telefon|phone/i.test(String(x))));
    if (hi < 0) return toast("Faylda 'Telefon' ustuni topilmadi", "err");
    const heads = raw[hi].map((h) => String(h));
    const rows = raw.slice(hi + 1).map((r) => Object.fromEntries(heads.map((h, i) => [h || `c${i}`, r[i]])));
    const known = new Set(clients.map((c) => digits(c.phone)));
    const items = [];
    let dup = 0;
    for (const r of rows) {
      const name = String(pickCol(r, "ism", "mijoz", "klient", "name", "dokon") || "").trim();
      const phones = String(pickCol(r, "telefon", "phone", "tel", "raqam") || "").split(/[\/,;]| yoki /).map((x) => x.trim()).filter(Boolean);
      const phone = normalizePhone(phones[0] || "");
      if (!phone || !name || /^jami$/i.test(name)) continue;
      if (known.has(digits(phone))) {
        dup++;
        continue;
      }
      known.add(digits(phone));
      const talked = norm(pickCol(r, "gaplash", "qongiroq")).startsWith("ha");
      const inProcess = num(pickCol(r, "jarayon"));
      const bought = num(pickCol(r, "soni", "olgan", "matras soni"));
      const st = String(pickCol(r, "holat", "status") || "").trim();
      items.push({
        name,
        phone,
        phone2: phones[1] ? normalizePhone(phones[1]) || phones[1] : "",
        address: String(pickCol(r, "manzil", "adres", "shahar") || "").trim(),
        kind: ["Mebel do'kon", "Mebelchi (usta)", "Shaxsiy mijoz", "Boshqa"].find((k) => norm(k) === norm(pickCol(r, "turi", "tur"))) || guessKind(name),
        status: STATUSES.includes(st) ? st : bought ? "Oldi" : inProcess ? "Jarayonda" : talked ? "Gaplashildi" : "Yangi",
        inProcess,
        bought,
        note: String(pickCol(r, "izoh", "note") || "").trim(),
        nextCall: "",
      });

    }
    if (!items.length) return toast(dup ? `Hammasi bazada bor (${dup} ta)` : "Faylda mijoz topilmadi", "err");
    // Kichik ro'yxat bo'lsa yangi mijozlar bugungi qo'ng'iroqlarga tushadi; katta baza (1C) "Mijozlar" bo'limida turadi
    if (items.length <= 80) items.forEach((c) => c.status === "Yangi" && (c.nextCall = today()));
    if (!confirm(`${items.length} ta mijoz bazaga qo'shilsinmi?${dup ? `\n(${dup} ta raqam bazada bor — o'tkazib yuborildi)` : ""}`)) return;
    for (let i = 0; i < items.length; i += 400) {
      const b = writeBatch(db);
      items.slice(i, i + 400).forEach((c) => b.set(doc(collection(db, "matrasClients")), { ...c, createdBy: me.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
      await b.commit();
    }
    toast(`✅ ${items.length} ta mijoz qo'shildi`);
  } catch (err) {
    console.error(err);
    toast("Import bo'lmadi: " + err.message, "err");
  }
});
$("#mtExport").addEventListener("click", async () => {
  try {
    const XLSX = await import(XLSX_URL);
    const wb = XLSX.utils.book_new();
    const rows = clients
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map((c, i) => ({ "№": i + 1, "Mijoz ismi": c.name, Telefon: c.phone, "2-telefon": c.phone2 || "", Manzil: c.address || "", Turi: c.kind || "", Holati: c.status || "Yangi", "Jarayonda": Number(c.inProcess) || 0, "Jami olgan": Number(c.bought) || 0, "Keyingi qo'ng'iroq": fmtDate(c.nextCall), Izoh: c.note || "" }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Mijozlar");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(sales.filter((s) => s.status !== "Bekor qilindi").map((s) => ({ Sana: fmtDate(s.date), Mijoz: s.name, Telefon: s.phone, Model: s.model || s.product, "O'lcham": s.size || "", Soni: s.qty || 1, Summa: s.amount, Valyuta: s.currency, "Kafolat gacha": fmtDate(s.warrantyUntil || addYears(s.date || today(), 5)), Sotuvchi: s.sellerName || "" }))),
      "Sotuvlar"
    );
    XLSX.writeFile(wb, `FURNIPART-matras-${today()}.xlsx`);
  } catch (err) {
    toast("Yuklab bo'lmadi: " + err.message, "err");
  }
});

document.addEventListener("click", (e) => {
  const x = e.target.closest("[data-close]");
  if (x) x.closest("dialog")?.close();
});
