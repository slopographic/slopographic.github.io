/* PhotoSlop tools: the Red Eye tool. Drag a region (a click corrects a square around the point).
 * The correction is limited to the region and to the selection when there is one. One history step. */
'use strict';

/** Applies red-eye correction to layer L inside doc-space rect r (and the selection, if any). */
function redEyeRegion(L, r) {
  const W = L.canvas.width, H = L.canvas.height;
  const m = mkCanvas(W, H), mg = cx(m);
  mg.fillStyle = '#000';
  mg.fillRect(r.x0 - L.x, r.y0 - L.y, r.x1 - r.x0, r.y1 - r.y0);
  if (D.sel) { mg.globalCompositeOperation = 'destination-in'; mg.drawImage(selInLayer(L), 0, 0); }
  const o = T.redeye;
  const out = withPixels(L.canvas, (d) => redEyeData(d, o.tol, o.dark));
  patchLayer(L.id, { canvas: mixBySel(L.canvas, out, m), text: null });
  commit(TOOL.redeye.short);
}

defTool({ id: 'redeye', nk: 'redeye', key: 'J', icon: ICON('M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'),
  opt: () => T.redeye,
  down(p) {
    const L = editableLayer(); if (!L) { this.s = null; return; }
    this.s = { L: L.id, p0: p, p1: p }; dirty(true);
  },
  move(p) { if (this.s) { this.s.p1 = p; dirty(true); } },
  up(p) {
    const S = this.s; this.s = null; if (!S) return;
    const L = D.layers.find((l) => l.id === S.L); if (!L) return;
    const a = S.p0, b = p;
    let r = { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
    if (Math.hypot(b.x - a.x, b.y - a.y) < 3) {
      const h = T.redeye.size / 2; r = { x0: a.x - h, y0: a.y - h, x1: a.x + h, y1: a.y + h };
    }
    redEyeRegion(L, r);
  },
  cancel() { this.s = null; dirty(true); },
  overlay(g) {
    if (!this.s) return;
    const a = toScreen(this.s.p0.x, this.s.p0.y), b = toScreen(this.s.p1.x, this.s.p1.y);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.setLineDash([4, 3]); g.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); g.setLineDash([]);
  },
});
