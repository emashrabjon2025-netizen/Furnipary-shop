// Vaqtinchalik tekshiruv: server Firestore'ga qanday kirayotganini ko'rsatadi.
// /api/diag?key=<CRM_LEAD_TOKEN>
const { idToken, whoami } = require("./_crm");
const KEY = "AIzaSyDrbB7ppT6vSccAl1CLMdVhcmzg7Tyj1zU";

async function probe(url, token, ref) {
  try {
    const h = token ? { Authorization: "Bearer " + token } : {};
    if (ref) Object.assign(h, { Referer: "https://furnipart-shop.vercel.app/admin", Origin: "https://furnipart-shop.vercel.app" });
    const r = await fetch(url, { headers: h });
    const t = await r.text();
    let msg = "";
    try { const j = JSON.parse(t); msg = j.error ? j.error.status + ": " + j.error.message : (j.documents ? j.documents.length + " ta hujjat" : "bo'sh"); } catch (_) { msg = t.slice(0, 120); }
    return r.status + " " + msg;
  } catch (e) {
    return "xato " + e.message;
  }
}

module.exports = async (req, res) => {
  if (!process.env.CRM_LEAD_TOKEN || req.query.key !== process.env.CRM_LEAD_TOKEN) return res.status(401).json({ ok: false });
  const out = {};
  try {
    const tok = await idToken();
    const w = await whoami();
    out.uid = w.uid;
    const claims = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString());
    out.aud = claims.aud;
    out.provider = claims.firebase && claims.firebase.sign_in_provider;
    const base = (db) => `https://firestore.googleapis.com/v1/projects/furbipart/databases/${db}/documents`;
    out.products_token = await probe(base("default") + "/products?pageSize=1", tok);
    out.products_key = await probe(base("default") + "/products?pageSize=1&key=" + KEY);
    out.crm_token = await probe(base("default") + "/crmLeads?pageSize=1", tok);
    out.crm_token_key = await probe(base("default") + "/crmLeads?pageSize=1&key=" + KEY, tok);
    out.orders_token = await probe(base("default") + "/orders?pageSize=1", tok);
    out.products_key_ref = await probe(base("default") + "/products?pageSize=1&key=" + KEY, null, true);
    out.crm_token_key_ref = await probe(base("default") + "/crmLeads?pageSize=1&key=" + KEY, tok, true);
    out.crm_token_ref = await probe(base("default") + "/crmLeads?pageSize=1", tok, true);
    const r = await fetch(base("default") + "/products?pageSize=1");
    out.raw = (await r.text()).slice(0, 600);
  } catch (e) {
    out.error = e.message;
  }
  res.status(200).json(out);
};
