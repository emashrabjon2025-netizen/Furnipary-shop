// FURNIPART — animatsiyali (3D) karusel slaydlari. render.py har slaydni alohida yuklaydi:
// window.setup(slide, meta) -> dur;  window.renderAt(t) -> kadr.
import * as THREE from 'three';
import { RoomEnvironment } from '../mebel_video/vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from '../mebel_video/vendor/RoundedBoxGeometry.js';

const W = 1080, H = 1350, Y = '#FFE135';
const RS = +(new URLSearchParams(location.search).get('rs') || 0.75);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(Math.round(W * RS), Math.round(H * RS), false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 100);
const key = new THREE.DirectionalLight(0xfff1dc, 2.3); key.position.set(3, 6, 4); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 5; key.shadow.bias = -0.0004;
Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: .5, far: 20 }); scene.add(key);
const rim = new THREE.DirectionalLight(0xffe135, 1.2); rim.position.set(-4, 3, -3); scene.add(rim);
scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, .4));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .35 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

// ---------- helpers ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eOut = x => 1 - Math.pow(1 - x, 3);
const eIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const eBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * t;
// 0 -> 1 -> 0 : ochilib-yopilish (a..b ochiladi, c..d yopiladi)
const pulse = (t, a, b, c, d, e = eIO) => e(seg(t, a, b)) - e(seg(t, c, d));
function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function ctex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }
const rgb = c => { const k = new THREE.Color(c); return [k.r * 255, k.g * 255, k.b * 255]; };
function woodTex(light, dark, seed) {
  return ctex(1024, 512, (g, w, h) => {
    const im = g.createImageData(w, h), L = rgb(light), D = rgb(dark), r = rng(seed);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = y * .07 + 1.1 * Math.sin(x * .0025 + y * .006) + .35 * Math.sin(x * .009 + y * .03);
      const f = clamp(Math.pow(.5 + .5 * Math.sin(s * 2.3), 5) * .5 + .25 * (.5 + .5 * Math.sin(s * 9)) + (r() - .5) * .08), i = (y * w + x) * 4;
      im.data[i] = lerp(L[0], D[0], f); im.data[i + 1] = lerp(L[1], D[1], f); im.data[i + 2] = lerp(L[2], D[2], f); im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  });
}
const OAK = woodTex('#d9b98c', '#a87c4f', 2);
const M = {};
function mat(s) {
  if (M[s]) return M[s];
  let m;
  if (s === 'oak') { const t = OAK.clone(); t.needsUpdate = true; m = new THREE.MeshStandardMaterial({ map: t, roughness: .55 }); }
  else if (s === 'white') m = new THREE.MeshStandardMaterial({ color: '#f1efea', roughness: .45 });
  else if (s === 'inner') m = new THREE.MeshStandardMaterial({ color: '#dedbd4', roughness: .6 });
  else if (s === 'fasad') m = new THREE.MeshStandardMaterial({ color: '#2f3a36', roughness: .35 });
  else if (s === 'chrome') m = new THREE.MeshStandardMaterial({ color: '#e9ecf0', roughness: .15, metalness: 1 });
  else if (s === 'metal') m = new THREE.MeshStandardMaterial({ color: '#9da1a8', roughness: .3, metalness: 1 });
  else if (s === 'yellow') m = new THREE.MeshStandardMaterial({ color: Y, roughness: .4 });
  else if (s === 'ghost') m = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: .5, transparent: true, opacity: .28, depthWrite: false });
  else m = new THREE.MeshStandardMaterial({ color: s, roughness: .45 });
  return (M[s] = m);
}
function sh(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }
const box = (sx, sy, sz, m, x = 0, y = 0, z = 0) => { const b = sh(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), typeof m === 'string' ? mat(m) : m)); b.position.set(x, y, z); return b; };
const cyl = (r, h, m, x = 0, y = 0, z = 0, seg = 28) => { const c = sh(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), typeof m === 'string' ? mat(m) : m)); c.position.set(x, y, z); return c; };
function anchor(p, x, y, z) { const a = new THREE.Object3D(); a.position.set(x, y, z); p.add(a); return a; }
function setOpacity(o, a) { o.traverse(m => { if (!m.isMesh) return; [].concat(m.material).forEach(x => { if (x.userData.b == null) { x.userData.b = x.opacity; x.userData.t = x.transparent; } x.transparent = a < 1 || x.userData.t; x.opacity = x.userData.b * a; }); m.visible = a > 0.02; }); }

// idishlar: banka, likopcha, kastryul, butilka
const ITEM_COLS = ['#d64545', '#3a7bd5', '#f2a33a', '#3fae6a', '#8e5bd0', '#e8e4da', '#c0392b', '#2c3e50'];
function item(kind, ci = 0) {
  const g = new THREE.Group(), c = ITEM_COLS[ci % ITEM_COLS.length];
  if (kind === 'jar') { g.add(cyl(.045, .13, c, 0, .065)); g.add(cyl(.047, .025, 'chrome', 0, .14)); }
  else if (kind === 'bottle') { g.add(cyl(.035, .17, c, 0, .085)); g.add(cyl(.015, .06, c, 0, .2)); }
  else if (kind === 'pot') { g.add(cyl(.085, .1, '#3b3d42', 0, .05, 0, 36)); g.add(box(.06, .012, .02, 'metal', .11, .085, 0)); }
  else if (kind === 'plates') { for (let i = 0; i < 5; i++) g.add(cyl(.09, .012, '#f4f2ee', 0, .008 + i * .016, 0, 36)); }
  else if (kind === 'bowl') { g.add(cyl(.065, .06, c, 0, .03, 0, 30)); }
  return g;
}

// ---- burchak (L) shkaf korpusi: "kirish" burchagi (0,0) da, ochiq chorak x>0,z>0 ----
// a: orqaga chuqurlik, b: fasad eni, h: balandlik
function cornerShell({ a = .5, b = .44, h = .78, top = true, cut = 0 } = {}) {
  const g = new THREE.Group(), th = .022, y0 = .08, parts = [], add = (m, from) => { m.userData.home = m.position.clone(); m.userData.from = new THREE.Vector3(...from); g.add(m); parts.push(m); return m; };
  const L = a + b;
  add(box(L, h, th, 'white', (b - a) / 2, y0 + h / 2, -a + th / 2), [0, 0, -1.4]);                       // orqa
  add(box(th, h, L - th, 'white', -a + th / 2, y0 + h / 2, (b - a) / 2 + th / 2), [-1.4, 0, 0]);          // chap
  add(box(th, h, a - th, 'white', b - th / 2, y0 + h / 2, -a / 2 - th / 2 + th), [1.4, 0, 0]);            // o'ng yon
  add(box(a - th, h, th, 'white', -a / 2 + th / 2, y0 + h / 2, b - th / 2), [0, 0, 1.4]);                 // old yon
  add(box(L - th, th, a - th, 'inner', (b - a) / 2 + th / 2, y0 + th / 2, -a / 2 + th / 2), [0, -1.2, 0]); // tub 1
  add(box(a - th, th, b, 'inner', -a / 2 + th / 2, y0 + th / 2, b / 2), [0, -1.2, 0]);                    // tub 2
  add(box(L + .03, .02, .06, '#1c1c1e', (b - a) / 2, .04, -a + .03 - .0), [0, -1, 0]);                     // tsokol (orqa ko'rinmaydi)
  if (top) {
    add(box(L + .04, .04, a + .02, 'oak', (b - a) / 2, y0 + h + .02, -a / 2 + .01 + .02 - cut), [0, 1.3, 0]);
    add(box(a + .02, .04, b + .02, 'oak', -a / 2 + .01, y0 + h + .02, b / 2 + .02), [0, 1.3, 0]);
  }
  return { g, parts, y0, h, a, b };
}

// sim savat (magic corner uchun)
function basket(w, d, hgt) {
  const g = new THREE.Group(), r = .006;
  g.add(box(w, .008, d, 'metal', 0, .004, 0));
  const rod = (len, x, y, z, rotZ = 0, rotX = 0) => { const c = cyl(r, len, 'chrome', x, y, z, 10); c.rotation.z = rotZ; c.rotation.x = rotX; g.add(c); };
  [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].forEach(([x, z]) => rod(hgt, x, hgt / 2, z));
  [hgt * .5, hgt].forEach(y => { rod(w, 0, y, -d / 2, Math.PI / 2); rod(w, 0, y, d / 2, Math.PI / 2); rod(d, -w / 2, y, 0, 0, Math.PI / 2); rod(d, w / 2, y, 0, 0, Math.PI / 2); });
  for (let i = 1; i < 6; i++) rod(d, -w / 2 + i * w / 6, .01, 0, 0, Math.PI / 2);
  return g;
}

// ---------- slaydlar ----------
const S = {};

// MUQOVA: burchak shkafi yig'iladi, ichida karusel aylanadi, keyin qismlar tarqaladi (sikl)
S.cover = () => {
  const c = cornerShell(), g = c.g, sus = susan(c);
  g.add(sus.grp);
  return {
    group: g, dur: 4.8, cam: { pos: [2.5, 2.0, 2.6], target: [.0, .62, .0], zoom: 1.55 }, labels: [],
    update(t, dur) {
      // 0 s da toʻliq yigʻilgan (Instagram lentadagi muqova kadri shu), oʻrtada qismlarga ajralib qayta yigʻiladi
      c.parts.forEach((p, i) => { const k = 1 - pulse(t, 2.3 + i * .03, 2.9 + i * .03, 3.3 + i * .05, 4.0 + i * .05); p.position.copy(p.userData.from).multiplyScalar((1 - k) * .28).add(p.userData.home); });
      sus.grp.rotation.y = eIO(seg(t, .3, 2.4)) * Math.PI * 2;
      g.rotation.y = Math.sin(t / dur * Math.PI * 2) * .12;
    }
  };
};

function susan(c) {
  const grp = new THREE.Group(), R = .4, y0 = c.y0;
  const shelfM = new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: .5 });
  [.06, .43].forEach((yy, li) => {
    const s = sh(new THREE.Mesh(new THREE.CylinderGeometry(R, R, .02, 64, 1, false, Math.PI / 2, Math.PI * 1.5), shelfM)); s.position.y = y0 + yy; grp.add(s);
    const rimG = new THREE.TorusGeometry(R, .008, 8, 64, Math.PI * 1.5); const rimM = sh(new THREE.Mesh(rimG, mat('chrome')));
    rimM.rotation.x = Math.PI / 2; rimM.rotation.z = Math.PI; rimM.position.y = y0 + yy + .035; grp.add(rimM);
    // idishlar 270° bo'ylab
    const kinds = li ? ['jar', 'bottle', 'jar', 'bowl', 'bottle', 'jar'] : ['pot', 'plates', 'pot', 'bowl', 'plates'];
    kinds.forEach((k, i) => { const ang = Math.PI / 2 + .35 + i * (Math.PI * 1.5 - .7) / (kinds.length - 1), rr = k === 'pot' || k === 'plates' ? .25 : .28; const it = item(k, i + li * 3); it.position.set(Math.sin(ang) * rr, y0 + yy + .01, Math.cos(ang) * rr); grp.add(it); });
  });
  grp.add(cyl(.016, c.h - .04, 'chrome', 0, y0 + c.h / 2));
  // chorakka biriktirilgan ikki fasad (shkaf bilan birga aylanadi)
  const fh = c.h - .02;
  const dA = box(c.b - .006, fh, .02, 'fasad', c.b / 2, y0 + c.h / 2, .012); const dB = box(.02, fh, c.b - .006, 'fasad', .012, y0 + c.h / 2, c.b / 2);
  dA.add(box(.24, .02, .02, 'chrome', .0, fh / 2 - .07, .025)); dB.add(box(.02, .02, .24, 'chrome', .025, fh / 2 - .07, 0));
  grp.add(dA, dB);
  return { grp, dA };
}

// 01 — karusel polkalar: fasadlar bilan birga 360° aylanadi
S.susan = () => {
  const c = cornerShell(), g = c.g, s = susan(c); g.add(s.grp);
  const lab = { obj: anchor(s.grp, -.3, c.y0 + .5, -.1), text: '360° aylanadi', style: 'yel', at: .9, side: 'left', until: 4.6 };
  const lab2 = { obj: anchor(s.dA, .1, .1, .02), text: 'Eshik bilan birga', style: 'wht', at: .3, side: 'right', until: 1.2 };
  return {
    group: g, dur: 5.6, cam: { pos: [2.3, 1.75, 2.3], target: [-.02, .42, -.02], zoom: 1.4 }, labels: [lab2, lab],
    update(t, dur) { s.grp.rotation.y = eIO(seg(t, .9, dur - .6)) * Math.PI * 2; g.rotation.y = Math.sin(t / dur * Math.PI * 2) * .1; }
  };
};

// 02 — magic corner: eshik ochiladi, old savatlar chiqadi, orqadagilar oldinga suriladi
S.magic = () => {
  const g = new THREE.Group(), Wd = 1.0, D = .6, Hh = .78, y0 = .08, th = .022;
  const korpus = [box(Wd, Hh, th, 'white', 0, y0 + Hh / 2, -D / 2 + th / 2), box(th, Hh, D, 'white', -Wd / 2 + th / 2, y0 + Hh / 2, 0), box(th, Hh, D, 'white', Wd / 2 - th / 2, y0 + Hh / 2, 0),
    box(Wd, th, D, 'inner', 0, y0 + th / 2, 0), box(Wd + .04, .04, D + .04, 'oak', 0, y0 + Hh + .02, .02), box(Wd, .07, .02, '#1c1c1e', 0, .035, D / 2 - .05)];
  korpus.forEach(k => g.add(k));
  // ko'r burchak: qo'shni shkaf fasadi (yopiq qism)
  const blind = box(Wd / 2, Hh - .02, .02, 'fasad', Wd / 4, y0 + Hh / 2, D / 2 + .012); g.add(blind);
  const shade = box(Wd / 2 - .03, Hh - .1, .004, new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: .0 }), Wd / 4, y0 + Hh / 2, D / 2 + .024); g.add(shade);
  // eshik (chapdan ilgak)
  const hinge = new THREE.Group(); hinge.position.set(-Wd / 2, y0 + Hh / 2, D / 2 + .012); g.add(hinge);
  const door = box(Wd / 2 - .005, Hh - .02, .02, 'fasad', Wd / 4, 0, 0); hinge.add(door); door.add(box(.02, .26, .025, 'chrome', Wd / 4 - .06, .2, .02));
  // savatlar
  const mk = (x, z, seed) => { const u = new THREE.Group(); [.12, .44].forEach((yy, i) => { const b = basket(.4, .42, .1); b.position.y = y0 + yy; ['jar', 'bottle', 'bowl', 'jar'].forEach((k, j) => { const it = item(k, seed + i * 2 + j); it.position.set(-.13 + j * .088, .008, (j % 2 ? .08 : -.08)); it.scale.setScalar(.85); b.add(it); }); u.add(b); }); u.position.set(x, 0, z); g.add(u); return u; };
  const front = mk(-Wd / 4, 0, 0), rear = mk(Wd / 4, -.02, 3);
  const labels = [
    { obj: anchor(front, -.1, y0 + .6, .2), text: 'Old savatlar chiqadi', style: 'yel', at: 1.6, side: 'left', until: 4.1 },
    { obj: anchor(rear, .05, y0 + .6, .1), text: 'Orqadagilar suriladi', style: 'wht', at: 2.6, side: 'right', until: 4.3 },
    { obj: anchor(blind, 0, .1, .02), text: "Ko'r burchak", style: 'red', at: .1, side: 'right', until: 1.3 }];
  return {
    group: g, dur: 6.6, cam: { pos: [-.9, 2.1, 3.1], target: [-.05, .42, .25] }, labels,
    update(t, dur) {
      hinge.rotation.y = -1.92 * pulse(t, .5, 1.4, dur - 1.4, dur - .5);
      const f = pulse(t, 1.2, 2.2, dur - 2.1, dur - 1.2); front.position.set(-Wd / 4 - .08 * f, 0, .64 * f);
      const r = pulse(t, 2.2, 3.1, dur - 3.0, dur - 2.1); rear.position.set(Wd / 4 - Wd / 2 * r, 0, -.02 + .04 * r);
      g.rotation.y = .12 + Math.sin(t / dur * Math.PI * 2) * .07;
    }
  };
};

// 03 — keng ochiladigan petli: oddiy 110° (shaffof) va 165°
S.hinge = () => {
  const g = new THREE.Group(), Wd = .6, D = .58, Hh = .78, y0 = .08, th = .022;
  [box(Wd, Hh, th, 'white', 0, y0 + Hh / 2, -D / 2 + th / 2), box(th, Hh, D, 'white', -Wd / 2 + th / 2, y0 + Hh / 2, 0), box(th, Hh, D, 'white', Wd / 2 - th / 2, y0 + Hh / 2, 0),
    box(Wd, th, D, 'inner', 0, y0 + th / 2, 0), box(Wd - 2 * th, th, D - .03, 'inner', 0, y0 + Hh * .5, 0), box(Wd + .04, .04, D + .04, 'oak', 0, y0 + Hh + .02, .02)].forEach(k => g.add(k));
  [['pot', -.12, .1], ['plates', .12, .1]].forEach(([k, x, y]) => { const it = item(k, 2); it.position.set(x, y0 + y - .07, 0); g.add(it); });
  [['jar', -.15], ['bottle', -.02], ['jar', .13]].forEach(([k, x], i) => { const it = item(k, i + 4); it.position.set(x, y0 + Hh * .5 + .011, -.02); g.add(it); });
  // qo'shni shkaf (chapda, perpendikulyar) — eshik unga urilmasligi kerak
  const nb = new THREE.Group(); nb.add(box(.6, Hh, .58, 'white', 0, y0 + Hh / 2, 0)); nb.add(box(.6, Hh - .02, .02, 'fasad', 0, y0 + Hh / 2, .3)); nb.add(box(.62, .04, .62, 'oak', 0, y0 + Hh + .02, .02));
  nb.position.set(-Wd / 2 - .3, 0, -.0); g.add(nb);
  const mkDoor = (m) => { const hg = new THREE.Group(); hg.position.set(Wd / 2, y0 + Hh / 2, D / 2 + .012); const d = box(Wd - .005, Hh - .02, .02, m, -Wd / 2, 0, 0); hg.add(d); g.add(hg); return { hg, d }; };
  const ghost = mkDoor('ghost'), real = mkDoor('fasad');
  real.d.add(box(.02, .26, .025, 'chrome', -Wd / 2 + .06, .2, .02));
  // petli (kosa + yelka) eshik ichida
  [.28, -.28].forEach(yy => { const cup = cyl(.018, .012, 'chrome', -.05, yy, -.016); cup.rotation.x = Math.PI / 2; real.d.add(cup); real.d.add(box(.07, .012, .012, 'chrome', -.0, yy, -.02)); });
  // pol yoyi
  const arcG = new THREE.Group(); arcG.position.set(Wd / 2, .005, D / 2 + .012); g.add(arcG);
  const mkArc = (deg, col, r) => { const m = new THREE.Mesh(new THREE.RingGeometry(r - .012, r, 64, 1, 0, deg * Math.PI / 180), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true })); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI; arcG.add(m); return m; };
  const a110 = mkArc(110, '#9aa0a6', .5), a165 = mkArc(1, Y, .6);
  let deg = 0;
  const labels = [
    { obj: anchor(arcG, -.5 * Math.cos(110 * Math.PI / 180) * -1, 0, .5 * Math.sin(110 * Math.PI / 180)), text: 'Oddiy 110°', style: 'wht', at: 1.0, side: 'right', until: 4.6 },
    { obj: anchor(real.d, -Wd / 2, .25, .02), text: () => `Keng: ${Math.round(deg)}°`, style: 'yel', at: 1.3, side: 'left', until: 4.6 }];
  return {
    group: g, dur: 5.8, cam: { pos: [.9, 2.5, 2.75], target: [-.15, .42, .3], zoom: 1.85 }, labels,
    update(t, dur) {
      const k1 = pulse(t, .4, 1.2, dur - 1.3, dur - .6); ghost.hg.rotation.y = k1 * 110 * Math.PI / 180; setOpacity(ghost.hg, Math.min(1, k1 * 3));
      const k2 = pulse(t, 1.2, 2.4, dur - 1.6, dur - .6); deg = k2 * 165; real.hg.rotation.y = deg * Math.PI / 180;
      a165.geometry.dispose(); a165.geometry = new THREE.RingGeometry(.588, .6, 64, 1, 0, Math.max(.001, deg) * Math.PI / 180);
      a110.material.opacity = k1; a165.material.opacity = Math.min(1, k2 * 3);
      g.rotation.y = Math.sin(t / dur * Math.PI * 2) * .06;
    }
  };
};

// 04 — burchakli tortmalar: V fasadli tortmalar diagonal bo'ylab chiqadi
S.drawer = () => {
  const c = cornerShell(), g = c.g, a = c.a, b = c.b, hs = [.22, .26, .26], drawers = [];
  let y = c.y0 + .025;
  hs.forEach((hh, i) => {
    const d = new THREE.Group(), cc = .42, t = .015, bh = hh - .05;
    const P = [[b - .01, 0], [0, 0], [0, b - .01], [-cc, b - .01], [-cc, -cc], [b - .01, -cc]];
    const In = [[b - .01 - t, -t], [-t, -t], [-t, b - .01 - t], [-cc + t, b - .01 - t], [-cc + t, -cc + t], [b - .01 - t, -cc + t]];
    const shp = new THREE.Shape(P.map(([x, z]) => new THREE.Vector2(x, -z))); shp.holes.push(new THREE.Path(In.map(([x, z]) => new THREE.Vector2(x, -z))));
    const walls = sh(new THREE.Mesh(new THREE.ExtrudeGeometry(shp, { depth: bh, bevelEnabled: false }), mat('#7d838b'))); walls.rotation.x = -Math.PI / 2; d.add(walls);
    const bot = sh(new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(P.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: .01, bevelEnabled: false }), mat('inner'))); bot.rotation.x = -Math.PI / 2; d.add(bot);
    const fh = hh - .012, fy = fh / 2 - .02;
    const fA = box(b - .004, fh, .02, 'fasad', b / 2, fy, .012), fB = box(.02, fh, b - .004, 'fasad', .012, fy, b / 2); d.add(fA, fB);
    fA.add(box(.22, .018, .02, 'chrome', 0, fh / 2 - .05, .022)); fB.add(box(.02, .018, .22, 'chrome', .022, fh / 2 - .05, 0));
    const kinds = i === 0 ? ['bowl', 'jar', 'bowl', 'jar'] : i === 1 ? ['plates', 'bowl', 'plates'] : ['pot', 'pot', 'bottle'];
    const spots = [[-.25, -.25], [.15, -.22], [-.25, .2], [-.05, -.05]];
    kinds.forEach((k, j) => { const it = item(k, j + i * 2); it.position.set(spots[j][0], .012, spots[j][1]); d.add(it); });
    d.position.y = y; d.userData.y = y; y += hh; g.add(d); drawers.push(d);
  });
  const dir = new THREE.Vector3(1, 0, 1).normalize();
  const labels = [{ obj: anchor(drawers[2], .2, .2, .2), text: "To'liq ochiladi", style: 'yel', at: 1.4, side: 'right', until: 4.9 },
    { obj: anchor(drawers[1], -.2, .15, .25), text: 'Burchak ham ishlaydi', style: 'wht', at: 2.4, side: 'left', until: 4.6 }];
  return {
    group: g, dur: 6.4, cam: { pos: [2.45, 2.35, 2.45], target: [0, .38, 0] }, labels,
    update(t, dur) {
      const o = [pulse(t, 1.6, 2.5, dur - 2.0, dur - 1.2), pulse(t, 1.0, 1.9, dur - 2.6, dur - 1.8), pulse(t, .4, 1.3, dur - 3.2, dur - 2.4)];
      drawers.forEach((d, i) => { const k = o[i] * (i === 2 ? .46 : .38); d.position.set(dir.x * k, d.userData.y, dir.z * k); });
      g.rotation.y = Math.sin(t / dur * Math.PI * 2) * .1;
    }
  };
};

// ===== GARDEROB sahnalari =====
const CLOTH = ['#3a7bd5', '#e8e4da', '#d64545', '#2c3e50', '#3fae6a', '#f2a33a', '#8e5bd0', '#c9b79c'];
// ilgichdagi koʻylak: pivot = shtanga nuqtasi
function shirt(ci) {
  const g = new THREE.Group(), c = CLOTH[ci % CLOTH.length];
  g.add(cyl(.006, .05, 'chrome', 0, -.012, 0, 8));
  g.add(box(.012, .014, .34, 'chrome', 0, -.04, 0));
  g.add(box(.035, .5, .34, c, 0, -.3, 0));
  return g;
}
function stack(n, w, d, ci) { const g = new THREE.Group(); for (let i = 0; i < n; i++) g.add(box(w, .045, d, CLOTH[(ci + i) % CLOTH.length], 0, .0225 + i * .047, 0)); return g; }
function wShell(Wd, D, Hh, { mids = [] } = {}) {
  const g = new THREE.Group(), y0 = .06, th = .022;
  [box(Wd, Hh, th, 'white', 0, y0 + Hh / 2, -D / 2 + th / 2), box(th, Hh, D, 'white', -Wd / 2 + th / 2, y0 + Hh / 2, 0), box(th, Hh, D, 'white', Wd / 2 - th / 2, y0 + Hh / 2, 0),
    box(Wd, th, D, 'inner', 0, y0 + th / 2, 0), box(Wd, th, D, 'white', 0, y0 + Hh - th / 2, 0), box(Wd - .04, y0, .02, '#1c1c1e', 0, y0 / 2, D / 2 - .04)].forEach(k => g.add(k));
  mids.forEach(x => g.add(box(th, Hh - 2 * th, D - .02, 'white', x, y0 + Hh / 2, -.01)));
  return { g, y0, th, Wd, D, Hh };
}

// kupe garderob (muqova va 04 uchun)
function kupeWardrobe() {
  const Wd = 1.6, D = .6, Hh = 2.2, s = wShell(Wd, D, Hh, { mids: [0] }), g = s.g, y0 = s.y0, th = s.th;
  // chap: shtanga + koʻylaklar, pastda polka va taxlam
  { const r = cyl(.012, Wd / 2 - 2 * th, 'chrome', -Wd / 4, y0 + 1.9, -.02); r.rotation.z = Math.PI / 2; g.add(r); }
  for (let i = 0; i < 7; i++) { const sh_ = shirt(i); sh_.position.set(-Wd / 2 + .09 + i * .1, y0 + 1.9, -.02); g.add(sh_); }
  g.add(box(Wd / 2 - th, th, D - .03, 'inner', -Wd / 4, y0 + .55, -.01));
  [-.55, -.25].forEach((x, i) => { const st = stack(5, .26, .34, i * 3); st.position.set(x, y0 + .56, 0); g.add(st); });
  // oʻng: polkalar + 2 savat
  [1.5, 1.95].forEach(yy => g.add(box(Wd / 2 - th, th, D - .03, 'inner', Wd / 4, y0 + yy, -.01)));
  [[.55, 1.51, 0], [.25, 1.51, 4]].forEach(([x, yy, ci]) => { const st = stack(6, .24, .32, ci); st.position.set(x, y0 + yy, 0); g.add(st); });
  const baskets = [.15, .62].map((yy, i) => { const b = basket(Wd / 2 - .08, D - .1, .2); b.position.set(Wd / 4, y0 + yy, 0); [-.18, .02, .2].forEach((x, j) => { const st = stack(2, .16, .3, i * 2 + j); st.position.set(x, .01, 0); b.add(st); }); g.add(b); return b; });
  // relslar va eshiklar
  g.add(box(Wd, .035, .08, 'metal', 0, y0 + Hh - .02, D / 2 + .03)); g.add(box(Wd, .015, .08, 'metal', 0, y0 + .008, D / 2 + .03));
  const dw = Wd / 2 + .03, dh = Hh - .05;
  const mkDoor = (m, z, x) => { const d = new THREE.Group(); d.add(box(dw, dh, .02, m, 0, 0, 0)); d.add(box(.02, dh, .03, 'metal', -dw / 2 + .01, 0, .005)); d.add(box(.02, dh, .03, 'metal', dw / 2 - .01, 0, .005));
    d.position.set(x, y0 + Hh / 2, z); d.userData.x = x; g.add(d); return d; };
  const dL = mkDoor('oak', D / 2 + .015, -Wd / 4 + .015), dR = mkDoor('fasad', D / 2 + .048, Wd / 4 - .015);
  return { g, s, dL, dR, baskets, Wd, D, Hh, y0 };
}

// MUQOVA (garderob): kupe eshik suriladi, savat chiqadi, hammasi joyiga qaytadi
S.garderob = () => {
  const k = kupeWardrobe(), g = k.g;
  const labels = [{ obj: anchor(k.baskets[1], 0, .2, .3), text: 'Har joy ishlaydi', style: 'yel', at: 1.6, side: 'right', until: 3.6 }];
  return {
    group: g, dur: 5.0, cam: { pos: [1.5, 1.3, 3.6], target: [0, 1.2, 0], zoom: 2.6 }, labels,
    update(t, dur) {
      const o = pulse(t, .6, 1.5, 3.7, 4.5); k.dR.position.x = k.dR.userData.x - (k.Wd / 2 - .03) * o;
      const b = pulse(t, 1.4, 2.1, 2.9, 3.6); k.baskets[1].position.z = .42 * b; k.baskets[0].position.z = .42 * pulse(t, 1.6, 2.3, 2.8, 3.5);
      g.rotation.y = Math.sin(t / dur * Math.PI * 2) * .08;
    }
  };
};

// 04 — kupe eshiklar: ikkala eshik navbat bilan rels boʻylab suriladi
S.kupe = () => {
  const k = kupeWardrobe(), g = k.g;
  // eshik oldidagi pol: ochilishga joy kerak emas (sariq chiziq)
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(k.Wd, .06), new THREE.MeshBasicMaterial({ color: Y, transparent: true, opacity: 0 })); strip.rotation.x = -Math.PI / 2; strip.position.set(0, .004, k.D / 2 + .12); g.add(strip);
  const labels = [
    { obj: anchor(k.dR, 0, .3, .02), text: 'Rels boʻylab suriladi', style: 'yel', at: .9, side: 'left', until: 2.9 },
    { obj: anchor(strip, .4, 0, 0), text: 'Oldinga ochilmaydi', style: 'wht', at: 3.2, side: 'right', until: 5.6 }];
  return {
    group: g, dur: 6.4, cam: { pos: [1.6, 1.25, 3.6], target: [0, 1.12, 0], zoom: 2.6 }, labels,
    update(t, dur) {
      k.dR.position.x = k.dR.userData.x - (k.Wd / 2 - .03) * pulse(t, .6, 1.6, 2.2, 3.1);
      k.dL.position.x = k.dL.userData.x + (k.Wd / 2 - .03) * pulse(t, 3.2, 4.2, 4.8, 5.7);
      strip.material.opacity = .9 * pulse(t, 3.0, 3.4, 5.4, 5.8, x => x);
      g.rotation.y = Math.sin(t / dur * Math.PI * 2) * .07;
    }
  };
};

// 01 — shtanga-lift (pantograf): yuqoridagi shtanga pastga-oldinga tushadi
S.pantograf = () => {
  const Wd = .9, D = .6, Hh = 2.3, s = wShell(Wd, D, Hh), g = s.g, y0 = s.y0, th = s.th;
  g.add(box(Wd - 2 * th, th, D - .03, 'inner', 0, y0 + .75, -.01)); g.add(box(Wd - 2 * th, th, D - .03, 'inner', 0, y0 + .35, -.01));
  [[-.22, .76, 0], [.18, .76, 3], [-.22, .36, 5], [.18, .36, 2]].forEach(([x, yy, ci]) => { const st = stack(4, .3, .34, ci); st.position.set(x, y0 + yy, 0); g.add(st); });
  const PY = y0 + 1.72, PZ = -.12, L = .5;
  const arms = [-1, 1].map(sx => { const a = new THREE.Group(); a.position.set(sx * (Wd / 2 - th - .02), PY, PZ); a.add(box(.025, L, .035, 'metal', 0, L / 2, 0)); { const p = cyl(.03, .03, 'metal', 0, 0, 0, 16); p.rotation.z = Math.PI / 2; a.add(p); } g.add(a); return a; });
  const rodG = new THREE.Group(); g.add(rodG);
  { const r = cyl(.014, Wd - 2 * th - .06, 'chrome', 0, 0, 0); r.rotation.z = Math.PI / 2; rodG.add(r); }
  for (let i = 0; i < 6; i++) { const sh_ = shirt(i + 1); sh_.position.set(-Wd / 2 + .13 + i * .126, 0, 0); rodG.add(sh_); }
  const handle = new THREE.Group(); handle.add(cyl(.008, .45, 'chrome', 0, -.225, 0, 10)); handle.add(cyl(.02, .07, 'yellow', 0, -.47, 0, 16)); handle.position.set(0, 0, .05); rodG.add(handle);
  const labels = [
    { obj: anchor(rodG, .2, 0, .1), text: 'Yuqori shtanga', style: 'wht', at: .1, side: 'right', until: 1.0 },
    { obj: anchor(rodG, -.15, -.2, .2), text: 'Pastga tushadi', style: 'yel', at: 1.9, side: 'left', until: 4.3 }];
  return {
    group: g, dur: 5.8, cam: { pos: [1.7, 1.2, 3.4], target: [0, 1.22, .1], zoom: 2.5 }, labels,
    update(t, dur) {
      const th_ = 1.95 * pulse(t, .9, 2.4, dur - 2.0, dur - .6);
      arms.forEach(a => a.rotation.x = th_);
      rodG.position.set(0, PY + L * Math.cos(th_), PZ + L * Math.sin(th_));
      handle.rotation.x = -Math.sin(th_) * .15;
      g.rotation.y = .1 + Math.sin(t / dur * Math.PI * 2) * .08;
    }
  };
};

// 02 — shim tortmasi: tayoqchali ramka tortib chiqariladi
S.shimtortma = () => {
  const Wd = .7, D = .6, Hh = 1.3, s = wShell(Wd, D, Hh), g = s.g, y0 = s.y0, th = s.th;
  g.add(box(Wd - 2 * th, th, D - .03, 'inner', 0, y0 + .42, -.01));
  [[-.15, 0], [.15, 3]].forEach(([x, ci]) => { const st = stack(5, .26, .34, ci); st.position.set(x, y0 + .43, 0); g.add(st); });
  const fr = new THREE.Group(), FY = y0 + 1.2, iw = Wd - 2 * th - .04;
  // yon yoʻnaltiruvchilar (korpusda)
  [-1, 1].forEach(sx => g.add(box(.012, .035, D - .06, 'metal', sx * (iw / 2 + .012), FY, -.01)));
  [-1, 1].forEach(sx => fr.add(box(.014, .03, D - .08, 'chrome', sx * iw / 2, 0, 0)));
  fr.add(box(iw, .03, .02, 'chrome', 0, 0, D / 2 - .05)); fr.add(box(iw, .03, .02, 'chrome', 0, 0, -D / 2 + .05));
  const n = 7;
  for (let i = 0; i < n; i++) {
    const z = -D / 2 + .1 + i * (D - .18) / (n - 1);
    const bar = cyl(.007, iw, 'chrome', 0, 0, z, 10); bar.rotation.z = Math.PI / 2; fr.add(bar);
    const c = CLOTH[(i + 2) % CLOTH.length], len = .4 + (i % 3) * .05;
    const tw = iw * .62, tx = (i % 2 ? .04 : -.04); fr.add(box(tw, len, .008, c, tx, -len / 2, z + .009)); fr.add(box(tw, len * .9, .008, c, tx, -len * .45, z - .009));
  }
  fr.add(box(iw * .5, .03, .03, 'yellow', 0, 0, D / 2 - .03));
  fr.position.set(0, FY, -.01); g.add(fr);
  const labels = [
    { obj: anchor(fr, iw / 2, 0, D / 2 - .05), text: 'Toʻliq chiqadi', style: 'yel', at: 1.6, side: 'right', until: 4.4 },
    { obj: anchor(fr, -iw / 4, -.25, 0), text: 'Gʻijimlanmaydi', style: 'wht', at: 2.4, side: 'left', until: 4.6 }];
  return {
    group: g, dur: 6.0, cam: { pos: [1.9, 1.6, 2.9], target: [0, .76, .15], zoom: 1.9 }, labels,
    update(t, dur) {
      fr.position.z = -.01 + .5 * pulse(t, .7, 1.9, dur - 1.9, dur - .7);
      g.rotation.y = Math.sin(t / dur * Math.PI * 2) * .08;
    }
  };
};

// 03 — toʻrli savatlar: uchta savat navbat bilan chiqadi
S.savat = () => {
  const Wd = .7, D = .6, Hh = 1.0, s = wShell(Wd, D, Hh), g = s.g, y0 = s.y0, th = s.th;
  const bs = [.06, .36, .66].map((yy, i) => {
    const b = basket(Wd - .09, D - .1, .2); b.position.set(0, y0 + yy, 0);
    [-.18, .02, .2].forEach((x, j) => { const st = stack(2 + (j + i) % 2, .17, .32, i * 3 + j); st.position.set(x, .01, 0); b.add(st); });
    [-1, 1].forEach(sx => g.add(box(.012, .03, D - .06, 'metal', sx * (Wd / 2 - th - .01), y0 + yy + .02, -.01)));
    g.add(b); return b;
  });
  const labels = [
    { obj: anchor(bs[2], .25, .2, .2), text: 'Ichi koʻrinadi', style: 'yel', at: 1.3, side: 'right', until: 4.4 },
    { obj: anchor(bs[1], -.25, .15, .15), text: 'Havo aylanadi', style: 'wht', at: 2.2, side: 'left', until: 4.6 }];
  return {
    group: g, dur: 6.0, cam: { pos: [1.9, 1.9, 2.8], target: [0, .5, .15], zoom: 1.6 }, labels,
    update(t, dur) {
      const o = [pulse(t, 1.5, 2.3, dur - 2.2, dur - 1.4), pulse(t, 1.0, 1.8, dur - 2.6, dur - 1.8), pulse(t, .5, 1.3, dur - 3.0, dur - 2.2)];
      bs.forEach((b, i) => b.position.z = .42 * o[i]);
      g.rotation.y = Math.sin(t / dur * Math.PI * 2) * .08;
    }
  };
};

// ===== MATRAS sahnalari =====
class Helix extends THREE.Curve {
  constructor(r, h, turns, hour) { super(); this.r = r; this.h = h; this.turns = turns; this.hour = hour; }
  getPoint(t, o = new THREE.Vector3()) { const a = t * this.turns * Math.PI * 2, r = this.hour ? this.r * (.62 + .55 * Math.pow(2 * t - 1, 2)) : this.r; return o.set(Math.cos(a) * r, t * this.h, Math.sin(a) * r); }
}
const quiltTex = (base = '#f4f1ea') => ctex(512, 512, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.13)'; g.lineWidth = 5; for (let i = -w; i < w * 2; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); } });
const QUILT = quiltTex();
const tmat = (tex, rep = [2, 2], col = '#ffffff', rough = .85) => { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(...rep); return new THREE.MeshStandardMaterial({ map: t, color: col, roughness: rough }); };
// prujina panjarasi: set(i, s) — s = siqilish koeffitsienti (1 = boʻsh)
function springGrid({ nx, nz, p, h, r, hour = false, pocket = false, yb = 0 }) {
  const g = new THREE.Group(), geo = new THREE.TubeGeometry(new Helix(r, h, hour ? 4 : 5, hour), 150, .0042, 6, false), items = [];
  const pGeo = new THREE.CylinderGeometry(r * 1.18, r * 1.18, h, 18), pMat = new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: .95, transparent: true, opacity: .42, depthWrite: false });
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = (i - (nx - 1) / 2) * p, z = (j - (nz - 1) / 2) * p;
    const m = new THREE.Mesh(geo, mat('chrome')); m.castShadow = true; m.position.set(x, yb, z); g.add(m);
    let pk = null; if (pocket) { pk = new THREE.Mesh(pGeo, pMat); pk.position.set(x, yb + h / 2, z); g.add(pk); }
    items.push({ m, pk, x, z, i, j, s: 1 });
  }
  return { g, items, h, yb, set(it, s) { it.s = s; it.m.scale.y = s; if (it.pk) { it.pk.scale.y = s; it.pk.position.y = yb + h * s / 2; } }, top(it) { return yb + h * it.s; } };
}
const UP = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
function rod(m) { const c = cyl(.0035, 1, m, 0, 0, 0, 6); return c; }
function placeRod(c, a, b) { _d.subVectors(b, a); const L = _d.length(); c.position.addVectors(a, b).multiplyScalar(.5); c.quaternion.setFromUnitVectors(UP, _d.normalize()); c.scale.set(1, L, 1); }
const gauss = (dx, dz, s) => Math.exp(-(dx * dx + dz * dz) / (2 * s * s));

// MUQOVA (matras): yopiq matras -> ustki qatlamlar koʻtariladi, ichidagi prujinalar toʻlqin boʻlib ishlaydi -> yopiladi
S.matras = () => {
  const g = new THREE.Group(), nx = 12, nz = 8, p = .09, Wx = nx * p + .04, Dz = nz * p + .04, yb = .03, sp = springGrid({ nx, nz, p, h: .16, r: .036, pocket: true, yb });
  g.add(box(Wx, .03, Dz, 'inner', 0, .015, 0)); g.add(sp.g);
  const bordM = tmat(QUILT, [6, .5], '#e6e2d8');
  [[Wx, .16, .02, 0, -Dz / 2 + .01], [Wx, .16, .02, 0, Dz / 2 - .01], [.02, .16, Dz, -Wx / 2 + .01, 0], [.02, .16, Dz, Wx / 2 - .01, 0]].forEach(([a, b, c, x, z]) => g.add(box(a, b, c, bordM, x, yb + .08, z)));
  const foam = box(Wx, .04, Dz, '#f2df8a', 0, .21, 0); g.add(foam);
  const topM = [bordM, bordM, tmat(QUILT, [3, 2]), bordM, bordM, bordM];
  const cover = sh(new THREE.Mesh(new THREE.BoxGeometry(Wx + .01, .045, Dz + .01), topM)); cover.position.y = .2525; g.add(cover);
  const labels = [{ obj: anchor(g, -.25, .2, .15), text: 'Ichida prujinalar', style: 'yel', at: 1.4, side: 'left', until: 3.2 }];
  return {
    group: g, dur: 4.8, cam: { pos: [2.2, 2.0, 2.6], target: [0, .26, 0], zoom: 1.08 }, labels,
    update(t, dur) {
      const o = pulse(t, .7, 1.4, 3.3, 4.0); cover.position.y = .2525 + .34 * o; foam.position.y = .21 + .18 * o; cover.rotation.x = -.16 * o; foam.rotation.x = -.07 * o;
      const w = seg(t, 1.3, 3.3);
      sp.items.forEach(it => { const ph = w * 2.4 - (it.x + .55) / 1.1; sp.set(it, 1 - .32 * Math.max(0, Math.sin(clamp(ph) * Math.PI)) * (w > 0 && w < 1 ? 1 : 0)); });
      g.rotation.y = Math.sin(t / dur * Math.PI * 2) * .1;
    }
  };
};

// 01 — Bonnel: bogʻliq prujinalar, yuk bossa atrofi ham keng egiladi
S.bonnel = () => {
  const g = new THREE.Group(), nx = 9, nz = 6, p = .12, yb = .03, sp = springGrid({ nx, nz, p, h: .17, r: .05, hour: true, yb }), Wx = nx * p, Dz = nz * p;
  g.add(box(Wx + .02, .03, Dz + .02, 'inner', 0, .015, 0)); g.add(sp.g);
  const at = (i, j) => sp.items[i * nz + j], rods = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { if (i < nx - 1) rods.push([at(i, j), at(i + 1, j)]); if (j < nz - 1) rods.push([at(i, j), at(i, j + 1)]); }
  const rm = rods.map(() => { const c = rod('metal'); g.add(c); return c; });
  const ball = cyl(.16, .05, 'yellow', 0, 0, 0, 40); g.add(ball);
  const A = new THREE.Vector3(), B = new THREE.Vector3();
  const labels = [{ obj: anchor(g, .36, .2, .2), text: 'Atrofi ham egiladi', style: 'yel', at: 1.5, side: 'right', until: 4.2 },
    { obj: anchor(g, -.42, .2, -.1), text: 'Sim bilan bogʻlangan', style: 'wht', at: .2, side: 'left', until: 1.3 }];
  return {
    group: g, dur: 5.4, cam: { pos: [2.0, 2.1, 2.6], target: [0, .12, .02], zoom: .95 }, labels,
    update(t, dur) {
      const d = pulse(t, 1.1, 2.0, 3.6, 4.5);
      sp.items.forEach(it => sp.set(it, 1 - .42 * d * gauss(it.x, it.z, .3)));
      rods.forEach(([a, b], k) => { A.set(a.x, sp.top(a), a.z); B.set(b.x, sp.top(b), b.z); placeRod(rm[k], A, B); });
      ball.position.y = yb + .17 * (1 - .42 * d) + .028 + .22 * (1 - pulse(t, .3, 1.1, 4.4, 5.1));
      g.rotation.y = Math.sin(t / dur * Math.PI * 2) * .08;
    }
  };
};

// 02 — mustaqil prujinalar: faqat bosilgan joy egiladi, qoʻshni joy tinch
S.pocket = () => {
  const g = new THREE.Group(), nx = 12, nz = 8, p = .09, yb = .03, sp = springGrid({ nx, nz, p, h: .16, r: .036, pocket: true, yb }), Wx = nx * p, Dz = nz * p;
  g.add(box(Wx + .02, .03, Dz + .02, 'inner', 0, .015, 0)); g.add(sp.g);
  const bx = -.28, ball = cyl(.13, .05, 'yellow', bx, 0, 0, 40), ball2 = cyl(.13, .05, '#ffffff', .3, 0, 0, 40); g.add(ball, ball2);
  const labels = [{ obj: anchor(ball, 0, .03, 0), text: 'Faqat shu joy egiladi', style: 'yel', at: 1.4, side: 'left', until: 4.0 },
    { obj: anchor(ball2, 0, .03, 0), text: 'Bu tomon tinch', style: 'wht', at: 1.9, side: 'right', until: 4.2 }];
  return {
    group: g, dur: 5.4, cam: { pos: [1.9, 2.1, 2.6], target: [0, .12, .02], zoom: 1.0 }, labels,
    update(t, dur) {
      const d = pulse(t, 1.1, 2.0, 3.6, 4.5);
      sp.items.forEach(it => sp.set(it, 1 - .45 * d * gauss(it.x - bx, it.z, .085)));
      ball.position.y = yb + .16 * (1 - .45 * d) + .028 + .22 * (1 - pulse(t, .3, 1.1, 4.4, 5.1));
      ball2.position.y = yb + .16 + .028;
      g.rotation.y = Math.sin(t / dur * Math.PI * 2) * .08;
    }
  };
};

// 03 — prujinasiz: qatlamlar ajralib koʻrinadi va qayta yigʻiladi
S.qatlam = () => {
  const g = new THREE.Group(), Wx = 1.1, Dz = .74;
  const coco = ctex(256, 256, (c, w, h) => { c.fillStyle = '#7a5532'; c.fillRect(0, 0, w, h); const r = rng(5); for (let i = 0; i < 900; i++) { c.strokeStyle = r() > .5 ? '#5a3c22' : '#a57a4c'; c.lineWidth = 1.5; const x = r() * w, y = r() * h, a = r() * 6.3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); c.stroke(); } });
  const latex = ctex(256, 256, (c, w, h) => { c.fillStyle = '#f3ead2'; c.fillRect(0, 0, w, h); c.fillStyle = '#d9cba8'; for (let x = 16; x < w; x += 32) for (let y = 16; y < h; y += 32) { c.beginPath(); c.arc(x + (y / 32 % 2) * 16, y, 7, 0, 7); c.fill(); } });
  const L = [[.07, new THREE.MeshStandardMaterial({ color: '#e7dcc0', roughness: .9 })], [.03, tmat(coco, [3, 2])], [.05, tmat(latex, [4, 3])], [.04, new THREE.MeshStandardMaterial({ color: '#9fc4e0', roughness: .9 })], [.04, null]];
  let y = 0; const slabs = L.map(([hh, m], i) => {
    const mm = m || [tmat(QUILT, [6, .5], '#e6e2d8'), tmat(QUILT, [6, .5], '#e6e2d8'), tmat(QUILT, [3, 2]), tmat(QUILT, [6, .5], '#e6e2d8'), tmat(QUILT, [6, .5], '#e6e2d8'), tmat(QUILT, [6, .5], '#e6e2d8')];
    const s = sh(new THREE.Mesh(new THREE.BoxGeometry(Wx, hh, Dz), mm)); s.position.y = y + hh / 2; s.userData.y = s.position.y; y += hh; g.add(s); return s;
  });
  const labels = [{ obj: anchor(slabs[1], Wx / 2, 0, Dz / 2), text: 'Kokos', style: 'wht', at: 1.5, side: 'right', until: 3.9 },
    { obj: anchor(slabs[2], -Wx / 2, 0, Dz / 2), text: 'Lateks', style: 'yel', at: 1.7, side: 'left', until: 4.0 }];
  return {
    group: g, dur: 5.2, cam: { pos: [2.0, 1.7, 2.7], target: [0, .28, 0], zoom: 1.3 }, labels,
    update(t, dur) {
      const o = pulse(t, .6, 1.5, 3.9, 4.7);
      slabs.forEach((s, i) => { s.position.y = s.userData.y + o * i * .1; s.rotation.y = o * (i - 2) * .05; });
      g.rotation.y = Math.sin(t / dur * Math.PI * 2) * .1;
    }
  };
};

// 04 — lamelli asos: yuk bosilganda reykalar egiladi va qaytadi
S.lamel = () => {
  const g = new THREE.Group(), Wx = 1.2, Dz = 1.15, n = 13, Ll = Wx - .1, ry = .2;
  [-1, 1].forEach(sx => { g.add(box(.05, .1, Dz + .1, 'oak', sx * Wx / 2, ry - .02, 0)); });
  [-1, 1].forEach(sz => g.add(box(Wx + .05, .1, .05, 'oak', 0, ry - .02, sz * (Dz / 2 + .05))));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => g.add(box(.05, ry - .07, .05, 'oak', sx * Wx / 2, (ry - .07) / 2, sz * (Dz / 2 + .05))));
  const lam = [];
  for (let k = 0; k < n; k++) {
    const z = -Dz / 2 + .05 + k * (Dz - .1) / (n - 1), geo = new THREE.BoxGeometry(Ll, .012, .055, 30, 1, 1), m = sh(new THREE.Mesh(geo, mat('oak')));
    m.position.set(0, ry + .045, z); g.add(m); lam.push({ m, z, base: geo.attributes.position.array.slice() });
    [-1, 1].forEach(sx => g.add(box(.045, .025, .07, '#1c1c1e', sx * (Ll / 2 - .01), ry + .042, z)));
  }
  const ball = cyl(.17, .05, 'yellow', 0, 0, 0, 40); g.add(ball);
  const bend = (k, d) => { const P = lam[k].m.geometry.attributes.position, b = lam[k].base, w = gauss(0, lam[k].z, .26);
    for (let i = 0; i < P.count; i++) { const x = b[i * 3], f = 1 - Math.pow(2 * x / Ll, 2); P.array[i * 3 + 1] = b[i * 3 + 1] + .03 * f - .1 * d * w * f; } P.needsUpdate = true; lam[k].m.geometry.computeVertexNormals(); };
  const labels = [{ obj: anchor(g, .35, ry + .07, .45), text: 'Egiluvchan reyka', style: 'yel', at: 1.4, side: 'right', until: 4.3 },
    { obj: anchor(g, -.4, ry + .07, -.1), text: 'Yuk taqsimlanadi', style: 'wht', at: 2.0, side: 'left', until: 4.4 }];
  return {
    group: g, dur: 5.4, cam: { pos: [1.9, 2.3, 2.5], target: [0, .02, .02], zoom: 1.32 }, labels,
    update(t, dur) {
      const d = pulse(t, 1.1, 2.0, 3.6, 4.5);
      lam.forEach((_, k) => bend(k, d));
      ball.position.set(0, ry + .045 + .03 - .1 * d * gauss(0, lam[6].z, .26) + .006 + .025 + .25 * (1 - pulse(t, .3, 1.1, 4.4, 5.1)), lam[6].z);
      g.rotation.y = Math.sin(t / dur * Math.PI * 2) * .08;
    }
  };
};

// RO'YXAT: 3D kartochkalar ketma-ket chiqadi
S.list = (sl) => {
  const g = new THREE.Group(), cards = [], items = sl.items || [], n = items.length, gap = .4;
  items.forEach((s, i) => {
    const tex = ctex(1024, 180, (c, w, h) => {
      c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = Y; c.beginPath(); c.arc(90, h / 2, 56, 0, 7); c.fill();
      c.strokeStyle = '#0e0e0e'; c.lineWidth = 14; c.lineCap = 'round'; c.beginPath(); c.moveTo(64, h / 2); c.lineTo(84, h / 2 + 22); c.lineTo(120, h / 2 - 24); c.stroke();
      c.fillStyle = '#0e0e0e'; let fs = 58; c.font = `800 ${fs}px Inter`; while (c.measureText(s).width > 830 && fs > 34) { fs -= 2; c.font = `800 ${fs}px Inter`; } c.textBaseline = 'middle'; c.fillText(s, 175, h / 2 + 2);
    });
    const side = mat('#e7e4dd'), face = new THREE.MeshStandardMaterial({ map: tex, roughness: .5 });
    const m = sh(new THREE.Mesh(new THREE.BoxGeometry(2.2, .36, .06), [side, side, side, side, face, side]));
    const hh = new THREE.Group(); hh.add(m); hh.position.y = .35 + (n - 1 - i) * gap; g.add(hh); cards.push(hh);
  });
  return {
    group: g, dur: 4.6, cam: { pos: [.5, .25 + n * gap / 2 + .7, 4.7], target: [0, .3 + (n - 1) * gap / 2, 0], zoom: 1.4 }, labels: [],
    update(t, dur) {
      cards.forEach((c, i) => { const k = seg(t, .3 + i * .55, 1.1 + i * .55); c.rotation.x = eIO(k) * Math.PI * 2; c.position.z = Math.sin(k * Math.PI) * .35; });
      g.rotation.y = Math.sin(t / dur * Math.PI * 2) * .08;
    }
  };
};

// CTA: 3D logo
S.cta = () => {
  const g = new THREE.Group();
  const shp = pts => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x / 263, -y / 263) : s.moveTo(x / 263, -y / 263)); s.closePath(); return s; };
  const opt = { depth: .14, bevelEnabled: true, bevelThickness: .025, bevelSize: .012, bevelSegments: 4 };
  const A = sh(new THREE.Mesh(new THREE.ExtrudeGeometry(shp([[0, 0], [263, 0], [192, 93], [56, 93], [56, 249], [0, 319]]), opt), new THREE.MeshStandardMaterial({ color: Y, roughness: .3, metalness: .2 })));
  const B = sh(new THREE.Mesh(new THREE.ExtrudeGeometry(shp([[56, 93], [263, 93], [212, 164], [125, 164], [125, 270], [56, 353]]), opt), new THREE.MeshStandardMaterial({ color: '#f6f7f8', roughness: .28, metalness: .35 })));
  B.position.z = .07; const L = new THREE.Group(); L.add(A, B); L.position.set(-.5, .67, -.1); const piv = new THREE.Group(); piv.add(L); piv.position.y = .95; g.add(piv);
  return {
    group: g, dur: 4.0, cam: { pos: [0, 1.15, 5.2], target: [0, .95, 0], zoom: 1.45 }, labels: [],
    update(t, dur) { piv.rotation.y = eIO(seg(t, .3, dur - .3)) * Math.PI * 2; piv.position.y = .95 + Math.sin(t / dur * Math.PI * 2) * .05; }
  };
};

// ---------- matn qatlami ----------
const $ = s => document.querySelector(s);
const hl = s => (s || '').replace(/\*(.+?)\*/g, '<span class="y">$1</span>');
let cur = null, labs = [], meta = {};
window.setup = async (sl, m) => {
  await document.fonts.load('900 40px Inter'); await document.fonts.load('800 40px Inter'); await document.fonts.load('900 40px "Inter Display"');
  meta = m || {}; $('#cat').textContent = meta.kategoriya || ''; $('#pg').textContent = meta.page || '';
  $('#bar').style.width = (meta.progress || 0) * 100 + '%';
  const kind = sl.anim || ({ cover: 'cover', list: 'list', cta: 'cta' })[sl.type];
  cur = (S[kind] || S.cta)(sl); scene.add(cur.group);
  if (sl.type === 'cover') {
    document.body.classList.add('cover');
    const t = sl.accent ? sl.title.replace(sl.accent, `*${sl.accent}*`) : sl.title;
    $('#top').innerHTML = `<div class="kick">${sl.kicker || ''}</div><h1>${hl(t)}</h1>`;
    $('#bot').innerHTML = `<div class="txt">${sl.sub || ''}</div><div class="tag">Varaqlang →</div>`;
  } else if (sl.type === 'point') {
    $('#top').innerHTML = `<span class="num">${sl.num}</span><h1>${hl(sl.title)}</h1>`;
    $('#bot').innerHTML = `<div class="txt">${sl.text}</div>${sl.tag ? `<div class="tag">${sl.tag}</div>` : ''}`;
  } else if (sl.type === 'list') {
    $('#top').innerHTML = `<span class="num">✓</span><h1>${hl(sl.title)}</h1>`; $('#bot').innerHTML = '';
  } else {
    $('#top').innerHTML = `<h1 style="font-size:72px">${hl(sl.title)}</h1>`;
    $('#bot').innerHTML = `<div class="txt">${sl.text || ''}</div><div class="btn">Direktga yozing →</div>`;
  }
  const lw = $('#labels');
  labs = (cur.labels || []).map(l => { const d = document.createElement('div'); d.className = 'lab ' + (l.style || ''); d.style.opacity = 0; lw.appendChild(d); return { ...l, el: d }; });
  return cur.dur;
};

const v = new THREE.Vector3();
window.renderAt = (t) => {
  const dur = cur.dur; cur.update(t, dur);
  const c = cur.cam, tg = new THREE.Vector3(...c.target);
  camera.position.set(...c.pos).sub(tg).multiplyScalar(c.zoom ?? 1.55).add(tg); camera.lookAt(tg);
  camera.setViewOffset(W, H, 0, -H * 0.02, W, H); camera.updateMatrixWorld();
  renderer.render(scene, camera);
  let lines = '';
  labs.forEach(l => {
    const a = seg(t, l.at, l.at + .35) * (1 - seg(t, l.until ?? dur, (l.until ?? dur) + .3)); l.el.style.opacity = a;
    if (typeof l.text === 'function') l.el.textContent = l.text(); else if (!l.el.textContent) l.el.textContent = l.text;
    if (a <= 0) return;
    l.obj.getWorldPosition(v); v.project(camera); const x = (v.x * .5 + .5) * W, y = (-v.y * .5 + .5) * H;
    const bw = l.el.offsetWidth, bh = l.el.offsetHeight, right = l.side !== 'left';
    let bx = right ? x + 90 : x - 90 - bw, by = y - 90 - bh / 2;
    bx = clamp(bx, 40, W - 40 - bw); by = clamp(by, 420, 1010 - bh);
    l.el.style.left = bx + 'px'; l.el.style.top = by + 'px';
    const ex = right ? bx : bx + bw, ey = by + bh / 2, col = l.style === 'red' ? '#FF5A5A' : l.style === 'wht' ? '#fff' : Y, dl = eOut(seg(t, l.at, l.at + .45));
    lines += `<line x1="${x}" y1="${y}" x2="${lerp(x, ex, dl)}" y2="${lerp(y, ey, dl)}" stroke="${col}" stroke-width="4" opacity="${a}"/><circle cx="${x}" cy="${y}" r="${9 * a}" fill="${col}"/>`;
  });
  $('#labels svg').innerHTML = lines;
  if (document.body.classList.contains('cover') === false && cur && $('.list')) { }
  return true;
};
window.ENGINE_READY = true;
