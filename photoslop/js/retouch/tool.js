/* PhotoSlop: the Remove Object tool (key J, with the healing tools). Brush over the object, or draw round it with the
 * lasso mode; on release the marked area is removed (js/retouch/remove.js, loaded on first use): filled from its
 * surroundings on this device, or, for a big area, with Edit with AI if the person picks it. Works with a finger or a pen
 * (the canvas is the touch surface, core/view.js). "Remove selection" in the options bar removes the selection instead.
 * Loads at boot after tools/redeye.js (the tool list is read when the keys are built). */
'use strict';

T.remove = Object.assign({ size: 40, mode: 'brush' }, (store.get('tools', null) || {}).remove);

/** The marked area as a document-sized mask canvas: the stroke (brush) or the closed outline (lasso). */
function rtStrokeMask(pts, o) {
  const m = mkCanvas(D.w, D.h), g = cx(m);
  g.fillStyle = g.strokeStyle = '#000';
  g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
  if (o.mode === 'lasso' && pts.length > 2) { g.closePath(); g.fill(); }
  else {
    g.lineWidth = o.size; g.lineCap = g.lineJoin = 'round';
    if (pts.length === 1) { g.arc(pts[0].x, pts[0].y, o.size / 2, 0, Math.PI * 2); g.fill(); } else g.stroke();
  }
  return m;
}
function rtRemoveFrom(mask) {
  return psRetouch().then(() => rtRemoveObject(mask, { ask: true })).then((r) => { if (r) toast(r.split('. ')[0] + '.'); }).catch((e) => toast(e.message));
}

defTool({ id: 'remove', nk: 'remove', key: 'J', opt: () => T.remove,
  icon: ICON('M4 20h16M7 16l9-9 3 3-9 9H7zM5 5l4 4M9 5 5 9'),
  brushCursor() { return T.remove.mode === 'lasso' ? 0 : T.remove.size; },
  down(p) {
    if (!activeLayer()) { toast(rtT('no_picture_work')); this.s = null; return; }
    this.s = { pts: [p] }; dirty(true);
  },
  move(p) { if (this.s) { this.s.pts.push(p); dirty(true); } },
  up() {
    const s = this.s; this.s = null; dirty(true);
    if (!s) return;
    rtRemoveFrom(rtStrokeMask(s.pts, T.remove));
  },
  cancel() { this.s = null; dirty(true); },
  overlay(g) {
    const s = this.s; if (!s) return;
    g.save(); g.translate(V.ox, V.oy); g.scale(V.zoom, V.zoom);
    g.beginPath(); g.moveTo(s.pts[0].x, s.pts[0].y);
    for (const p of s.pts.slice(1)) g.lineTo(p.x, p.y);
    if (T.remove.mode === 'lasso') {
      g.closePath(); g.fillStyle = 'rgba(255, 40, 80, .28)'; g.fill();
      g.lineWidth = 1.5 / V.zoom; g.setLineDash([4 / V.zoom, 4 / V.zoom]); g.strokeStyle = '#fff'; g.stroke();
    } else {
      g.lineCap = g.lineJoin = 'round'; g.lineWidth = T.remove.size; g.strokeStyle = 'rgba(255, 40, 80, .45)'; g.stroke();
    }
    g.restore();
  },
  options(add) {
    add(optSelect(rtT('opt_mode'), T.remove, 'mode', [['brush', rtT('opt_brush')], ['lasso', rtT('opt_lasso')]], () => buildOptions()));
    if (T.remove.mode !== 'lasso') add(optRange(rtT('opt_size'), T.remove, 'size', 2, 500));
    if (D.sel) add(h('button', { class: 'btn', type: 'button', onclick: () => rtRemoveFrom(D.sel.mask) }, rtT('opt_remove_sel')));
    add(h('span', { class: 'opt-hint' }, rtT('opt_hint')));
  },
});
