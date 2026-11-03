// Vaqtinchalik tekshiruv: Firebase JS SDK (brauzerdagi kabi) orqali o'qish
const { initializeApp, getApps } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { initializeFirestore, collection, getDocs, limit, query } = require("firebase/firestore");

module.exports = async (req, res) => {
  if (!process.env.CRM_LEAD_TOKEN || req.query.key !== process.env.CRM_LEAD_TOKEN) return res.status(401).json({ ok: false });
  const out = {};
  try {
    const app = getApps()[0] || initializeApp({ apiKey: "AIzaSyDrbB7ppT6vSccAl1CLMdVhcmzg7Tyj1zU", authDomain: "furbipart.firebaseapp.com", projectId: "furbipart" });
    const db = initializeFirestore(app, { experimentalForceLongPolling: true }, "default");
    try { out.products_anon = (await getDocs(query(collection(db, "products"), limit(1)))).size + " ta"; } catch (e) { out.products_anon = e.code + " " + e.message; }
    await signInWithEmailAndPassword(getAuth(app), process.env.FIREBASE_ADMIN_EMAIL, process.env.FIREBASE_ADMIN_PASSWORD);
    out.login = "ok";
    try { out.crm = (await getDocs(query(collection(db, "crmLeads"), limit(3)))).size + " ta"; } catch (e) { out.crm = e.code + " " + e.message; }
  } catch (e) {
    out.error = e.code + " " + e.message;
  }
  res.status(200).json(out);
};
