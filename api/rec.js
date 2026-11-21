// Lid ichiga qo'ng'iroq yozuvi (audio) yuklash → Telegram kanal/botga yuboriladi, lidda saqlanadi.
//   POST /api/rec?lead=<leadId>&name=<fayl nomi>   Authorization: Bearer <Firebase idToken>   body: audio fayl (≤ 4.4 MB)
//   GET  /api/rec?file=<telegram file_id>&t=<idToken>  → yozuvni tinglash (Telegram'dan oqim)
// Qayerga yuboriladi: crmSettings/rec.chatId (yopiq kanal — botga kanaldan biror postni forward qilsangiz o'zi saqlanadi),
// bo'lmasa TELEGRAM_CHAT_ID (admin bilan bot chati).
const { getOne, patch, fs, esc } = require("./_crm");

const API_KEY = "AIzaSyDrbB7ppT6vSccAl1CLMdVhcmzg7Tyj1zU";
const ADMIN_UID = "B3O0Gn3vA3al6kmBZw5porxAEXC3";
const MAX = 4.4 * 1024 * 1024;

async function uidOf(tok) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: String(tok || "") }),
  });
  const j = await r.json().catch(() => ({}));
  return j.users && j.users[0] && j.users[0].localId;
}

function readBody(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    const parts = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > MAX) {
        reject(new Error("Fayl juda katta (4 MB dan oshmasin)"));
        req.destroy();
      } else parts.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
}

const fmtNow = () => {
  const d = new Date(Date.now() + 5 * 3600e3).toISOString();
  return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)} ${d.slice(11, 16)}`;
};

module.exports = async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  try {
    if (!token) return res.status(500).json({ ok: false, reason: "TELEGRAM_BOT_TOKEN sozlanmagan" });

    // ---------- tinglash ----------
    if (req.method === "GET") {
      const uid = await uidOf(req.query.t);
      if (!uid) return res.status(401).send("kirish kerak");
      if (uid !== ADMIN_UID && !(await getOne("crmOperators", uid))) return res.status(403).send("ruxsat yo'q");
      const f = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(String(req.query.file || ""))}`).then((r) => r.json());
      if (!f.ok) return res.status(404).send("fayl topilmadi (20 MB dan katta bo'lsa Telegram'da tinglang)");
      const a = await fetch(`https://api.telegram.org/file/bot${token}/${f.result.file_path}`);
      const buf = Buffer.from(await a.arrayBuffer());
      const ext = (f.result.file_path.split(".").pop() || "").toLowerCase();
      const type = { mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", amr: "audio/amr" }[ext] || "application/octet-stream";
      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "private, max-age=3600");
      return res.status(200).send(buf);
    }

    if (req.method !== "POST") return res.status(405).json({ ok: false });

    // ---------- yuklash ----------
    const tok = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const uid = await uidOf(tok);
    if (!uid) return res.status(401).json({ ok: false, reason: "kirish muddati tugagan — qayta kiring" });
    const lead = await getOne("crmLeads", String(req.query.lead || ""));
    if (!lead) return res.status(404).json({ ok: false, reason: "lid topilmadi" });
    const op = uid === ADMIN_UID ? { name: "Admin" } : await getOne("crmOperators", uid);
    if (!op || (uid !== ADMIN_UID && lead.assignedTo !== uid)) return res.status(403).json({ ok: false, reason: "bu lid sizga biriktirilmagan" });

    const buf = await readBody(req);
    if (!buf.length) return res.status(400).json({ ok: false, reason: "fayl bo'sh" });
    const name = String(req.query.name || "yozuv.m4a").replace(/[^\w.\-() ]+/g, "_").slice(0, 80) || "yozuv.m4a";
    const type = String(req.headers["content-type"] || "audio/mpeg");

    const rec = (await getOne("crmSettings", "rec")) || {};
    const chatId = rec.chatId || process.env.TELEGRAM_CHAT_ID;
    const caption = [
      `🎙 <b>Qo'ng'iroq yozuvi</b>`,
      `👤 <b>${esc(lead.name || "Mijoz")}</b> ${esc(lead.phone || "")}`,
      lead.interest ? `🛏 ${esc(lead.interest)}` : "",
      `🎧 Operator: ${esc(op.name || "")} · ${fmtNow()}`,
      `📌 Holati: ${esc(lead.stage || "")}${lead.source ? " · " + esc(lead.source) : ""}`,
      `#lid_${String(lead.id).slice(0, 8)}`,
    ].filter(Boolean).join("\n");

    const send = async (method, field) => {
      const fd = new FormData();
      fd.append("chat_id", String(chatId));
      fd.append("caption", caption);
      fd.append("parse_mode", "HTML");
      if (method === "sendAudio") fd.append("title", `${lead.name || "Mijoz"} — ${fmtNow()}`);
      fd.append(field, new Blob([buf], { type }), name);
      return fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body: fd }).then((r) => r.json());
    };
    let j = /mpeg|mp3|mp4|m4a|aac/.test(type + name) ? await send("sendAudio", "audio") : { ok: false };
    if (!j.ok) j = await send("sendDocument", "document");
    if (!j.ok) return res.status(502).json({ ok: false, reason: "Telegram: " + (j.description || "yuborilmadi") });

    const m = j.result;
    const media = m.audio || m.document || m.voice || {};
    const item = {
      fileId: media.file_id || "",
      msgId: m.message_id,
      chatId: String(chatId),
      chatUser: (m.chat && m.chat.username) || "",
      name,
      size: buf.length,
      dur: media.duration || 0,
      at: Date.now(),
      by: uid,
      byName: op.name || "",
    };
    await patch("crmLeads", lead.id, { recordings: fs.arrayUnion(item) });
    return res.status(200).json({ ok: true, item });
  } catch (e) {
    return res.status(500).json({ ok: false, reason: e.message });
  }
};
