// "5 daqiqa qoidasi": yangi lidga qo'ng'iroq qilinmasa — eslatma.
// GitHub Actions har 5 daqiqada chaqiradi (.github/workflows/lead-remind.yml).
//   5 daqiqa  → operatorga (Telegram ulangan bo'lsa) va sizga
//   30 daqiqa → sizga "🚨" bilan qayta
// Faqat ish vaqtida (Toshkent 08:30–21:00). Hech qanday maxfiy ma'lumot qaytarmaydi.
//   GET /api/remind?me=1  → botning username'i (operatorni Telegram'ga ulash havolasi uchun)
const { list, getOne, put, patch, tg, esc, assignOrphans } = require("./_crm");

const tashkentMinutes = () => {
  const d = new Date(Date.now() + 5 * 3600e3);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

module.exports = async (req, res) => {
  try {
    if (req.query.ics) {
      // Telefon kalendariga eslatma (.ics): ?ics=1&d=YYYY-MM-DD&t=HH:MM&title=..&desc=..
      const d = String(req.query.d || ""), t = String(req.query.t || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{1,2}:\d{2}$/.test(t)) return res.status(400).send("sana/soat noto'g'ri");
      const clean = (s) => String(s || "").replace(/[\r\n]+/g, " ").replace(/([,;\\])/g, "\\$1").slice(0, 300);
      const [h, mi] = t.split(":").map(Number);
      const start = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), h - 5, mi)); // Toshkent UTC+5
      const z = (x) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      const end = new Date(start.getTime() + 15 * 60e3);
      const ics = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FURNIPART//CRM//UZ", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "BEGIN:VEVENT", `UID:${z(start)}-${Math.random().toString(36).slice(2)}@furnipart`, `DTSTAMP:${z(new Date())}`,
        `DTSTART:${z(start)}`, `DTEND:${z(end)}`, `SUMMARY:${clean(req.query.title || "📞 Qo'ng'iroq")}`, `DESCRIPTION:${clean(req.query.desc)}`,
        "BEGIN:VALARM", "TRIGGER:-PT5M", "ACTION:DISPLAY", "DESCRIPTION:5 daqiqadan keyin qo'ng'iroq", "END:VALARM",
        "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", "DESCRIPTION:Qo'ng'iroq vaqti", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR",
      ].join("\r\n");
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", 'inline; filename="qongiroq.ics"');
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(ics);
    }
    if (req.query.me) {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const j = token ? await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json()) : {};
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.status(200).json({ ok: !!j.ok, username: j.result && j.result.username });
    }
    if (req.query.rules) {
      // Firestore qoidalari e'lon qilinganmi — faqat ha/yo'q (ma'lumot qaytarmaydi)
      const ok = async (c) => list(c).then((x) => x.length, () => -1);
      const out = {};
      for (const c of ["dvClients", "dvPhotos", "crmCouriers", "matrasClients"]) out[c] = await ok(c);
      res.setHeader("Cache-Control", "no-store");
      const ls = await list("crmLeads").catch(() => []);
      return res.status(200).json({ ok: true, rules: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v >= 0])), count: { dvClients: out.dvClients, leadsWithTime: ls.filter((l) => l.nextCallTime).length, recordings: ls.flatMap((l) => l.recordings || []).map((r) => ({ name: String(r.name || "").split(".").pop(), size: r.size, dur: r.dur, via: r.via || "panel", hasFile: !!r.fileId, ch: String(r.chatId || "").slice(0, 4) })), timedReminded: ls.filter((l) => l.callRemindFor).length } });
    }
    const st = (await getOne("crmSettings", "remind")) || {};
    if (st.lastRun && Date.now() - Number(st.lastRun) < 2 * 60e3) return res.status(200).json({ ok: true, skip: "yaqinda tekshirildi" });
    await put("crmSettings", "remind", { lastRun: Date.now() });

    const now = Date.now();
    const [leads, ops] = await Promise.all([list("crmLeads"), list("crmOperators")]);
    // 1) Operatorsiz lid qolmasin — navbat bilan taqsimlash (kecha-kunduz)
    const assigned = await assignOrphans(leads, ops).catch((e) => (console.error("assign", e.message), []));
    const upd = Object.fromEntries(assigned.map((a) => [a.id, a.upd]));
    leads.forEach((l) => upd[l.id] && Object.assign(l, upd[l.id]));

    const m = tashkentMinutes();
    if (m < 8 * 60 + 30 || m > 21 * 60) return res.status(200).json({ ok: true, assigned: assigned.length, skip: "ish vaqti emas" });
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

    // Belgilangan soatdagi qo'ng'iroq — 5 daqiqa oldin operatorga eslatma
    const td = new Date(now + 5 * 3600e3).toISOString().slice(0, 10);
    const toMin = (t) => (/^\d{1,2}:\d{2}$/.test(t || "") ? Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]) : null);
    const timed = leads.filter((l) => {
      if (["Sotildi", "Rad etdi"].includes(l.stage) || l.nextCall !== td) return false;
      const tm = toMin(l.nextCallTime);
      if (tm === null) return false;
      const left = tm - m;
      return left <= 6 && left >= -30 && l.callRemindFor !== `${td} ${l.nextCallTime}`;
    });
    for (const l of timed) {
      const op = opById[l.assignedTo];
      const left = toMin(l.nextCallTime) - m;
      const msg = [
        `⏰ <b>${left > 0 ? `${left} daqiqadan keyin` : "Hozir"} qo'ng'iroq qilish kerak — ${esc(l.nextCallTime)}</b>`,
        `👤 <b>${esc(l.name || "Nomsiz")}</b> ${esc(l.phone || "")}`,
        l.interest ? `🛏 ${esc(l.interest)}` : "",
        l.note ? `📝 ${esc(String(l.note).slice(-200))}` : "",
        ``,
        `👉 https://furnipart-shop.vercel.app/operator`,
      ].filter((x) => x !== "").join("\n");
      if (op && op.tgChat && op.active !== false) await tg(msg, { chat_id: op.tgChat }).catch(() => {});
      else await tg(msg + `\n(operatorga yuborib bo'lmadi${l.assignedName ? " · " + esc(l.assignedName) : ""})`).catch(() => {});
      await patch("crmLeads", l.id, { callRemindFor: `${td} ${l.nextCallTime}` });
    }

    for (const l of due5) await patch("crmLeads", l.id, { remind5: true });
    for (const l of due30) await patch("crmLeads", l.id, { remind30: true });
    return res.status(200).json({ ok: true, assigned: assigned.length, r5: due5.length, r30: due30.length, timed: timed.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, reason: e.message });
  }
};
