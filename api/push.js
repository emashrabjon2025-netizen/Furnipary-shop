// Saytdagi bildirishnomalar (web push).
//   GET  /api/push?vapid=1                         → ochiq VAPID kalit
//   POST {action:"sub", sub, cid?}                 → mijoz obuna bo'ldi
//   POST {action:"unsub", endpoint}                → obunani bekor qilish
//   POST {action:"send", qid}                      → admin pushQueue/{qid} ga yozgan xabarni hammaga yuborish
//   POST {action:"chat", cid}                      → chatga admin javob yozdi — mijozga bildirishnoma
// pushQueue va siteChats'ga faqat admin yoza oladi (firestore.rules), shuning uchun bu yerda alohida parol shart emas.
const { body, clip, getOne, put, del, list, patch } = require("./_crm");
const { vapid, subId, sendOne, sendAll } = require("./_push");

const okId = (s) => /^[A-Za-z0-9_-]{6,60}$/.test(String(s || ""));

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      if (req.query.vapid) {
        const v = await vapid();
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.status(200).json({ ok: true, key: v.publicKey });
      }
      if (req.query.count) {
        const n = (await list("pushSubs")).filter((s) => s.id !== "_vapid").length;
        return res.status(200).json({ ok: true, count: n });
      }
      return res.status(400).json({ ok: false });
    }
    if (req.method !== "POST") return res.status(405).json({ ok: false });
    const b = body(req);

    if (b.action === "sub") {
      const s = b.sub || {};
      if (!/^https:\/\//.test(s.endpoint || "") || !s.keys || !s.keys.p256dh || !s.keys.auth) return res.status(400).json({ ok: false });
      const id = subId(s.endpoint);
      await put("pushSubs", id, {
        endpoint: clip(s.endpoint, 600),
        keys: { p256dh: clip(s.keys.p256dh, 200), auth: clip(s.keys.auth, 100) },
        ua: clip(req.headers["user-agent"], 160),
        at: new Date().toISOString(),
      });
      if (okId(b.cid)) {
        const c = await getOne("siteChats", b.cid);
        if (c) await patch("siteChats", b.cid, { pushId: id });
      }
      return res.status(200).json({ ok: true });
    }

    if (b.action === "unsub") {
      if (b.endpoint) await del("pushSubs", subId(b.endpoint)).catch(() => {});
      return res.status(200).json({ ok: true });
    }

    if (b.action === "send") {
      if (!okId(b.qid)) return res.status(400).json({ ok: false });
      const q = await getOne("pushQueue", b.qid);
      if (!q) return res.status(404).json({ ok: false, reason: "topilmadi" });
      if (q.sent) return res.status(200).json({ ok: true, already: true, ...q.result });
      await patch("pushQueue", b.qid, { sent: true });
      const result = await sendAll({ title: clip(q.title, 80) || "FURNIPART", body: clip(q.body, 300), url: clip(q.url, 300) || "/", tag: "news-" + b.qid });
      await patch("pushQueue", b.qid, { result });
      return res.status(200).json({ ok: true, ...result });
    }

    if (b.action === "chat") {
      if (!okId(b.cid)) return res.status(400).json({ ok: false });
      const c = await getOne("siteChats", b.cid);
      const last = c && (c.msgs || []).slice().sort((x, y) => x.at - y.at).pop();
      if (!c || !c.pushId || !last || last.f !== "a") return res.status(200).json({ ok: true, sent: false });
      if (c.pushAt && Date.now() - Number(c.pushAt) < 15000) return res.status(200).json({ ok: true, sent: false });
      const sub = await getOne("pushSubs", c.pushId);
      if (!sub) return res.status(200).json({ ok: true, sent: false });
      await patch("siteChats", b.cid, { pushAt: Date.now() });
      const sent = await sendOne(sub, { title: "FURNIPART javob berdi 💬", body: clip(last.t, 200), url: "/?chat=1", tag: "chat" });
      return res.status(200).json({ ok: true, sent });
    }

    return res.status(400).json({ ok: false });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, reason: e.message });
  }
};
