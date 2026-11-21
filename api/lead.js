// Yangi lidni CRMga qo'shadi. ChatPlace (Instagram bot) shu manzilga POST yuboradi:
//   {"token":"<CRM_LEAD_TOKEN>","ism":"..","telefon":"..","viloyat":"..","mahsulot":"..","manba":"..","instagram":"..","akkaunt":"furnipart.uz"}
// "akkaunt" — lid qaysi Instagram akkauntimizdan kelgani (har bir ChatPlace boti o'z nomini yuboradi)
// Tekshirish: GET /api/lead?key=<CRM_LEAD_TOKEN>  → Firebase'ga ulanish holati
const { addLead, body, idToken, tg, whoami, list, getOne, patch, create, findBy, normPhone, clip, guessType, today, esc } = require("./_crm");
const API_KEY = "AIzaSyDrbB7ppT6vSccAl1CLMdVhcmzg7Tyj1zU";

// Operator keyingi qo'ng'iroq sanasi/soatini saqlaydi (Firestore qoidasiga bog'liq emas):
//   POST {"calltime":{"idToken":"<operator Firebase tokeni>","leadId":"..","date":"YYYY-MM-DD","time":"HH:MM"}}
async function uidOf(tok) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: String(tok || "") }) });
  const j = await r.json().catch(() => ({}));
  return j.users && j.users[0] && j.users[0].localId;
}

// Operator o'zi topgan mijozni (komment, direkt, qo'ng'iroq...) o'ziga lid qilib qo'shadi:
//   POST {"oplead":{"idToken":"..","name":"..","phone":"..","region":"..","interest":"..","channel":"Komment","target":true,"account":"furnipart.uz","instagram":"..","stage":"Yangi","note":".."}}
const CHANNEL_SRC = { Komment: "Instagram", Direkt: "Instagram", "Instagram story": "Instagram", Telegram: "Telegram", "Qo'ng'iroq": "Qo'ng'iroq", "Do'konga keldi": "Do'kon", Tavsiya: "Tavsiya", Sayt: "Sayt", Boshqa: "Boshqa" };
async function opLead(b, res) {
  const uid = await uidOf(b.idToken);
  if (!uid) return res.status(401).json({ ok: false, reason: "kirish muddati tugagan — qayta kiring" });
  const op = await getOne("crmOperators", uid);
  if (!op && uid !== ADMIN_UID) return res.status(403).json({ ok: false, reason: "siz operator emassiz" });
  const phone = normPhone(b.phone);
  if (!phone) return res.status(400).json({ ok: false, reason: "telefon raqam noto'g'ri" });
  // shu raqam bilan ochiq lid bormi
  const same = (await findBy("crmLeads", "phone", phone)).filter((l) => !["Sotildi", "Rad etdi"].includes(l.stage));
  if (same.length) {
    const l = same[0];
    const mine = l.assignedTo === uid;
    return res.status(200).json({ ok: false, dup: true, mine, leadId: mine ? l.id : null, reason: mine ? "Bu raqam sizda allaqachon bor" : `Bu raqam ${l.assignedName || "boshqa operator"}da ochiq lid sifatida bor` });
  }
  const channel = CHANNEL_SRC[b.channel] ? b.channel : "Boshqa";
  const target = !!b.target;
  const ig = ["Komment", "Direkt", "Instagram story"].includes(channel) || target;
  const account = ig ? clip(b.account, 40).replace(/^@/, "").toLowerCase() : "";
  const stage = ["Yangi", "Bog'lanildi", "O'ylab ko'radi"].includes(b.stage) ? b.stage : "Yangi";
  const interest = clip(b.interest, 200);
  const name = clip(b.name, 80) || "Mijoz";
  const data = {
    name,
    phone,
    region: clip(b.region, 120),
    interest,
    source: target ? "Instagram target" : CHANNEL_SRC[channel],
    channel,
    target,
    ...(account ? { account } : {}),
    ...(ig && b.instagram ? { instagram: clip(b.instagram, 60).replace(/^@/, "") } : {}),
    stage,
    ctype: guessType(interest),
    nextCall: /^\d{4}-\d{2}-\d{2}$/.test(b.nextCall || "") ? b.nextCall : today(),
    note: clip(b.note, 1000),
    date: today(),
    assignedTo: uid,
    assignedName: (op && op.name) || "Admin",
    assignedAt: new Date().toISOString(),
    addedBy: "operator",
    ...(stage !== "Yangi" ? { contactedAt: new Date().toISOString(), attempts: 1 } : {}),
  };
  const id = await create("crmLeads", data);
  await tg(`➕ <b>${esc(data.assignedName)}</b> o'zi lid qo'shdi: ${esc(name)} ${esc(phone)}\n📍 ${esc(channel)}${target ? " · 📣 target" : ""}${account ? " · @" + esc(account) : ""}${interest ? "\n🛏 " + esc(interest) : ""}`).catch(() => {});
  return res.status(200).json({ ok: true, id });
}

async function callTime(c, res) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: String(c.idToken || "") }) });
  const j = await r.json().catch(() => ({}));
  const uid = j.users && j.users[0] && j.users[0].localId;
  if (!uid) return res.status(401).json({ ok: false, reason: "kirish muddati tugagan — qayta kiring" });
  const lead = await getOne("crmLeads", String(c.leadId || ""));
  if (!lead) return res.status(404).json({ ok: false, reason: "lid topilmadi" });
  if (lead.assignedTo !== uid && uid !== ADMIN_UID) return res.status(403).json({ ok: false, reason: "bu lid sizga biriktirilmagan" });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(c.date || "") ? c.date : lead.nextCall || "";
  const time = /^\d{1,2}:\d{2}$/.test(c.time || "") ? c.time.padStart(5, "0") : "";
  await patch("crmLeads", lead.id || c.leadId, { nextCall: date, nextCallTime: time });
  return res.status(200).json({ ok: true, date, time });
}
const ADMIN_UID = "B3O0Gn3vA3al6kmBZw5porxAEXC3";

module.exports = async (req, res) => {
  const b = req.method === "POST" ? body(req) : {};
  if (b.oplead) return opLead(b.oplead, res).catch((e) => res.status(500).json({ ok: false, reason: e.message }));
  if (b.calltime) return callTime(b.calltime, res).catch((e) => res.status(500).json({ ok: false, reason: e.message }));
  const key = b.token || req.query.key || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const secret = process.env.CRM_LEAD_TOKEN;
  if (!secret) return res.status(500).json({ ok: false, reason: "CRM_LEAD_TOKEN sozlanmagan" });
  if (key !== secret) return res.status(401).json({ ok: false, reason: "kalit noto'g'ri" });

  if (req.method === "GET") {
    const out = { ok: true };
    try {
      await idToken();
      out.firebase = "ulandi";
      const w = await whoami();
      out.email = w.email;
      out.admin = w.uid === ADMIN_UID ? "ha" : `YO'Q — bu akkaunt admin emas (uid ${w.uid})`;
      try {
        out.crm = (await list("crmLeads")).length + " ta lid o'qildi";
      } catch (e) {
        out.ok = false;
        out.crm = e.message;
      }
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
      account: b.akkaunt || b.account || b.sahifa || "",
      source,
    });
    return res.status(r.ok ? 200 : 400).json(r);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, reason: e.message });
  }
};
