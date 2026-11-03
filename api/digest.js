// Har kuni ertalab (09:00 Toshkent) Telegram'ga CRM xulosasini yuboradi.
// Vercel Cron chaqiradi (vercel.json → crons). Qo'lda sinash: /api/digest?key=<CRM_LEAD_TOKEN>
const { list, today, esc, tg } = require("./_crm");

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
    const [leads, sales, settings] = await Promise.all([
      list("crmLeads"),
      list("crmSales"),
      list("crmSettings").catch(() => []),
    ]);
    const open = leads.filter((l) => !CLOSED.includes(l.stage));
    const calls = open.filter((l) => l.nextCall && l.nextCall <= t).sort((a, b) => a.nextCall.localeCompare(b.nextCall));
    const noDate = open.filter((l) => !l.nextCall);
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
    const cat = st.targetCategory || "matras";
    const target = Number(st.monthlyTarget) || 150;
    const ym = t.slice(0, 7);
    const done = sales
      .filter((s) => (s.date || "").startsWith(ym) && s.status !== "Bekor qilindi" && s.category === cat)
      .reduce((a, s) => a + (Number(s.qty) || 0), 0);
    const [y, m, d] = t.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    const left = days - d + 1;
    const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
    const newYest = leads.filter((l) => l.date === yesterday).length;
    const soldYest = sales.filter((s) => s.date === yesterday && s.status !== "Bekor qilindi").length;

    const parts = [
      `☀️ <b>CRM · ${d}-${MONTHS[m - 1]}</b>`,
      ``,
      `📊 Reja (${cat}): <b>${done} / ${target}</b>${done < target ? ` — kuniga ~${Math.ceil((target - done) / left)} ta kerak` : " 🎉"}`,
      `Kecha: ${newYest} ta yangi lid, ${soldYest} ta sotuv`,
      ``,
      calls.length ? `📞 <b>Bugun qo'ng'iroq qilish kerak: ${calls.length} ta</b>` : `📞 Bugun rejadagi qo'ng'iroq yo'q`,
      ...calls.slice(0, 15).map(line),
      calls.length > 15 ? `… yana ${calls.length - 15} ta` : null,
      noDate.length ? `\n⚠️ Qo'ng'iroq sanasi qo'yilmagan ochiq lidlar: ${noDate.length} ta` : null,
      debts.length ? `\n💰 <b>Qoldiq (mijozlar berishi kerak): ${Object.entries(debtSum).map(([c, v]) => money(v, c)).join(" + ")}</b>` : null,
      ...debts.slice(0, 5).map((s) => `• ${esc(s.name || "Nomsiz")} — ${money(s.rest, s.currency)}`),
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
