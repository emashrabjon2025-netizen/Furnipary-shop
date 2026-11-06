// Mahsulot rasmlari: to'liq ekranda kattalashtirish (ikki barmoq bilan, ikki marta bosish),
// surib keyingi rasmga o'tish va video havolasini ichki pleyerga aylantirish.

// ---------- Video havolasi → ichki pleyer ----------
export function videoEmbed(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  let m;
  if ((m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{6,})/))) {
    const vertical = /shorts\//.test(u);
    return frame(`https://www.youtube.com/embed/${m[1]}?playsinline=1&rel=0`, vertical ? "9/16" : "16/9");
  }
  if ((m = u.match(/instagram\.com\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]+)/))) {
    const kind = m[1] === "reels" ? "reel" : m[1];
    return frame(`https://www.instagram.com/${kind}/${m[2]}/embed/`, "9/15", true);
  }
  if ((m = u.match(/t\.me\/([\w]+\/\d+)/))) {
    return frame(`https://t.me/${m[1]}?embed=1&mode=tme`, "4/5", true);
  }
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u)) {
    return `<div class="pd-video"><video src="${attr(u)}" controls playsinline preload="metadata"></video></div>`;
  }
  return `<a class="btn btn-line pd-video-link" href="${attr(u)}" target="_blank" rel="noopener">▶ Videoni ko'rish</a>`;
}
const attr = (s) => String(s).replace(/[&"<>]/g, (c) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c]);
const frame = (src, ratio, scroll) =>
  `<div class="pd-video" style="aspect-ratio:${ratio}"><iframe src="${attr(src)}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen ${scroll ? "" : 'scrolling="no"'} title="Mahsulot videosi"></iframe></div>`;

// ---------- To'liq ekran ko'ruvchi ----------
let dlg, img, counter, prevBtn, nextBtn;
let list = [];
let idx = 0;
let scale = 1, tx = 0, ty = 0;
const pts = new Map();
let pinch0 = null, pan0 = null, swipe0 = null, lastTap = 0;

function build() {
  if (dlg) return;
  dlg = document.createElement("dialog");
  dlg.className = "zoom";
  dlg.innerHTML = `
    <button class="zoom-x" type="button" aria-label="Yopish">×</button>
    <div class="zoom-stage"><img alt="" draggable="false" /></div>
    <button class="zoom-nav prev" type="button" aria-label="Oldingi">‹</button>
    <button class="zoom-nav next" type="button" aria-label="Keyingi">›</button>
    <div class="zoom-count"></div>
    <div class="zoom-hint">Ikki barmoq bilan kattalashtiring · ikki marta bosing</div>`;
  document.body.appendChild(dlg);
  img = dlg.querySelector("img");
  counter = dlg.querySelector(".zoom-count");
  prevBtn = dlg.querySelector(".prev");
  nextBtn = dlg.querySelector(".next");
  dlg.querySelector(".zoom-x").addEventListener("click", () => dlg.close());
  prevBtn.addEventListener("click", () => go(-1));
  nextBtn.addEventListener("click", () => go(1));
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  });
  const stage = dlg.querySelector(".zoom-stage");
  stage.addEventListener("pointerdown", down);
  stage.addEventListener("pointermove", move);
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
  }, { passive: false });
}

function apply(anim) {
  img.style.transition = anim ? "transform .2s ease" : "none";
  img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}
function clampPan() {
  const nw = img.naturalWidth || innerWidth, nh = img.naturalHeight || innerHeight;
  const base = Math.min(innerWidth / nw, innerHeight / nh);
  const w = nw * base * scale, h = nh * base * scale;
  const maxX = Math.max(0, (w - innerWidth) / 2), maxY = Math.max(0, (h - innerHeight) / 2);
  tx = Math.min(maxX, Math.max(-maxX, tx));
  ty = Math.min(maxY, Math.max(-maxY, ty));
}
function zoomAt(s, cx, cy) {
  const ns = Math.min(5, Math.max(1, s));
  const ox = cx - innerWidth / 2, oy = cy - innerHeight / 2;
  tx = ox - ((ox - tx) * ns) / scale;
  ty = oy - ((oy - ty) * ns) / scale;
  scale = ns;
  if (scale === 1) tx = ty = 0;
  apply();
  clampPan();
  apply();
}
function reset() {
  scale = 1; tx = 0; ty = 0;
  apply();
}
function show() {
  reset();
  img.src = list[idx];
  counter.textContent = list.length > 1 ? `${idx + 1} / ${list.length}` : "";
  prevBtn.hidden = nextBtn.hidden = list.length < 2;
}
function go(d) {
  if (list.length < 2) return;
  idx = (idx + d + list.length) % list.length;
  show();
}

function down(e) {
  e.currentTarget.setPointerCapture(e.pointerId);
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), s: scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    swipe0 = pan0 = null;
  } else if (pts.size === 1) {
    if (scale > 1) pan0 = { x: e.clientX, y: e.clientY, tx, ty };
    else swipe0 = { x: e.clientX, y: e.clientY, t: Date.now() };
  }
}
function move(e) {
  if (!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch0 && pts.size === 2) {
    const [a, b] = [...pts.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const target = (pinch0.s * d) / pinch0.d;
    scale = pinch0.s; // zoomAt nisbatan hisoblaydi
    zoomAt(target, pinch0.cx, pinch0.cy);
  } else if (pan0) {
    tx = pan0.tx + (e.clientX - pan0.x);
    ty = pan0.ty + (e.clientY - pan0.y);
    clampPan();
    apply();
  } else if (swipe0) {
    img.style.transition = "none";
    img.style.transform = `translate(${e.clientX - swipe0.x}px, 0)`;
  }
}
function up(e) {
  pts.delete(e.pointerId);
  if (pts.size < 2) pinch0 = null;
  if (swipe0 && pts.size === 0) {
    const dx = e.clientX - swipe0.x, dy = e.clientY - swipe0.y;
    const quick = Date.now() - swipe0.t < 250 && Math.abs(dx) < 10 && Math.abs(dy) < 10;
    swipe0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) return go(dx < 0 ? 1 : -1);
    if (dy > 120 && Math.abs(dy) > Math.abs(dx)) return dlg.close();
    apply(true);
    if (quick) {
      const now = Date.now();
      if (now - lastTap < 300) {
        zoomAt(scale > 1 ? 1 : 2.5, e.clientX, e.clientY);
        apply(true);
        lastTap = 0;
      } else lastTap = now;
    }
  }
  if (pts.size === 0) pan0 = null;
}

export function openZoom(sources, start = 0) {
  list = sources.filter(Boolean);
  if (!list.length) return;
  build();
  idx = Math.min(Math.max(0, start), list.length - 1);
  show();
  if (!dlg.open) dlg.showModal();
}

// Galereyada rasm ochilgandan keyin to'liq sifatli nusxasi kelsa — almashtirish
export function updateZoomSource(i, src) {
  if (!list[i]) return;
  list[i] = src;
  if (dlg && dlg.open && idx === i && scale === 1) img.src = src;
}
