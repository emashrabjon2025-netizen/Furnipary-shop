// "5 daqiqa qoidasi": yangi lidga qo'ng'iroq qilinmasa — eslatma.
// GitHub Actions har 5 daqiqada chaqiradi (.github/workflows/lead-remind.yml).
//   5 daqiqa  → operatorga (Telegram ulangan bo'lsa) va sizga
//   30 daqiqa → sizga "🚨" bilan qayta
// Faqat ish vaqtida (Toshkent 08:30–21:00). Hech qanday maxfiy ma'lumot qaytarmaydi.
//   GET /api/remind?me=1  → botning username'i (operatorni Telegram'ga ulash havolasi uchun)
const { list, getOne, put, patch, tg, esc } = require("./_crm");

const tashkentMinutes = () => {
  const d = new Date(Date.now() + 5 * 3600e3);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

module.exports = async (req, res) => {
  try {
    if (req.query.me) {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const j = token ? await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json()) : {};
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.status(200).json({ ok: !!j.ok, username: j.result && j.result.username });
    }
    const m = tashkentMinutes();
    if (m < 8 * 60 + 30 || m > 21 * 60) return res.status(200).json({ ok: true, skip: "ish vaqti emas" });

    const st = (await getOne("crmSettings", "remind")) || {};
    if (st.lastRun && Date.now() - Number(st.lastRun) < 3 * 60e3) return res.status(200).json({ ok: true, skip: "yaqinda tekshirildi" });
    await put("crmSettings", "remind", { lastRun: Date.now() });

    const now = Date.now();
    const [leads, ops] = await Promise.all([list("crmLeads"), list("crmOperators")]);
    const opById = Object.fromEntries(ops.map((o) => [o.id, o]));
    const fresh = leads.filter((l) => {
      if (l.stage !== "Yangi" || l.contactedAt) return false;
      const t = Date.parse(l.createdAt || l.assignedAt || "");
      return t && now - t >= 5 * 60e3 && now - t < 48 * 3600e3;
    });
    const due5 = fresh.filter((l) => !l.remind5);
    const due30 = fresh.filter((l) => !l.remind30 && now - Date.parse(l.createdAt || l.assignedAt) >= 30 * 60e3);

    const mins = (l) => Math.round((now - Date.parse(l.createdAt || l.assignedAt)) / 60e3);
    const line = (l) => `• <b>${esc(l.name || "Nomsiz")}</b> ${esc(l.phone || "")} — ${mins(l)} daq.${l.assignedName ? ` · 👤 ${esc(l.assignedName)}` : " · operator yo'q"}`;

    // Operatorlarga — har biriga o'z lidlari
    const byOp = {};
    due5.forEach((l) => l.assignedTo && (byOp[l.assignedTo] = byOp[l.assignedTo] || []).push(l));
    for (const [uid, ls] of Object.entries(byOp)) {
      const op = opById[uid];
      if (op && op.tgChat && op.active !== false)
        await tg([`⏰ <b>Qo'ng'iroq kutyapti!</b>`, ...ls.map(line), ``, `👉 https://furnipart-shop.vercel.app/operator`].join("\n"), { chat_id: op.tgChat }).catch(() => {});
    }
    // Sizga — umumiy
    if (due5.length) await tg([`⏰ <b>5 daqiqadan beri qo'ng'iroq qilinmagan lidlar: ${due5.length}</b>`, ...due5.map(line)].join("\n"));
    if (due30.length) await tg([`🚨 <b>30 daqiqadan oshdi — lid sovuyapti: ${due30.length}</b>`, ...due30.map(line)].join("\n"));

    for (const l of due5) await patch("crmLeads", l.id, { remind5: true });
    for (const l of due30) await patch("crmLeads", l.id, { remind30: true });
    return res.status(200).json({ ok: true, r5: due5.length, r30: due30.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, reason: e.message });
  }
};
