// Dastavka (kuryer) paneli: faqat o'ziga biriktirilgan yetkazishlar — manzil, xarita, qo'ng'iroq, Telegram, SMS.
import {
  db,
  auth,
  collection,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "./firebase.js";
import { $, $$, escapeHtml as esc, toast, normalizePhone } from "./util.js";
import { areaOf } from "./areas.js";

let me = null;
let list = [];
let view = "today";
let area = "all";
let openId = null;
let unsub = [];

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd();
const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return ymd(d);
};
const digits = (p) => String(normalizePhone(p) || p || "").replace(/\D/g, "");
const num = (s) => Number(String(s ?? "").replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, "")) || 0;
const fmt = (n, cur) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const t = String(v).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return cur === "$" ? `$${t}` : `${t} so'm`;
};
const rest = (s) => Math.max(0, (Number(s.amount) || 0) - (Number(s.paid) || 0));
const dday = (s) => s.deliveryDate || s.date || today();
const fmtDate = (s) => (s ? s.split("-").reverse().slice(0, 2).join(".") : "");
const mapUrl = (s) => `https://yandex.uz/maps/?text=${encodeURIComponent(`${s.address || ""}, Farg'ona viloyati`)}`;

// Mijozga tayyor xabarlar
const TEMPLATES = [
  ["🚚 Yo'lga chiqdik", "Assalomu alaykum, {ism}! FURNIPART'dan. Buyurtmangiz ({mahsulot}) yo'lda, taxminan {vaqt} da yetib boramiz. Uyda bo'lasizmi?"],
  ["⏱ 15 daqiqada", "Assalomu alaykum, {ism}! FURNIPART kuryeri. 15 daqiqada yetib boraman, iltimos telefoningiz yoniq tursin."],
  ["📍 Yetib keldim", "Assalomu alaykum, {ism}! FURNIPART kuryeri manzilingizga yetib keldi. Chiqib olasizmi?"],
  ["📵 Uyda yo'qsiz", "Assalomu alaykum, {ism}! FURNIPART kuryeri edim, sizni topa olmadim. Iltimos, shu raqamga qo'ng'iroq qiling."],
];
const fill = (t, s) =>
  t
    .replace(/\{ism\}/g, (s.name || "").split(" ")[0] || "")
    .replace(/\{mahsulot\}/g, s.product || "buyurtma")
    .replace(/\{vaqt\}/g, (() => {
      const d = new Date(Date.now() + 40 * 60e3);
      return `${pad(d.getHours())}:${pad(d.getMinutes() < 30 ? 0 : 30)}`;
    })());

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
  let c = null;
  try {
    const s = await getDoc(doc(db, "crmCouriers", user.uid));
    c = s.exists() ? s.data() : null;
  } catch (_) {}
  if (!c || c.active === false) {
    $("#loginMsg").textContent = "Bu akkaunt kuryer sifatida qo'shilmagan yoki o'chirilgan. Rahbaringizga murojaat qiling.";
    await signOut(auth);
    return;
  }
  me = { uid: user.uid, name: c.name || user.email };
  $("#opName").textContent = "🚚 " + me.name;
  $("#loginView").hidden = true;
  $("#appView").hidden = false;
  $("#logout").hidden = false;
  unsub.push(
    onSnapshot(
      query(collection(db, "crmSales"), where("courier", "==", me.uid)),
      (snap) => {
        list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.status !== "Bekor qilindi");
        render();
        if (openId && $("#dvDlg").open) renderCard();
      },
      (err) => {
        console.error(err);
        $("#dvList").innerHTML = `<p class="panel danger">Ma'lumotni o'qib bo'lmadi. Rahbaringizga ayting: Firebase qoidalarini yangilash kerak.</p>`;
      }
    )
  );
});

// ---------- ro'yxat ----------
function bucket() {
  const t = today();
  if (view === "today") return list.filter((s) => s.status !== "Yetkazildi" && dday(s) <= t);
  if (view === "later") return list.filter((s) => s.status !== "Yetkazildi" && dday(s) > t);
  return list.filter((s) => s.status === "Yetkazildi" && String(s.deliveredAt ? new Date(s.deliveredAt).toISOString() : s.date || "").slice(0, 7) === t.slice(0, 7));
}

function render() {
  if (!me) return;
  const t = today();
  const todayList = list.filter((s) => s.status !== "Yetkazildi" && dday(s) <= t);
  const later = list.filter((s) => s.status !== "Yetkazildi" && dday(s) > t);
  $("#nToday").textContent = todayList.length || "";
  $("#nLater").textContent = later.length || "";
  const doneToday = list.filter((s) => s.status === "Yetkazildi" && s.deliveredAt && ymd(new Date(s.deliveredAt)) === t);
  const collectSom = todayList.filter((s) => s.currency !== "$").reduce((a, s) => a + rest(s), 0);
  const collectUsd = todayList.filter((s) => s.currency === "$").reduce((a, s) => a + rest(s), 0);
  const gotSom = doneToday.filter((s) => s.currency !== "$").reduce((a, s) => a + (Number(s.collected) || 0), 0);
  const gotUsd = doneToday.filter((s) => s.currency === "$").reduce((a, s) => a + (Number(s.collected) || 0), 0);
  const both = (som, usd) => [som ? fmt(som) : "", usd ? fmt(usd, "$") : ""].filter(Boolean).join(" + ") || "0";
  $("#dvKpi").innerHTML = `
    <div><small>Bugun yetkazish</small><b>${todayList.length}</b></div>
    <div><small>Yetkazildi</small><b>${doneToday.length}</b></div>
    <div><small>Olinadigan pul</small><b>${both(collectSom, collectUsd)}</b></div>
    <div><small>Olingan pul</small><b>${both(gotSom, gotUsd)}</b></div>`;

  const items = bucket();
  const counts = {};
  items.forEach((s) => (counts[areaOf(s)] = (counts[areaOf(s)] || 0) + 1));
  if (area !== "all" && !counts[area]) area = "all";
  $("#dvAreas").innerHTML = Object.keys(counts).length > 1
    ? [`<button class="chip ${area === "all" ? "on" : ""}" data-area="all">Hammasi ${items.length}</button>`]
        .concat(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([a, n]) => `<button class="chip ${area === a ? "on" : ""}" data-area="${esc(a)}">📍 ${esc(a)} ${n}</button>`))
        .join("")
    : "";
  const shown = items
    .filter((s) => area === "all" || areaOf(s) === area)
    .sort((a, b) => (a.status === "Yo'lda" ? -1 : 0) - (b.status === "Yo'lda" ? -1 : 0) || areaOf(a).localeCompare(areaOf(b)) || dday(a).localeCompare(dday(b)));

  // Marshrut: Marg'ilon do'konidan boshlab (Google Maps — 9 tagacha manzil)
  const stops = shown.filter((s) => s.address && view !== "done").slice(0, 9);
  $("#dvRoute").innerHTML = stops.length >= 2
    ? `<a class="btn btn-dark btn-block" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent("Marg'ilon sitiy, Marg'ilon")}&destination=${encodeURIComponent(stops[stops.length - 1].address + ", Farg'ona viloyati")}&waypoints=${encodeURIComponent(stops.slice(0, -1).map((s) => s.address + ", Farg'ona viloyati").join("|"))}&travelmode=driving">🗺 ${stops.length} ta manzil — marshrutni xaritada ochish</a>`
    : "";

  $("#dvList").innerHTML = shown.length
    ? shown
        .map((s) => {
          const r = rest(s);
          const late = s.status !== "Yetkazildi" && dday(s) < t;
          return `<button type="button" class="op-card dv-card ${s.status === "Yo'lda" ? "new" : ""} ${late ? "late" : ""}" data-open="${s.id}">
            <span class="oc-top"><b>${esc(s.name || "Mijoz")}</b><span class="pill ${s.status === "Yetkazildi" ? "ok" : s.status === "Yo'lda" ? "today" : late ? "late" : ""}">${s.status === "Yetkazildi" ? "✅ yetkazildi" : s.status === "Yo'lda" ? "🚚 yo'lda" : late ? "⏰ " + fmtDate(dday(s)) : "📅 " + (dday(s) === t ? "bugun" : dday(s) === tomorrow() ? "ertaga" : fmtDate(dday(s)))}</span></span>
            <span class="oc-int">📍 <b>${esc(areaOf(s))}</b> · ${esc(s.address || "manzil yozilmagan")}</span>
            <span class="oc-mid">📦 ${esc(s.product || "")}${Number(s.qty) > 1 ? ` × ${s.qty}` : ""}</span>
            <span class="oc-bot"><small>${esc(s.phone || "")}</small>${s.status === "Yetkazildi" ? (s.collected ? `<small>💵 olindi ${fmt(s.collected, s.currency)}</small>` : "") : r ? `<b class="dv-rest">💵 ${fmt(r, s.currency)}</b>` : `<small>✔ to'langan</small>`}</span>
          </button>`;
        })
        .join("")
    : `<p class="empty">${view === "today" ? "Bugunga yetkazish yo'q 👍" : view === "later" ? "Keyingi kunlarga yetkazish yo'q" : "Bu oy hali yetkazilgan buyurtma yo'q"}</p>`;
}

$("#dvTabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-v]");
  if (!b) return;
  view = b.dataset.v;
  area = "all";
  $$("#dvTabs .tab").forEach((x) => x.classList.toggle("active", x === b));
  render();
});
$("#dvAreas").addEventListener("click", (e) => {
  const b = e.target.closest("[data-area]");
  if (!b) return;
  area = b.dataset.area;
  render();
});
$("#dvList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-open]");
  if (!b) return;
  openId = b.dataset.open;
  renderCard();
  $("#dvDlg").showModal();
});

// ---------- kartochka ----------
let tpl = 0;
function renderCard() {
  const s = list.find((x) => x.id === openId);
  if (!s) return $("#dvDlg").close();
  const d = digits(s.phone);
  const text = fill(TEMPLATES[tpl][1], s);
  const enc = encodeURIComponent(text);
  const r = rest(s);
  const done = s.status === "Yetkazildi";
  $("#dvBody").innerHTML = `
    <h2>${esc(s.name || "Mijoz")}</h2>
    <p class="muted">${esc(s.status || "Yangi")} · ${dday(s) === today() ? "bugun" : fmtDate(dday(s))}</p>
    <a class="dv-addr" href="${mapUrl(s)}" target="_blank" rel="noopener">📍 <b>${esc(areaOf(s))}</b> — ${esc(s.address || "manzil yozilmagan")} <span>xaritada ›</span></a>
    <p>📦 <b>${esc(s.product || "")}</b>${Number(s.qty) > 1 ? ` × ${s.qty}` : ""}</p>
    <p>${r && !done ? `💵 Olinadigan pul: <b class="dv-rest">${fmt(r, s.currency)}</b> <small class="muted">(jami ${fmt(s.amount, s.currency)}, oldindan ${fmt(s.paid, s.currency)})</small>` : done ? `✅ Yetkazildi${s.collected ? ` · olindi ${fmt(s.collected, s.currency)}` : ""}` : "✔ To'liq to'langan"}</p>
    ${s.note ? `<p class="muted">📝 ${esc(s.note)}</p>` : ""}
    ${s.courierNote ? `<p class="muted">🚚 ${esc(s.courierNote)}</p>` : ""}
    <div class="op-contact">
      <a class="btn btn-yellow" href="tel:+${d}">📞 Qo'ng'iroq</a>
      <a class="btn btn-line" href="${mapUrl(s)}" target="_blank" rel="noopener">🗺 Xarita</a>
    </div>
    <h3 class="op-h">Mijozga xabar</h3>
    <div class="dv-tpl">${TEMPLATES.map(([n], i) => `<button type="button" class="chip ${i === tpl ? "on" : ""}" data-tpl="${i}">${n}</button>`).join("")}</div>
    <p class="dv-msg">${esc(text)}</p>
    <div class="op-contact">
      <a class="btn btn-line" href="tg://resolve?phone=${d}&text=${enc}" data-copytext="${esc(text)}">✈️ Telegram</a>
      <a class="btn btn-line" href="sms:+${d}&body=${enc}">💬 SMS</a>
      <a class="btn btn-line" href="https://wa.me/${d}?text=${enc}" target="_blank" rel="noopener">🟢 WhatsApp</a>
    </div>
    ${
      done
        ? ""
        : `<h3 class="op-h">Holat</h3>
    <div class="op-result">
      ${s.status !== "Yo'lda" ? `<button class="btn btn-line" type="button" data-act="go">🚚 Yo'lga chiqdim</button>` : `<button class="btn btn-line" type="button" disabled>🚚 Yo'ldasiz</button>`}
      <button class="btn btn-line" type="button" data-act="move">📅 Boshqa kunga</button>
      <button class="btn btn-yellow" type="button" data-act="done" style="grid-column: span 2">✅ Yetkazildi</button>
    </div>`
    }
    ${(s.deliveryLog || []).length ? `<h3 class="op-h">Tarix</h3><ul class="op-log">${s.deliveryLog.slice(-6).reverse().map((x) => `<li>${new Date(x.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} — ${esc(x.t)}</li>`).join("")}</ul>` : ""}
  `;
}

const log = (t) => ({ deliveryLog: arrayUnion({ at: Date.now(), t }), updatedAt: serverTimestamp() });
async function upd(id, data, msg) {
  try {
    await updateDoc(doc(db, "crmSales", id), data);
    toast(msg || "Saqlandi");
    return true;
  } catch (err) {
    toast("Saqlanmadi: " + err.message, "err");
    return false;
  }
}

$("#dvBody").addEventListener("click", async (e) => {
  const s = list.find((x) => x.id === openId);
  if (!s) return;
  const t = e.target.closest("[data-tpl]");
  if (t) {
    tpl = Number(t.dataset.tpl);
    return renderCard();
  }
  const tgA = e.target.closest("[data-copytext]");
  if (tgA) navigator.clipboard?.writeText(tgA.dataset.copytext).catch(() => {});
  const a = e.target.closest("[data-act]");
  if (!a) return;
  if (a.dataset.act === "go") {
    await upd(s.id, { status: "Yo'lda", ...log("🚚 yo'lga chiqdi") }, "Yo'lda — mijozga xabar yuborishni unutmang");
    tpl = 0;
  } else if (a.dataset.act === "move") {
    $("#moveForm").reset();
    $("#moveForm").elements.date.value = tomorrow();
    moveReason = "";
    $$("#moveBtns .btn").forEach((x) => x.classList.remove("on"));
    $("#moveDlg").showModal();
  } else if (a.dataset.act === "done") {
    const r = rest(s);
    $("#doneForm").reset();
    $("#doneForm").elements.collected.value = r ? String(r) : "0";
    $("#doneInfo").textContent = r ? `Olinishi kerak: ${fmt(r, s.currency)}` : "Buyurtma oldindan to'liq to'langan";
    $("#doneDlg").showModal();
  }
});

let moveReason = "";
$("#moveBtns").addEventListener("click", (e) => {
  const b = e.target.closest("[data-r]");
  if (!b) return;
  moveReason = b.dataset.r;
  $$("#moveBtns .btn").forEach((x) => x.classList.toggle("on", x === b));
});
$("#moveForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const s = list.find((x) => x.id === openId);
  const f = e.target.elements;
  const why = [moveReason, f.note.value.trim()].filter(Boolean).join(" — ");
  if (!why) return toast("Sababini tanlang", "err");
  const ok = await upd(s.id, { deliveryDate: f.date.value, courierNote: why, status: s.status === "Yo'lda" ? "Tayyorlanmoqda" : s.status === "Yangi" ? "Tayyorlanmoqda" : s.status, ...log(`📅 ${fmtDate(f.date.value)} ga o'tkazildi: ${why}`) }, "Boshqa kunga o'tkazildi");
  if (ok) {
    $("#moveDlg").close();
    $("#dvDlg").close();
  }
});
$("#doneForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const s = list.find((x) => x.id === openId);
  const f = e.target.elements;
  const got = num(f.collected.value);
  const r = rest(s);
  if (got > r + 0.001 && !confirm(`Olingan pul (${fmt(got, s.currency)}) qoldiqdan (${fmt(r, s.currency)}) ko'p. Shundaymi?`)) return;
  const ok = await upd(
    s.id,
    {
      status: "Yetkazildi",
      deliveredAt: Date.now(),
      collected: got,
      paid: (Number(s.paid) || 0) + got,
      courierNote: f.note.value.trim() || s.courierNote || "",
      ...log(`✅ yetkazildi${got ? `, olindi ${fmt(got, s.currency)}` : ""}`),
    },
    "✅ Yetkazildi — rahmat!"
  );
  if (ok) {
    $("#doneDlg").close();
    $("#dvDlg").close();
  }
});

document.addEventListener("click", (e) => {
  const x = e.target.closest("[data-close]");
  if (x) x.closest("dialog")?.close();
});
