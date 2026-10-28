// Yangi buyurtma haqida Telegram'ga xabar yuboradi.
// Vercel → Project → Settings → Environment Variables:
//   TELEGRAM_BOT_TOKEN  — @BotFather bergan token
//   TELEGRAM_CHAT_ID    — xabar boradigan chat/guruh ID'si
// Ikkalasi bo'lmasa, funksiya hech narsa yubormaydi (sayt baribir ishlaydi).

const clip = (s, n) => String(s ?? "").slice(0, n);
const money = (n) => {
  const [int, dec] = (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).split(".");
  return "$" + int.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (dec === "00" ? "" : "." + dec);
};
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return res.status(200).json({ ok: false, reason: "not-configured" });

  const o = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
  const phone = clip(o.phone, 20);
  if (!/^\+998\d{9}$/.test(phone) || !Array.isArray(o.items) || !o.items.length) {
    return res.status(400).json({ ok: false });
  }

  const items = o.items
    .slice(0, 30)
    .map((i) => `• ${esc(clip(i.name, 80))} × ${Number(i.qty) || 1} — ${money((Number(i.price) || 0) * (Number(i.qty) || 1))}`)
    .join("\n");

  const text = [
    `🛒 <b>Yangi buyurtma</b> #${esc(clip(o.id, 6).toUpperCase())}`,
    ``,
    `👤 ${esc(clip(o.name, 60))}`,
    `📞 ${esc(phone)}`,
    o.address ? `📍 ${esc(clip(o.address, 120))}` : null,
    o.comment ? `💬 ${esc(clip(o.comment, 300))}` : null,
    ``,
    items,
    ``,
    `<b>Jami: ${money(o.total)}</b>`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    return res.status(200).json({ ok: r.ok });
  } catch (e) {
    return res.status(200).json({ ok: false });
  }
};

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return {};
  }
}
