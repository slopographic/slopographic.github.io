/* SlopLabel — ui/view: the design canvas (pasteboard, label, grid, margins, objects), selection
 * handles, smart guides and rulers. Screen px = pan + mm × zoom (zoom is CSS px per mm). */
'use strict';

const V = { cv: null, g: null, w: 0, h: 0, dpr: 1, colors: {} };
const HANDLE_PX = 8;
function readViewColors() {
  const cs = getComputedStyle(document.documentElement), v = (k) => cs.getPropertyValue(k).trim();
  V.colors = { paste: v('--pasteboard') || '#3a3a3a', shadow: v('--label-shadow') || 'rgba(0,0,0,.4)', handle: v('--handle') || '#4f8bff', guide: v('--guide') || '#ff2d9a',
    rulerBg: v('--ruler-bg') || '#262626', rulerFg: v('--ruler-fg') || '#8d8d8d', rulerTick: v('--ruler-tick') || '#555', danger: v('--danger') || '#e5484d', warn: v('--warn') || '#f5a524' };
}
function initView() {
  V.cv = $('cv'); V.g = V.cv.getContext('2d');
  readViewColors();
  new ResizeObserver(() => { resizeView(); }).observe($('stageView'));
  resizeView();
}
function resizeView() {
  const st = $('stageView'), r = st.getBoundingClientRect(); // the canvas area, above the drop strip
  V.dpr = Math.min(3, window.devicePixelRatio || 1);
  V.w = Math.max(1, Math.round(r.width)); V.h = Math.max(1, Math.round(r.height));
  V.cv.width = Math.round(V.w * V.dpr); V.cv.height = Math.round(V.h * V.dpr);
  V.cv.style.width = V.w + 'px'; V.cv.style.height = V.h + 'px';
  if (!V.fitted && V.w > 10 && App.doc) { V.fitted = true; fitView(); }
  drawView();
}
/** Fit the label in the stage with some breathing room. */
function fitView() {
  if (!App.doc || V.w < 10) return;
  const L = App.doc.label, pad = narrow() ? 20 : 48;
  App.zoom = clamp(Math.min((V.w - pad * 2) / L.w, (V.h - pad * 2) / L.h), 0.3, 80);
  App.panX = (V.w - L.w * App.zoom) / 2; App.panY = (V.h - L.h * App.zoom) / 2;
  refresh();
}
/** Zoom about a stage point (defaults to the centre). */
function zoomTo(z, sx = V.w / 2, sy = V.h / 2) {
  z = clamp(z, 0.3, 120);
  const mx = (sx - App.panX) / App.zoom, my = (sy - App.panY) / App.zoom;
  App.zoom = z; App.panX = sx - mx * z; App.panY = sy - my * z;
  refresh({ keepProps: true });
}
/** 100% = real size on a 96 dpi screen. */
function zoomActual() { zoomTo(96 / 25.4); }
const toScreen = (x, y) => [App.panX + x * App.zoom, App.panY + y * App.zoom];
function stagePoint(e) { const r = V.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function toMMpt(e) { const [sx, sy] = stagePoint(e); return [(sx - App.panX) / App.zoom, (sy - App.panY) / App.zoom]; }

function drawView() {
  const g = V.g; if (!g || !App.doc) return;
  const d = App.doc, L = d.label, z = App.zoom, C = V.colors;
  g.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  g.fillStyle = C.paste; g.fillRect(0, 0, V.w, V.h);
  const [lx, ly] = toScreen(0, 0), lw = L.w * z, lh = L.h * z, rr = Math.min(L.radius || 0, L.w / 2, L.h / 2) * z;
  // label sheet with shadow
  g.save(); g.shadowColor = C.shadow; g.shadowBlur = 14; g.shadowOffsetY = 3;
  g.fillStyle = '#fff'; g.beginPath(); g.roundRect(lx, ly, lw, lh, rr); g.fill(); g.restore();
  // grid
  const gs = +d.grid.size || 0;
  if (d.grid.show && gs > 0 && gs * z >= 7) {
    g.save(); g.beginPath(); g.roundRect(lx, ly, lw, lh, rr); g.clip();
    g.strokeStyle = 'rgba(0,0,0,.07)'; g.lineWidth = 1; g.beginPath();
    for (let x = gs; x < L.w; x += gs) { const sx = Math.round(lx + x * z) + 0.5; g.moveTo(sx, ly); g.lineTo(sx, ly + lh); }
    for (let y = gs; y < L.h; y += gs) { const sy = Math.round(ly + y * z) + 0.5; g.moveTo(lx, sy); g.lineTo(lx + lw, sy); }
    g.stroke(); g.restore();
  }
  // margins (safe area)
  const m = L.margin || [0, 0, 0, 0];
  if (m.some((v) => v > 0)) { g.save(); g.strokeStyle = 'rgba(79,139,255,.45)'; g.setLineDash([4, 3]); g.lineWidth = 1; g.strokeRect(Math.round(lx + m[3] * z) + 0.5, Math.round(ly + m[0] * z) + 0.5, (L.w - m[1] - m[3]) * z, (L.h - m[0] - m[2]) * z); g.restore(); }
  // objects (in mm)
  g.save(); g.translate(App.panX, App.panY); g.scale(z, z);
  drawItems(g, App.scene, { doc: d, design: true });
  g.restore();
  // outside-the-label veil and outline
  g.save(); g.fillStyle = 'rgba(128,128,128,.35)'; g.beginPath(); g.rect(0, 0, V.w, V.h); g.roundRect(lx, ly, lw, lh, rr); g.fill('evenodd'); g.restore();
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.beginPath(); g.roundRect(lx - 0.5, ly - 0.5, lw + 1, lh + 1, rr); g.stroke();
  drawOverlay(g);
  drawRulers();
}
function screenBox(b) { const [x, y] = toScreen(b.x, b.y); return { x, y, w: b.w * App.zoom, h: b.h * App.zoom }; }
function handleRects(b) {
  const s = screenBox(b), hs = HANDLE_PX / 2, xs = [s.x, s.x + s.w / 2, s.x + s.w], ys = [s.y, s.y + s.h / 2, s.y + s.h];
  // order: nw n ne e se s sw w
  return [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]].map(([i, j], k) => ({ k, x: xs[i] - hs, y: ys[j] - hs, w: HANDLE_PX, h: HANDLE_PX }));
}
function drawOverlay(g) {
  const C = V.colors;
  // error / overflow markers
  for (const it of App.scene) {
    if (!it.error && !it.warn) continue;
    const s = screenBox(it.box); g.save(); g.strokeStyle = it.error ? C.danger : C.warn; g.setLineDash([3, 3]); g.lineWidth = 1; g.strokeRect(s.x - 0.5, s.y - 0.5, s.w + 1, s.h + 1); g.restore();
  }
  if (App.hover && !App.sel.includes(App.hover)) { const it = itemOf(App.hover); if (it) { const s = screenBox(it.box); g.strokeStyle = C.handle; g.globalAlpha = 0.6; g.lineWidth = 1; g.strokeRect(Math.round(s.x) + 0.5, Math.round(s.y) + 0.5, s.w, s.h); g.globalAlpha = 1; } }
  const objs = selObjs();
  g.lineWidth = 1; g.strokeStyle = C.handle;
  for (const o of objs) { const s = screenBox(boxOf(o)); g.setLineDash(o.locked ? [2, 2] : []); g.strokeRect(Math.round(s.x) + 0.5, Math.round(s.y) + 0.5, Math.round(s.w), Math.round(s.h)); }
  g.setLineDash([]);
  const b = selBox();
  if (b && objs.length) {
    if (objs.length > 1) { const s = screenBox(b); g.save(); g.setLineDash([4, 3]); g.strokeRect(Math.round(s.x) + 0.5, Math.round(s.y) + 0.5, Math.round(s.w), Math.round(s.h)); g.restore(); }
    if (objs.length === 1 && !objs[0].locked) for (const h of handleRects(b)) { g.fillStyle = '#fff'; g.fillRect(h.x, h.y, h.w, h.h); g.strokeRect(h.x + 0.5, h.y + 0.5, h.w - 1, h.h - 1); }
  }
  // smart guides
  g.strokeStyle = C.guide; g.lineWidth = 1;
  for (const gd of App.guides) {
    g.beginPath();
    if (gd.axis === 'x') { const [sx] = toScreen(gd.v, 0); g.moveTo(Math.round(sx) + 0.5, 0); g.lineTo(Math.round(sx) + 0.5, V.h); }
    else { const [, sy] = toScreen(0, gd.v); g.moveTo(0, Math.round(sy) + 0.5); g.lineTo(V.w, Math.round(sy) + 0.5); }
    g.stroke();
  }
  if (App.marquee) { const s = screenBox(App.marquee); g.fillStyle = 'rgba(79,139,255,.12)'; g.fillRect(s.x, s.y, s.w, s.h); g.strokeStyle = C.handle; g.strokeRect(s.x + 0.5, s.y + 0.5, s.w, s.h); }
  if (App.ghost) { const s = screenBox(App.ghost); g.save(); g.setLineDash([4, 3]); g.strokeStyle = C.guide; g.strokeRect(s.x + 0.5, s.y + 0.5, s.w, s.h); g.restore(); }
}

/* ---------------- rulers ---------------- */
function rulerStep(unit, z, dpi) {
  // major tick spacing in document units, at least ~60 px apart
  const pxPerUnit = toMM(1, unit, dpi) * z;
  const steps = unit === 'in' ? [0.125, 0.25, 0.5, 1, 2, 4, 8] : unit === 'dots' ? [10, 25, 50, 100, 200, 500, 1000, 2000] : [1, 2, 5, 10, 20, 50, 100, 200, 500];
  return steps.find((s) => s * pxPerUnit >= 60) || steps[steps.length - 1];
}
function drawRuler(cv, horiz) {
  if (!cv || !cv.offsetParent) return;
  const r = cv.getBoundingClientRect(), dpr = V.dpr, W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
  if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  const g = cv.getContext('2d'), C = V.colors, d = App.doc, unit = d.unit, z = App.zoom;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = C.rulerBg; g.fillRect(0, 0, W, H);
  const step = rulerStep(unit, z, d.dpi), stepMM = toMM(step, unit, d.dpi), sub = unit === 'in' ? 4 : 5;
  const len = horiz ? W : H, pan = horiz ? App.panX : App.panY;
  // label extent highlight
  const a = pan, b = pan + (horiz ? d.label.w : d.label.h) * z;
  g.fillStyle = 'rgba(128,128,128,.18)';
  if (horiz) g.fillRect(a, 0, b - a, H); else g.fillRect(0, a, W, b - a);
  g.strokeStyle = C.rulerTick; g.fillStyle = C.rulerFg; g.lineWidth = 1; g.font = '9px ' + getComputedStyle(document.body).fontFamily;
  const first = Math.floor(-pan / z / stepMM) - 1, last = Math.ceil((len - pan) / z / stepMM) + 1;
  g.beginPath();
  for (let i = first; i <= last; i++) {
    for (let k = 0; k < sub; k++) {
      const p = Math.round(pan + (i * stepMM + (k * stepMM) / sub) * z) + 0.5, t = k === 0 ? (horiz ? H : W) : (horiz ? H : W) * 0.3;
      if (horiz) { g.moveTo(p, H); g.lineTo(p, H - t); } else { g.moveTo(W, p); g.lineTo(W - t, p); }
    }
    const lab = num(i * step, 3), p = pan + i * stepMM * z;
    if (horiz) g.fillText(lab, p + 3, 9);
    else { g.save(); g.translate(9, p + 3); g.rotate(-Math.PI / 2); g.textAlign = 'right'; g.fillText(lab, 0, 0); g.restore(); }
  }
  g.stroke();
  // pointer position marker
  if (V.pointer) { const p = horiz ? V.pointer[0] : V.pointer[1]; g.strokeStyle = C.guide; g.beginPath(); if (horiz) { g.moveTo(p + 0.5, 0); g.lineTo(p + 0.5, H); } else { g.moveTo(0, p + 0.5); g.lineTo(W, p + 0.5); } g.stroke(); }
}
function drawRulers() { drawRuler($('rulerH'), true); drawRuler($('rulerV'), false); }
