/* PhotoSlop guides: drawing the grid, guides, the live layout preview, snap indicator and rulers on the view canvas. */
'use strict';

/** Grid and guides, drawn above the image (called from draw() in core/view.js). */
function drawGuidesLayer(g) {
  if (GUIDE_PREFS.grid) drawGridOverlay(g);
  const z = V.zoom, sx = (x) => Math.round(V.ox + x * z) + 0.5, sy = (y) => Math.round(V.oy + y * z) + 0.5;
  const line = (o, pos) => { if (o === 'v') { const x = sx(pos); g.moveTo(x, 0); g.lineTo(x, V.H); } else { const y = sy(pos); g.moveTo(0, y); g.lineTo(V.W, y); } };
  g.save(); g.lineWidth = 1;
  if (GUIDE_PREFS.show && D.guides && D.guides.length) {
    g.beginPath();
    D.guides.forEach((gd, i) => { if (!(V.guideDrag && V.guideDrag.idx === i)) line(gd.o, gd.pos); });
    g.strokeStyle = GUIDE_PREFS.color; g.globalAlpha = GUIDE_PREFS.lock ? 0.55 : 0.95; g.stroke(); g.globalAlpha = 1;
  }
  if (V.guidePreview && V.guidePreview.length) {
    g.beginPath(); for (const gd of V.guidePreview) line(gd.o, gd.pos);
    g.setLineDash([5, 4]); g.strokeStyle = '#ff2dd4'; g.stroke(); g.setLineDash([]);
  }
  const d = V.guideDrag;
  if (d && d.moved) {
    g.beginPath(); line(d.o, d.pos); g.strokeStyle = d.out ? 'rgba(255,80,80,.7)' : '#ff2dd4'; g.stroke();
    const s = d.o === 'v' ? { x: sx(d.pos) + 6, y: (GUIDE_PREFS.rulers ? RULER : 0) + 16 } : { x: (GUIDE_PREFS.rulers ? RULER : 0) + 6, y: sy(d.pos) - 6 };
    pill(g, d.out ? tr('photoslop.guide.pill_delete') : `${d.o === 'v' ? 'X' : 'Y'} ${fmtPos(d.pos)} px`, s.x, s.y);
  }
  g.restore();
}
const fmtPos = (v) => String(Math.round(v * 100) / 100);
function pill(g, text, x, y) {
  g.font = '600 11px "JetBrains Mono", ui-monospace, monospace'; // i18n-ignore: ids, key names, CSS
  const w = g.measureText(text).width + 10;
  x = clamp(x, 2, V.W - w - 2); y = clamp(y, 14, V.H - 4);
  g.fillStyle = 'rgba(0,0,0,.78)'; g.fillRect(x, y - 13, w, 17); g.fillStyle = '#fff'; g.fillText(text, x + 5, y);
}
function drawGridOverlay(g) {
  const z = V.zoom, step = GUIDE_PREFS.gridSize, sub = GUIDE_PREFS.gridSub, color = GUIDE_PREFS.gridColor;
  const lines = (st, alpha, every) => {
    if (st * z < 5) return;
    g.beginPath();
    const x0 = Math.max(0, Math.floor(-V.ox / z / st) * st), x1 = Math.min(D.w, (V.W - V.ox) / z), y0 = Math.max(0, Math.floor(-V.oy / z / st) * st), y1 = Math.min(D.h, (V.H - V.oy) / z);
    for (let x = x0, i = Math.round(x0 / st); x <= x1 + 1e-6; x += st, i++) { if (every && i % every === 0) continue; const s = Math.round(V.ox + x * z) + 0.5; g.moveTo(s, Math.max(0, V.oy)); g.lineTo(s, Math.min(V.H, V.oy + D.h * z)); }
    for (let y = y0, i = Math.round(y0 / st); y <= y1 + 1e-6; y += st, i++) { if (every && i % every === 0) continue; const s = Math.round(V.oy + y * z) + 0.5; g.moveTo(Math.max(0, V.ox), s); g.lineTo(Math.min(V.W, V.ox + D.w * z), s); }
    g.globalAlpha = alpha; g.stroke();
  };
  g.save(); g.strokeStyle = color; g.lineWidth = 1;
  if (sub > 1) { g.setLineDash([2, 3]); lines(step / sub, 0.28, sub); g.setLineDash([]); }
  lines(step, 0.6, 0);
  g.restore();
}
/** Magenta lines where a tool snapped, plus the rulers (called last in draw()). */
function drawTopOverlays(g) {
  const s = V.snapInd;
  if (s && (V.op || TRANSFORM.drag)) {
    g.save(); g.strokeStyle = '#ff2dd4'; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath();
    if (s.x != null) { const x = Math.round(V.ox + s.x * V.zoom) + 0.5; g.moveTo(x, 0); g.lineTo(x, V.H); }
    if (s.y != null) { const y = Math.round(V.oy + s.y * V.zoom) + 0.5; g.moveTo(0, y); g.lineTo(V.W, y); }
    g.stroke(); g.restore();
  }
  if (rulersShown()) drawRulers(g);
}
function rulerStep(z) {
  const target = 64 / z; // a labelled tick about every 64 screen px
  const p = Math.pow(10, Math.floor(Math.log10(target))), n = target / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
}
function drawRulers(g) {
  if (!V.rulerCss || V.rulerTheme !== document.documentElement.dataset.theme) {
    const cs = getComputedStyle(V.el);
    V.rulerCss = { bg: (cs.getPropertyValue('--panel') || '#2b2b2b').trim(), fg: (cs.getPropertyValue('--fg-dim') || '#a0a0a0').trim(), line: (cs.getPropertyValue('--line-2') || '#444').trim() };
    V.rulerTheme = document.documentElement.dataset.theme;
  }
  const c = V.rulerCss, z = V.zoom, step = rulerStep(z), minor = step / (String(step)[0] === '5' ? 5 : 10);
  g.save();
  g.fillStyle = c.bg; g.fillRect(0, 0, V.W, RULER); g.fillRect(0, 0, RULER, V.H);
  g.strokeStyle = c.line; g.lineWidth = 1; g.beginPath(); g.moveTo(0, RULER - 0.5); g.lineTo(V.W, RULER - 0.5); g.moveTo(RULER - 0.5, 0); g.lineTo(RULER - 0.5, V.H); g.stroke();
  g.font = '9px "JetBrains Mono", ui-monospace, monospace'; g.fillStyle = c.fg; g.strokeStyle = c.fg; g.globalAlpha = 0.85; // i18n-ignore: ids, key names, CSS
  g.beginPath();
  const ticks = (o) => {
    const off = o === 'v' ? V.ox : V.oy, len = o === 'v' ? V.W : V.H;
    const a = Math.floor((RULER - off) / z / minor) * minor, b = (len - off) / z;
    if ((b - a) / minor > 4000) return;
    for (let v = a; v <= b; v += minor) {
      const s = Math.round(off + v * z) + 0.5; if (s < RULER) continue;
      const major = Math.abs(v / step - Math.round(v / step)) < 1e-6, half = !major && Math.abs((v / step) * 2 - Math.round((v / step) * 2)) < 1e-6;
      const tl = major ? RULER : half ? 7 : 4;
      if (o === 'v') { g.moveTo(s, RULER - tl); g.lineTo(s, RULER); if (major) g.fillText(fmtPos(v), s + 2, 9); }
      else {
        g.moveTo(RULER - tl, s); g.lineTo(RULER, s);
        if (major) { g.save(); g.translate(9, s + 2); g.rotate(-Math.PI / 2); g.textAlign = 'right'; g.fillText(fmtPos(v), 0, 0); g.restore(); }
      }
    }
  };
  ticks('v'); ticks('h'); g.stroke();
  // Cursor position marks
  if (V.cursorIn && V.cursor) {
    g.globalAlpha = 1; g.strokeStyle = GUIDE_PREFS.color; g.beginPath();
    const cx0 = Math.round(V.ox + V.cursor.x * z) + 0.5, cy0 = Math.round(V.oy + V.cursor.y * z) + 0.5;
    if (cx0 > RULER) { g.moveTo(cx0, 0); g.lineTo(cx0, RULER); }
    if (cy0 > RULER) { g.moveTo(0, cy0); g.lineTo(RULER, cy0); }
    g.stroke();
  }
  g.globalAlpha = 1; g.fillStyle = c.bg; g.fillRect(0, 0, RULER, RULER);
  g.restore();
}
