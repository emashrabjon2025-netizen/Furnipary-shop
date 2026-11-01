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
function setOpacity(o, a) { o.traverse(m => { if (m.isMesh) [].concat(m.material).forEach(x => { if (x.userData.b == null) { x.userData.b = x.opacity; x.userData.t = x.transparent; } x.transparent = a < 1 || x.userData.t; x.opacity = x.userData.b * a; }); }); }

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
      c.parts.forEach((p, i) => { const k = eOut(seg(t, i * .07, .55 + i * .07)) - eIO(seg(t, dur - .9 + i * .03, dur - .25 + i * .03)); p.position.copy(p.userData.from).multiplyScalar(1 - k).add(p.userData.home); setOpacity(p, Math.min(1, k * 1.6)); });
      const k2 = seg(t, .8, dur - 1.0); sus.grp.rotation.y = eIO(k2) * Math.PI * 2; setOpacity(sus.grp, seg(t, .5, .9) * (1 - seg(t, dur - .6, dur - .3)));
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
      cards.forEach((c, i) => { const k = eBack(seg(t, .2 + i * .45, .8 + i * .45)) * (1 - eIO(seg(t, dur - .7 + i * .05, dur - .2 + i * .05))); c.rotation.x = (1 - k) * -1.5; c.position.x = (1 - k) * 1.6; setOpacity(c, clamp(k * 1.5)); });
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
