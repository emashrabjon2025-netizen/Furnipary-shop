// Saytni ilovaga o'xshatadigan qismlar:
//  1) service worker + "Bosh ekranga qo'shish"
//  2) 🔔 bildirishnomalarga obuna (web push)
//  3) 💬 onlayn chat — xabar egasining Telegram'iga boradi, javob shu yerda chiqadi
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch (_) {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch (_) {}
  },
};
function toast(msg) {
  let t = $("#appToast");
  if (!t) {
    t = document.createElement("div");
    t.id = "appToast";
    t.className = "app-toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("on"), 3200);
}

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// ---------- 1. Service worker ----------
let swReg = null;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .then((r) => {
      swReg = r;
      refreshBell();
    })
    .catch(() => {});
}
let installEvt = null;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvt = e;
});

// ---------- 2. Bildirishnomalar ----------
const bell = document.createElement("button");
bell.className = "bell-btn";
bell.type = "button";
bell.setAttribute("aria-label", "Bildirishnomalar");
bell.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg><em hidden>✓</em>`;
$(".topbar-in")?.insertBefore(bell, $("#cartOpen"));

const sheet = document.createElement("dialog");
sheet.className = "sheet app-sheet";
document.body.appendChild(sheet);
sheet.addEventListener("click", (e) => {
  if (e.target === sheet || e.target.closest("[data-close]")) sheet.close();
});

async function currentSub() {
  if (!pushSupported) return null;
  const r = swReg || (await navigator.serviceWorker.ready);
  return r.pushManager.getSubscription();
}
async function refreshBell() {
  const on = !!(await currentSub().catch(() => null)) && Notification.permission === "granted";
  bell.classList.toggle("on", on);
  bell.querySelector("em").hidden = !on;
  return on;
}

function b64ToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function subscribePush() {
  if (!pushSupported) throw new Error("unsupported");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("denied");
  const reg = swReg || (await navigator.serviceWorker.ready);
  const { key } = await fetch("/api/push?vapid=1").then((r) => r.json());
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  const r = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sub", sub: sub.toJSON(), cid: store.get("fp_chat") || undefined }),
  });
  if (!r.ok) throw new Error("server");
  store.set("fp_push", "1");
  await refreshBell();
  return true;
}

async function unsubscribePush() {
  const sub = await currentSub();
  if (sub) {
    fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unsub", endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe();
  }
  await refreshBell();
}

function iosSteps() {
  return `<ol class="ios-steps">
    <li>Pastdagi <b>Ulashish</b> tugmasini bosing <span class="ios-ic">⬆︎</span> (Safari'da)</li>
    <li><b>"Bosh ekranga qo'shish"</b> (На экран «Домой») ni tanlang</li>
    <li>Telefoningizda paydo bo'lgan <b>FURNIPART</b> belgisini oching</li>
    <li>U yerda yana 🔔 ni bosing va <b>"Ruxsat berish"</b>ni tanlang</li>
  </ol>`;
}

bell.addEventListener("click", async () => {
  const on = await refreshBell();
  let html;
  if (on) {
    html = `<h2>🔔 Bildirishnomalar yoqilgan</h2>
      <p>Yangi mahsulotlar, chegirmalar va chatdagi javoblar telefoningizga keladi.</p>
      <div class="app-actions"><button class="btn btn-dark" data-close>Yaxshi</button><button class="btn btn-ghost-d" id="pushOff">O'chirish</button></div>`;
  } else if (isIOS && !standalone) {
    html = `<h2>🔔 Yangiliklardan xabardor bo'ling</h2>
      <p>iPhone'da bildirishnoma olish uchun saytni ilova sifatida o'rnating — 10 soniya:</p>${iosSteps()}
      <div class="app-actions"><button class="btn btn-dark" data-close>Tushunarli</button></div>`;
  } else if (!pushSupported) {
    html = `<h2>🔔 Bildirishnomalar</h2><p>Bu brauzer bildirishnomalarni qo'llamaydi. Safari yoki Chrome'da oching.</p>
      <div class="app-actions"><button class="btn btn-dark" data-close>Yopish</button></div>`;
  } else {
    html = `<h2>🔔 Yangiliklardan xabardor bo'ling</h2>
      <p>Yangi mahsulot, chegirma va chatdagi javoblar haqida telefoningizga xabar yuboramiz. Spam yo'q — haftasiga 1–2 marta.</p>
      <div class="app-actions"><button class="btn btn-yellow" id="pushOn">🔔 Yoqish</button>${installEvt ? `<button class="btn btn-ghost-d" id="appInstall">📲 Ilovani o'rnatish</button>` : ""}</div>`;
  }
  sheet.innerHTML = `<button class="x" data-close aria-label="Yopish">×</button>${html}`;
  sheet.showModal();
  $("#pushOn", sheet)?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await subscribePush();
      sheet.close();
      toast("🔔 Bildirishnomalar yoqildi");
    } catch (err) {
      e.target.disabled = false;
      toast(err.message === "denied" ? "Ruxsat berilmadi — telefon sozlamalaridan yoqing" : "Yoqib bo'lmadi, keyinroq urinib ko'ring");
    }
  });
  $("#pushOff", sheet)?.addEventListener("click", async () => {
    await unsubscribePush();
    sheet.close();
    toast("Bildirishnomalar o'chirildi");
  });
  $("#appInstall", sheet)?.addEventListener("click", async () => {
    installEvt.prompt();
    installEvt = null;
    sheet.close();
  });
});

// ---------- 3. Onlayn chat ----------
const fab = document.createElement("button");
fab.className = "chat-fab";
fab.type = "button";
fab.setAttribute("aria-label", "Chat");
fab.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2Zm3 6v2h2v-2H7Zm4 0v2h2v-2h-2Zm4 0v2h2v-2h-2Z"/></svg><em hidden></em>`;
document.body.appendChild(fab);

const chat = document.createElement("dialog");
chat.className = "sheet chat-sheet";
chat.innerHTML = `
  <button class="x" data-close aria-label="Yopish">×</button>
  <div class="chat-head"><img src="img/logo-mark.png" alt="" width="36" height="36"><div><b>FURNIPART</b><small>Odatda bir necha daqiqada javob beramiz</small></div></div>
  <div class="chat-msgs" id="chatMsgs"></div>
  <div class="chat-quick" id="chatQuick">
    <button type="button">Narxi qancha?</button><button type="button">Dastavka bormi?</button><button type="button">Matras tanlashga yordam bering</button><button type="button">Muddatli to'lov bormi?</button>
  </div>
  <form class="chat-form" id="chatForm" autocomplete="on">
    <div class="chat-who" id="chatWho">
      <input name="name" placeholder="Ismingiz" maxlength="60" autocomplete="given-name" />
      <input name="phone" type="tel" inputmode="tel" placeholder="Telefon: 90 123 45 67" autocomplete="tel" />
    </div>
    <div class="chat-input">
      <textarea name="text" rows="1" maxlength="1000" placeholder="Xabar yozing…"></textarea>
      <button class="chat-send" type="submit" aria-label="Yuborish"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M3 20.5 21 12 3 3.5V10l12 2-12 2v6.5Z"/></svg></button>
    </div>
  </form>`;
document.body.appendChild(chat);
const form = $("#chatForm", chat);
const msgsBox = $("#chatMsgs", chat);
chat.addEventListener("click", (e) => {
  if (e.target === chat || e.target.closest("[data-close]")) chat.close();
});

let cid = store.get("fp_chat");
let msgs = [];
let pollT = null;
const seenKey = "fp_chat_seen";

function fmtTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  const today = new Date().toDateString() === d.toDateString();
  return (today ? "" : `${p(d.getDate())}.${p(d.getMonth() + 1)} `) + `${p(d.getHours())}:${p(d.getMinutes())}`;
}
function renderChat() {
  $("#chatWho", chat).hidden = !!cid;
  $("#chatQuick", chat).hidden = msgs.length > 0;
  const hello = `<div class="msg a"><p>Assalomu alaykum! 👋 Savolingizni yozing — mahsulot, narx, dastavka yoki matras tanlash bo'yicha yordam beramiz.</p></div>`;
  const askPush =
    cid && pushSupported && !(isIOS && !standalone) && store.get("fp_push") !== "1" && msgs.some((m) => m.f === "u")
      ? `<div class="msg sys"><button type="button" class="btn btn-sm btn-yellow" id="chatPush">🔔 Javob kelganda xabar bering</button></div>`
      : "";
  msgsBox.innerHTML =
    hello +
    msgs.map((m) => `<div class="msg ${m.f === "a" ? "a" : "u"}"><p>${esc(m.t).replace(/\n/g, "<br>")}</p><time>${fmtTime(m.at)}</time></div>`).join("") +
    askPush;
  msgsBox.scrollTop = msgsBox.scrollHeight;
  $("#chatPush", chat)?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await subscribePush();
      toast("🔔 Javob kelganda xabar beramiz");
      renderChat();
    } catch (_) {
      e.target.disabled = false;
      toast("Ruxsat berilmadi");
    }
  });
}
function updateBadge() {
  const seen = Number(store.get(seenKey)) || 0;
  const n = msgs.filter((m) => m.f === "a" && m.at > seen).length;
  const em = fab.querySelector("em");
  em.hidden = !n || chat.open;
  em.textContent = n;
}
async function load() {
  if (!cid) return;
  try {
    const r = await fetch(`/api/chat?cid=${encodeURIComponent(cid)}`, { cache: "no-store" });
    if (r.status === 404) {
      cid = null;
      store.set("fp_chat", "");
      msgs = [];
    } else if (r.ok) {
      const j = await r.json();
      const changed = j.msgs.length !== msgs.length;
      msgs = j.msgs;
      if (changed && chat.open) renderChat();
    }
  } catch (_) {}
  if (chat.open) store.set(seenKey, String(Date.now()));
  updateBadge();
}
function schedule() {
  clearTimeout(pollT);
  if (!cid) return;
  pollT = setTimeout(async () => {
    if (document.visibilityState === "visible") await load();
    schedule();
  }, chat.open ? 4000 : 30000);
}

export function openChat(prefill) {
  renderChat();
  if (!chat.open) chat.showModal();
  if (prefill) {
    form.text.value = prefill;
  }
  store.set(seenKey, String(Date.now()));
  updateBadge();
  load().then(schedule);
  setTimeout(() => (cid ? form.text : form.name.value ? form.text : form.name).focus(), 150);
}
fab.addEventListener("click", () => openChat());
chat.addEventListener("close", () => {
  schedule();
  updateBadge();
});
$("#chatQuick", chat).addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  form.text.value = b.textContent;
  if (cid) form.requestSubmit();
  else form.name.focus();
});
form.text.addEventListener("input", () => {
  form.text.style.height = "auto";
  form.text.style.height = Math.min(120, form.text.scrollHeight) + "px";
});
form.text.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !isIOS) {
    e.preventDefault();
    form.requestSubmit();
  }
});
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = form.text.value.trim();
  if (!text) return;
  const payload = { action: "send", text };
  if (cid) payload.cid = cid;
  else {
    payload.name = form.name.value.trim();
    payload.phone = form.phone.value.trim();
    if (payload.name.length < 2) return toast("Ismingizni yozing"), form.name.focus();
    if (payload.phone.replace(/\D/g, "").length < 9) return toast("Telefon raqamingizni yozing"), form.phone.focus();
  }
  const btn = $(".chat-send", chat);
  btn.disabled = true;
  msgs = [...msgs, { f: "u", t: text, at: Date.now() }];
  renderChat();
  form.text.value = "";
  form.text.style.height = "auto";
  try {
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.reason || "Yuborib bo'lmadi");
    if (!cid) {
      cid = j.cid;
      store.set("fp_chat", cid);
      if (store.get("fp_push") === "1") subscribePush().catch(() => {}); // obunani chatga bog'lash
    }
    msgs = j.msgs;
    renderChat();
    schedule();
  } catch (err) {
    msgs = msgs.slice(0, -1);
    renderChat();
    form.text.value = text;
    toast(err.message);
  } finally {
    btn.disabled = false;
  }
});

// Mahsulot oynasidagi "Savol berish" tugmasi
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ask]");
  if (!b) return;
  $("#productDlg")?.close();
  openChat(`${b.dataset.ask} — `);
});

// Bildirishnomadan kirilsa (/?chat=1) chat ochiladi
if (new URLSearchParams(location.search).get("chat")) {
  history.replaceState(null, "", location.pathname + location.hash);
  setTimeout(() => openChat(), 300);
}
load().then(schedule);
