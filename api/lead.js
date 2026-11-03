// Yangi lidni CRMga qo'shadi. ChatPlace (Instagram bot) shu manzilga POST yuboradi:
//   {"token":"<CRM_LEAD_TOKEN>","ism":"..","telefon":"..","viloyat":"..","mahsulot":"..","manba":"..","instagram":".."}
// Tekshirish: GET /api/lead?key=<CRM_LEAD_TOKEN>  → Firebase'ga ulanish holati
const { addLead, body, idToken, tg } = require("./_crm");

module.exports = async (req, res) => {
  const b = req.method === "POST" ? body(req) : {};
  const key = b.token || req.query.key || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const secret = process.env.CRM_LEAD_TOKEN;
  if (!secret) return res.status(500).json({ ok: false, reason: "CRM_LEAD_TOKEN sozlanmagan" });
  if (key !== secret) return res.status(401).json({ ok: false, reason: "kalit noto'g'ri" });

  if (req.method === "GET") {
    const out = { ok: true };
    try {
      await idToken();
      out.firebase = "ulandi";
    } catch (e) {
      out.ok = false;
      out.firebase = e.message;
    }
    if (req.query.tg) out.telegram = await tg("✅ CRM ulanish sinovi: hammasi ishlayapti.");
    return res.status(out.ok ? 200 : 500).json(out);
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  const manba = String(b.manba || b.source || "").toLowerCase();
  const source = manba.includes("telegram") ? "Telegram" : manba.includes("sayt") ? "Sayt" : "Instagram";
  try {
    const r = await addLead({
      name: b.ism || b.name,
      phone: b.telefon || b.phone,
      region: b.viloyat || b.region,
      interest: b.mahsulot || b.product,
      instagram: b.instagram || b.username,
      note: b.izoh || b.note,
      source,
    });
    return res.status(r.ok ? 200 : 400).json(r);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, reason: e.message });
  }
};
