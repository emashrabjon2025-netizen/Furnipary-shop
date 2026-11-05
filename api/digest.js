// Har kuni ertalab (09:00 Toshkent) Telegram'ga CRM xulosasini yuboradi.
// Vercel Cron chaqiradi (vercel.json → crons). Qo'lda sinash: /api/digest?key=<CRM_LEAD_TOKEN>
const { list, today, esc, tg, guessType, REPEAT_DAYS } = require("./_crm");

const pad = (n) => String(n).padStart(2, "0");
const fmt = (s) => (s ? s.slice(8, 10) + "." + s.slice(5, 7) : "");
function money(n, cur) {
  const s = String(Math.round(Math.abs(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return cur === "so'm" ? s + " so'm" : "$" + s;
}
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
const CLOSED = ["Sotildi", "Rad etdi"];

module.exports = async (req, res) => {
  const cron = process.env.CRON_SECRET && req.headers.authorization === "Bearer " + process.env.CRON_SECRET;
  const manual = process.env.CRM_LEAD_TOKEN && req.query.key === process.env.CRM_LEAD_TOKEN;
  if (!cron && !manual && process.env.CRON_SECRET) return res.status(401).json({ ok: false });
  if (!cron && !manual && !req.headers["user-agent"]?.includes("vercel-cron")) return res.status(401).json({ ok: false });

  try {
    const t = today();
    const [leads, sales, settings, clients] = await Promise.all([
      list("crmLeads"),
      list("crmSales"),
      list("crmSettings").catch(() => []),
      list("crmClients").catch(() => []),
    ]);

    // Qayta taklif vaqti kelgan mijozlar (CRM'dagi hisob bilan bir xil)
    const addDays = (s, n) => new Date(Date.parse(s + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
    const due = clients
      .map((c) => {
        const cs = sales.filter((x) => x.status !== "Bekor qilindi" && ((c.phone && x.phone === c.phone) || x.clientId === c.id));
        if (!cs.length) return null;
        const lead = c.phone && leads.find((l) => l.phone === c.phone && l.ctype);
        const type = c.ctype || (lead && lead.ctype) || guessType(cs.map((x) => x.product).join(" "));
        const days = REPEAT_DAYS[type] || 150;
        let d = addDays(cs.map((x) => x.date || "").sort().pop(), days);
        if (c.followDone && c.followDone >= d) d = addDays(c.followDone, days);
        return d <= t ? { ...c, type, d } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.d.localeCompare(b.d));
    const open = leads.filter((l) => !CLOSED.includes(l.stage));
    const calls = open.filter((l) => l.nextCall && l.nextCall <= t).sort((a, b) => a.nextCall.localeCompare(b.nextCall));
    const noDate = open.filter((l) => !l.nextCall);
    const stale = leads.filter((l) => l.stage === "Yangi" && l.createdAt && Date.now() - Date.parse(l.createdAt) > 24 * 3600e3);
    const overdue = open.filter((l) => l.nextCall && l.nextCall < t);
    const line = (l) =>
      `• <b>${esc(l.name || "Nomsiz")}</b> ${l.phone ? esc(l.phone) : ""}${l.interest ? " — " + esc(l.interest.slice(0, 50)) : ""}${
        l.nextCall && l.nextCall < t ? ` <i>(${fmt(l.nextCall)} dan beri)</i>` : ""
      }`;

    // Qoldig'i bor sotuvlar
    const debts = sales
      .filter((s) => s.status !== "Bekor qilindi" && (Number(s.amount) || 0) > (Number(s.paid) || 0))
      .map((s) => ({ ...s, rest: (Number(s.amount) || 0) - (Number(s.paid) || 0) }))
      .sort((a, b) => b.rest - a.rest);
    const debtSum = {};
    debts.forEach((s) => (debtSum[s.currency || "$"] = (debtSum[s.currency || "$"] || 0) + s.rest));

    // Oylik reja
    const st = settings.find((s) => s.id === "main") || {};
    // Oylik reja: umumiy online savdo, so'mda
    const target = Number(st.planRevenue) || 150000000;
    const rate = Number((settings.find((s) => s.id === "target") || {}).usdRate) || 12050;
    const som = (s) => (Number(s.amount) || 0) * ((s.currency || "$") === "$" ? rate : 1);
    const mlnS = (v) => (Math.round((v / 1e6) * 10) / 10).toString().replace(".", ",") + " mln";
    const ym = t.slice(0, 7);
    const done = sales
      .filter((s) => (s.date || "").startsWith(ym) && s.status !== "Bekor qilindi")
      .reduce((a, s) => a + som(s), 0);
    const [y, m, d] = t.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    const left = days - d + 1;
    const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
    const newYest = leads.filter((l) => l.date === yesterday).length;
    const soldYest = sales.filter((s) => s.date === yesterday && s.status !== "Bekor qilindi").length;

    // Kechki eslatma (18:00): faqat muammo bo'lsa yuboriladi
    if (req.query.mode === "evening") {
      const todayCalls = open.filter((l) => l.nextCall === t);
      if (!stale.length && !noDate.length && !todayCalls.length && !overdue.length) return res.status(200).json({ ok: true, sent: false });
      const ev = [
        `🌙 <b>Kechki eslatma</b>`,
        stale.length ? `\n⏰ <b>24 soatdan beri javob berilmagan: ${stale.length} ta</b>` : null,
        ...stale.slice(0, 10).map(line),
        todayCalls.length ? `\n📞 Bugun qo'ng'iroq qilinishi kerak edi: ${todayCalls.length} ta (holati o'zgarmagan)` : null,
        overdue.length ? `⌛ Muddati o'tgan qo'ng'iroqlar: ${overdue.length} ta` : null,
        noDate.length ? `⚠️ Qo'ng'iroq sanasi qo'yilmagan: ${noDate.length} ta` : null,
        ``,
        `👉 https://furnipart-shop.vercel.app/admin`,
      ].filter((x) => x !== null);
      const r = await tg(ev.join("\n"));
      return res.status(200).json({ ok: r.ok, sent: true });
    }

    const parts = [
      `☀️ <b>CRM · ${d}-${MONTHS[m - 1]}</b>`,
      ``,
      `📊 Oylik savdo rejasi: <b>${mlnS(done)} / ${mlnS(target)} so'm</b> (${Math.round((done / target) * 100)}%)${done < target ? ` — kuniga ~${mlnS((target - done) / left)} so'm kerak` : " 🎉"}`,
      `Kecha: ${newYest} ta yangi lid, ${soldYest} ta sotuv`,
      ``,
      calls.length ? `📞 <b>Bugun qo'ng'iroq qilish kerak: ${calls.length} ta</b>` : `📞 Bugun rejadagi qo'ng'iroq yo'q`,
      ...calls.slice(0, 15).map(line),
      calls.length > 15 ? `… yana ${calls.length - 15} ta` : null,
      stale.length ? `\n⏰ 24 soatdan beri javob berilmagan yangi lidlar: <b>${stale.length} ta</b>` : null,
      noDate.length ? `${stale.length ? "" : "\n"}⚠️ Qo'ng'iroq sanasi qo'yilmagan ochiq lidlar: ${noDate.length} ta` : null,
      debts.length ? `\n💰 <b>Qoldiq (mijozlar berishi kerak): ${Object.entries(debtSum).map(([c, v]) => money(v, c)).join(" + ")}</b>` : null,
      ...debts.slice(0, 5).map((s) => `• ${esc(s.name || "Nomsiz")} — ${money(s.rest, s.currency)}`),
      due.length ? `\n🔁 <b>Qayta taklif qilish vaqti kelgan: ${due.length} ta</b>` : null,
      ...due.slice(0, 5).map((c) => `• ${esc(c.name || "Nomsiz")} (${esc(c.type)}) ${c.phone ? esc(c.phone) : ""}`),
      ``,
      `👉 https://furnipart-shop.vercel.app/admin`,
    ].filter((x) => x !== null);

    const r = await tg(parts.join("\n"));
    return res.status(200).json({ ok: r.ok, reason: r.reason, calls: calls.length });
  } catch (e) {
    console.error(e);
    await tg("⚠️ CRM xulosasini tayyorlab bo'lmadi: " + esc(e.message)).catch(() => {});
    return res.status(500).json({ ok: false, reason: e.message });
  }
};
