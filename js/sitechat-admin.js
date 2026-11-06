// Admin: saytdagi chatlar va bildirishnoma yuborish
import { ADMIN_UIDS } from "./config.js";
import { toast } from "./util.js";
import { db, auth, collection, doc, setDoc, updateDoc, onSnapshot, query, orderBy, arrayUnion, onAuthStateChanged } from "./firebase.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pad = (n) => String(n).padStart(2, "0");
const when = (ms) => {
  if (!ms) return "";
  const d = new Date(Number(ms));
  const today = new Date().toDateString() === d.toDateString();
  return (today ? "" : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} `) + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

let chats = [];
let openId = null;
let unsub = [];

function sortMsgs(c) {
  return (c.msgs || []).slice().sort((a, b) => a.at - b.at);
}

function renderList() {
  const unread = chats.reduce((a, c) => a + (Number(c.unread) || 0), 0);
  $("#chatCount").textContent = unread ? unread : "";
  $("#chatList").innerHTML = chats.length
    ? chats
        .map((c) => {
          const last = sortMsgs(c).pop();
          return `<button type="button" class="chat-row ${c.id === openId ? "on" : ""}" data-chat="${c.id}">
            <span class="cr-top"><b>${esc(c.name || "Mijoz")}</b><small>${when(c.last)}</small></span>
            <span class="cr-bot"><small>${last ? (last.f === "a" ? "Siz: " : "") + esc(String(last.t).slice(0, 70)) : ""}</small>${c.unread ? `<em>${c.unread}</em>` : ""}</span>
          </button>`;
        })
        .join("")
    : `<p class="muted">Hali saytdan xabar yozilmagan. Saytning pastki o'ng burchagidagi 💬 tugma orqali mijozlar yozadi.</p>`;
}

function renderThread() {
  const c = chats.find((x) => x.id === openId);
  const box = $("#chatThread");
  if (!c) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const digits = String(c.phone || "").replace(/\D/g, "");
  $("#ctHead").innerHTML = `<b>${esc(c.name || "Mijoz")}</b> <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>
    <span class="ct-links"><a class="icon-btn" href="tel:${esc(c.phone)}" title="Qo'ng'iroq">📞</a><a class="icon-btn" href="https://wa.me/${digits}" target="_blank" rel="noopener" title="WhatsApp">🟢</a><a class="icon-btn" href="tg://resolve?phone=${digits}" title="Telegram">✈️</a></span>
    ${c.pushId ? `<small class="muted">🔔 javobingiz telefoniga bildirishnoma bo'lib boradi</small>` : `<small class="muted">Mijoz saytga qaytib kirganda javobni ko'radi</small>`}`;
  const list = $("#ctMsgs");
  list.innerHTML = sortMsgs(c)
    .map((m) => `<div class="msg ${m.f === "a" ? "me" : "them"}"><p>${esc(m.t).replace(/\n/g, "<br>")}</p><time>${when(m.at)}</time></div>`)
    .join("");
  list.scrollTop = list.scrollHeight;
  if (c.unread) updateDoc(doc(db, "siteChats", c.id), { unread: 0 }).catch(() => {});
}

function start() {
  unsub.forEach((u) => u());
  unsub = [
    onSnapshot(
      query(collection(db, "siteChats"), orderBy("last", "desc")),
      (snap) => {
        chats = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.last || 0) - (a.last || 0));
        renderList();
        renderThread();
      },
      (err) => {
        console.error(err);
        $("#chatList").innerHTML = `<p class="danger">Chatlarni o'qib bo'lmadi. Firebase → Firestore → Rules bo'limiga yangi <code>firestore.rules</code> faylini qo'yib, "Publish" bosing.</p>`;
      }
    ),
  ];
  fetch("/api/push?count=1")
    .then((r) => r.json())
    .then((j) => ($("#pushSubs").textContent = j.ok ? `${j.count} ta obunachi` : ""))
    .catch(() => {});
}

onAuthStateChanged(auth, (user) => {
  if (user && ADMIN_UIDS.includes(user.uid)) start();
  else {
    unsub.forEach((u) => u());
    unsub = [];
  }
});

$("#chatList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-chat]");
  if (!b) return;
  openId = b.dataset.chat;
  renderList();
  renderThread();
  $("#chatThread").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("#ctForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const t = e.target.elements.text;
  const text = t.value.trim();
  if (!text || !openId) return;
  const btn = e.target.querySelector("button");
  btn.disabled = true;
  try {
    const at = Date.now();
    await updateDoc(doc(db, "siteChats", openId), {
      msgs: arrayUnion({ f: "a", t: text.slice(0, 1000), at, r: Math.random().toString(36).slice(2, 8) }),
      last: at,
      lastFrom: "a",
      unread: 0,
    });
    t.value = "";
    fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", cid: openId }) }).catch(() => {});
  } catch (err) {
    console.error(err);
    toast("Yuborib bo'lmadi: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

// ---- Bildirishnoma yuborish ----
$("#pushForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const title = f.title.value.trim();
  const body = f.body.value.trim();
  if (!title || !body) return toast("Sarlavha va matnni yozing", "err");
  if (!confirm(`Bildirishnoma barcha obunachilarga yuborilsinmi?\n\n${title}\n${body}`)) return;
  const btn = e.target.querySelector("[type=submit]");
  btn.disabled = true;
  try {
    const ref = doc(collection(db, "pushQueue"));
    await setDoc(ref, { title: title.slice(0, 80), body: body.slice(0, 300), url: f.url.value.trim().slice(0, 300) || "/", at: Date.now(), sent: false });
    const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", qid: ref.id }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.reason || "server");
    const msg = `✅ ${j.total || 0} ta obunachidan ${j.sent || 0} tasiga yetkazildi${j.fail ? ` · ${j.fail} tasi eskirgan (o'chirildi)` : ""}`;
    toast(msg);
    $("#pushResult").textContent = msg;
    e.target.reset();
  } catch (err) {
    console.error(err);
    toast("Yuborib bo'lmadi: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
});
