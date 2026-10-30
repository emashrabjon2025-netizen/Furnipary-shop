// FURNIPART — "Mebel bilim" 3D video engine (three.js). render.py drives it frame by frame.
// window.setup(script) -> builds scenes;  window.renderAt(t) -> draws frame at time t (seconds).
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

const W = 1080, H = 1920, Y = '#FFE135';
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
const RS = +(new URLSearchParams(location.search).get('rs') || 0.67);
renderer.setPixelRatio(1); renderer.setSize(Math.round(W * RS), Math.round(H * RS), false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(32, W / H, 0.05, 100);

const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
key.position.set(3.5, 6, 4); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; key.shadow.bias = -0.0004;
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
scene.add(key);
const rim = new THREE.DirectionalLight(0xffe135, 1.3); rim.position.set(-4, 3, -4); scene.add(rim);
scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.35));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.35 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

// ---------- helpers ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eOut = x => 1 - Math.pow(1 - x, 3);
const eInOut = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const eBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function ctex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
const hex = c => new THREE.Color(c);
function rgb(c) { const k = hex(c); return [k.r * 255, k.g * 255, k.b * 255]; }

// ---------- procedural textures ----------
const TX = {};
TX.chip = ctex(512, 512, (g, w, h) => {
  g.fillStyle = '#c9a675'; g.fillRect(0, 0, w, h); const r = rng(7);
  const pal = ['#b58d58', '#e0c597', '#9c7442', '#d8b984', '#86602f', '#efd6aa'];
  for (let i = 0; i < 11000; i++) {
    g.save(); g.translate(r() * w, r() * h); g.rotate(r() * Math.PI);
    g.fillStyle = pal[(r() * pal.length) | 0]; const a = 2 + r() * 9, b = 1 + r() * 3; g.fillRect(-a / 2, -b / 2, a, b); g.restore();
  }
});
TX.mdf = ctex(512, 512, (g, w, h) => {
  const im = g.createImageData(w, h), r = rng(3), [R, G, B] = rgb('#9a6f46');
  for (let i = 0; i < w * h; i++) { const n = (r() - .5) * 26; im.data[i * 4] = R + n; im.data[i * 4 + 1] = G + n * .8; im.data[i * 4 + 2] = B + n * .6; im.data[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0);
});
function woodTex(light, dark, seed = 1, w = 1024, h = 512, contrast = 1) {
  return ctex(w, h, (g) => {
    const im = g.createImageData(w, h), L = rgb(light), D = rgb(dark), r = rng(seed), ph = r() * 10;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = y * 0.07 + 1.1 * Math.sin(x * 0.0025 + ph + y * 0.006) + 0.35 * Math.sin(x * 0.009 + y * 0.03) + 0.12 * Math.sin(x * 0.05 + y * 0.2);
      let f = Math.pow(0.5 + 0.5 * Math.sin(s * 2.3), 5) * 0.6 + 0.25 * (0.5 + 0.5 * Math.sin(s * 9.0 + x * 0.001)) + 0.15 * (0.5 + 0.5 * Math.sin(y * 0.9 + Math.sin(x * 0.02) * 2));
      f = clamp(f * contrast + (r() - .5) * 0.08); const i = (y * w + x) * 4;
      im.data[i] = lerp(L[0], D[0], f); im.data[i + 1] = lerp(L[1], D[1], f); im.data[i + 2] = lerp(L[2], D[2], f); im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  });
}
TX.oak = woodTex('#d9b98c', '#a87c4f', 2, 1024, 512, 0.8);
TX.massiv = woodTex('#c48a52', '#6e4321', 5, 1024, 512, 1);
TX.walnut = woodTex('#8a5a36', '#3e2614', 9, 1024, 512, 1);
TX.endgrain = ctex(512, 512, (g, w, h) => {
  const im = g.createImageData(w, h), L = rgb('#c99258'), D = rgb('#6b4020'), r = rng(4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - w * 0.5, dy = y + h * 1.4, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const f = clamp(Math.pow(0.5 + 0.5 * Math.sin(d * 0.16 + 1.2 * Math.sin(a * 7)), 4) + (r() - .5) * .1); const i = (y * w + x) * 4;
    im.data[i] = lerp(L[0], D[0], f); im.data[i + 1] = lerp(L[1], D[1], f); im.data[i + 2] = lerp(L[2], D[2], f); im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
});
TX.quilt = ctex(512, 512, (g, w, h) => {
  g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.10)'; g.lineWidth = 3;
  for (let i = -w; i < w * 2; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
});
TX.foam = ctex(256, 256, (g, w, h) => {
  g.fillStyle = '#f2e3a6'; g.fillRect(0, 0, w, h); const r = rng(11);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(150,120,40,${r() * .25})`; g.beginPath(); g.arc(r() * w, r() * h, r() * 2.2, 0, 7); g.fill(); }
});
TX.coir = ctex(256, 256, (g, w, h) => {
  g.fillStyle = '#6b4526'; g.fillRect(0, 0, w, h); const r = rng(12);
  for (let i = 0; i < 900; i++) { g.strokeStyle = `rgba(${150 + r() * 60},${100 + r() * 40},${50 + r() * 20},.7)`; g.lineWidth = 1 + r(); g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.quadraticCurveTo(x + r() * 30 - 15, y + r() * 30 - 15, x + r() * 40 - 20, y + r() * 40 - 20); g.stroke(); }
});

function texRep(t, rx, ry) { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; }
// material from spec: 'chip' 'mdf' 'oak' 'massiv' 'walnut' 'endgrain' 'white' 'grey' 'black' '#hex' 'paint:#hex' 'metal' 'chrome' 'glass'
function mat(spec, rx = 1, ry = 1) {
  const S = String(spec);
  if (TX[S]) return new THREE.MeshStandardMaterial({ map: texRep(TX[S], rx, ry), roughness: S === 'chip' ? .9 : S === 'mdf' ? .85 : .55 });
  if (S === 'white') return new THREE.MeshStandardMaterial({ color: '#f1efea', roughness: .45 });
  if (S === 'grey') return new THREE.MeshStandardMaterial({ color: '#6d6f73', roughness: .5 });
  if (S === 'black') return new THREE.MeshStandardMaterial({ color: '#1c1c1e', roughness: .45 });
  if (S === 'metal') return new THREE.MeshStandardMaterial({ color: '#b9bcc2', roughness: .3, metalness: 1 });
  if (S === 'chrome') return new THREE.MeshStandardMaterial({ color: '#e9ecf0', roughness: .12, metalness: 1 });
  if (S === 'glass') return new THREE.MeshStandardMaterial({ color: '#cfe8ff', roughness: .05, metalness: .1, transparent: true, opacity: .35 });
  if (S === 'yellow') return new THREE.MeshStandardMaterial({ color: Y, roughness: .4 });
  if (S.startsWith('paint:')) return new THREE.MeshStandardMaterial({ color: S.slice(6), roughness: .38 });
  return new THREE.MeshStandardMaterial({ color: S, roughness: .5 });
}
function shadowy(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }

// Box with a "face" material on the two largest faces and an "edge" material on the four thin faces.
function panel(sx, sy, sz, face, edge) {
  const dims = [sx, sy, sz], minAx = dims.indexOf(Math.min(...dims));
  const fm = typeof face === 'string' ? mat(face, Math.max(sx, sz) / 1.2, Math.max(sy, sz) / 1.2) : face;
  const em = typeof edge === 'string' ? mat(edge, 3, .3) : (edge || fm);
  const arr = [0, 1, 2].flatMap(ax => ax === minAx ? [fm, fm] : [em, em]);
  return shadowy(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), arr));
}

// Laminated board lying flat: width w (x), thickness t (y), depth d (z). Front edge = +z.
function board({ w = 1.5, t = 0.13, d = 0.95, core = 'ldsp', face = 'oak', edge = null } = {}) {
  const g = new THREE.Group(); g.userData.parts = {};
  if (core === 'massiv' || core === 'walnut') {
    const side = mat(core === 'walnut' ? 'walnut' : 'massiv', w / 1.5, 1), end = mat('endgrain', d / 1, t / .3);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), [end, end, side, side, side, side]);
    g.add(shadowy(m)); g.userData.parts.core = m; return g;
  }
  const lam = face ? 0.010 : 0, ct = t - 2 * lam;
  const cm = mat(core === 'mdf' ? 'mdf' : 'chip', w / 0.75, ct / 0.75);
  const c = shadowy(new THREE.Mesh(new THREE.BoxGeometry(w, ct, d), cm)); g.add(c); g.userData.parts.core = c;
  if (face) {
    const fm = mat(face, w / 1.5, d / 1.5);
    const top = shadowy(new THREE.Mesh(new THREE.BoxGeometry(w, lam, d), fm)); top.position.y = (ct + lam) / 2;
    const bot = shadowy(new THREE.Mesh(new THREE.BoxGeometry(w, lam, d), fm)); bot.position.y = -(ct + lam) / 2;
    g.add(top, bot); Object.assign(g.userData.parts, { top, bot });
  }
  if (edge) {
    const em = mat(edge === true ? face : edge, w / 1.5, .1), e = 0.014, es = [];
    const f = new THREE.Mesh(new THREE.BoxGeometry(w + 2 * e, t, e), em); f.position.z = d / 2 + e / 2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w + 2 * e, t, e), em); b.position.z = -d / 2 - e / 2;
    const l = new THREE.Mesh(new THREE.BoxGeometry(e, t, d), em); l.position.x = -w / 2 - e / 2;
    const r = new THREE.Mesh(new THREE.BoxGeometry(e, t, d), em); r.position.x = w / 2 + e / 2;
    [f, b, l, r].forEach(m => { shadowy(m); g.add(m); es.push(m); }); g.userData.parts.edges = es; g.userData.parts.front = f;
  }
  return g;
}
function setOpacity(o, a) { o.traverse(m => { if (m.isMesh) [].concat(m.material).forEach(x => { x.transparent = a < 1 || x.userData.glass; if (!x.userData.base) x.userData.base = x.opacity; x.opacity = x.userData.base * a; x.depthWrite = a > .5; }); }); }
function anchor(parent, x, y, z) { const a = new THREE.Object3D(); a.position.set(x, y, z); parent.add(a); return a; }
function textTex(lines, { w = 1024, h = 256, bg = null, color = '#fff', size = 90, weight = 900, align = 'center' } = {}) {
  return ctex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = align; g.font = `${weight} ${size}px Inter`;
    const L = [].concat(lines); L.forEach((s, i) => g.fillText(s, align === 'left' ? 40 : w / 2, h / 2 + (i - (L.length - 1) / 2) * size * 1.15));
  });
}

// ---------- presets ----------
// Each returns {group, cam:{pos,target}, labels:[{obj,text,style,at,side}], update(lt,dur)}
const P = {};

// boards: [{core,face,edge,label,style}] stacked; focus: index or null
P.boards = (p) => {
  const g = new THREE.Group(), items = p.items || [], n = items.length, gap = 0.62, labels = [], bs = [];
  items.forEach((it, i) => {
    const b = board({ w: 1.25, t: .16, d: .8, ...it }); const holder = new THREE.Group(); holder.add(b);
    holder.userData.baseY = (n - 1 - i) * gap + .25; g.add(holder); bs.push(holder);
    if (it.label) labels.push({ obj: anchor(b, .62, .02, .4), text: it.label, style: it.style || (i === p.focus ? 'yel' : ''), at: .25 + i * .25, side: i % 2 ? 'left' : 'right' });
  });
  return {
    group: g, labels, cam: { pos: [2.7, 2.9 + n * .25, 5.4], target: [0, (n - 1) * gap / 2 + .32, 0] },
    update(t) {
      bs.forEach((h, i) => {
        const k = eBack(seg(t, .1 + i * .22, .75 + i * .22)); h.position.y = h.userData.baseY + (1 - k) * 2.5; h.rotation.y = (1 - k) * 1.2 + Math.sin(t * .6 + i) * .06;
        const foc = p.focus == null ? 1 : (i === p.focus ? 1 : .35); const fk = seg(t, 1.2, 1.8);
        setOpacity(h, Math.min(seg(t, .1 + i * .22, .4 + i * .22), lerp(1, foc, fk)));
        const s = p.focus === i ? lerp(1, 1.12, eOut(fk)) : 1; h.scale.setScalar(s);
      });
    }
  };
};

// layers: exploded board with labels (core/face/edge)
P.layers = (p) => {
  const b = board({ w: 1.6, t: .22, d: 1.0, core: p.core || 'ldsp', face: p.face || 'oak', edge: p.edge || '#e9e4da' });
  const g = new THREE.Group(); g.add(b); b.position.y = .55; const P_ = b.userData.parts, labels = [];
  const L = p.labels || {};
  if (P_.top && L.face) labels.push({ obj: anchor(P_.top, .55, 0, .3), text: L.face, at: 1.4, side: 'right' });
  if (L.core) labels.push({ obj: anchor(P_.core, -.45, 0, .5), text: L.core, at: .8, side: 'left', style: 'yel' });
  if (P_.front && L.edge) labels.push({ obj: anchor(P_.front, .5, 0, 0), text: L.edge, at: 2.0, side: 'right', style: 'wht' });
  return {
    group: g, labels, cam: { pos: [2.9, 3.0, 4.8], target: [0, .55, 0] },
    update(t) {
      const k = eBack(seg(t, 0, .7)); b.rotation.y = -.5 + (1 - k) * 1.5 + t * .05; b.scale.setScalar(.6 + .4 * k);
      const ex = eInOut(seg(t, .9, 1.9));
      if (P_.top) { P_.top.position.y = (P_.core.geometry.parameters.height + .01) / 2 + ex * .38; P_.bot.position.y = -(P_.core.geometry.parameters.height + .01) / 2 - ex * .28; }
      if (P_.edges) { P_.front.position.z = .5 + .007 + eInOut(seg(t, 1.6, 2.4)) * .35; }
    }
  };
};

// edge: kromka bor vs kromkasiz under water drops
P.edge = (p) => {
  const g = new THREE.Group(), labels = [];
  const mk = (withEdge, y) => {
    const b = board({ w: 1.3, t: .17, d: .7, core: 'ldsp', face: p.face || 'white', edge: withEdge ? (p.edgeColor || '#e8e6e1') : null }); b.position.y = y; g.add(b);
    let swell = null;
    if (!withEdge) {
      const sm = mat('chip', 1.3 / .75, .25); sm.color = hex('#ffffff');
      swell = shadowy(new THREE.Mesh(new THREE.BoxGeometry(1.3, .15, .12), sm)); swell.position.set(0, 0, .35 - .05); b.add(swell);
    }
    const drops = [];
    for (let i = 0; i < 5; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(.045, 20, 14), new THREE.MeshStandardMaterial({ color: '#7cc8ff', roughness: .05, metalness: .1, transparent: true, opacity: .85 }));
      d.userData = { x: -.45 + i * .22, t0: .6 + i * .35 }; b.add(d); drops.push(d);
    }
    return { b, swell, drops, withEdge };
  };
  const A = mk(true, 1.15), B = mk(false, .25);
  labels.push({ obj: anchor(A.b, .66, .1, .2), text: p.okLabel || 'Kromka bor ✓', style: 'grn', at: .5, side: 'right' });
  labels.push({ obj: anchor(B.b, .66, .1, .2), text: p.badLabel || 'Kromkasiz ✗', style: 'red', at: .9, side: 'right' });
  return {
    group: g, labels, cam: { pos: [2.3, 3.4, 4.7], target: [0, .7, 0] },
    update(t, dur) {
      [A, B].forEach((S, si) => {
        const k = eOut(seg(t, si * .2, .6 + si * .2)); S.b.rotation.y = -.45 + (1 - k) * 1.2; S.b.position.x = (1 - k) * (si ? -2 : 2);
        S.drops.forEach((d, i) => {
          const per = 1.8, tt = ((t - d.userData.t0) % per + per) % per, live = t > d.userData.t0;
          const fall = seg(tt, 0, .55), y = .55 - fall * fall * .55; d.position.set(d.userData.x, y + .02, .38);
          d.visible = live; let s = 1, o = .85;
          if (fall >= 1) { const a = seg(tt, .55, 1.1); if (S.withEdge) { d.position.z = .38 + a * .5; d.position.y = .02 - a * .6; o = .85 * (1 - a); } else { d.scale.setScalar(Math.max(.001, 1 - a)); d.position.z = .38 - a * .06; } }
          else d.scale.setScalar(1); d.material.opacity = o;
        });
        if (S.swell) { const sw = eInOut(seg(t, 1.2, dur - .5)); S.swell.scale.set(1, 1 + sw * .9, 1 + sw * .6); S.swell.material.color.lerpColors(hex('#ffffff'), hex('#6e5233'), sw); }
      });
    }
  };
};

// single: hero board/facade. kind: 'board' | 'facade'; paints: ['#hex',...] cycles; core
P.single = (p) => {
  const g = new THREE.Group(), labels = []; let obj, paintMats = [];
  if (p.kind === 'facade') {
    obj = new THREE.Group(); const pm = mat('paint:' + (p.paints?.[0] || '#efeee9')); paintMats.push(pm);
    const base = panel(1.1, 1.6, .06, pm, pm); obj.add(base);
    const fr = .12, depth = .04;[[0, .74, 1.1, fr], [0, -.74, 1.1, fr], [-.49, 0, fr, 1.6], [.49, 0, fr, 1.6]].forEach(([x, y, w, h]) => { const m = panel(w, h, depth, pm, pm); m.position.set(x, y, .05); obj.add(m); });
    const bev = panel(.86, 1.36, .015, pm, pm); bev.position.z = .035; obj.add(bev);
    const handle = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .32, 16), mat('chrome'))); handle.position.set(.38, 0, .12); obj.add(handle);
    obj.position.y = 1.0;
    if (p.label) labels.push({ obj: anchor(obj, .5, .5, .05), text: p.label, at: .6, side: 'right', style: 'yel' });
    if (p.label2) labels.push({ obj: anchor(obj, -.3, -.3, .08), text: p.label2, at: 1.4, side: 'left' });
  } else {
    obj = board({ w: 1.5, t: .16, d: 1.0, core: p.core || 'massiv', face: p.face, edge: p.edge }); obj.position.y = .7;
    if (p.label) labels.push({ obj: anchor(obj, .6, .11, .3), text: p.label, at: .6, side: 'right', style: 'yel' });
    if (p.label2) labels.push({ obj: anchor(obj, -.75, 0, .2), text: p.label2, at: 1.4, side: 'left' });
  }
  g.add(obj);
  const pc = (p.paints || []).map(hex);
  return {
    group: g, labels, cam: p.kind === 'facade' ? { pos: [1.7, 1.9, 5.9], target: [0, 1.02, 0] } : { pos: [2.6, 2.7, 4.4], target: [0, .65, 0] },
    update(t, dur) {
      const k = eBack(seg(t, 0, .8)); obj.scale.setScalar(.5 + .5 * k);
      obj.rotation.y = (p.kind === 'facade' ? -.35 : -.6) + (1 - k) * 1.4 + Math.sin(t * .5) * .18 + (p.spin ? t * .35 : 0);
      if (pc.length > 1) { const per = (dur - 1) / pc.length, i = Math.floor(clamp((t - .8) / per, 0, pc.length - 1)), f = seg((t - .8) - i * per, per - .4, per); const c = pc[i].clone().lerp(pc[Math.min(i + 1, pc.length - 1)], eInOut(f)); paintMats.forEach(m => m.color.copy(c)); }
    }
  };
};

// cabinet: base cabinet assembling. mats: {korpus, fasad, top, edge}; door opens; drawer
P.cabinet = (p) => {
  const m = Object.assign({ korpus: 'white', fasad: 'paint:#2f3a36', top: 'oak', edge: '#efede8' }, p.mats || {});
  const g = new THREE.Group(), parts = [], labels = [], Wd = 1.2, Hh = 1.25, D = .8, th = .05;
  const add = (mesh, pos, from) => { mesh.position.set(...pos); mesh.userData.home = new THREE.Vector3(...pos); mesh.userData.from = new THREE.Vector3(...from); g.add(mesh); parts.push(mesh); return mesh; };
  const L = add(panel(th, Hh, D, m.korpus, m.edge), [-Wd / 2 + th / 2, Hh / 2 + .08, 0], [-1.6, 0, 0]);
  add(panel(th, Hh, D, m.korpus, m.edge), [Wd / 2 - th / 2, Hh / 2 + .08, 0], [1.6, 0, 0]);
  add(panel(Wd - 2 * th, th, D, m.korpus, m.edge), [0, .08 + th / 2, 0], [0, -1, 0]);
  add(panel(Wd - 2 * th, th, D, m.korpus, m.edge), [0, Hh * .55, 0], [0, 0, 1.2]);
  add(panel(Wd, Hh, .015, m.korpus === 'white' ? '#dcd9d2' : m.korpus, m.edge), [0, Hh / 2 + .08, -D / 2], [0, 0, -1.5]);
  const top = add(panel(Wd + .08, .07, D + .06, m.top, m.top), [0, Hh + .08 + .035, .03], [0, 1.6, 0]);
  const hinge = new THREE.Group(); hinge.userData.home = new THREE.Vector3(-Wd / 2, Hh / 2 + .08, D / 2 + .012); hinge.userData.from = new THREE.Vector3(0, 0, 1.5);
  hinge.position.copy(hinge.userData.home); g.add(hinge); parts.push(hinge);
  const door = panel(Wd - .01, Hh - .01, .03, m.fasad, m.fasad); door.position.set((Wd - .01) / 2, 0, 0); hinge.add(door);
  const hd = shadowy(new THREE.Mesh(new THREE.BoxGeometry(.03, .35, .03), mat('chrome'))); hd.position.set(Wd - .1, .1, .04); hinge.add(hd);
  const L2 = p.labels || {};
  if (L2.korpus) labels.push({ obj: anchor(L, -.03, .2, .3), text: L2.korpus, at: 1.0, side: 'left', style: 'wht' });
  if (L2.top) labels.push({ obj: anchor(top, .4, .04, .2), text: L2.top, at: 1.6, side: 'right' });
  if (L2.fasad) labels.push({ obj: anchor(door, .3, -.2, .02), text: L2.fasad, at: 2.2, side: 'right', style: 'yel' });
  return {
    group: g, labels, cam: { pos: [3.1, 2.8, 5.4], target: [0, .8, 0] },
    update(t, dur) {
      parts.forEach((pt, i) => { const k = eOut(seg(t, i * .12, .6 + i * .12)); pt.position.copy(pt.userData.from).multiplyScalar(1 - k).add(pt.userData.home.clone()); setOpacity(pt, seg(t, i * .12, .25 + i * .12)); });
      const o = p.doorOpen === false ? 0 : eInOut(seg(t, 2.6, 3.4)) - eInOut(seg(t, dur - 1.2, dur - .4));
      hinge.rotation.y = -o * 1.75; g.rotation.y = Math.sin(t * .35) * .2 - .15;
    }
  };
};

// mattress: exploded layers [{kind:'cover'|'foam'|'springs'|'coir'|'latex', label}]
P.mattress = (p) => {
  const g = new THREE.Group(), labels = [], layers = [], Wm = 1.6, Dm = 2.0;
  (p.layers || []).forEach((L, i) => {
    let o; const h = L.kind === 'springs' ? .22 : L.kind === 'cover' ? .06 : .09;
    if (L.kind === 'springs') {
      o = new THREE.Group(); const pts = []; for (let a = 0; a <= 1; a += 1 / 60) { const ang = a * Math.PI * 2 * 4.5; pts.push(new THREE.Vector3(Math.cos(ang) * .055, a * h - h / 2, Math.sin(ang) * .055)); }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, .007, 6), nx = 9, nz = 11;
      const im = new THREE.InstancedMesh(geo, mat('metal'), nx * nz), M4 = new THREE.Matrix4(); let k = 0;
      for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) { M4.makeTranslation(-Wm / 2 + .09 + x * (Wm - .18) / (nx - 1), 0, -Dm / 2 + .09 + z * (Dm - .18) / (nz - 1)); im.setMatrixAt(k++, M4); }
      im.castShadow = true; o.add(im);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(Wm, .02, Dm), mat('#8a8d92')); fr.position.y = -h / 2; o.add(fr);
    } else {
      const mt = L.kind === 'cover' ? new THREE.MeshStandardMaterial({ map: texRep(TX.quilt, 3, 4), roughness: .9 }) : L.kind === 'coir' ? new THREE.MeshStandardMaterial({ map: texRep(TX.coir, 4, 5), roughness: 1 }) : L.kind === 'latex' ? new THREE.MeshStandardMaterial({ map: texRep(TX.foam, 4, 5), color: '#fff8e8', roughness: .9 }) : new THREE.MeshStandardMaterial({ map: texRep(TX.foam, 4, 5), roughness: .9 });
      o = shadowy(new THREE.Mesh(new RoundedBoxGeometry(Wm, h, Dm, 3, .03), mt));
    }
    o.userData.h = h; g.add(o); layers.push(o);
    if (L.label) labels.push({ obj: anchor(o, Wm / 2, 0, Dm / 2 - .2), text: L.label, at: .8 + i * .45, side: i % 2 ? 'left' : 'right', style: i === 0 ? 'yel' : '' });
  });
  const n = layers.length;
  return {
    group: g, labels, cam: { pos: [2.6, 3.4, 4.6], target: [0, .9, 0] },
    update(t) {
      let y = .1; const ex = eInOut(seg(t, .7, 1.8));
      for (let i = n - 1; i >= 0; i--) { const o = layers[i], h = o.userData.h; y += h / 2; const k = eBack(seg(t, (n - 1 - i) * .12, .6 + (n - 1 - i) * .12)); o.position.y = y + (n - 1 - i) * ex * .32 + (1 - k) * 2; y += h / 2; }
      g.rotation.y = -.55 + Math.sin(t * .4) * .15;
    }
  };
};

// checklist: items [text], marks: 'ok'|'no'
P.checklist = (p) => {
  const g = new THREE.Group(), cards = [], items = p.items || [], n = items.length, gap = .42;
  items.forEach((s, i) => {
    const bad = (p.marks || [])[i] === 'no';
    const tex = ctex(1024, 200, (c, w, h) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      c.fillStyle = bad ? '#FF5A5A' : Y; c.beginPath(); c.arc(100, h / 2, 62, 0, 7); c.fill();
      c.strokeStyle = bad ? '#fff' : '#0e0e0e'; c.lineWidth = 16; c.lineCap = 'round'; c.beginPath();
      if (bad) { c.moveTo(75, h / 2 - 25); c.lineTo(125, h / 2 + 25); c.moveTo(125, h / 2 - 25); c.lineTo(75, h / 2 + 25); } else { c.moveTo(70, h / 2); c.lineTo(92, h / 2 + 24); c.lineTo(132, h / 2 - 26); }
      c.stroke(); c.fillStyle = '#0e0e0e'; c.font = '800 64px Inter'; c.textBaseline = 'middle';
      let fs = 64; while (c.measureText(s).width > 800 && fs > 36) { fs -= 2; c.font = `800 ${fs}px Inter`; } c.fillText(s, 195, h / 2 + 2);
    });
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: .5 }), side = new THREE.MeshStandardMaterial({ color: '#e7e4dd' });
    const m = shadowy(new THREE.Mesh(new THREE.BoxGeometry(2.0, .39, .06), [side, side, side, side, face, side]));
    const h = new THREE.Group(); h.add(m); h.position.y = .3 + (n - 1 - i) * gap; g.add(h); cards.push(h);
  });
  return {
    group: g, labels: [], cam: { pos: [0.6, 1.0 + n * gap / 2, 4.6], target: [0, .3 + (n - 1) * gap / 2, 0] },
    update(t, dur) {
      const step = Math.min(.9, (dur - 1) / Math.max(n, 1));
      cards.forEach((c, i) => { const k = eBack(seg(t, .2 + i * step, .75 + i * step)); c.rotation.x = (1 - k) * -1.6; c.position.x = (1 - k) * 1.5; setOpacity(c, seg(t, .2 + i * step, .45 + i * step)); });
      g.rotation.y = -.12 + Math.sin(t * .4) * .05;
    }
  };
};

// logo: extruded brand mark
P.logo = (p) => {
  const g = new THREE.Group();
  const shp = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x / 263, -y / 263) : s.moveTo(x / 263, -y / 263)); s.closePath(); return s; };
  const opt = { depth: .14, bevelEnabled: true, bevelThickness: .025, bevelSize: .012, bevelSegments: 4 };
  const corner = shadowy(new THREE.Mesh(new THREE.ExtrudeGeometry(shp([[0, 0], [263, 0], [192, 93], [56, 93], [56, 249], [0, 319]]), opt), new THREE.MeshStandardMaterial({ color: Y, roughness: .3, metalness: .2 })));
  const F = shadowy(new THREE.Mesh(new THREE.ExtrudeGeometry(shp([[56, 93], [263, 93], [212, 164], [125, 164], [125, 270], [56, 353]]), opt), new THREE.MeshStandardMaterial({ color: '#f6f7f8', roughness: .28, metalness: .35 })));
  F.position.z = .07;
  const L = new THREE.Group(); L.add(corner, F); L.position.set(-.5, .67, 0); const piv = new THREE.Group(); piv.add(L); piv.scale.setScalar(.9); piv.position.y = 1.0; g.add(piv);
  return {
    group: g, labels: [], cam: { pos: [0, 1.3, 6.6], target: [0, 1.05, 0] },
    update(t) { const k = eBack(seg(t, 0, .9)); piv.rotation.y = (1 - k) * 3.2 + Math.sin(t * .8) * .25; piv.rotation.x = Math.sin(t * .6) * .08; piv.scale.setScalar(.9 * (.4 + .6 * k)); piv.position.y = 1.0 + Math.sin(t * 1.2) * .04; }
  };
};
window.PRESETS = P; window.TH = { THREE, board, panel, mat, anchor, shadowy, setOpacity, seg, eOut, eInOut, eBack, lerp, clamp, ctex, TX };

// ---------- timeline / overlay ----------
const $ = s => document.querySelector(s);
const svg = $('#labels svg'), labWrap = $('#labels');
let S = null, total = 0;
const hl = s => (s || '').replace(/\*(.+?)\*/g, '<span class="y">$1</span>').replace(/!(.+?)!/g, '<span class="r">$1</span>').replace(/~(.+?)~/g, '<span class="g">$1</span>');
function chunks(text) {
  const words = text.split(/\s+/).filter(Boolean), out = []; let cur = [];
  words.forEach((w, i) => { cur.push(w); const plain = w.replace(/[*!~]/g, ''); if (plain === '—') return; if (cur.length >= 5 || (/[.,!?:;]$/.test(plain) && cur.length >= 3) || i === words.length - 1) { out.push(cur.join(' ')); cur = []; } });
  // balance star-highlights broken across chunks
  return out.map(c => { const n = (c.match(/\*/g) || []).length; return n % 2 ? c.replace(/\*/g, '') : c; });
}

window.setup = async (script) => {
  await document.fonts.load('900 40px Inter'); await document.fonts.load('800 40px Inter');
  S = script; let t = 0;
  if (script.rubric) $('#rub').textContent = script.rubric;
  S.scenes.forEach((sc, i) => {
    sc.t0 = t; sc.dur = sc.dur || 4; t += sc.dur;
    const fn = P[sc.visual?.type] || P.logo; const built = fn(sc.visual || {});
    Object.assign(sc, { built }); built.group.visible = false; scene.add(built.group);
    sc.caps = []; const cs = chunks(sc.show || ''), tot = cs.reduce((a, c) => a + c.length, 0) || 1;
    const a0 = sc.t0 + (sc.voiceAt || .2), ad = sc.voiceDur || (sc.dur - .6); let acc = 0;
    cs.forEach(c => { sc.caps.push({ s: a0 + ad * acc / tot, text: c }); acc += c.length; });
    sc.labEls = (built.labels || []).map(l => { const d = document.createElement('div'); d.className = 'lab ' + (l.style || ''); d.textContent = l.text; d.style.opacity = 0; labWrap.appendChild(d); return { ...l, el: d }; });
  });
  total = t; return total;
};

const v = new THREE.Vector3();
window.renderAt = (time) => {
  const idx = Math.max(0, S.scenes.findIndex(s => time >= s.t0 && time < s.t0 + s.dur)), sc = S.scenes[idx === -1 ? S.scenes.length - 1 : idx];
  const lt = time - sc.t0;
  S.scenes.forEach(s => { s.built.group.visible = s === sc; s.labEls.forEach(l => { l.el.style.display = s === sc ? 'block' : 'none'; }); });
  sc.built.update(lt, sc.dur);
  // camera: preset framing + slow drift / punch-in
  const c = sc.built.cam, tg = new THREE.Vector3(...c.target), pos = new THREE.Vector3(...c.pos).sub(tg);
  const drift = (sc.drift ?? 1) * (lt / sc.dur), ang = -0.18 + drift * 0.36, dolly = 1.08 - 0.10 * eInOut(clamp(lt / sc.dur));
  pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang).multiplyScalar(dolly);
  camera.position.copy(tg).add(pos); camera.lookAt(tg);
  camera.setViewOffset(W, H, 0, H * 0.035, W, H); camera.updateMatrixWorld();
  renderer.render(scene, camera);
  // overlay text
  const hin = seg(lt, .05, .45);
  const head = $('#head'); if (head.dataset.k !== String(idx)) { head.innerHTML = hl(sc.head || ''); head.dataset.k = idx; $('#sub').innerHTML = hl(sc.sub || ''); }
  head.style.opacity = hin; head.style.filter = `blur(${(1 - hin) * 14}px)`; head.style.transform = `translateY(${(1 - eOut(hin)) * 30}px)`;
  const sub = $('#sub'); sub.style.top = (head.offsetTop + head.offsetHeight + 18) + 'px'; const sin = seg(lt, .3, .7); sub.style.opacity = sin;
  $('#step').textContent = String(idx + 1).padStart(2, '0') + '/' + String(S.scenes.length).padStart(2, '0');
  $('#prog i').style.width = (100 * time / total).toFixed(2) + '%';
  // captions
  const capEl = $('#cap div'); let cur = null; sc.caps.forEach(cp => { if (time >= cp.s) cur = cp; });
  if (cur && !sc.noCaption) { capEl.style.display = 'block'; if (capEl.dataset.s !== String(cur.s)) { capEl.innerHTML = hl(cur.text); capEl.dataset.s = cur.s; } const ci = seg(time - cur.s, 0, .15); capEl.style.opacity = ci; capEl.style.transform = `scale(${.94 + .06 * eOut(ci)})`; }
  else capEl.style.display = 'none';
  // labels with leader lines
  let lines = '';
  sc.labEls.forEach(l => {
    const a = seg(lt, l.at, l.at + .35); l.el.style.opacity = a; if (a <= 0) return;
    l.obj.getWorldPosition(v); v.project(camera); const x = (v.x * .5 + .5) * W, y = (-v.y * .5 + .5) * H;
    const bw = l.el.offsetWidth, bh = l.el.offsetHeight, right = l.side !== 'left';
    let bx = right ? Math.min(W - 50 - bw, x + 120) : Math.max(50, x - 120 - bw), by = y - 110 - bh / 2;
    bx = clamp(bx, 40, W - 40 - bw); by = clamp(by, 420, 1330 - bh);
    l.el.style.left = bx + 'px'; l.el.style.top = by + 'px'; l.el.style.transform = `translateY(${(1 - eOut(a)) * 20}px)`;
    const ex = right ? bx : bx + bw, ey = by + bh / 2, col = l.style === 'red' ? '#FF5A5A' : l.style === 'grn' ? '#2fbf6a' : l.style === 'wht' ? '#fff' : Y;
    const dl = eOut(seg(lt, l.at, l.at + .5));
    lines += `<line x1="${x}" y1="${y}" x2="${lerp(x, ex, dl)}" y2="${lerp(y, ey, dl)}" stroke="${col}" stroke-width="4" opacity="${a}"/><circle cx="${x}" cy="${y}" r="${9 * a}" fill="${col}"/><circle cx="${x}" cy="${y}" r="${9 + 14 * ((lt * 1.2) % 1)}" fill="none" stroke="${col}" stroke-width="3" opacity="${a * (1 - (lt * 1.2) % 1)}"/>`;
  });
  svg.innerHTML = lines;
  // transitions
  const fi = 1 - seg(lt, 0, .22), fo = idx < S.scenes.length - 1 ? seg(lt, sc.dur - .12, sc.dur) : seg(time, total - .5, total);
  $('#fade').style.opacity = Math.max(idx === 0 ? 0 : fi, fo) * .9;
  $('#flash').style.opacity = (1 - seg(lt, 0, .5)) * .8;
  return true;
};
window.ENGINE_READY = true;
