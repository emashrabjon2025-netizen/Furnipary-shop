// Admin → Hisobot: yetkazib berilgan joylar bo'yicha hisobot (shahar/tuman, kuryer, summa)
import { ADMIN_UIDS } from "./config.js";
import { db, auth, collection, doc, onSnapshot, onAuthStateChanged } from "./firebase.js";
import { $, escapeHtml as esc } from "./util.js";
import { areaOf, setCustomAreas } from "./areas.js";

let sales = [];
let couriers = [];
let unsub = [];

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtSom = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " mln so'm" : Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ") + " so'm");
const fmtUsd = (n) => "$" + (Math.round(n * 100) / 100).toLocaleString("ru-RU").replace(/,/g, " ");
const sum = (arr) => {
  const som = arr.filter((s) => s.currency !== "$").reduce((a, s) => a + (Number(s.amount) || 0), 0);
  const usd = arr.filter((s) => s.currency === "$").reduce((a, s) => a + (Number(s.amount) || 0), 0);
  return [som ? fmtSom(som) : "", usd ? fmtUsd(usd) : ""].filter(Boolean).join(" + ") || "0";
};
const deliveredDay = (s) => (s.deliveredAt ? ymd(new Date(s.deliveredAt)) : s.date || "");

// Dastavka paneli orqali qo'shilgan sotuvlar (asosiy savdo rejasiga qo'shilmaydi)
const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const fmtD = (s) => (s ? s.split("-").reverse().slice(0, 2).join(".") : "");
const prod = (s) => {
  const l = String(s.product || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
  return l.length > 1 ? `${l[0]} +${l.length - 1}` : l[0] || (s.hasPhotos ? "📷 rasmda" : "—");
};
function renderDvSales(ym) {
  const box = $("#dvSalesRep");
  if (!box) return;
  const [y, m] = ym.split("-").map(Number);
  $("#dvTitle").textContent = `🚚 Dastavka · ${MONTHS[m - 1]} ${y}`;
  const arr = sales.filter((s) => s.source === "Dastavka" && s.status !== "Bekor qilindi" && (s.date || "").startsWith(ym)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!arr.length) {
    box.innerHTML = `<p class="muted">Bu oyda dastavka panelidan sotuv qo'shilmagan.</p>`;
    return;
  }
  const done = arr.filter((s) => s.status === "Yetkazildi");
  const wait = arr.filter((s) => s.status !== "Yetkazildi");
  const byDay = {};
  arr.forEach((s) => (byDay[s.date] = byDay[s.date] || []).push(s));
  box.innerHTML = `
    <div class="mgrid dr-kpi">
      <div><small>Sotuvlar</small><b>${arr.length} ta</b></div>
      <div><small>Jami summa</small><b>${sum(arr)}</b></div>
      <div><small>Yetkazildi</small><b>${done.length} ta · ${sum(done)}</b></div>
      <div><small>Kutilmoqda</small><b class="${wait.length ? "neg" : ""}">${wait.length} ta · ${sum(wait)}</b></div>
    </div>
    <h3 class="dr-h">📅 Kunlar bo'yicha</h3>
    <div class="ttable-wrap"><table class="ttable"><thead><tr><th>Sana</th><th>Soni</th><th>Summa</th></tr></thead><tbody>${Object.entries(byDay)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([d, v]) => `<tr><td>${fmtD(d)}</td><td>${v.length}</td><td>${sum(v)}</td></tr>`)
      .join("")}</tbody></table></div>
    <h3 class="dr-h">🧾 Sotuvlar ro'yxati</h3>
    <div class="ttable-wrap"><table class="ttable"><thead><tr><th>Sana</th><th>Mijoz</th><th>Mahsulot</th><th>Summa</th><th>Holat</th></tr></thead><tbody>${arr
      .map((s) => `<tr><td>${fmtD(s.date)}</td><td><b>${esc(s.name || "")}</b><div class="small muted">${esc(areaOf(s))}</div></td><td class="small">${esc(prod(s))}</td><td>${sum([s])}</td><td class="small">${s.status === "Yetkazildi" ? "✅" : "⏳"} ${esc(s.status || "")}</td></tr>`)
      .join("")}</tbody></table></div>
    <p class="muted small">Bu sotuvlar asosiy savdo rejasiga qo'shilmaydi. "Sotuvlar" bo'limida ularni "🚚 Dastavka" filtri orqali ko'rish mumkin.</p>`;
}

function render() {
  const box = $("#rDelivery");
  if (!box) return;
  const ym = $("#dvMonth").value || ymd(new Date()).slice(0, 7);
  renderDvSales(ym);
  const live = sales.filter((s) => s.status !== "Bekor qilindi");
  const done = live.filter((s) => s.status === "Yetkazildi" && s.courier && deliveredDay(s).startsWith(ym));
  const waiting = live.filter((s) => s.status !== "Yetkazildi" && s.courier);

  const byArea = {};
  done.forEach((s) => ((byArea[areaOf(s)] = byArea[areaOf(s)] || { done: [], wait: [] }).done.push(s)));
  waiting.forEach((s) => ((byArea[areaOf(s)] = byArea[areaOf(s)] || { done: [], wait: [] }).wait.push(s)));
  const rows = Object.entries(byArea).sort((a, b) => b[1].done.length - a[1].done.length || b[1].wait.length - a[1].wait.length);
  const max = Math.max(1, ...rows.map(([, v]) => v.done.length));

  const byCourier = {};
  done.forEach((s) => {
    const k = s.courier || "";
    (byCourier[k] = byCourier[k] || []).push(s);
  });
  const cName = (id) => (couriers.find((c) => c.id === id) || {}).name || "Kuryer";

  if (!done.length && !waiting.length) {
    box.innerHTML = `<p class="muted">Bu oyda yetkazish yo'q. Sotuvga manzil yozib, kuryer biriktirsangiz — shu yerda shaharlar bo'yicha hisobot chiqadi.</p>`;
    return;
  }
  box.innerHTML = `
    <div class="mgrid dr-kpi">
      <div><small>Yetkazildi</small><b>${done.length} ta</b></div>
      <div><small>Yetkazilgan summa</small><b>${sum(done)}</b></div>
      <div><small>Shahar / tuman</small><b>${Object.values(byArea).filter((v) => v.done.length).length}</b></div>
      <div><small>Hozir kutilmoqda</small><b class="${waiting.length ? "neg" : ""}">${waiting.length} ta</b></div>
    </div>
    <div class="ttable-wrap"><table class="ttable dr-table">
      <thead><tr><th>📍 Shahar / tuman</th><th>Yetkazildi</th><th>Summa</th><th>Kutilmoqda</th></tr></thead>
      <tbody>${rows
        .map(
          ([a, v]) => `<tr>
            <td><b>${esc(a)}</b><div class="dr-bar"><i style="width:${Math.round((v.done.length / max) * 100)}%"></i></div></td>
            <td>${v.done.length}</td>
            <td>${v.done.length ? sum(v.done) : "—"}</td>
            <td class="${v.wait.length ? "neg" : ""}">${v.wait.length || "—"}</td>
          </tr>`
        )
        .join("")}</tbody>
    </table></div>
    ${
      Object.keys(byCourier).length
        ? `<h3 class="dr-h">🚚 Kuryerlar bo'yicha</h3>
      <div class="ttable-wrap"><table class="ttable"><thead><tr><th>Kuryer</th><th>Yetkazdi</th><th>Summa</th><th>Joylar</th></tr></thead><tbody>${Object.entries(byCourier)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([id, arr]) => {
          const places = {};
          arr.forEach((s) => (places[areaOf(s)] = (places[areaOf(s)] || 0) + 1));
          return `<tr><td><b>${esc(cName(id))}</b></td><td>${arr.length}</td><td>${sum(arr)}</td><td class="small">${Object.entries(places)
            .sort((a, b) => b[1] - a[1])
            .map(([p, n]) => `${esc(p)} (${n})`)
            .join(", ")}</td></tr>`;
        })
        .join("")}</tbody></table></div>`
        : ""
    }
    <p class="muted small">Shahar manzil matnidan aniqlanadi; kuryer dastavka panelida buyurtmani boshqa shaharga o'tkazsa — shu yerda ham o'zgaradi. Yetkazilgan sana — kuryer "Yetkazildi" bosgan kun.</p>`;
}

function start() {
  unsub.forEach((u) => u());
  unsub = [
    onSnapshot(collection(db, "crmSales"), (s) => {
      sales = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    }, () => {}),
    onSnapshot(collection(db, "crmCouriers"), (s) => {
      couriers = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    }, () => {}),
    onSnapshot(doc(db, "crmSettings", "cities"), (d) => {
      setCustomAreas(d.exists() ? d.data().list : []);
      render();
    }, () => {}),
  ];
}

$("#dvMonth").value = ymd(new Date()).slice(0, 7);
$("#dvMonth").addEventListener("change", render);
onAuthStateChanged(auth, (user) => {
  if (user && ADMIN_UIDS.includes(user.uid)) start();
  else {
    unsub.forEach((u) => u());
    unsub = [];
  }
});
