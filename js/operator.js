// Operator paneli: faqat o'ziga biriktirilgan lidlar, skript, narxlar va natija.
import {
  db,
  auth,
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  increment,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "./firebase.js";
import { DEFAULT_SCRIPTS } from "./scripts.js";
import { $, $$, escapeHtml as esc, toast, normalizePhone, effectivePrice, formatPrice } from "./util.js";

const LOST = ["Qimmat", "Yetkazib berish / uzoq", "Raqobatchidan oldi", "Javob bermadi", "Hozir kerak emas", "Kerakli mahsulot yo'q", "Shunchaki so'radi", "Boshqa"];
const CLOSED = ["Sotildi", "Rad etdi"];
const MIN_ATTEMPTS = 5;
// Har bir urinishdan keyin keyingi qo'ng'iroq: 1-kun, 2-kun, 4-kun, 7-kun
const CADENCE = [1, 2, 3, 3];

let me = null; // { uid, name }
let leads = [];
let sales = [];
let products = [];
let scripts = {};
let view = "today";
let openId = null;
let unsub = [];
let tick = null;

// ---------- yordamchilar ----------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd();
const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const ms = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : v ? Date.parse(v) || 0 : 0);
const digits = (p) => String(normalizePhone(p) || p || "").replace(/\D/g, "");
const money = (n, cur) => (cur === "$" ? formatPrice(n) : `${Math.round(Number(n) || 0).toLocaleString("ru-RU").replace(/,/g, " ")} so'm`);
const num = (s) => Number(String(s || "").replace(/[^\d.]/g, "")) || 0;
const fmtDate = (s) => (s ? s.split("-").reverse().slice(0, 2).join(".") : "");
const ago = (t) => {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "hozir";
  if (m < 60) return `${m} daq oldin`;
  if (m < 1440) return `${Math.floor(m / 60)} soat oldin`;
  return `${Math.floor(m / 1440)} kun oldin`;
};
function kind(l) {
  const s = `${l.interest || ""} ${l.ctype || ""}`.toLowerCase();
  if (/matras|матрас|ortoped/.test(s)) return "matras";
  if (/divan|диван|krovat|bosh tomon/.test(s)) return "divan";
  if (/mebelchi|usta|shablon|klipsa|petlya|planka|mexanizm|sushilka|kargo|moyka|dazmol|higold|starax|furnitura|lazer|stanok|chamadon|organayzer|fartuk|zamok/.test(s)) return "furnitura";
  return "umumiy";
}

// ---------- skriptlar (admin "Operatorlar" bo'limida o'zgartira oladi) ----------
const scriptFor = (l) => {
  const k = kind(l);
  const txt = (scripts[k] || DEFAULT_SCRIPTS[k] || DEFAULT_SCRIPTS.umumiy)
    .replace(/\{ism\}/g, (l.name || "").split(" ")[0] || "")
    .replace(/\{operator\}/g, me?.name || "")
    .replace(/\{mahsulot\}/g, l.interest || "mahsulot");
  return { k, txt };
};

// ---------- kirish ----------
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  $("#loginMsg").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, f.email.value.trim(), f.password.value);
  } catch (err) {
    $("#loginMsg").textContent = "Email yoki parol noto'g'ri";
  }
});
$("#logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  unsub.forEach((u) => u());
  unsub = [];
  clearInterval(tick);
  if (!user) {
    me = null;
    $("#loginView").hidden = false;
    $("#appView").hidden = true;
    $("#logout").hidden = true;
    return;
  }
  let op = null;
  try {
    const s = await getDoc(doc(db, "crmOperators", user.uid));
    op = s.exists() ? s.data() : null;
  } catch (_) {}
  if (!op || op.active === false) {
    $("#loginMsg").textContent = "Bu akkaunt operator sifatida qo'shilmagan yoki o'chirilgan. Rahbaringizga murojaat qiling.";
    await signOut(auth);
    return;
  }
  me = { uid: user.uid, name: op.name || user.email };
  $("#opName").textContent = me.name;
  $("#loginView").hidden = true;
  $("#appView").hidden = false;
  $("#logout").hidden = false;
  start();
});

function start() {
  unsub = [
    onSnapshot(query(collection(db, "crmLeads"), where("assignedTo", "==", me.uid)), (snap) => {
      leads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
      if (openId && $("#leadDlg").open) renderLead();
    }, (err) => showErr(err)),
    onSnapshot(query(collection(db, "crmSales"), where("operator", "==", me.uid)), (snap) => {
      sales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderKpi();
    }, () => {}),
    onSnapshot(collection(db, "products"), (snap) => {
      products = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.active !== false);
      $("#prodList").innerHTML = products.map((p) => `<option value="${esc(p.name)}">${formatPrice(effectivePrice(p))}</option>`).join("");
      if (view === "prices") render();
    }, () => {}),
    onSnapshot(doc(db, "crmSettings", "scripts"), (s) => (scripts = s.exists() ? s.data() : {}), () => {}),
  ];
  tick = setInterval(() => view === "today" && !$("#leadDlg").open && render(), 30000);
}
function showErr(err) {
  console.error(err);
  $("#opList").innerHTML = `<p class="panel danger">Lidlarni o'qib bo'lmadi. Rahbaringizga ayting: Firebase qoidalarini yangilash kerak.</p>`;
}

// ---------- ro'yxat ----------
const isNew = (l) => l.stage === "Yangi" && !l.contactedAt;
const due = (l) => !CLOSED.includes(l.stage) && l.nextCall && l.nextCall <= today();
function todayList() {
  const fresh = leads.filter(isNew).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  const calls = leads.filter((l) => !isNew(l) && due(l)).sort((a, b) => (a.nextCall || "").localeCompare(b.nextCall || ""));
  return { fresh, calls };
}

function card(l) {
  const created = ms(l.createdAt) || Date.parse(l.assignedAt || "") || 0;
  const late = isNew(l) && created && Date.now() - created > 5 * 60e3;
  const att = Number(l.attempts) || 0;
  return `<button type="button" class="op-card ${late ? "late" : ""} ${isNew(l) ? "new" : ""}" data-open="${l.id}">
    <span class="oc-top"><b>${esc(l.name || "Nomsiz")}</b>${isNew(l) ? `<span class="pill ${late ? "late" : "today"}">${late ? "⏰ " : "🆕 "}${created ? ago(created) : "yangi"}</span>` : l.nextCall ? `<span class="pill ${l.nextCall < today() ? "late" : "today"}">📞 ${l.nextCall < today() ? "kechikdi " + fmtDate(l.nextCall) : l.nextCall === today() ? "bugun" : fmtDate(l.nextCall)}</span>` : ""}</span>
    <span class="oc-mid">${esc(l.phone || "")}${l.region ? ` · 📍 ${esc(l.region)}` : ""}</span>
    ${l.interest ? `<span class="oc-int">🛏 ${esc(l.interest)}</span>` : ""}
    <span class="oc-bot"><small>${esc(l.stage)}${att ? ` · urinish ${att}/${MIN_ATTEMPTS}` : ""}</small>${l.stage === "Sotildi" && l.soldAmount ? `<small>💰 ${esc(l.soldAmount)}</small>` : ""}</span>
  </button>`;
}

function render() {
  if (!me) return;
  const { fresh, calls } = todayList();
  const open = leads.filter((l) => !CLOSED.includes(l.stage));
  $("#nToday").textContent = fresh.length + calls.length || "";
  $("#nOpen").textContent = open.length || "";
  renderKpi();
  let html = "";
  if (view === "today") {
    html =
      (fresh.length ? `<h3 class="op-h">🆕 Yangi lidlar — 5 daqiqa ichida qo'ng'iroq qiling</h3>${fresh.map(card).join("")}` : "") +
      (calls.length ? `<h3 class="op-h">📞 Bugungi qo'ng'iroqlar</h3>${calls.map(card).join("")}` : "") +
      (!fresh.length && !calls.length ? `<p class="empty">Bugunga qo'ng'iroq qolmadi 👏 Yangi lid kelsa shu yerda chiqadi.</p>` : "");
  } else if (view === "open") {
    html = open.length
      ? open.sort((a, b) => (a.nextCall || "9").localeCompare(b.nextCall || "9")).map(card).join("")
      : `<p class="empty">Ochiq lid yo'q</p>`;
  } else if (view === "closed") {
    const cl = leads.filter((l) => CLOSED.includes(l.stage)).sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt));
    html = cl.length ? cl.map(card).join("") : `<p class="empty">Hali yopilgan lid yo'q</p>`;
  } else if (view === "prices") {
    html = `<input class="op-search" id="priceQ" placeholder="🔎 Mahsulot qidirish…" value="${esc(priceQ)}" />
      <div class="op-prices">${products
        .filter((p) => !priceQ || `${p.name} ${p.category}`.toLowerCase().includes(priceQ.toLowerCase()))
        .slice(0, 80)
        .map((p) => `<div class="op-price"><span>${esc(p.name)}</span><b>${formatPrice(effectivePrice(p))}</b></div>`)
        .join("")}</div>`;
  }
  $("#opList").innerHTML = html;
  const q = $("#priceQ");
  if (q) {
    q.addEventListener("input", () => {
      priceQ = q.value;
      const pos = q.selectionStart;
      render();
      const n = $("#priceQ");
      n.focus();
      n.setSelectionRange(pos, pos);
    });
  }
}
let priceQ = "";

function renderKpi() {
  const m = today().slice(0, 7);
  const mine = leads.filter((l) => String(l.assignedAt || l.date || "").slice(0, 7) === m || (l.date || "").slice(0, 7) === m);
  const sold = mine.filter((l) => l.stage === "Sotildi").length;
  const closed = mine.filter((l) => CLOSED.includes(l.stage)).length;
  const conv = closed ? Math.round((sold / closed) * 100) : 0;
  const monthSales = sales.filter((s) => (s.date || "").slice(0, 7) === m && s.status !== "Bekor qilindi");
  const som = monthSales.filter((s) => (s.currency || "so'm") !== "$").reduce((a, s) => a + (Number(s.amount) || 0), 0);
  const usd = monthSales.filter((s) => s.currency === "$").reduce((a, s) => a + (Number(s.amount) || 0), 0);
  const rts = mine.filter((l) => l.contactedAt && ms(l.createdAt)).map((l) => (ms(l.contactedAt) - ms(l.createdAt)) / 60000).filter((x) => x >= 0);
  const avg = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null;
  $("#opKpi").innerHTML = `
    <div><small>Bu oy lidlar</small><b>${mine.length}</b></div>
    <div><small>Sotildi</small><b>${sold}</b></div>
    <div><small>Konversiya</small><b>${conv}%</b></div>
    <div><small>Savdo</small><b>${som ? (som / 1e6).toFixed(1).replace(".", ",") + " mln" : "0"}${usd ? ` + ${formatPrice(usd)}` : ""}</b></div>
    <div><small>O'rt. javob</small><b>${avg === null ? "—" : avg < 60 ? avg + " daq" : (avg / 60).toFixed(1) + " soat"}</b></div>`;
}

$("#opTabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-v]");
  if (!b) return;
  view = b.dataset.v;
  $$("#opTabs .tab").forEach((t) => t.classList.toggle("active", t === b));
  render();
});
$("#opList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-open]");
  if (b) openLead(b.dataset.open);
});

// ---------- lid kartasi ----------
function openLead(id) {
  openId = id;
  renderLead();
  if (!$("#leadDlg").open) $("#leadDlg").showModal();
}
function renderLead() {
  const l = leads.find((x) => x.id === openId);
  if (!l) return $("#leadDlg").close();
  const d = digits(l.phone);
  const att = Number(l.attempts) || 0;
  const sc = scriptFor(l);
  const log = (l.attemptLog || []).slice(-6).reverse();
  const created = ms(l.createdAt) || Date.parse(l.assignedAt || "") || 0;
  const closed = CLOSED.includes(l.stage);
  $("#leadBody").innerHTML = `
    <h2>${esc(l.name || "Nomsiz")}</h2>
    <p class="muted">${esc(l.source || "")}${created ? ` · ${ago(created)} keldi` : ""} · <b>${esc(l.stage)}</b></p>
    ${l.interest ? `<p>🛏 <b>${esc(l.interest)}</b></p>` : ""}
    ${l.region ? `<p>📍 ${esc(l.region)}</p>` : ""}
    ${l.instagram ? `<p><a href="https://instagram.com/${encodeURIComponent(l.instagram)}" target="_blank" rel="noopener">@${esc(l.instagram)}</a></p>` : ""}
    <div class="op-contact">
      <a class="btn btn-yellow" href="tel:+${d}" data-ch="call">📞 Qo'ng'iroq</a>
      <a class="btn btn-line" href="https://wa.me/${d}" target="_blank" rel="noopener" data-ch="wa">🟢 WhatsApp</a>
      <a class="btn btn-line" href="tg://resolve?phone=${d}" data-ch="tg">✈️ Telegram</a>
      <a class="btn btn-line" href="sms:+${d}" data-ch="sms">💬 SMS</a>
    </div>
    <div class="op-att">
      <div class="att-dots">${Array.from({ length: MIN_ATTEMPTS }, (_, i) => `<i class="${i < att ? "on" : ""}"></i>`).join("")}</div>
      <small>Urinish: <b>${att}/${MIN_ATTEMPTS}</b>${att < MIN_ATTEMPTS && !closed ? ` — kamida ${MIN_ATTEMPTS} marta urinmasdan "Javob bermadi" deb yopib bo'lmaydi` : ""}</small>
    </div>
    ${
      closed
        ? `<p class="panel">${l.stage === "Sotildi" ? `💰 Sotildi${l.soldAmount ? ": " + esc(l.soldAmount) : ""}` : `✖ ${esc(l.lostReason || "Rad etdi")}${l.lostNote ? " — " + esc(l.lostNote) : ""}`}</p>`
        : `<h3 class="op-h">Natija</h3>
    <div class="op-result">
      <button class="btn btn-line" type="button" data-res="noans">📵 Ko'tarmadi</button>
      <button class="btn btn-line" type="button" data-res="talk">✅ Gaplashdik</button>
      <button class="btn btn-line" type="button" data-res="think">🤔 O'ylab ko'radi</button>
      <button class="btn btn-yellow" type="button" data-res="sold">💰 Sotildi</button>
      <button class="btn btn-ghost-d" type="button" data-res="lost">✖ Olmadi</button>
    </div>
    <label class="op-next">Keyingi qo'ng'iroq <input type="date" id="nextCall" value="${esc(l.nextCall || "")}" /></label>`
    }
    <label class="op-note">Izoh (mijoz nima dedi)<textarea id="leadNote" rows="3" maxlength="1000">${esc(l.note || "")}</textarea></label>
    <button class="btn btn-dark btn-sm" type="button" id="saveNote">Izohni saqlash</button>
    <details class="op-script" ${l.stage === "Yangi" ? "open" : ""}>
      <summary>📜 Skript — ${{ matras: "matras", furnitura: "furnitura / mebelchi", divan: "divan", umumiy: "umumiy" }[sc.k]}</summary>
      <pre>${esc(sc.txt)}</pre>
    </details>
    ${log.length ? `<h3 class="op-h">Tarix</h3><ul class="op-log">${log.map((a) => `<li>${new Date(a.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} — ${esc(a.t)}</li>`).join("")}</ul>` : ""}
  `;
}

const CH_LABEL = { call: "📞 qo'ng'iroq", wa: "🟢 WhatsApp", tg: "✈️ Telegram", sms: "💬 SMS" };
async function logAttempt(l, ch) {
  const upd = {
    attempts: increment(1),
    lastAttemptAt: Date.now(),
    attemptLog: arrayUnion({ at: Date.now(), t: CH_LABEL[ch] || ch }),
    updatedAt: serverTimestamp(),
  };
  if (!l.contactedAt) upd.contactedAt = serverTimestamp();
  await updateDoc(doc(db, "crmLeads", l.id), upd).catch((e) => toast("Saqlanmadi: " + e.message, "err"));
}

$("#leadBody").addEventListener("click", async (e) => {
  const l = leads.find((x) => x.id === openId);
  if (!l) return;
  const c = e.target.closest("[data-ch]");
  if (c) {
    logAttempt(l, c.dataset.ch);
    return;
  }
  if (e.target.id === "saveNote") {
    await save(l, { note: $("#leadNote").value.trim() }, "Izoh saqlandi");
    return;
  }
  const r = e.target.closest("[data-res]");
  if (!r) return;
  const note = $("#leadNote").value.trim();
  const next = $("#nextCall")?.value;
  const att = Number(l.attempts) || 0;
  const res = r.dataset.res;
  if (res === "noans") {
    const n = Math.max(att, 1);
    const days = CADENCE[Math.min(n - 1, CADENCE.length - 1)];
    await save(
      l,
      {
        note,
        nextCall: addDays(days),
        attemptLog: arrayUnion({ at: Date.now(), t: "📵 ko'tarmadi" }),
        ...(att === 0 ? { attempts: 1, lastAttemptAt: Date.now() } : {}),
      },
      n >= MIN_ATTEMPTS ? `Urinishlar ${n}/${MIN_ATTEMPTS}. Endi "Olmadi → Javob bermadi" deb yopish mumkin` : `Keyingi urinish: ${fmtDate(addDays(days))}`
    );
  } else if (res === "talk") {
    await save(l, { stage: "Bog'lanildi", note, nextCall: next && next > today() ? next : addDays(1), attemptLog: arrayUnion({ at: Date.now(), t: "✅ gaplashdik" }), ...(l.contactedAt ? {} : { contactedAt: serverTimestamp() }) }, "Saqlandi — keyingi qo'ng'iroq sanasini tekshiring");
  } else if (res === "think") {
    await save(l, { stage: "O'ylab ko'radi", note, nextCall: next && next > today() ? next : addDays(2), attemptLog: arrayUnion({ at: Date.now(), t: "🤔 o'ylab ko'radi" }), ...(l.contactedAt ? {} : { contactedAt: serverTimestamp() }) }, "Saqlandi");
  } else if (res === "sold") {
    openSale(l);
  } else if (res === "lost") {
    openLost(l);
  }
});

async function save(l, data, msg) {
  try {
    await updateDoc(doc(db, "crmLeads", l.id), { ...data, updatedAt: serverTimestamp() });
    toast(msg || "Saqlandi");
  } catch (err) {
    toast("Saqlanmadi: " + err.message, "err");
  }
}

// ---------- sotuv ----------
function openSale(l) {
  const f = $("#saleForm").elements;
  $("#saleForm").reset();
  f.product.value = l.interest || "";
  f.address.value = l.region || "";
  f.note.value = "";
  $("#saleDlg").showModal();
}
$("#saleForm").elements.product.addEventListener("change", (e) => {
  const p = products.find((x) => x.name === e.target.value);
  const f = $("#saleForm").elements;
  if (p && !num(f.amount.value)) {
    f.currency.value = "$";
    f.amount.value = effectivePrice(p) * (Number(f.qty.value) || 1);
  }
});
$("#saleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const l = leads.find((x) => x.id === openId);
  if (!l) return;
  const f = e.target.elements;
  const amount = num(f.amount.value);
  if (!amount) return toast("Summani yozing", "err");
  const cur = f.currency.value;
  const btn = e.target.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    await addDoc(collection(db, "crmSales"), {
      name: l.name || "",
      phone: l.phone || "",
      product: f.product.value.trim(),
      category: kind(l) === "matras" ? "matras" : kind(l) === "divan" ? "divan" : "",
      qty: Number(f.qty.value) || 1,
      amount,
      paid: num(f.paid.value),
      currency: cur,
      address: f.address.value.trim(),
      note: f.note.value.trim(),
      date: today(),
      status: "Yangi",
      source: l.source || "",
      leadId: l.id,
      operator: me.uid,
      operatorName: me.name,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "crmLeads", l.id), {
      stage: "Sotildi",
      soldAmount: money(amount, cur),
      soldAt: Date.now(),
      nextCall: "",
      ...(l.contactedAt ? {} : { contactedAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    });
    $("#saleDlg").close();
    $("#leadDlg").close();
    toast("💰 Sotuv saqlandi — barakalla!");
  } catch (err) {
    toast("Saqlanmadi: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

// ---------- rad etish ----------
let lostPick = "";
function openLost(l) {
  lostPick = "";
  const att = Number(l.attempts) || 0;
  $("#lostBtns").innerHTML = LOST.map((r) => {
    const block = r === "Javob bermadi" && att < MIN_ATTEMPTS;
    return `<button type="button" class="btn btn-line" data-r="${esc(r)}" ${block ? `disabled title="Kamida ${MIN_ATTEMPTS} urinish kerak"` : ""}>${esc(r)}${block ? ` (${att}/${MIN_ATTEMPTS})` : ""}</button>`;
  }).join("");
  $("#lostForm").reset();
  $("#lostDlg").showModal();
}
$("#lostBtns").addEventListener("click", (e) => {
  const b = e.target.closest("[data-r]");
  if (!b || b.disabled) return;
  lostPick = b.dataset.r;
  $$("#lostBtns .btn").forEach((x) => x.classList.toggle("on", x === b));
});
$("#lostForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const l = leads.find((x) => x.id === openId);
  if (!l) return;
  if (!lostPick) return toast("Sababni tanlang", "err");
  await save(l, { stage: "Rad etdi", lostReason: lostPick, lostNote: e.target.elements.lostNote.value.trim(), lostDate: today(), nextCall: "", note: $("#leadNote")?.value.trim() ?? l.note ?? "" }, "Yopildi");
  $("#lostDlg").close();
  $("#leadDlg").close();
});

// Dialoglarni yopish
document.addEventListener("click", (e) => {
  const x = e.target.closest("[data-close]");
  if (x) x.closest("dialog")?.close();
});
