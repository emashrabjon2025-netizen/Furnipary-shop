// Admin → "🛏 Matras hisobot": matras savdosi asosiy rejadan alohida hisoblanadi.
import { ADMIN_UIDS } from "./config.js";
import { db, auth, collection, doc, setDoc, onSnapshot, onAuthStateChanged } from "./firebase.js";
import { $, escapeHtml as esc, toast } from "./util.js";

const DEFAULT_PLAN = 150;
const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
let sales = [];
let clients = [];
let sellers = [];
let plan = DEFAULT_PLAN;
let usdRate = 12050;
let unsub = [];

const pad = (n) => String(n).padStart(2, "0");
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const isMatras = (s) => s.category === "matras" || s.source === "Matras panel";
const qty = (s) => Number(s.qty) || 1;
const som = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " mln" : Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ")) + " so'm";
const usd = (n) => "$" + (Math.round(n * 100) / 100).toLocaleString("ru-RU").replace(/,/g, " ");
const sumCur = (arr, f = "amount") => ({
  som: arr.filter((s) => s.currency !== "$").reduce((a, s) => a + (Number(s[f]) || 0), 0),
  usd: arr.filter((s) => s.currency === "$").reduce((a, s) => a + (Number(s[f]) || 0), 0),
});
const curText = (c) => [c.usd ? usd(c.usd) : "", c.som ? som(c.som) : ""].filter(Boolean).join(" + ") || "0";
const inSom = (c) => c.som + c.usd * usdRate;

function bars(rows, unit = "") {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return rows.length
    ? rows
        .map(
          ([label, v, extra]) => `<div class="bar-row"><span>${esc(label)}</span><div class="bar"><i style="width:${(v / max) * 100}%"></i></div><b>${v}${unit}${extra ? ` <small>${extra}</small>` : ""}</b></div>`
        )
        .join("")
    : `<p class="muted">Ma'lumot yo'q</p>`;
}

function render() {
  if (!$("#mrMonth")) return;
  const ym = $("#mrMonth").value || thisMonth();
  const [y, m] = ym.split("-").map(Number);
  $("#mrTitle").textContent = `🛏 Matras savdosi — ${MONTHS[m - 1]} ${y}`;
  const live = sales.filter((s) => isMatras(s) && s.status !== "Bekor qilindi");
  const ms = live.filter((s) => (s.date || "").startsWith(ym));

  // Reja (dona)
  const sold = ms.reduce((a, s) => a + qty(s), 0);
  const pct = Math.min(100, Math.round((sold / plan) * 100));
  const days = new Date(y, m, 0).getDate();
  const isCur = ym === thisMonth();
  const dayNow = isCur ? new Date().getDate() : days;
  const left = isCur ? days - dayNow + 1 : 0;
  const expected = Math.round((plan * dayNow) / days);
  $("#mrPlan").innerHTML = `
    <div class="plan-top">
      <div><small>Oylik matras rejasi (asosiy savdodan alohida)</small><div class="big-num">${sold}<span> / ${plan} dona</span></div></div>
      <button class="btn btn-sm btn-line" id="mrPlanEdit" type="button">Rejani o'zgartirish</button>
    </div>
    <div class="progress"><i style="width:${pct}%"></i><em style="left:${Math.min(100, (expected / plan) * 100)}%"></em></div>
    <p class="muted">${pct}% bajarildi${isCur ? (sold >= plan ? " · 🎉 Reja bajarildi!" : ` · qolgan ${left} kunda kuniga ~${Math.ceil((plan - sold) / Math.max(1, left))} ta kerak · bugungacha ${expected} ta bo'lishi kerak edi ${sold >= expected ? "✅" : "⚠️"}`) : ""}</p>`;

  // Ko'rsatkichlar
  const tot = sumCur(ms);
  const paid = sumCur(ms, "paid");
  const rest = { som: tot.som - paid.som, usd: tot.usd - paid.usd };
  const avg = ms.length ? inSom(tot) / ms.length : 0;
  $("#mrKpi").innerHTML = `
    <div><small>Sotilgan matras</small><b>${sold} dona</b></div>
    <div><small>Sotuvlar soni</small><b>${ms.length}</b></div>
    <div><small>Savdo summasi</small><b>${curText(tot)}</b>${tot.usd ? `<small class="muted">≈ ${som(inSom(tot))}</small>` : ""}</div>
    <div><small>Olingan pul</small><b>${curText(paid)}</b></div>
    <div><small>Qoldiq</small><b class="${rest.som || rest.usd ? "neg" : ""}">${curText(rest)}</b></div>
    <div><small>O'rtacha chek</small><b>${som(avg)}</b></div>`;

  // Kunlik (dona)
  const perDay = Array.from({ length: days }, (_, i) => ms.filter((s) => s.date === `${ym}-${pad(i + 1)}`).reduce((a, s) => a + qty(s), 0));
  const mx = Math.max(1, ...perDay);
  $("#mrDaily").className = "daily";
  $("#mrDaily").innerHTML = perDay.map((v, i) => `<div class="col" title="${i + 1}-kun: ${v} dona"><i style="height:${(v / mx) * 100}%"></i><small>${(i + 1) % 5 === 0 || i === 0 ? i + 1 : ""}</small></div>`).join("");

  // Model / o'lcham
  const byModel = {};
  ms.forEach((s) => {
    const k = [s.model || (s.product || "").replace(/^matras\s*/i, "") || "Noma'lum", s.size].filter(Boolean).join(" · ");
    byModel[k] = (byModel[k] || 0) + qty(s);
  });
  $("#mrModels").innerHTML = bars(Object.entries(byModel).sort((a, b) => b[1] - a[1]).slice(0, 12), " ta");

  // Sotuvchilar
  const bySeller = {};
  ms.forEach((s) => {
    const k = s.sellerName || (s.seller ? (sellers.find((x) => x.id === s.seller) || {}).name || "Sotuvchi" : s.operatorName ? `${s.operatorName} (operator)` : "Admin / do'kon");
    (bySeller[k] = bySeller[k] || []).push(s);
  });
  $("#mrSellers").innerHTML = bars(
    Object.entries(bySeller)
      .map(([k, arr]) => [k, arr.reduce((a, s) => a + qty(s), 0), curText(sumCur(arr))])
      .sort((a, b) => b[1] - a[1]),
    " ta"
  );

  // Manba
  const bySrc = {};
  ms.forEach((s) => {
    const k = s.source === "Matras panel" ? "Matras paneli" : s.operator ? "Operator" : s.source || "Admin CRM";
    bySrc[k] = (bySrc[k] || 0) + qty(s);
  });
  $("#mrSources").innerHTML = bars(Object.entries(bySrc).sort((a, b) => b[1] - a[1]), " ta");

  // Mijozlar bazasi (matras paneli)
  const st = {};
  clients.forEach((c) => (st[c.status || "Yangi"] = (st[c.status || "Yangi"] || 0) + 1));
  const newThisMonth = clients.filter((c) => {
    const t = c.createdAt && typeof c.createdAt.toMillis === "function" ? new Date(c.createdAt.toMillis()) : null;
    return t && `${t.getFullYear()}-${pad(t.getMonth() + 1)}` === ym;
  }).length;
  const inProc = clients.reduce((a, c) => a + (Number(c.inProcess) || 0), 0);
  $("#mrBase").innerHTML = clients.length
    ? `<p class="small">Jami <b>${clients.length}</b> mijoz · bu oy qo'shilgan <b>${newThisMonth}</b> · jarayonda <b>${inProc}</b> matras</p>` +
      bars(["Yangi", "Gaplashildi", "Jarayonda", "Oldi", "Doimiy mijoz", "Rad etdi"].filter((k) => st[k]).map((k) => [k, st[k]]))
    : `<p class="muted">Matras panelida hali mijoz yo'q</p>`;

  // Qoldiq (barcha oylar)
  const debts = live
    .map((s) => ({ ...s, rest: (Number(s.amount) || 0) - (Number(s.paid) || 0) }))
    .filter((s) => s.rest > 0.009)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  $("#mrDebts").innerHTML = debts.length
    ? debts
        .slice(0, 15)
        .map((s) => `<div class="mt-debt"><span><b>${esc(s.name || "")}</b><br><small class="muted">${esc(s.phone || "")} · ${(s.date || "").split("-").reverse().join(".")}</small></span><b class="neg">${s.currency === "$" ? usd(s.rest) : som(s.rest)}</b></div>`)
        .join("") + (debts.length > 15 ? `<p class="muted small">… yana ${debts.length - 15} ta</p>` : "")
    : `<p class="muted">Qoldiq yo'q 👍</p>`;
}

document.addEventListener("click", async (e) => {
  if (e.target.id !== "mrPlanEdit") return;
  const n = Number(prompt("Oylik matras rejasi (dona):", String(plan)));
  if (!n || n < 1) return;
  await setDoc(doc(db, "crmSettings", "matras"), { plan: Math.round(n) }, { merge: true }).then(() => toast("Reja saqlandi")).catch((er) => toast(er.message, "err"));
});

function start() {
  $("#mrMonth").value = thisMonth();
  $("#mrMonth").addEventListener("change", render);
  unsub.forEach((u) => u());
  unsub = [
    onSnapshot(collection(db, "crmSales"), (s) => {
      sales = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    }, () => {}),
    onSnapshot(collection(db, "matrasClients"), (s) => {
      clients = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    }, () => {}),
    onSnapshot(collection(db, "crmMatras"), (s) => {
      sellers = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    }, () => {}),
    onSnapshot(doc(db, "crmSettings", "matras"), (d) => {
      plan = (d.exists() && Number(d.data().plan)) || DEFAULT_PLAN;
      render();
    }, () => {}),
    onSnapshot(doc(db, "crmSettings", "target"), (d) => {
      if (d.exists() && Number(d.data().usdRate)) usdRate = Number(d.data().usdRate);
      render();
    }, () => {}),
  ];
}

onAuthStateChanged(auth, (user) => {
  if (user && ADMIN_UIDS.includes(user.uid)) start();
  else {
    unsub.forEach((u) => u());
    unsub = [];
  }
});
