// Web push (telefonga bildirishnoma) uchun umumiy yordamchilar.
// VAPID kalitlari birinchi marta kerak bo'lganda server o'zi yaratadi va Firestore'da
// (pushSubs/_vapid — faqat admin o'qiy oladi) saqlaydi. Maxfiy kalit GitHub'ga tushmaydi.
const webpush = require("web-push");
const crypto = require("crypto");
const { getOne, put, del, list } = require("./_crm");

let vapidP = null;
async function vapid() {
  vapidP =
    vapidP ||
    (async () => {
      let v = await getOne("pushSubs", "_vapid");
      if (!v || !v.publicKey || !v.privateKey) {
        const k = webpush.generateVAPIDKeys();
        v = { publicKey: k.publicKey, privateKey: k.privateKey };
        await put("pushSubs", "_vapid", v, false);
      }
      webpush.setVapidDetails("mailto:furnipart.uz@gmail.com", v.publicKey, v.privateKey);
      return v;
    })().catch((e) => {
      vapidP = null;
      throw e;
    });
  return vapidP;
}

const subId = (endpoint) => crypto.createHash("sha256").update(String(endpoint)).digest("hex").slice(0, 40);

// Bitta obunachiga yuborish. Obuna eskirgan bo'lsa (404/410) — o'chiriladi.
async function sendOne(sub, payload) {
  await vapid();
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 3 * 24 * 3600, urgency: "high" });
    return true;
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) await del("pushSubs", sub.id || subId(sub.endpoint)).catch(() => {});
    return false;
  }
}

async function sendAll(payload) {
  await vapid();
  const subs = (await list("pushSubs")).filter((s) => s.id !== "_vapid" && s.endpoint);
  const res = await Promise.all(subs.map((s) => sendOne(s, payload)));
  const sent = res.filter(Boolean).length;
  return { total: subs.length, sent, fail: subs.length - sent };
}

module.exports = { vapid, subId, sendOne, sendAll };
