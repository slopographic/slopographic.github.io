/* SlopIsolate — refine brush on the edit map (item.edit: Uint8 per pixel, 128 = untouched, 255 = keep,
 * 0 = remove). A stroke remembers the original bytes of every 64×64 tile it touches (for undo) and its own
 * per-pixel coverage, so overlapping dabs within one stroke never build up past the brush's opacity. */
(function () {
  'use strict';
  const CO = window.CO;
  const TILE = 64;
  const TARGET = { keep: 255, remove: 0, restore: 128 };

  function ensureEdit(it) { if (!it.edit) it.edit = new Uint8ClampedArray(it.w * it.h).fill(128); return it.edit; }
  /** Brush opacity at distance d from the centre: 1 inside radius·hardness, smooth falloff to 0 at radius. */
  function profile(d, r, hardness) {
    const inner = Math.min(r * hardness, r - 1);
    if (d <= inner) return 1;
    if (d >= r) return 0;
    const t = (d - inner) / (r - inner);
    return 1 - t * t * (3 - 2 * t);
  }
  function begin(it, mode) {
    ensureEdit(it);
    return { it, mode, target: TARGET[mode] == null ? 255 : TARGET[mode], tiles: new Map(), tx: Math.ceil(it.w / TILE), last: null, dirty: null };
  }
  function tileOf(st, x, y) {
    const tx = (x / TILE) | 0, ty = (y / TILE) | 0, key = ty * st.tx + tx;
    let t = st.tiles.get(key);
    if (!t) {
      const it = st.it, x0 = tx * TILE, y0 = ty * TILE, w = Math.min(TILE, it.w - x0), h = Math.min(TILE, it.h - y0);
      const orig = new Uint8ClampedArray(w * h);
      for (let j = 0; j < h; j++) orig.set(it.edit.subarray((y0 + j) * it.w + x0, (y0 + j) * it.w + x0 + w), j * w);
      t = { x0, y0, w, h, orig, cov: new Uint8Array(w * h) };
      st.tiles.set(key, t);
    }
    return t;
  }
  const union = (a, b) => (!a ? b : !b ? a : { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
  /** One round dab at image coordinates (x, y). Returns the dirty rect {x, y, x1, y1} (exclusive end) or null. */
  function dab(st, x, y, r, hardness) {
    const it = st.it, ed = it.edit;
    const xa = Math.max(0, Math.floor(x - r)), xb = Math.min(it.w, Math.ceil(x + r) + 1), ya = Math.max(0, Math.floor(y - r)), yb = Math.min(it.h, Math.ceil(y + r) + 1);
    if (xa >= xb || ya >= yb) return null;
    for (let py = ya; py < yb; py++) {
      for (let px = xa; px < xb; px++) {
        const f = profile(Math.hypot(px + 0.5 - x, py + 0.5 - y), r, hardness);
        if (f <= 0) continue;
        const t = tileOf(st, px, py), k = (py - t.y0) * t.w + (px - t.x0), c = Math.round(f * 255);
        if (c <= t.cov[k]) continue;
        t.cov[k] = c;
        const o = t.orig[k];
        ed[py * it.w + px] = o + (st.target - o) * c / 255;
      }
    }
    const d = { x: xa, y: ya, x1: xb, y1: yb };
    st.dirty = union(st.dirty, d);
    return d;
  }
  /** Dabs along a segment (spacing a fifth of the radius). Returns the dirty rect of the segment. */
  function line(st, x0, y0, x1, y1, r, hardness) {
    const len = Math.hypot(x1 - x0, y1 - y0), step = Math.max(0.75, r * 0.2), n = Math.max(1, Math.ceil(len / step));
    let rect = null;
    for (let i = st.last ? 1 : 0; i <= n; i++) rect = union(rect, dab(st, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, r, hardness));
    st.last = [x1, y1];
    return rect;
  }
  /** Finish a stroke: returns an undo entry ({ kind: 'stroke', tiles }) or null if nothing changed. */
  function end(st) {
    if (!st.tiles.size) return null;
    const tiles = [];
    for (const t of st.tiles.values()) tiles.push({ x0: t.x0, y0: t.y0, w: t.w, h: t.h, bytes: t.orig });
    return { kind: 'stroke', label: st.mode === 'keep' ? 'cutout.menu.keep_brush' : st.mode === 'remove' ? 'cutout.menu.remove_brush' : 'cutout.undo.brush', tiles, rect: st.dirty };
  }
  /** Undo/redo: swap the saved tile bytes with the current ones (the entry then holds the other state). */
  function swap(it, entry) {
    ensureEdit(it);
    for (const t of entry.tiles) {
      for (let j = 0; j < t.h; j++) {
        const o = (t.y0 + j) * it.w + t.x0, row = it.edit.slice(o, o + t.w);
        it.edit.set(t.bytes.subarray(j * t.w, (j + 1) * t.w), o);
        t.bytes.set(row, j * t.w);
      }
    }
    return entry.rect;
  }
  /** True if the edit map has any change (so exports know whether to send it). */
  const hasEdits = (it) => !!it.edit && it.edit.some((v) => v !== 128);

  CO.brush = { TILE, TARGET, ensureEdit, profile, begin, dab, line, end, swap, hasEdits };
})();
