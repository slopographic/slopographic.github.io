/* Slop Font: the drawing tools. Pen (P): click for a sharp point, drag for a smooth one, click the first point (or press
 * Enter, or double click) to close the contour; a click on an existing outline adds a point there. Rectangle (R) and
 * Ellipse (E): drag a box (Shift: a square or a circle). Stroke (S): click the centre line of a stroke, double click or
 * Enter to finish; it becomes an outline of the panel's stroke width (core/stroke.js). Escape drops what is being drawn.
 * Every finished shape is one undo step. Classic script. FC.tools: current(), set(id), all, IDS. */
(function (g) {
  'use strict';
  const S = () => g.FC.state, E = () => g.FC.editor, G = () => g.SVGeom, P = () => g.SlopFont.paths;
  const T = (g.FC.tools = g.FC.tools || { all: {} });
  const add = (label, contours) => { if (contours.length) S().edit(label, 'glyph', (p, gl) => { gl.contours = gl.contours.concat(P().clean(contours)); }); };
  const near = (a, ev) => { const s = E().toScreen(a.x, a.y); return Math.hypot(s.x - ev.sx, s.y - ev.sy) <= E().hitR(); };
  const anchor = (q) => ({ x: q.x, y: q.y, ix: q.x, iy: q.y, ox: q.x, oy: q.y });

  // ---- pen
  let pen = null, hover = null;
  function penFinish() {
    const pts = pen ? pen.pts.filter((a, i, all) => i === 0 || a.x !== all[i - 1].x || a.y !== all[i - 1].y) : [];
    if (pts.length >= 2) add(g.FC.t('fontcreator.undo.draw_contour'), [{ closed: true, pts }]);
    pen = null; E().paint();
  }
  T.all.pen = {
    id: 'pen',
    down(ev) {
      if (pen && pen.pts.length >= 2 && near(pen.pts[0], ev)) { penFinish(); return; }
      if (!pen) {
        const cs = E().contours();
        for (let ci = 0; ci < cs.length; ci++) {
          const hit = G().nearestOnSub(cs[ci], ev.pt);
          if (hit && hit.d * E().cam().z <= E().hitR()) {
            S().edit(g.FC.t('fontcreator.undo.add_point'), 'glyph', (p, gl) => { G().splitSegAt(gl.contours[ci], hit.i, hit.t); gl.contours = P().clean(gl.contours); });
            return;
          }
        }
        pen = { pts: [], dragging: false };
      }
      pen.pts.push(anchor(E().snap(ev.pt, { free: ev.e.altKey })));
      pen.dragging = true; E().paint();
    },
    move(ev) {
      hover = ev.pt;
      if (pen && pen.dragging) {
        const a = pen.pts[pen.pts.length - 1], q = E().snap(ev.pt, { free: ev.e.altKey });
        a.ox = q.x; a.oy = q.y; a.ix = 2 * a.x - q.x; a.iy = 2 * a.y - q.y;
      }
      E().paint();
    },
    up() { if (pen) pen.dragging = false; },
    dbl() { penFinish(); },
    key(e) { if (e.key === 'Enter') { e.preventDefault(); penFinish(); } else if (e.key === 'Escape') { pen = null; E().paint(); } },
    cancel() { if (pen) pen.dragging = false; },
    finish: penFinish,
    overlay(ctx, o, C) {
      if (!pen || !pen.pts.length) return;
      const pts = pen.pts.slice();
      if (hover && !pen.dragging) pts.push(anchor(hover));
      g.FC.editorDraw.trace(ctx, [{ closed: false, pts }], o.cam);
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.stroke();
      for (const a of pen.pts) { const s = E().toScreen(a.x, a.y); ctx.fillStyle = C.accent; ctx.fillRect(s.x - 3.5, s.y - 3.5, 7, 7); }
    },
  };

  // ---- rectangle and ellipse
  function shapeTool(id, label, make) {
    let box = null;
    const corners = (ev) => {
      const b = E().snap(ev.pt, { free: ev.e.altKey });
      let w = b.x - box.a.x, h = b.y - box.a.y;
      if (ev.e.shiftKey) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
      return { x: Math.min(box.a.x, box.a.x + w), y: Math.min(box.a.y, box.a.y + h), w: Math.abs(w), h: Math.abs(h) };
    };
    T.all[id] = {
      id,
      down(ev) { box = { a: E().snap(ev.pt, { free: ev.e.altKey }), r: null }; },
      move(ev) { if (box) { box.r = corners(ev); E().paint(); } },
      up(ev) { if (!box) return; const r = corners(ev); box = null; if (r.w >= 2 && r.h >= 2) add(g.FC.t(label), make(r)); else E().paint(); },
      cancel() { box = null; },
      overlay(ctx, o, C) {
        if (!box || !box.r) return;
        g.FC.editorDraw.trace(ctx, make(box.r), o.cam);
        ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
      },
    };
  }
  shapeTool('rect', 'fontcreator.undo.draw_rect', (r) => P().rect(r.x, r.y, r.w, r.h, 0));
  shapeTool('ellipse', 'fontcreator.undo.draw_ellipse', (r) => P().ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2));

  // ---- stroke
  let line = null;
  function strokeFinish() {
    if (line && line.length) {
      const st = S().settings();
      const out = g.SlopFont.stroke.outline([{ points: line.map((q) => [q.x, q.y]) }], { width: st.strokeWidth, cap: st.cap });
      add(g.FC.t('fontcreator.undo.draw_stroke'), out);
    }
    line = null; E().paint();
  }
  T.all.stroke = {
    id: 'stroke',
    down(ev) {
      const q = E().snap(ev.pt, { free: ev.e.altKey });
      if (!line) line = [];
      const last = line[line.length - 1];
      if (!last || last.x !== q.x || last.y !== q.y) line.push(q);
      E().paint();
    },
    move(ev) { hover = ev.pt; if (line) E().paint(); },
    dbl() { strokeFinish(); },
    key(e) { if (e.key === 'Enter') { e.preventDefault(); strokeFinish(); } else if (e.key === 'Escape') { line = null; E().paint(); } },
    finish: strokeFinish,
    overlay(ctx, o, C) {
      if (!line || !line.length) return;
      const pts = line.concat(hover ? [hover] : []).map((q) => E().toScreen(q.x, q.y));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, S().settings().strokeWidth * o.cam.z);
      ctx.strokeStyle = C.accent; ctx.globalAlpha = 0.35;
      ctx.beginPath(); pts.forEach((s, i) => (i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y))); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    },
  };

  T.IDS = [['select', 'V'], ['pen', 'P'], ['rect', 'R'], ['ellipse', 'E'], ['stroke', 'S']];   // names: fontcreator.tool.<id>
  T.current = () => T.all[S().settings().tool] || T.all.select;
  T.set = (id) => {
    if (!T.all[id]) throw new Error(`Unknown tool “${id}”`);
    const cur = T.current();
    if (cur.finish && cur.id !== id) cur.finish();
    S().set({ tool: id });
    E().paint();
  };
})(window);
