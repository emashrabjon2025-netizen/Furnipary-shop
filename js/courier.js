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
  setDoc,
  addDoc,
  writeBatch,
} from "./firebase.js";
import { ADMIN_UIDS } from "./config.js";
import { $, $$, escapeHtml as esc, toast, normalizePhone } from "./util.js";
import { areaOf, setCustomAreas, allAreaNames, customAreas, AREAS } from "./areas.js";

let me = null;
let list = [];
let couriersAll = []; // admin uchun kuryerlar ro'yxati
let view = "today";
let area = "all";
let openId = null;
let showAllCities = false;
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
const total = (s) => Number(s.amount) || 0;
// so'm va $ alohida qo'shiladi: "2 400 000 so'm + $95"
const sumStr = (arr, short) => {
  const som = arr.filter((s) => s.currency !== "$").reduce((a, s) => a + total(s), 0);
  const usd = arr.filter((s) => s.currency === "$").reduce((a, s) => a + total(s), 0);
  const ss = short && som >= 1e6 ? (som / 1e6).toFixed(1).replace(".", ",") + " mln" : som ? fmt(som) : "";
  return [ss, usd ? fmt(usd, "$") : ""].filter(Boolean).join(" + ") || "0";
};
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
  const isAdm = ADMIN_UIDS.includes(user.uid);
  if (isAdm) c = { name: "Admin", active: true };
  else
    try {
      const s = await getDoc(doc(db, "crmCouriers", user.uid));
      c = s.exists() ? s.data() : null;
    } catch (_) {}
  if (!c || c.active === false) {
    $("#loginMsg").textContent = "Bu akkaunt kuryer sifatida qo'shilmagan yoki o'chirilgan. Rahbaringizga murojaat qiling.";
    await signOut(auth);
    return;
  }
  me = { uid: user.uid, name: c.name || user.email, admin: isAdm };
  $("#opName").textContent = "🚚 " + me.name;
  $("#loginView").hidden = true;
  $("#appView").hidden = false;
  $("#logout").hidden = false;
  if (me.admin)
    unsub.push(
      onSnapshot(collection(db, "crmCouriers"), (snap) => {
        couriersAll = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.active !== false);
      }, () => {})
    );
  unsub.push(
    onSnapshot(doc(db, "crmSettings", "cities"), (d) => {
      setCustomAreas(d.exists() ? d.data().list : []);
      render();
    }, () => {})
  );
  unsub.push(
    onSnapshot(
      me.admin ? collection(db, "crmSales") : query(collection(db, "crmSales"), where("courier", "==", me.uid)),
      (snap) => {
        // Faqat dastavkaga yuborilgan (kuryer biriktirilgan) sotuvlar — lidlar va oddiy sotuvlar bu yerga tushmaydi
        list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.status !== "Bekor qilindi" && s.courier);
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
  if (view === "tomorrow") return list.filter((s) => s.status !== "Yetkazildi" && dday(s) === tomorrow());
  if (view === "later") return list.filter((s) => s.status !== "Yetkazildi" && dday(s) > tomorrow());
  return list.filter((s) => s.status === "Yetkazildi" && String(s.deliveredAt ? new Date(s.deliveredAt).toISOString() : s.date || "").slice(0, 7) === t.slice(0, 7));
}

function render() {
  if (!me) return;
  const t = today();
  const todayList = list.filter((s) => s.status !== "Yetkazildi" && dday(s) <= t);
  const tmr = list.filter((s) => s.status !== "Yetkazildi" && dday(s) === tomorrow());
  const later = list.filter((s) => s.status !== "Yetkazildi" && dday(s) > tomorrow());
  $("#nToday").textContent = todayList.length || "";
  $("#nTomorrow").textContent = tmr.length || "";
  $("#nLater").textContent = later.length || "";
  const doneToday = list.filter((s) => s.status === "Yetkazildi" && s.deliveredAt && ymd(new Date(s.deliveredAt)) === t);
  $("#dvKpi").innerHTML = `
    <div><small>Bugun yetkazish</small><b>${todayList.length}</b></div>
    <div><small>Bugun yetkazildi</small><b>${doneToday.length}</b></div>
    <div><small>Bugungi mahsulotlar summasi</small><b>${sumStr(todayList)}</b></div>
    <div><small>Yetkazilgan summa</small><b>${sumStr(doneToday)}</b></div>`;

  const items = bucket();
  const counts = {};
  const byArea = {};
  items.forEach((s) => {
    const a = areaOf(s);
    counts[a] = (counts[a] || 0) + 1;
    (byArea[a] = byArea[a] || []).push(s);
  });
  const names = allAreaNames().concat(counts["Boshqa"] ? ["Boshqa"] : []);
  const ordered = names.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
  const tile = (key, label, n, sub) =>
    `<button type="button" class="city ${area === key ? "on" : ""} ${n ? "" : "zero"}" data-area="${esc(key)}"><b>${esc(label)}</b><span>${n || 0}</span>${sub ? `<small>${sub}</small>` : ""}</button>`;
  $("#dvAreas").innerHTML =
    `<div class="city-h"><b>🏙 Farg'ona shaharlari</b>${area !== "all" ? ` <button class="chip" data-area="all">Hammasini ko'rsatish</button>` : ""}</div>
     <div class="city-grid">
       ${tile("all", "Hammasi", items.length, "")}
       ${ordered.filter((a) => counts[a] || showAllCities || a === area).map((a) => tile(a, a, counts[a], byArea[a] ? sumStr(byArea[a], true) : "")).join("")}
       <button type="button" class="city add" id="cityMore"><b>${showAllCities ? "▴" : "▾"}</b><small>${showAllCities ? "Bo'shlarini yashirish" : `Barcha shaharlar (${ordered.length})`}</small></button>
       <button type="button" class="city add" id="cityAdd"><b>➕</b><small>Shahar qo'shish</small></button>
     </div>`;
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
          const late = s.status !== "Yetkazildi" && dday(s) < t;
          return `<button type="button" class="op-card dv-card ${s.status === "Yo'lda" ? "new" : ""} ${late ? "late" : ""}" data-open="${s.id}">
            <span class="oc-top"><b>${esc(s.name || "Mijoz")}</b><span class="pill ${s.status === "Yetkazildi" ? "ok" : s.status === "Yo'lda" ? "today" : late ? "late" : ""}">${s.status === "Yetkazildi" ? "✅ yetkazildi" : s.status === "Yo'lda" ? "🚚 yo'lda" : late ? "⏰ " + fmtDate(dday(s)) : "📅 " + (dday(s) === t ? "bugun" : dday(s) === tomorrow() ? "ertaga" : fmtDate(dday(s)))}</span></span>
            <span class="oc-int">📍 <b>${esc(areaOf(s))}</b> · ${esc(s.address || "manzil yozilmagan")}</span>
            <span class="oc-mid">📦 ${esc(s.product || "")}${Number(s.qty) > 1 ? ` × ${s.qty}` : ""}</span>
            <span class="oc-bot"><small>${esc(s.phone || "")}</small><b class="dv-rest">💵 ${fmt(total(s), s.currency)}</b></span>
          </button>`;
        })
        .join("")
    : `<p class="empty">${view === "today" ? "Bugunga yetkazish yo'q 👍" : view === "tomorrow" ? "Ertaga yetkaziladigan buyurtma yo'q" : view === "later" ? "Keyingi kunlarga yetkazish yo'q" : "Bu oy hali yetkazilgan buyurtma yo'q"}</p>`;
}

$("#dvTabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-v]");
  if (!b) return;
  view = b.dataset.v;
  area = "all";
  $$("#dvTabs .tab").forEach((x) => x.classList.toggle("on", x === b));
  render();
});
$("#dvAreas").addEventListener("click", async (e) => {
  if (e.target.closest("#cityAdd")) return addCity();
  if (e.target.closest("#cityMore")) {
    showAllCities = !showAllCities;
    return render();
  }
  const b = e.target.closest("[data-area]");
  if (!b) return;
  area = b.dataset.area;
  render();
  if (area !== "all") $("#dvList").scrollIntoView({ behavior: "smooth", block: "start" });
});

async function addCity() {
  const name = (prompt("Yangi shahar / tuman / mahalla nomi:\n(masalan: Yaypan, Vodil, Chimyon)") || "").trim().slice(0, 40);
  if (!name) return;
  if (allAreaNames().some((n) => n.toLowerCase() === name.toLowerCase())) return toast("Bu shahar ro'yxatda bor", "err");
  const extra = (prompt(`"${name}" manzilda boshqacha yozilishi mumkinmi? Vergul bilan yozing (bo'sh qoldirsa ham bo'ladi).\nMasalan: ${name.toLowerCase()}, ${name}a`) || "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 1)
    .slice(0, 8);
  try {
    await setDoc(doc(db, "crmSettings", "cities"), { list: [...customAreas(), { name, keys: [name, ...extra] }] }, { merge: true });
    toast(`🏙 ${name} qo'shildi`);
  } catch (err) {
    toast("Qo'shib bo'lmadi: " + err.message, "err");
  }
}
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
  const done = s.status === "Yetkazildi";
  $("#dvBody").innerHTML = `
    <h2>${esc(s.name || "Mijoz")}</h2>
    <p class="muted">${esc(s.status || "Yangi")} · ${dday(s) === today() ? "bugun" : fmtDate(dday(s))}</p>
    <a class="dv-addr" href="${mapUrl(s)}" target="_blank" rel="noopener">📍 <b>${esc(areaOf(s))}</b> — ${esc(s.address || "manzil yozilmagan")} <span>xaritada ›</span></a>
    <label class="dv-city">🏙 Shahar <select id="dvCity">${allAreaNames().concat(["Boshqa"]).map((n) => `<option ${n === areaOf(s) ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
    ${me.admin ? `<p class="muted">🚚 Kuryer: ${esc(s.courierName || "biriktirilgan")} <button type="button" class="chip" data-act="unassign">✖ Dastavkadan olib tashlash</button></p>` : ""}
    <p>📦 <b>${esc(s.product || "")}</b>${Number(s.qty) > 1 ? ` × ${s.qty}` : ""}</p>
    <p>💵 Summa: <b class="dv-rest">${fmt(total(s), s.currency)}</b>${done ? " · ✅ yetkazildi" : ""}</p>
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
      <button class="btn ${dday(s) <= today() ? "btn-dark" : "btn-line"}" type="button" data-act="today">🚚 Bugun yetkaziladi</button>
      <button class="btn ${dday(s) === tomorrow() ? "btn-dark" : "btn-line"}" type="button" data-act="tomorrow">📅 Ertaga yetkaziladi</button>
      ${s.status !== "Yo'lda" ? `<button class="btn btn-line" type="button" data-act="go">🛣 Yo'lga chiqdim</button>` : `<button class="btn btn-line" type="button" disabled>🛣 Yo'ldasiz</button>`}
      <button class="btn btn-line" type="button" data-act="move">🗓 Boshqa kunga</button>
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
  if (a.dataset.act === "unassign" && me.admin) {
    if (!confirm("Bu sotuv dastavka panelidan olib tashlansinmi? (Sotuvning o'zi CRMda qoladi)")) return;
    if (await upd(s.id, { courier: "", courierName: "", updatedAt: serverTimestamp() }, "Dastavkadan olib tashlandi")) $("#dvDlg").close();
    return;
  }
  if (a.dataset.act === "today" || a.dataset.act === "tomorrow") {
    const d = a.dataset.act === "today" ? today() : tomorrow();
    const st = s.status === "Yangi" ? "Tayyorlanmoqda" : s.status === "Yo'lda" && a.dataset.act === "tomorrow" ? "Tayyorlanmoqda" : s.status;
    await upd(s.id, { deliveryDate: d, status: st, ...log(a.dataset.act === "today" ? "🚚 bugun yetkaziladi" : "📅 ertaga yetkaziladi") }, a.dataset.act === "today" ? "🚚 Bugungi ro'yxatga qo'shildi" : "📅 Ertangi ro'yxatga o'tkazildi");
    return;
  }
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
    $("#doneForm").reset();
    $("#doneInfo").textContent = `${s.name || "Mijoz"} · ${s.product || ""} · ${fmt(total(s), s.currency)}`;
    $("#doneDlg").showModal();
  }
});

$("#dvBody").addEventListener("change", async (e) => {
  if (e.target.id !== "dvCity") return;
  const s = list.find((x) => x.id === openId);
  if (s) await upd(s.id, { area: e.target.value, updatedAt: serverTimestamp() }, `🏙 ${e.target.value} ga o'tkazildi`);
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
  const ok = await upd(
    s.id,
    {
      status: "Yetkazildi",
      deliveredAt: Date.now(),
      courierNote: f.note.value.trim() || s.courierNote || "",
      ...log("✅ yetkazildi"),
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

// ---------- Klient qo'shish ----------
let addWhen = "today";
function courierFor(sel) {
  if (!me.admin) return { id: me.uid, name: me.name };
  const c = couriersAll.find((x) => x.id === sel) || couriersAll[0];
  return c ? { id: c.id, name: c.name || "" } : null;
}
$("#dvAdd").addEventListener("click", () => {
  const f = $("#addForm").elements;
  $("#addForm").reset();
  f.area.innerHTML = `<option value="">— manzildan aniqlansin —</option>` + allAreaNames().map((n) => `<option ${n === area ? "selected" : ""}>${esc(n)}</option>`).join("");
  addWhen = view === "tomorrow" ? "tomorrow" : "today";
  $$("#addWhen .btn").forEach((b) => b.classList.toggle("on", b.dataset.when === addWhen));
  $("#addCourierWrap").hidden = !me.admin;
  if (me.admin) f.courier.innerHTML = couriersAll.map((c) => `<option value="${c.id}">${esc(c.name || c.email || "")}</option>`).join("") || `<option value="">Kuryer yo'q — avval admin paneldan qo'shing</option>`;
  $("#addDlg").showModal();
});
$("#addWhen").addEventListener("click", (e) => {
  const b = e.target.closest("[data-when]");
  if (!b) return;
  addWhen = b.dataset.when;
  $$("#addWhen .btn").forEach((x) => x.classList.toggle("on", x === b));
});
function saleDoc(d, c) {
  return {
    name: d.name,
    phone: d.phone,
    address: d.address,
    ...(d.area ? { area: d.area } : {}),
    product: d.product,
    qty: d.qty || 1,
    amount: d.amount,
    paid: 0,
    currency: d.currency === "$" ? "$" : "so'm",
    note: d.note || "",
    date: today(),
    deliveryDate: d.deliveryDate || today(),
    status: "Tayyorlanmoqda",
    source: "Dastavka",
    courier: c.id,
    courierName: c.name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}
$("#addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const phone = normalizePhone(f.phone.value);
  if (!phone) return toast("Telefon raqam noto'g'ri", "err");
  const amount = num(f.amount.value);
  if (!amount) return toast("Summani yozing", "err");
  const c = courierFor(f.courier && f.courier.value);
  if (!c) return toast("Avval admin paneldan kuryer qo'shing", "err");
  const btn = e.target.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    await addDoc(
      collection(db, "crmSales"),
      saleDoc(
        { name: f.name.value.trim(), phone, address: f.address.value.trim(), area: f.area.value, product: f.product.value.trim(), qty: Number(f.qty.value) || 1, amount, currency: f.currency.value, note: f.note.value.trim(), deliveryDate: addWhen === "tomorrow" ? tomorrow() : today() },
        c
      )
    );
    $("#addDlg").close();
    toast(`✅ ${f.name.value.trim()} — ${addWhen === "tomorrow" ? "ertangi" : "bugungi"} ro'yxatga qo'shildi`);
  } catch (err) {
    toast("Qo'shib bo'lmadi: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

// ---------- Excel ----------
const XLSX_URL = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";
const pickCol = (row, ...keys) => {
  const k = Object.keys(row).find((h) => keys.some((x) => h.toLowerCase().replace(/[ʻʼ'`‘’]/g, "").includes(x)));
  return k ? row[k] : "";
};
function toYmd(v) {
  if (v instanceof Date && !isNaN(v)) return ymd(v);
  if (typeof v === "number") return ymd(new Date(Math.round((v - 25569) * 864e5)));
  const t = String(v || "").trim().toLowerCase();
  if (!t) return "";
  if (t.startsWith("bugun")) return today();
  if (t.startsWith("ertaga")) return tomorrow();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return "";
}
$("#dvTemplate").addEventListener("click", async () => {
  try {
    const XLSX = await import(XLSX_URL);
    const ws = XLSX.utils.json_to_sheet([
      { Ism: "Akmal", Telefon: "90 123 45 67", Shahar: "Marg'ilon", Manzil: "Burhoniddin ko'chasi 12, maktab yonida", Mahsulot: "Ortopedik matras 160×200", Soni: 1, Summa: 2900000, Valyuta: "so'm", Sana: "bugun", Izoh: "3-qavat" },
      { Ism: "Nodira", Telefon: "+998 91 111 22 33", Shahar: "Quvasoy", Manzil: "Mustaqillik 5", Mahsulot: "Divan bosh tomoni", Soni: 1, Summa: 580000, Valyuta: "so'm", Sana: "ertaga", Izoh: "" },
    ]);
    ws["!cols"] = [12, 16, 14, 34, 28, 6, 12, 8, 12, 18].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dastavka");
    XLSX.writeFile(wb, "FURNIPART-dastavka-namuna.xlsx");
  } catch (err) {
    toast("Namuna yuklanmadi: " + err.message, "err");
  }
});
$("#dvImport").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  let pickId = couriersAll[0] && couriersAll[0].id;
  if (me.admin && couriersAll.length > 1) {
    const n = Number(prompt("Qaysi kuryerga?\n" + couriersAll.map((x, i) => `${i + 1}. ${x.name}`).join("\n"), "1"));
    if (!n || !couriersAll[n - 1]) return;
    pickId = couriersAll[n - 1].id;
  }
  const c = courierFor(pickId);
  if (!c) return toast("Avval admin paneldan kuryer qo'shing", "err");
  try {
    const XLSX = await import(XLSX_URL);
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    const names = allAreaNames();
    const items = [];
    let bad = 0;
    for (const r of rows) {
      const name = String(pickCol(r, "ism", "mijoz", "klient", "name", "fio") || "").trim();
      const phone = normalizePhone(pickCol(r, "telefon", "tel", "phone", "raqam"));
      const address = String(pickCol(r, "manzil", "adres", "address") || "").trim();
      if (!name && !phone) continue;
      if (!phone || !address) {
        bad++;
        continue;
      }
      const rawArea = String(pickCol(r, "shahar", "tuman", "hudud") || "").trim();
      const area = names.find((n) => n.toLowerCase().replace(/[ʻʼ'`‘’]/g, "") === rawArea.toLowerCase().replace(/[ʻʼ'`‘’]/g, "")) || "";
      const cur = String(pickCol(r, "valyuta", "currency") || "").includes("$") ? "$" : "so'm";
      items.push({
        name: name || "Mijoz",
        phone,
        address: area || !rawArea ? address : `${rawArea}, ${address}`,
        area,
        product: String(pickCol(r, "mahsulot", "tovar", "product") || "").trim(),
        qty: Number(pickCol(r, "soni", "dona", "qty")) || 1,
        amount: num(pickCol(r, "summa", "narx", "jami", "amount")),
        currency: cur,
        note: String(pickCol(r, "izoh", "note") || "").trim(),
        deliveryDate: toYmd(pickCol(r, "sana", "date", "kun")) || today(),
      });
    }
    if (!items.length) return toast(bad ? `${bad} ta qatorda telefon yoki manzil yo'q` : "Faylda klient topilmadi", "err");
    const ask = `${items.length} ta klient dastavkaga qo'shilsinmi?` + (me.admin ? `\nKuryer: ${c.name}` : "") + (bad ? `\n(${bad} ta qatorda telefon yoki manzil yo'q — o'tkazib yuborildi)` : "");
    if (!confirm(ask)) return;
    for (let i = 0; i < items.length; i += 400) {
      const b = writeBatch(db);
      items.slice(i, i + 400).forEach((d) => b.set(doc(collection(db, "crmSales")), saleDoc(d, c)));
      await b.commit();
    }
    toast(`✅ ${items.length} ta klient qo'shildi`);
  } catch (err) {
    console.error(err);
    toast("Import bo'lmadi: " + err.message, "err");
  }
});
