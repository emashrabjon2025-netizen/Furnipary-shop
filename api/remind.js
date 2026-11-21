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
    if (req.query.igrep) {
      // 📊 Instagram kunlik hisoboti (21:00) — HAR BIR Instagram akkaunt uchun alohida.
      // cp = ChatPlace raqamlari: "furnipart.uz:12:3;furnipart_uz:5:1"  (akkaunt:qiziqishlarga yozilganlar:Direct'da yozganlar)
      const t = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
      const day = /^\d{4}-\d{2}-\d{2}$/.test(req.query.d || "") ? req.query.d : t;
      const st = (await getOne("crmSettings", "igrep")) || {};
      // kuniga bir marta: bugun allaqachon yuborilgan bo'lsa takrorlamaymiz (force=1 bilan majburan)
      if (st.date === day && !req.query.force && !req.query.dry) return res.status(200).json({ ok: true, skip: "bugun yuborilgan" });
      if (st.at && Date.now() - Number(st.at) < 10 * 60e3 && st.date === day && !req.query.force && !req.query.dry) return res.status(200).json({ ok: true, skip: "yaqinda yuborilgan" });
      const MAIN = "furnipart.uz";
      const cp = {};
      String(req.query.cp || "").split(/[;,]/).forEach((x) => {
        const [a, w, dm] = x.split(":");
        const acc = String(a || "").trim().replace(/^@/, "").toLowerCase();
        if (acc) cp[acc] = { w: w === "" || isNaN(Number(w)) ? null : Number(w), dm: dm === undefined || dm === "" || isNaN(Number(dm)) ? null : Number(dm) };
      });
      // eski format: faqat umumiy w/dm → asosiy akkauntga
      const num = (v) => (v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
      if (!Object.keys(cp).length && (num(req.query.w) !== null || num(req.query.dm) !== null)) cp[MAIN] = { w: num(req.query.w), dm: num(req.query.dm) };
      const [leads, sales, sets] = await Promise.all([list("crmLeads"), list("crmSales"), list("crmSettings").catch(() => [])]);
      const rate = Number((sets.find((s) => s.id === "target") || {}).usdRate) || 12050;
      const isIg = (l) => !!l && (/instagram/i.test(l.source || "") || l.target === true || !!l.account);
      const accOf = (l) => (l.account || MAIN).toLowerCase();
      const isTarget = (l) => l.target === true || l.source === "Instagram target";
      const dayOf = (x) => {
        if (!x) return "";
        if (typeof x === "string") return x.length > 10 ? new Date(Date.parse(x) + 5 * 3600e3).toISOString().slice(0, 10) : x;
        const sec = x.seconds || x._seconds;
        return sec ? new Date(sec * 1000 + 5 * 3600e3).toISOString().slice(0, 10) : "";
      };
      const igLeads = leads.filter(isIg);
      const newIg = igLeads.filter((l) => (l.date || dayOf(l.createdAt)) === day);
      const okToday = (l) => (l.attemptLog || []).some((a) => new Date(Number(a.at) + 5 * 3600e3).toISOString().slice(0, 10) === day && /gaplashdik|o'ylab|sotildi|💰/i.test(a.t || ""));
      const qualified = igLeads.filter((l) => okToday(l) || (l.stage === "Sotildi" && dayOf(l.soldAt) === day));
      const byId = Object.fromEntries(leads.map((l) => [l.id, l]));
      const igSales = sales.filter((s) => s.date === day && s.status !== "Bekor qilindi" && (isIg(byId[s.leadId]) || /instagram/i.test(s.source || "") || s.fromTarget === true));
      const saleAcc = (s) => (byId[s.leadId] && isIg(byId[s.leadId]) ? accOf(byId[s.leadId]) : MAIN);
      const som = (s) => (Number(s.amount) || 0) * ((s.currency || "$") === "$" ? rate : 1);
      const mln = (n) => (n >= 1e6 ? (Math.round(n / 1e5) / 10).toString().replace(".", ",") + " mln" : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")) + " so'm";
      const accs = [...new Set([MAIN, "furnipart_uz", ...Object.keys(cp), ...newIg.map(accOf), ...qualified.map(accOf), ...igSales.map(saleAcc)])];
      const dash = (v) => (v === null || v === undefined ? "—" : v);
      const dd = `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
      const blocks = [];
      const tot = { w: 0, dm: 0, tg: 0, n: 0, q: 0, s: 0, sum: 0, hasW: false };
      for (const a of accs) {
        const nl = newIg.filter((l) => accOf(l) === a);
        const q = qualified.filter((l) => accOf(l) === a).length;
        const ss = igSales.filter((s) => saleAcc(s) === a);
        const sum = ss.reduce((x, s) => x + som(s), 0);
        const c = cp[a] || { w: null, dm: null };
        const tgN = nl.filter(isTarget).length;
        if (!nl.length && !q && !ss.length && !c.w && !c.dm && a !== MAIN && !cp[a]) continue;
        tot.n += nl.length; tot.q += q; tot.s += ss.length; tot.sum += sum; tot.tg += tgN;
        if (c.w !== null) (tot.w += c.w), (tot.hasW = true);
        if (c.dm !== null) tot.dm += c.dm;
        blocks.push([
          `📸 <b>@${esc(a)}</b>`,
          `👀 Qiziqishlarga yozilganlar soni: <b>${dash(c.w)}</b>`,
          `📣 Target orqali kelgan lidlar: <b>${tgN}</b>`,
          `📞 Raqam olinganlar soni: <b>${nl.length}</b>`,
          `💬 Smsda (Direct) yozishganlar soni: <b>${dash(c.dm)}</b>`,
          `✅ Bizga javob berganlar (sifatliga o'tganlar): <b>${q}</b>`,
          `💰 Sotuv: <b>${ss.length} ta</b>${ss.length ? " · " + mln(sum) : ""}`,
          `📅 Sana: <b>${dd}</b>`,
          c.w ? `📈 Yozilgan → raqam ${Math.round((nl.length / c.w) * 100)}% · raqam → sotuv ${nl.length ? Math.round((ss.length / nl.length) * 100) : 0}%` : "",
        ].filter(Boolean).join("\n"));
      }
      const msg = [
        `📊 <b>Instagram bo'yicha kunlik hisobot</b> — ${dd}`,
        ...blocks,
        blocks.length > 1 ? `🧮 <b>Jami:</b> yozilgan ${tot.hasW ? tot.w : "—"} · target ${tot.tg} · raqam ${tot.n} · sifatli ${tot.q} · sotuv ${tot.s} ta${tot.s ? " (" + mln(tot.sum) + ")" : ""}` : "",
        !Object.keys(cp).length ? `<i>ℹ️ ChatPlace raqamlari (yozilganlar, Direct) bu safar kelmadi</i>` : "",
      ].filter(Boolean).join("\n\n");
      if (req.query.dry) return res.status(200).json({ ok: true, msg });
      const r = await tg(msg);
      await put("crmSettings", "igrep", { date: day, at: Date.now(), cp });
      return res.status(200).json({ ok: !!r.ok, sent: true });
    }
    if (req.query.products) {
      // Saytdagi ommaviy mahsulotlar (nom, narx, rasm) kategoriya bo'yicha — PDF/kontent tayyorlash uchun
      const cat = String(req.query.products).toLowerCase();
      const ps = (await list("products")).filter((p) => String(p.category || "").toLowerCase().includes(cat) || String(p.name || "").toLowerCase().includes(cat)).slice(0, 10);
      const out = [];
      let total = 0;
      for (const p of ps) {
        const imgs = [];
        for (const suf of ["", "__1", "__2"]) {
          const d = await getOne("productImages", p.id + suf).catch(() => null);
          const src = d && (d.data || d.image || d.src);
          if (src && total + src.length < 4e6) (imgs.push(src), (total += src.length));
        }
        const { image, ...rest } = p;
        out.push({ ...Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== "string" || !v.startsWith("data:"))), imgs });
      }
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, n: out.length, items: out });
    }
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
      return res.status(200).json({ ok: true, rules: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v >= 0])), count: { dvClients: out.dvClients, leadsWithTime: ls.filter((l) => l.nextCallTime).length, recordings: ls.flatMap((l) => l.recordings || []).map((r) => ({ name: String(r.name || "").split(".").pop(), size: r.size, dur: r.dur, via: r.via || "panel", hasFile: !!r.fileId, ch: String(r.chatId || "").slice(0, 4) })), timedReminded: ls.filter((l) => l.callRemindFor).length, scriptsSaved: Object.keys((await getOne("crmSettings", "scripts").catch(() => null)) || {}).filter((k) => k !== "id" && k !== "updatedAt") } });
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
