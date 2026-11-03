// Server tomonda CRM bilan ishlash uchun umumiy yordamchilar (Vercel funksiyalari).
// "_" bilan boshlangan fayl Vercel'da alohida endpoint bo'lmaydi.
//
// Vercel → Project → Settings → Environment Variables:
//   FIREBASE_ADMIN_EMAIL     — admin panelga kiradigan email
//   FIREBASE_ADMIN_PASSWORD  — shu akkaunt paroli
//   CRM_LEAD_TOKEN           — /api/lead uchun maxfiy kalit (ChatPlace shu kalit bilan yuboradi)
//   TELEGRAM_BOT_TOKEN       — @BotFather bergan token
//   TELEGRAM_CHAT_ID         — xabar boradigan chat ID

const API_KEY = "AIzaSyDrbB7ppT6vSccAl1CLMdVhcmzg7Tyj1zU";
const PROJECT = "furbipart";
const DB = "default";
const BASE = `projects/${PROJECT}/databases/${DB}/documents`;
const FS = `https://firestore.googleapis.com/v1/${BASE}`;

let cached = null;
async function idToken() {
  if (cached && cached.exp > Date.now()) return cached.token;
  const email = process.env.FIREBASE_ADMIN_EMAIL;
  const password = process.env.FIREBASE_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("FIREBASE_ADMIN_EMAIL / FIREBASE_ADMIN_PASSWORD sozlanmagan");
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Firebase login: " + (j.error?.message || r.status));
  cached = { uid: j.localId, email: j.email, token: j.idToken, exp: Date.now() + (Number(j.expiresIn) - 120) * 1000 };
  return cached.token;
}

async function call(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await idToken()) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Firestore: " + (j.error?.message || r.status));
  return j;
}

// ---- qiymatlarni Firestore formatiga va qaytarib o'girish ----
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: encFields(v) } };
}
function encFields(o) {
  const f = {};
  Object.entries(o).forEach(([k, v]) => (f[k] = enc(v)));
  return f;
}
function dec(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
  if ("mapValue" in v) return decFields(v.mapValue.fields || {});
  return null;
}
function decFields(f) {
  const o = {};
  Object.entries(f || {}).forEach(([k, v]) => (o[k] = dec(v)));
  return o;
}
const docOf = (d) => ({ id: d.name.split("/").pop(), ...decFields(d.fields) });

async function list(col) {
  const out = [];
  let page = "";
  do {
    const j = await call(`${FS}/${col}?pageSize=300${page ? "&pageToken=" + page : ""}`);
    (j.documents || []).forEach((d) => out.push(docOf(d)));
    page = j.nextPageToken || "";
  } while (page);
  return out;
}

async function findBy(col, field, value) {
  const j = await call(`${FS}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: col }],
        where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: enc(value) } },
        limit: 20,
      },
    }),
  });
  return j.filter((x) => x.document).map((x) => docOf(x.document));
}

function randomId() {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(require("crypto").randomBytes(20), (n) => abc[n % abc.length]).join("");
}

// Yangi hujjat yaratadi (createdAt/updatedAt — server vaqti)
async function create(col, data, id = randomId()) {
  await call(`${FS}:commit`, {
    method: "POST",
    body: JSON.stringify({
      writes: [
        {
          update: { name: `${BASE}/${col}/${id}`, fields: encFields(data) },
          updateTransforms: [
            { fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" },
            { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
          ],
          currentDocument: { exists: false },
        },
      ],
    }),
  });
  return id;
}

// Mavjud hujjatning faqat berilgan maydonlarini o'zgartiradi
async function patch(col, id, data) {
  await call(`${FS}:commit`, {
    method: "POST",
    body: JSON.stringify({
      writes: [
        {
          update: { name: `${BASE}/${col}/${id}`, fields: encFields(data) },
          updateMask: { fieldPaths: Object.keys(data) },
          updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
          currentDocument: { exists: true },
        },
      ],
    }),
  });
}

// ---- umumiy ----
// Toshkent vaqti bo'yicha bugungi sana: "2026-11-04"
const today = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);

function normPhone(raw) {
  const head = (String(raw || "").match(/^[\s+\d()\-.]+/) || [""])[0];
  const d = head.replace(/\D/g, "");
  if (d.length === 9) return "+998" + d;
  if (d.length === 12 && d.startsWith("998")) return "+" + d;
  if (d.length >= 10 && d.length <= 15) return "+" + d;
  return "";
}

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

async function tg(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { ok: false, reason: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID sozlanmagan" };
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, reason: j.description };
}

function body(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_) {
      return Object.fromEntries(new URLSearchParams(req.body));
    }
  }
  return req.body || {};
}

const clip = (s, n) => String(s ?? "").trim().slice(0, n);

// Lid qo'shadi; shu raqam bilan ochiq lid bo'lsa — yangisini ochmay, unga qo'shib qo'yadi
async function addLead({ name, phone, region, interest, source, instagram, note }) {
  phone = normPhone(phone);
  name = clip(name, 60) || (instagram ? "@" + clip(instagram, 40) : "");
  interest = clip(interest, 200);
  if (!phone && !name) return { ok: false, reason: "ism ham, telefon ham yo'q" };
  const existing = phone ? await findBy("crmLeads", "phone", phone) : [];
  const open = existing.find((l) => !["Sotildi", "Rad etdi"].includes(l.stage));
  if (open) {
    const upd = {};
    if (interest && !(open.interest || "").includes(interest)) upd.interest = [open.interest, interest].filter(Boolean).join(" · ").slice(0, 300);
    upd.note = [open.note, `${today()}: qayta murojaat${interest ? " — " + interest : ""}`].filter(Boolean).join(" · ").slice(0, 1000);
    if (!open.region && region) upd.region = clip(region, 120);
    if (open.stage !== "Yangi") upd.stage = "Yangi";
    await patch("crmLeads", open.id, upd);
    return { ok: true, id: open.id, repeat: true };
  }
  const id = await create("crmLeads", {
    name,
    phone,
    region: clip(region, 120),
    interest,
    source: source || "Instagram",
    stage: "Yangi",
    instagram: clip(instagram, 60).replace(/^@/, ""),
    nextCall: today(),
    note: clip(note, 1000) + (existing.length ? (note ? " · " : "") + "Avval ham murojaat qilgan" : ""),
    date: today(),
  });
  return { ok: true, id, repeat: false };
}

const whoami = async () => (await idToken(), { uid: cached.uid, email: cached.email });
module.exports = { whoami, list, findBy, create, patch, today, normPhone, esc, tg, body, clip, addLead, idToken };
