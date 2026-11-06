// Server tomonda CRM bilan ishlash uchun umumiy yordamchilar (Vercel funksiyalari).
// "_" bilan boshlangan fayl Vercel'da alohida endpoint bo'lmaydi.
//
// Vercel → Project → Settings → Environment Variables:
//   FIREBASE_ADMIN_EMAIL     — admin panelga kiradigan email
//   FIREBASE_ADMIN_PASSWORD  — shu akkaunt paroli
//   CRM_LEAD_TOKEN           — /api/lead uchun maxfiy kalit (ChatPlace shu kalit bilan yuboradi)
//   TELEGRAM_BOT_TOKEN       — @BotFather bergan token
//   TELEGRAM_CHAT_ID         — xabar boradigan chat ID

// Firestore'ga Firebase JS SDK orqali ulanamiz (REST so'rovlari bu loyihada rad etiladi)
const { initializeApp, getApps } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const fs = require("firebase/firestore");

const app = getApps()[0] || initializeApp({ apiKey: "AIzaSyDrbB7ppT6vSccAl1CLMdVhcmzg7Tyj1zU", authDomain: "furbipart.firebaseapp.com", projectId: "furbipart" });
const db = fs.initializeFirestore(app, { experimentalForceLongPolling: true }, "default");
const auth = getAuth(app);

let loginP = null;
async function idToken() {
  if (auth.currentUser) return auth.currentUser.getIdToken();
  const email = process.env.FIREBASE_ADMIN_EMAIL;
  const password = process.env.FIREBASE_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("FIREBASE_ADMIN_EMAIL / FIREBASE_ADMIN_PASSWORD sozlanmagan");
  loginP = loginP || signInWithEmailAndPassword(auth, email, password).catch((e) => { loginP = null; throw new Error("Firebase login: " + (e.code || e.message)); });
  await loginP;
  return auth.currentUser.getIdToken();
}
const whoami = async () => (await idToken(), { uid: auth.currentUser.uid, email: auth.currentUser.email });

const plain = (v) => (v && typeof v.toDate === "function" ? v.toDate().toISOString() : v);
const docOf = (d) => {
  const o = { id: d.id };
  Object.entries(d.data()).forEach(([k, v]) => (o[k] = plain(v)));
  return o;
};

async function list(col) {
  await idToken();
  return (await fs.getDocs(fs.collection(db, col))).docs.map(docOf);
}

async function findBy(col, field, value) {
  await idToken();
  return (await fs.getDocs(fs.query(fs.collection(db, col), fs.where(field, "==", value), fs.limit(20)))).docs.map(docOf);
}

async function create(col, data) {
  await idToken();
  const ref = await fs.addDoc(fs.collection(db, col), { ...data, createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() });
  return ref.id;
}

async function patch(col, id, data) {
  await idToken();
  await fs.updateDoc(fs.doc(db, col, id), { ...data, updatedAt: fs.serverTimestamp() });
}

async function getOne(col, id) {
  await idToken();
  const d = await fs.getDoc(fs.doc(db, col, id));
  return d.exists() ? docOf(d) : null;
}

async function put(col, id, data, merge = true) {
  await idToken();
  await fs.setDoc(fs.doc(db, col, id), data, { merge });
}

async function del(col, id) {
  await idToken();
  await fs.deleteDoc(fs.doc(db, col, id));
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

async function tg(text, extra = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { ok: false, reason: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID sozlanmagan" };
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: extra.chat_id || chat, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, reason: j.description, result: j.result };
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

const MEBELCHI_KEYS = ["klipsa", "derjatel", "shablon", "chamadon", "petlya", "stanok", "lazer", "konduktor", "legirovka", "planka", "mebel yig", "mebelchi", "mebel"];
const guessType = (t) => (MEBELCHI_KEYS.some((k) => String(t || "").toLowerCase().includes(k)) ? "Mebelchi" : "Oddiy xaridor");
const REPEAT_DAYS = { "Oddiy xaridor": 150, Mebelchi: 30, "Diler / do'kon": 21 };

const clip = (s, n) => String(s ?? "").trim().slice(0, n);

// Lid qo'shadi; shu raqam bilan ochiq lid bo'lsa — yangisini ochmay, unga qo'shib qo'yadi
// ---- Operatorlar: yangi lidni navbat bilan biriktirish ----
async function pickOperator() {
  const ops = (await list("crmOperators")).filter((o) => o.active !== false).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (!ops.length) return null;
  const rr = (await getOne("crmSettings", "rr")) || {};
  const i = (Number(rr.i) || 0) % ops.length;
  await put("crmSettings", "rr", { i: i + 1 });
  return ops[i];
}

async function notifyOperator(op, lead, repeat) {
  if (!op || !op.tgChat) return;
  await tg(
    [
      repeat ? `🔁 <b>Qayta murojaat</b>` : `🆕 <b>Yangi lid</b> — 5 daqiqa ichida qo'ng'iroq qiling`,
      `👤 ${esc(lead.name || "")} · ${esc(lead.phone || "")}`,
      lead.interest ? `🛏 ${esc(lead.interest)}` : "",
      lead.region ? `📍 ${esc(lead.region)}` : "",
      ``,
      `👉 https://furnipart-shop.vercel.app/operator`,
    ].filter((x) => x !== "").join("\n"),
    { chat_id: op.tgChat }
  ).catch(() => {});
}

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
    let op = null;
    try {
      if (open.assignedTo) op = await getOne("crmOperators", open.assignedTo);
      if (!op || op.active === false) {
        op = await pickOperator();
        if (op) Object.assign(upd, { assignedTo: op.id, assignedName: op.name || "", assignedAt: new Date().toISOString() });
      }
    } catch (e) {
      console.error("operator", e.message);
    }
    await patch("crmLeads", open.id, upd);
    await notifyOperator(op, { ...open, ...upd }, true);
    return { ok: true, id: open.id, repeat: true };
  }
  let op = null;
  try {
    op = await pickOperator();
  } catch (e) {
    console.error("operator", e.message);
  }
  const id = await create("crmLeads", {
    ...(op ? { assignedTo: op.id, assignedName: op.name || "", assignedAt: new Date().toISOString() } : {}),
    name,
    phone,
    region: clip(region, 120),
    interest,
    source: source || "Instagram",
    stage: "Yangi",
    instagram: clip(instagram, 60).replace(/^@/, ""),
    ctype: guessType(interest),
    nextCall: today(),
    note: clip(note, 1000) + (existing.length ? (note ? " · " : "") + "Avval ham murojaat qilgan" : ""),
    date: today(),
  });
  await notifyOperator(op, { name, phone, interest, region }, false);
  return { ok: true, id, repeat: false, operator: op ? op.name : null };
}

module.exports = { pickOperator, fs, db, getOne, put, del, guessType, REPEAT_DAYS, whoami, list, findBy, create, patch, today, normPhone, esc, tg, body, clip, addLead, idToken };
