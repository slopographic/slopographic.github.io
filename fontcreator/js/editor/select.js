/* Slop Font: the Select tool (V). A point: click to select it (Shift adds), drag to move the selected points with their
 * handles; a handle: drag it (a smooth point keeps its two handles in line; Alt breaks them); the inside of a contour:
 * click to select it, drag to move it; empty space: drag a box round points. Arrow keys nudge the selection one unit
 * (Shift: ten), Delete removes it, a double click turns a point smooth or sharp, Ctrl+A selects all, Escape none.
 * Moves snap (js/editor/view.js snap). Each drag or nudge is one undo step. Classic script, registers FC.tools.select. */
(function (g) {
  'use strict';
  const S = () => g.FC.state, E = () => g.FC.editor, G = () => g.SVGeom;
  const clone = (cs) => cs.map((c) => ({ closed: c.closed !== false, pts: c.pts.map((p) => ({ x: p.x, y: p.y, ix: p.ix, iy: p.iy, ox: p.ox, oy: p.oy })) }));
  let drag = null, band = null;

  function hitPoint(cs, ev) {
    const R = E().hitR();
    let best = null;
    cs.forEach((c, ci) => c.pts.forEach((a, i) => {
      const s = E().toScreen(a.x, a.y), d = Math.hypot(s.x - ev.sx, s.y - ev.sy);
      if (d <= R && (!best || d < best.d)) best = { ci, i, d };
    }));
    return best;
  }
  function hitHandle(cs, ev) {
    const sel = S().sel, R = E().hitR();
    let best = null;
    cs.forEach((c, ci) => {
      const active = sel.contours.has(ci) || c.pts.some((_, i) => sel.points.has(ci + ':' + i));
      if (!active) return;
      c.pts.forEach((a, i) => {
        for (const side of ['i', 'o']) {
          const hx = a[side + 'x'], hy = a[side + 'y'];
          if (hx === a.x && hy === a.y) continue;
          const s = E().toScreen(hx, hy), d = Math.hypot(s.x - ev.sx, s.y - ev.sy);
          if (d <= R && (!best || d < best.d)) best = { ci, i, side, d };
        }
      });
    });
    return best;
  }
  function hitInside(cs, pt) {
    for (let ci = cs.length - 1; ci >= 0; ci--) {
      const poly = G().flatten([cs[ci]], 2)[0].pts;
      if (poly.length > 2 && G().winding(poly, pt) !== 0) return ci;
    }
    return -1;
  }
  const selectContour = (ci, cs) => { S().sel.contours.add(ci); cs[ci].pts.forEach((_, i) => S().sel.points.add(ci + ':' + i)); };
  function down(ev) {
    const cs = E().contours(), sel = S().sel, shift = ev.e.shiftKey;
    const h = hitHandle(cs, ev);
    if (h) { drag = { kind: 'handle', h, base: clone(cs), alt: ev.e.altKey, moved: false }; return; }
    const p = hitPoint(cs, ev);
    if (p) {
      const k = p.ci + ':' + p.i;
      if (!sel.points.has(k)) { if (!shift) S().clearSel(); sel.points.add(k); }
      else if (shift) { sel.points.delete(k); sel.contours.delete(p.ci); E().paint(); return; }
      drag = { kind: 'points', anchor: cs[p.ci].pts[p.i], base: clone(cs), start: ev.pt, moved: false };
      E().paint(); return;
    }
    const ci = hitInside(cs, ev.pt);
    if (ci >= 0) {
      if (!shift && !sel.contours.has(ci)) S().clearSel();
      selectContour(ci, cs);
      drag = { kind: 'points', anchor: null, base: clone(cs), start: ev.pt, moved: false };
      E().paint(); return;
    }
    if (!shift) S().clearSel();
    band = { a: { x: ev.sx, y: ev.sy }, b: { x: ev.sx, y: ev.sy } };
    E().paint();
  }
  function move(ev) {
    if (band) { band.b = { x: ev.sx, y: ev.sy }; E().paint(); return; }
    if (!drag) return;
    const cs = clone(drag.base);
    if (drag.kind === 'handle') {
      const { ci, i, side } = drag.h, a = cs[ci].pts[i], q = E().snap(ev.pt, { free: ev.e.altKey });
      const smooth = !drag.alt && G().isSmooth(drag.base[ci].pts[i]);
      a[side + 'x'] = q.x; a[side + 'y'] = q.y;
      if (smooth) {
        const o = side === 'i' ? 'o' : 'i', len = Math.hypot(a[o + 'x'] - a.x, a[o + 'y'] - a.y), dx = a.x - q.x, dy = a.y - q.y, l = Math.hypot(dx, dy) || 1;
        a[o + 'x'] = a.x + (dx / l) * len; a[o + 'y'] = a.y + (dy / l) * len;
      }
    } else {
      let dx = ev.pt.x - drag.start.x, dy = ev.pt.y - drag.start.y;
      if (drag.anchor) { const q = E().snap({ x: drag.anchor.x + dx, y: drag.anchor.y + dy }, { free: ev.e.altKey }); dx = q.x - drag.anchor.x; dy = q.y - drag.anchor.y; }
      else { dx = Math.round(dx); dy = Math.round(dy); }
      shift(cs, dx, dy);
    }
    drag.moved = true;
    E().setDraft(cs);
  }
  function shift(cs, dx, dy) {
    const sel = S().sel;
    cs.forEach((c, ci) => c.pts.forEach((a, i) => {
      if (!sel.points.has(ci + ':' + i)) return;
      a.x += dx; a.y += dy; a.ix += dx; a.iy += dy; a.ox += dx; a.oy += dy;
    }));
  }
  function up() {
    if (band) {
      const x0 = Math.min(band.a.x, band.b.x), x1 = Math.max(band.a.x, band.b.x), y0 = Math.min(band.a.y, band.b.y), y1 = Math.max(band.a.y, band.b.y);
      E().contours().forEach((c, ci) => {
        c.pts.forEach((a, i) => { const s = E().toScreen(a.x, a.y); if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) S().sel.points.add(ci + ':' + i); });
        if (c.pts.every((_, i) => S().sel.points.has(ci + ':' + i))) S().sel.contours.add(ci);
      });
      band = null; E().paint(); return;
    }
    if (drag && drag.moved) E().commit(g.FC.t(drag.kind === 'handle' ? 'fontcreator.ops.undo_handle' : 'fontcreator.ops.undo_points'));
    drag = null;
  }
  function removeSelected() {
    const sel = S().sel;
    if (!sel.points.size) return false;
    S().edit(g.FC.t('fontcreator.ops.undo_delete_points'), 'glyph', (p, gl) => {
      gl.contours = gl.contours.map((c, ci) => ({ closed: c.closed, pts: c.pts.filter((_, i) => !sel.points.has(ci + ':' + i)) })).filter((c) => c.pts.length >= 2);
    });
    S().clearSel(); E().paint();
    return true;
  }
  function nudge(dx, dy) {
    if (!S().sel.points.size) return;
    const cs = clone(E().contours());
    shift(cs, dx, dy);
    S().edit(g.FC.t('fontcreator.ops.undo_nudge'), 'glyph', (p, gl) => { gl.contours = cs; });
  }
  function toggleSmooth(ci, i) {
    S().edit(g.FC.t('fontcreator.ops.undo_smooth'), 'glyph', (p, gl) => {
      const c = gl.contours[ci], n = c.pts.length, a = c.pts[i];
      if (G().hasIn(a) || G().hasOut(a)) { a.ix = a.x; a.iy = a.y; a.ox = a.x; a.oy = a.y; return; }
      const prev = c.pts[(i - 1 + n) % n], next = c.pts[(i + 1) % n];
      const dx = next.x - prev.x, dy = next.y - prev.y, l = Math.hypot(dx, dy) || 1;
      const li = Math.hypot(a.x - prev.x, a.y - prev.y) / 3, lo = Math.hypot(next.x - a.x, next.y - a.y) / 3;
      a.ix = Math.round(a.x - (dx / l) * li); a.iy = Math.round(a.y - (dy / l) * li); a.ox = Math.round(a.x + (dx / l) * lo); a.oy = Math.round(a.y + (dy / l) * lo);
    });
  }
  function dbl(ev) { const p = hitPoint(E().contours(), ev); if (p) toggleSmooth(p.ci, p.i); }
  function key(e) {
    const step = e.shiftKey ? 10 : 1, mod = e.ctrlKey || e.metaKey;
    const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (arrows[e.key] && S().sel.points.size) { e.preventDefault(); nudge(...arrows[e.key]); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && removeSelected()) e.preventDefault();
    else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); }
    else if (e.key === 'Escape') { S().clearSel(); E().paint(); }
  }
  function selectAll() { const cs = E().contours(); S().clearSel(); cs.forEach((_, ci) => selectContour(ci, cs)); E().paint(); }
  function overlay(ctx, o, C) {
    if (!band) return;
    ctx.setLineDash([4, 3]); ctx.strokeStyle = C.accent; ctx.lineWidth = 1;
    ctx.strokeRect(Math.min(band.a.x, band.b.x) + 0.5, Math.min(band.a.y, band.b.y) + 0.5, Math.abs(band.b.x - band.a.x), Math.abs(band.b.y - band.a.y));
    ctx.setLineDash([]);
  }
  const cancel = () => { drag = null; band = null; };
  g.FC.tools = g.FC.tools || { all: {} };
  g.FC.tools.all.select = { id: 'select', down, move, up, dbl, key, overlay, cancel, removeSelected, selectAll, nudge, toggleSmooth };
})(window);
