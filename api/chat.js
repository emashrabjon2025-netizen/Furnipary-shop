// Saytdagi onlayn chat.
//   POST {action:"send", cid?, name, phone, text}  → mijoz xabari (yangi chat bo'lsa CRMga lid ham qo'shiladi)
//   GET  ?cid=..                                   → chat xabarlari (mijoz saytda ko'radi)
//   POST ?tg=1                                     → Telegram webhook: xabarga "Reply" qilinsa javob saytga boradi
//   GET  ?setup=<CRM_LEAD_TOKEN>                   → Telegram webhook'ni ulash (bir marta)
//   GET  ?info=<CRM_LEAD_TOKEN>                    → webhook holati
const crypto = require("crypto");
const { body, clip, esc, tg, normPhone, addLead, getOne, put, fs, db, idToken } = require("./_crm");
const { sendOne } = require("./_push");

const okCid = (s) => /^[A-Za-z0-9_-]{16,40}$/.test(String(s || ""));
const newCid = () => crypto.randomBytes(15).toString("base64url");
const hookSecret = () => crypto.createHash("sha256").update("chat:" + (process.env.CRM_LEAD_TOKEN || "")).digest("hex").slice(0, 48);
const MAX_MSGS = 300;

const view = (c) => ({
  ok: true,
  cid: c.id,
  name: c.name || "",
  msgs: (c.msgs || [])
    .slice()
    .sort((a, b) => a.at - b.at)
    .slice(-100)
    .map((m) => ({ f: m.f, t: m.t, at: m.at })),
});

async function append(cid, msg, extra = {}) {
  await idToken();
  await fs.updateDoc(fs.doc(db, "siteChats", cid), {
    msgs: fs.arrayUnion(msg),
    last: msg.at,
    lastFrom: msg.f,
    ...extra,
  });
}

async function botApi(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN sozlanmagan" };
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  return r.json().catch(() => ({ ok: false }));
}

// Telegram'dan kelgan javob
async function onTelegram(req, res) {
  if (req.headers["x-telegram-bot-api-secret-token"] !== hookSecret()) return res.status(401).json({ ok: false });
  const u = body(req);
  const m = u.message;
  const owner = String(process.env.TELEGRAM_CHAT_ID || "");
  // Operator botga /start op_<uid> yozsa — uning Telegram'i ulanadi
  const start = m && m.text && m.text.match(/^\/start\s+op_([A-Za-z0-9]{10,40})/);
  if (start) {
    const op = await getOne("crmOperators", start[1]);
    if (op) {
      await put("crmOperators", start[1], { tgChat: String(m.chat.id), tgName: clip((m.from && (m.from.username || m.from.first_name)) || "", 60) });
      await tg(`✅ ${esc(op.name || "Operator")}, Telegram ulandi. Yangi lidlar va eslatmalar shu yerga keladi.\n\n👉 https://furnipart-shop.vercel.app/operator`, { chat_id: m.chat.id });
      await tg(`👤 Operator <b>${esc(op.name || "")}</b> Telegram'ni uladi.`);
    }
    return res.status(200).json({ ok: true });
  }
  if (!m || String(m.chat && m.chat.id) !== owner) return res.status(200).json({ ok: true });
  const text = clip(m.text || m.caption, 1000);
  const ref = m.reply_to_message && (m.reply_to_message.text || m.reply_to_message.caption || "");
  const hit = ref && ref.match(/#c([A-Za-z0-9_-]{16,40})/);
  if (!hit) {
    if (text && !text.startsWith("/")) await tg("ℹ️ Saytdagi mijozga javob berish uchun uning xabariga <b>Reply</b> (Ответить) qilib yozing.", { reply_to_message_id: m.message_id });
    return res.status(200).json({ ok: true });
  }
  if (!text) {
    await tg("⚠️ Hozircha saytga faqat matn yuboriladi.", { reply_to_message_id: m.message_id });
    return res.status(200).json({ ok: true });
  }
  const cid = hit[1];
  const c = await getOne("siteChats", cid);
  if (!c) {
    await tg("⚠️ Bu chat topilmadi.", { reply_to_message_id: m.message_id });
    return res.status(200).json({ ok: true });
  }
  await append(cid, { f: "a", t: text, at: Date.now() }, { unread: 0 });
  let pushed = false;
  if (c.pushId) {
    const sub = await getOne("pushSubs", c.pushId);
    if (sub) pushed = await sendOne(sub, { title: "FURNIPART javob berdi 💬", body: clip(text, 200), url: "/?chat=1", tag: "chat" });
  }
  await tg(`✅ Saytga yuborildi${pushed ? " (mijoz telefoniga bildirishnoma ham ketdi)" : ""}`, { reply_to_message_id: m.message_id });
  return res.status(200).json({ ok: true });
}

module.exports = async (req, res) => {
  try {
    if (req.query.tg) return await onTelegram(req, res);

    if (req.method === "GET") {
      const key = req.query.setup || req.query.info;
      if (key) {
        if (key !== process.env.CRM_LEAD_TOKEN) return res.status(401).json({ ok: false });
        if (req.query.info) return res.status(200).json(await botApi("getWebhookInfo"));
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const r = await botApi("setWebhook", { url: `https://${host}/api/chat?tg=1`, secret_token: hookSecret(), allowed_updates: ["message"], drop_pending_updates: false });
        return res.status(200).json(r);
      }
      if (!okCid(req.query.cid)) return res.status(400).json({ ok: false });
      const c = await getOne("siteChats", req.query.cid);
      if (!c) return res.status(404).json({ ok: false });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(view(c));
    }

    if (req.method !== "POST") return res.status(405).json({ ok: false });
    const b = body(req);
    const text = clip(b.text, 1000);
    if (!text) return res.status(400).json({ ok: false, reason: "Xabar bo'sh" });
    const now = Date.now();

    let c = okCid(b.cid) ? await getOne("siteChats", b.cid) : null;
    if (!c) {
      const name = clip(b.name, 60);
      const phone = normPhone(b.phone);
      if (name.length < 2) return res.status(400).json({ ok: false, reason: "Ismingizni yozing" });
      if (!/^\+998\d{9}$/.test(phone)) return res.status(400).json({ ok: false, reason: "Telefon raqamini to'g'ri yozing" });
      const cid = newCid();
      let leadId = null;
      try {
        leadId = (await addLead({ name, phone, source: "Sayt", interest: "Saytdagi chat: " + clip(text, 120) })).id || null;
      } catch (e) {
        console.error("lead", e.message);
      }
      c = { id: cid, name, phone, leadId, msgs: [] };
      await put("siteChats", cid, { name, phone, leadId, msgs: [], unread: 0, created: now, last: now, lastFrom: "u", ua: clip(req.headers["user-agent"], 160) }, false);
    } else {
      // oddiy himoya: 1 daqiqada 8 tadan ko'p xabar yo'q
      const recent = (c.msgs || []).filter((m) => m.f === "u" && now - m.at < 60000).length;
      if (recent >= 8) return res.status(429).json({ ok: false, reason: "Biroz kuting" });
      if ((c.msgs || []).length >= MAX_MSGS) return res.status(400).json({ ok: false, reason: "Chat juda uzun — qo'ng'iroq qiling" });
    }

    const msg = { f: "u", t: text, at: now, r: crypto.randomBytes(3).toString("hex") };
    await append(c.id, msg, { unread: fs.increment(1) });
    const first = !(c.msgs || []).length;
    await tg(
      [
        `💬 <b>Saytdan xabar</b>${first ? " · yangi mijoz" : ""}`,
        `👤 ${esc(c.name)} · ${esc(c.phone)}`,
        ``,
        esc(text),
        ``,
        `↩️ Javob berish uchun shu xabarga <b>Reply</b> qiling · #c${c.id}`,
      ].join("\n")
    );
    const fresh = await getOne("siteChats", c.id);
    return res.status(200).json(view(fresh || { ...c, msgs: [...(c.msgs || []), msg] }));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, reason: "Server xatosi" });
  }
};
