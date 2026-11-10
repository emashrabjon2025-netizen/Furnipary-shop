// Panellarni telefonga ilova sifatida o'rnatish: service worker + "📲 O'rnatish" tugmasi
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

let evt = null;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  evt = e;
});

if (!standalone) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-sm btn-ghost pwa-btn";
  btn.textContent = "📲 O'rnatish";
  const bar = document.querySelector(".topbar-in");
  const out = document.getElementById("logout");
  if (bar) bar.insertBefore(btn, out || null);

  const dlg = document.createElement("dialog");
  dlg.className = "sheet";
  document.body.appendChild(dlg);
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest("[data-x]")) dlg.close();
  });
  const name = document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content || "FURNIPART";
  btn.addEventListener("click", async () => {
    if (evt) {
      evt.prompt();
      evt = null;
      return;
    }
    dlg.innerHTML = `<button class="x" data-x type="button" aria-label="Yopish">×</button>
      <h2>📲 "${name}" ilovasini o'rnatish</h2>
      ${
        isIOS
          ? `<ol class="pwa-steps">
              <li><b>Safari</b>'da oching (Chrome'da emas)</li>
              <li>Pastdagi <b>Ulashish</b> tugmasini bosing <span class="pwa-ic">⬆︎</span></li>
              <li>Ro'yxatdan <b>"Bosh ekranga qo'shish"</b> (На экран «Домой») ni tanlang</li>
              <li>O'ng tepada <b>"Qo'shish"</b> ni bosing</li>
            </ol>`
          : `<ol class="pwa-steps">
              <li><b>Chrome</b>'da oching</li>
              <li>O'ng tepadagi <b>⋮</b> menyuni bosing</li>
              <li><b>"Ilovani o'rnatish"</b> yoki <b>"Bosh ekranga qo'shish"</b> ni tanlang</li>
            </ol>`
      }
      <p class="muted">Telefoningizda <b>${name}</b> belgisi paydo bo'ladi — u alohida ilova kabi, manzil satrisiz ochiladi. Birinchi marta ochganda login va parolni bir marta kiritasiz.</p>
      <button class="btn btn-dark btn-block" data-x type="button">Tushunarli</button>`;
    dlg.showModal();
  });
}
