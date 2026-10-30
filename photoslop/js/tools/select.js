/* PhotoSlop tools: tool registry, move, selection, crop and eyedropper */
'use strict';

/* ---------- tool definitions ---------- */
const ICON = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const TOOLS = [];
const TOOL = {};
/** A tool: t.nk names its words, photoslop.tool.<nk> (the full name, toolbox and palette) and <nk>_short (history steps,
 *  palette cycles); both are getters, so they follow a language change. */
function defTool(t) {
  if (t.nk) Object.defineProperties(t, { name: { get: () => tr('photoslop.tool.' + t.nk), enumerable: true, configurable: true },
    short: { get: () => tr('photoslop.tool.' + t.nk + '_short'), enumerable: true, configurable: true } });
  TOOLS.push(t); TOOL[t.id] = t; return t;
}
function currentTool() { return TRANSFORM.active ? TRANSFORM_TOOL : TOOL[UI.tool]; }
function selectTool(id) {
  if (!TOOL[id]) return;
  if (TRANSFORM.active) commitTransform();
  const prev = TOOL[UI.tool];
  if (prev && prev.deactivate) prev.deactivate();
  UI.tool = id; store.set('tool', id);
  const t = TOOL[id];
  if (t.activate) t.activate();
  V.el && (V.el.dataset.tool = id);
  emit('tool'); dirty();
}

/* Move */
defTool({ id: 'move', nk: 'move', key: 'V', icon: ICON('M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3'),
  down(p, e) {
    let L = activeLayer();
    if (T.move.auto || e.ctrlKey || e.metaKey) { const hit = layerAt(p); if (hit) { L = hit; D.activeId = hit.id; emit('doc'); } }
    if (!L || L.locked) { if (L) toast(tr('photoslop.tool.locked')); this.s = null; return; }
    const s = this.s = { L, start: p, dx: 0, dy: 0, box: D.sel ? D.sel.bounds : layerBoundsDoc(L) };
    if (D.sel && !e.altKey) {
      // Lift the selected pixels and float them.
      if (L.text || L.shape) s.L = L = rasterizeText(L, true);
      const sel = selInLayer(L);
      s.lift = copyCanvas(L.canvas); const lg = cx(s.lift); lg.globalCompositeOperation = 'destination-in'; lg.drawImage(sel, 0, 0);
      s.rest = copyCanvas(L.canvas); const rg = cx(s.rest); rg.globalCompositeOperation = 'destination-out'; rg.drawImage(sel, 0, 0);
      s.sel = D.sel;
      live = { layerId: L.id, hideSel: true, surface: (LL) => { const t = scratchCanvas('b', LL.canvas.width, LL.canvas.height), g = cx(t); g.drawImage(s.rest, 0, 0); g.drawImage(s.lift, Math.round(s.dx), Math.round(s.dy)); return { canvas: t, x: LL.x, y: LL.y, w: LL.canvas.width, h: LL.canvas.height }; } };
    } else {
      live = { layerId: L.id, surface: (LL) => ({ canvas: LL.canvas, x: LL.x + Math.round(s.dx), y: LL.y + Math.round(s.dy) }), maskSurface: (LL) => LL.mask && Object.assign({}, LL.mask, { x: LL.mask.x + Math.round(s.dx), y: LL.mask.y + Math.round(s.dy) }) };
    }
  },
  move(p, e) {
    const s = this.s; if (!s) return;
    s.dx = p.x - s.start.x; s.dy = p.y - s.start.y;
    if (e.shiftKey) { if (Math.abs(s.dx) > Math.abs(s.dy)) s.dy = 0; else s.dx = 0; }
    const sn = snapDelta(s.box, Math.round(s.dx), Math.round(s.dy)); if (!e.shiftKey || s.dy === 0) s.dx = sn.dx; if (!e.shiftKey || s.dx === 0) s.dy = sn.dy;
    dirty(true);
  },
  up() { const s = this.s; this.s = null; if (!s) return; live = null; moveBy(s, Math.round(s.dx), Math.round(s.dy)); },
  cancel() { this.s = null; live = null; dirty(true); },
  overlay(g) {
    const s = this.s;
    if (s && s.sel) drawAnts(g, s.sel, { x: Math.round(s.dx), y: Math.round(s.dy) });
  },
});
function layerBoundsDoc(L) {
  if (!L._bounds || L._bounds.c !== L.canvas) { const b = alphaBounds(L.canvas); L._bounds = { c: L.canvas, b }; }
  const b = L._bounds.b; return b && { x: b.x + L.x, y: b.y + L.y, w: b.w, h: b.h };
}
function layerAt(p) {
  for (let i = D.layers.length - 1; i >= 0; i--) {
    const L = D.layers[i]; if (!L.visible) continue;
    const x = Math.floor(p.x - L.x), y = Math.floor(p.y - L.y);
    if (x < 0 || y < 0 || x >= L.canvas.width || y >= L.canvas.height) continue;
    if (cxr(L.canvas).getImageData(x, y, 1, 1).data[3] > 10) return L;
  }
  return null;
}
function moveBy(s, dx, dy) {
  if (!dx && !dy) return;
  const L = D.layers.find((l) => l.id === s.L.id); if (!L) return;
  if (s.lift) {
    const x0 = Math.min(0, dx), y0 = Math.min(0, dy), x1 = Math.max(L.canvas.width, L.canvas.width + dx), y1 = Math.max(L.canvas.height, L.canvas.height + dy);
    const c = mkCanvas(x1 - x0, y1 - y0), g = cx(c);
    g.drawImage(s.rest, -x0, -y0); g.drawImage(s.lift, dx - x0, dy - y0);
    let mask = L.mask;
    patchLayer(L.id, { canvas: c, x: L.x + x0, y: L.y + y0, mask });
    const m = mkCanvas(D.w, D.h); cx(m).drawImage(s.sel.mask, dx, dy);
    D.sel = makeSel(m);
  } else {
    patchLayer(L.id, { x: L.x + dx, y: L.y + dy, mask: L.mask && Object.assign({}, L.mask, { x: L.mask.x + dx, y: L.mask.y + dy }), text: L.text && Object.assign({}, L.text, { x: L.text.x + dx, y: L.text.y + dy }) });
  }
  commit(TOOL.move.short);
}
function nudge(dx, dy) {
  const L = activeLayer(); if (!L || L.locked) return;
  const s = { L };
  if (D.sel) {
    const sel = selInLayer(L);
    s.lift = copyCanvas(L.canvas); const lg = cx(s.lift); lg.globalCompositeOperation = 'destination-in'; lg.drawImage(sel, 0, 0);
    s.rest = copyCanvas(L.canvas); const rg = cx(s.rest); rg.globalCompositeOperation = 'destination-out'; rg.drawImage(sel, 0, 0);
    s.sel = D.sel;
  }
  moveBy(s, dx, dy);
}

/* Marquees & lassos */
function selectionTool(def) {
  return defTool(Object.assign({
    down(p, e) {
      const mode = modeFrom(e);
      if (mode === 'replace' && D.sel && this.id !== 'polylasso' && insideSel(p)) { this.s = { moveSel: true, start: p, dx: 0, dy: 0, sel: D.sel }; live = { hideSel: true, animate: false }; return; }
      this.s = { mode, start: p, pts: [p], cur: p };
    },
    move(p, e) {
      const s = this.s; if (!s) return;
      if (s.moveSel) { const sn = snapDelta(s.sel.bounds, Math.round(p.x - s.start.x), Math.round(p.y - s.start.y)); s.dx = Math.round(sn.dx); s.dy = Math.round(sn.dy); return; }
      s.cur = p; s.e = e; if (this.freehand) s.pts.push(p);
    },
    up(p, e) {
      const s = this.s; this.s = null; if (!s) return;
      if (s.moveSel) {
        live = null;
        if (s.dx || s.dy) { const m = mkCanvas(D.w, D.h); cx(m).drawImage(s.sel.mask, s.dx, s.dy); D.sel = makeSel(m); commit(tr('photoslop.tool.step_move_selection')); }
        return;
      }
      if (Math.hypot(p.x - s.start.x, p.y - s.start.y) * V.zoom < 3 && !this.freehand) { if (s.mode === 'replace' && D.sel) deselect(); return; }
      this.apply(s, e);
    },
    cancel() { this.s = null; live = null; },
    overlay(g) {
      const s = this.s; if (!s) return;
      if (s.moveSel) { drawAnts(g, s.sel, { x: s.dx, y: s.dy }); return; }
      g.save(); g.translate(V.ox, V.oy); g.scale(V.zoom, V.zoom); g.lineWidth = 1 / V.zoom;
      this.path(g, s);
      g.setLineDash([4 / V.zoom, 4 / V.zoom]); g.strokeStyle = '#000'; g.stroke(); g.lineDashOffset = 4 / V.zoom; g.strokeStyle = '#fff'; g.stroke();
      g.restore();
    },
  }, def));
}
function insideSel(p) {
  if (!D.sel) return false;
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= D.w || y >= D.h) return false;
  return cxr(D.sel.mask).getImageData(x, y, 1, 1).data[3] >= 128;
}
selectionTool({ id: 'marquee', nk: 'marquee', key: 'M', icon: ICON('M4 4h3M10 4h4M17 4h3v3M20 10v4M20 17v3h-3M14 20h-4M7 20H4v-3M4 14v-4M4 7V4'),
  rect(s) { const e = s.e || {}; return rectFrom(s.start, s.cur, e.shiftKey && s.mode === 'replace', e.altKey && s.mode === 'replace'); },
  path(g, s) { const r = this.rect(s); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); },
  apply(s) { const r = this.rect(s); selectShape((g) => g.fillRect(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)), s.mode, T.select.feather); commit(TOOL.marquee.short); } });
selectionTool({ id: 'ellipse', nk: 'ellipse', key: 'M', icon: ICON('M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8z'),
  rect(s) { const e = s.e || {}; return rectFrom(s.start, s.cur, e.shiftKey && s.mode === 'replace', e.altKey && s.mode === 'replace'); },
  path(g, s) { const r = this.rect(s); g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.1, r.w / 2), Math.max(0.1, r.h / 2), 0, 0, Math.PI * 2); },
  apply(s) { const r = this.rect(s); selectShape((g) => { g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.1, r.w / 2), Math.max(0.1, r.h / 2), 0, 0, Math.PI * 2); g.fill(); }, s.mode, T.select.feather); commit(TOOL.ellipse.short); } });
selectionTool({ id: 'lasso', nk: 'lasso', key: 'L', freehand: true, icon: ICON('M7 15c-3-1.5-4-4-2.5-6.5C6.5 5 12 4 16 5.5s5 5 2 7.5-8 3-11 2zM7 15c-1 2 0 4 2 5'),
  path(g, s) { g.beginPath(); s.pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); },
  apply(s) { if (s.pts.length < 3) { if (s.mode === 'replace') deselect(); return; } selectShape((g) => { g.beginPath(); s.pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.fill(); }, s.mode, T.select.feather); commit(TOOL.lasso.short); } });
defTool({ id: 'polylasso', nk: 'polylasso', key: 'L', icon: ICON('M4 18 7 5l7 4 6-3-2 12z'),
  down(p, e) {
    const s = this.s;
    if (!s) { this.s = { mode: modeFrom(e), pts: [p], cur: p }; return; }
    const first = s.pts[0];
    if (s.pts.length > 2 && Math.hypot(p.x - first.x, p.y - first.y) * V.zoom < 8) { this.finish(); return; }
    s.pts.push(p);
  },
  hover(p) { if (this.s) this.s.cur = p; },
  move(p) { if (this.s) this.s.cur = p; },
  dblclick() { this.finish(); },
  finish() {
    const s = this.s; this.s = null; if (!s || s.pts.length < 3) return;
    selectShape((g) => { g.beginPath(); s.pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.fill(); }, s.mode, T.select.feather);
    commit(TOOL.polylasso.short);
  },
  onKey(e) { if (!this.s) return false; if (e.key === 'Enter') { this.finish(); return true; } if (e.key === 'Escape') { this.s = null; dirty(); return true; } if (e.key === 'Backspace' || e.key === 'Delete') { this.s.pts.pop(); if (!this.s.pts.length) this.s = null; dirty(); return true; } return false; },
  cancel() { this.s = null; },
  deactivate() { this.s = null; },
  overlay(g) {
    const s = this.s; if (!s) return;
    g.save(); g.translate(V.ox, V.oy); g.scale(V.zoom, V.zoom); g.lineWidth = 1 / V.zoom;
    g.beginPath(); s.pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.lineTo(s.cur.x, s.cur.y);
    g.setLineDash([4 / V.zoom, 4 / V.zoom]); g.strokeStyle = '#000'; g.stroke(); g.lineDashOffset = 4 / V.zoom; g.strokeStyle = '#fff'; g.stroke();
    g.restore();
  },
});
defTool({ id: 'wand', nk: 'wand', key: 'W', icon: ICON('M4 20 14 10M14 10l2-2M17 3v3M17 12v3M12 7.5h3M19 7.5h3M14.5 5l1.5 1.5M19.5 10l-1.5-1.5M19.5 5 18 6.5'),
  down(p, e) {
    const src = sampleSource(T.wand.sampleAll), m = regionMask(src, p.x, p.y, T.wand.tol, T.wand.contiguous);
    if (!m) { if (modeFrom(e) === 'replace') deselect(); return; }
    const mc = maskToCanvas(m, D.w, D.h);
    selectShape((g) => g.drawImage(mc, 0, 0), modeFrom(e), T.select.feather);
    commit(TOOL.wand.short);
  } });
defTool({ id: 'crop', nk: 'crop', key: 'C', icon: ICON('M6 2v16h16M2 6h16v16'),
  activate() { this.r = { x: 0, y: 0, w: D.w, h: D.h }; },
  deactivate() { this.r = null; this.s = null; },
  handleAt(p) {
    const r = this.r; if (!r) return null;
    const tol = handleR(9) / V.zoom, xs = [r.x, r.x + r.w / 2, r.x + r.w], ys = [r.y, r.y + r.h / 2, r.y + r.h];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { if (i === 1 && j === 1) continue; if (Math.abs(p.x - xs[i]) < tol && Math.abs(p.y - ys[j]) < tol) return { hx: i - 1, hy: j - 1 }; }
    if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) return { move: true };
    return null;
  },
  down(p) { if (!this.r) this.activate(); const h = this.handleAt(p); this.s = { h: h || { draw: true }, start: p, r0: Object.assign({}, this.r) }; },
  move(p, e) {
    const s = this.s; if (!s) return;
    const dx = p.x - s.start.x, dy = p.y - s.start.y, r0 = s.r0;
    if (s.h.draw) this.r = rectFrom(s.start, p, e.shiftKey, e.altKey);
    else if (s.h.move) this.r = { x: r0.x + dx, y: r0.y + dy, w: r0.w, h: r0.h };
    else {
      let { x, y, w, h: hh } = r0;
      if (s.h.hx < 0) { x += dx; w -= dx; } if (s.h.hx > 0) w += dx;
      if (s.h.hy < 0) { y += dy; hh -= dy; } if (s.h.hy > 0) hh += dy;
      if (w < 0) { x += w; w = -w; } if (hh < 0) { y += hh; hh = -hh; }
      this.r = { x, y, w, h: hh };
    }
  },
  up() { this.s = null; },
  hover(p) { const h = this.handleAt(p); V.el.style.cursor = !h ? 'crosshair' : h.move ? 'move' : (h.hx * h.hy > 0 ? 'nwse-resize' : h.hx * h.hy < 0 ? 'nesw-resize' : h.hx ? 'ew-resize' : 'ns-resize'); },
  onKey(e) { if (e.key === 'Enter') { this.apply(); return true; } if (e.key === 'Escape') { this.activate(); dirty(); return true; } return false; },
  dblclick() { this.apply(); },
  apply() { const r = this.r; if (!r || r.w < 1 || r.h < 1) return; cropTo(r, T.crop.del); this.activate(); fitView(); },
  overlay(g) {
    const r = this.r; if (!r) return;
    const a = toScreen(r.x, r.y), w = r.w * V.zoom, hh = r.h * V.zoom;
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.beginPath(); g.rect(0, 0, V.W, V.H); g.rect(a.x, a.y, w, hh); g.fill('evenodd');
    g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(a.x + 0.5, a.y + 0.5, w, hh);
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.beginPath();
    for (let i = 1; i < 3; i++) { g.moveTo(a.x + (w * i) / 3, a.y); g.lineTo(a.x + (w * i) / 3, a.y + hh); g.moveTo(a.x, a.y + (hh * i) / 3); g.lineTo(a.x + w, a.y + (hh * i) / 3); }
    g.stroke();
    g.fillStyle = '#fff';
    for (const [i, j] of [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]]) g.fillRect(a.x + w * i - 4, a.y + hh * j - 4, 8, 8);
    g.font = '11px "JetBrains Mono", monospace'; g.fillStyle = '#fff'; g.fillText(`${Math.round(r.w)} × ${Math.round(r.h)} px · Enter to crop`, a.x + 4, a.y - 8); // i18n-ignore: a CSS font
  },
});
