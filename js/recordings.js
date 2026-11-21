// 🎙 Lid ichidagi qo'ng'iroq yozuvlari: ro'yxat, tinglash, yuklash (→ /api/rec → Telegram kanal)
import { auth } from "./firebase.js";
import { escapeHtml as esc, toast } from "./util.js";

let BOT = "";
try {
  BOT = sessionStorage.getItem("fpBot") || "";
} catch (_) {}
if (!BOT)
  fetch("/api/remind?me=1")
    .then((r) => r.json())
    .then((j) => {
      if (!j.username) return;
      BOT = j.username;
      try {
        sessionStorage.setItem("fpBot", BOT);
      } catch (_) {}
      document.querySelectorAll("[data-botlink]").forEach((a) => ((a.href = "https://t.me/" + BOT), (a.textContent = "@" + BOT)));
    })
    .catch(() => {});
const MAX = 4.4 * 1024 * 1024;
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB");
const dur = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "");
const when = (t) => new Date(t).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const tgLink = (r) => (!r.msgId ? "" : r.chatUser ? `https://t.me/${r.chatUser}/${r.msgId}` : String(r.chatId || "").startsWith("-100") ? `https://t.me/c/${String(r.chatId).slice(4)}/${r.msgId}` : "");

let tokenCache = { t: "", at: 0 };
async function idt() {
  if (tokenCache.t && Date.now() - tokenCache.at < 40 * 60e3) return tokenCache.t;
  const t = await auth.currentUser.getIdToken();
  tokenCache = { t, at: Date.now() };
  return t;
}

export function recHtml(l) {
  const recs = (l.recordings || []).slice().sort((a, b) => b.at - a.at);
  return `<div class="rec-box" data-rec-lead="${esc(l.id)}">
    <h3 class="op-h">🎙 Qo'ng'iroq yozuvlari ${recs.length ? `<span class="muted">(${recs.length})</span>` : ""}</h3>
    ${recs
      .map(
        (r) => `<div class="rec-item">
          <div class="rec-meta">🎧 ${esc(when(r.at))}${r.dur ? " · " + dur(r.dur) : ""} · ${kb(r.size || 0)}${r.byName ? " · " + esc(r.byName) : ""}
            ${tgLink(r) ? ` · <a href="${tgLink(r)}" target="_blank" rel="noopener">Telegram'da ochish</a>` : ""}</div>
          ${r.fileId ? `<button type="button" class="btn btn-line btn-sm" data-rec-play="${esc(r.fileId)}">▶️ Tinglash</button>` : ""}
        </div>`
      )
      .join("")}
    <label class="btn btn-dark btn-block file-btn rec-up">🎙 Yozuvni yuklash (audio fayl)
      <input type="file" accept="audio/*,.m4a,.mp3,.aac,.ogg,.opus,.amr,.wav,.3gp" hidden data-rec-file />
    </label>
    <small class="muted">Yozuv lidga saqlanadi va Telegram kanalga yuboriladi (4 MB gacha).<br>
      📲 <b>Osonroq:</b> yozuvni telefondan «Поделиться» → Telegram → <a data-botlink href="https://t.me/${BOT}" target="_blank" rel="noopener">${BOT ? "@" + BOT : "botimiz"}</a> ga yuboring, izohiga mijoz raqamini yozing — o'zi shu lidga qo'shiladi (20 MB gacha).</small>
  </div>`;
}

async function play(btn) {
  btn.disabled = true;
  btn.textContent = "⏳ Yuklanmoqda…";
  try {
    const a = document.createElement("audio");
    a.controls = true;
    a.autoplay = true;
    a.preload = "auto";
    a.src = `/api/rec?file=${encodeURIComponent(btn.dataset.recPlay)}&t=${encodeURIComponent(await idt())}`;
    a.className = "rec-audio";
    a.addEventListener("error", () => toast("Tinglab bo'lmadi — Telegram'dan oching", "err"));
    btn.replaceWith(a);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "▶️ Tinglash";
    toast(e.message, "err");
  }
}

async function upload(input) {
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  const box = input.closest("[data-rec-lead]");
  const leadId = box.dataset.recLead;
  if (file.size > MAX) return toast(`Fayl ${kb(file.size)} — 4 MB dan oshmasin (uzun bo'lsa qisqartiring yoki Telegram'ga o'zingiz yuboring)`, "err");
  const lbl = box.querySelector(".rec-up");
  const old = lbl.firstChild.textContent;
  lbl.firstChild.textContent = "⏳ Yuborilmoqda… ";
  lbl.classList.add("busy");
  try {
    const r = await fetch(`/api/rec?lead=${encodeURIComponent(leadId)}&name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { Authorization: "Bearer " + (await idt()), "Content-Type": file.type || "audio/mpeg" },
      body: file,
    });
    const j = await r.json().catch(() => ({ ok: false, reason: r.status === 413 ? "fayl juda katta" : "server xatosi" }));
    if (!j.ok) throw new Error(j.reason);
    toast("✅ Yozuv saqlandi va Telegram'ga yuborildi");
  } catch (e) {
    toast("Yuklanmadi: " + e.message, "err");
  } finally {
    lbl.firstChild.textContent = old;
    lbl.classList.remove("busy");
  }
}

// Bir marta ulanadi: istalgan konteynerdagi rec-box'lar uchun
export function bindRecordings(root) {
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-rec-play]");
    if (b) play(b);
  });
  root.addEventListener("change", (e) => {
    if (e.target.matches("[data-rec-file]")) upload(e.target);
  });
}
