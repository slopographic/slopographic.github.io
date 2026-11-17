/* Slop Upscale: tiling. Pure functions, no DOM, so Node tests can load it (module.exports) and the browser gets
 * window.SlopUpscaleTiling. Classic script.
 * A picture is cut into cores of `tile` px (the last row and column may be smaller). Each core is read together
 * with `overlap` px of picture on every side (clamped to the picture), so the model sees context at the seams. Only
 * the core of the model's output is kept, so every output pixel comes from exactly one tile and the seams line up.
 *   plan(W, H, { tile, overlap })   → { cols, rows, tiles: [{ col, row, core, src, inner }] }
 *       core:  the rectangle this tile owns, in picture pixels
 *       src:   the padded rectangle to read from the picture (inside the picture)
 *       inner: the core inside the padded rectangle (what to keep from the output, in input pixels)
 *   cropRGBA(data, srcW, rect)      copies a rectangle out of an RGBA buffer (row stride srcW pixels)
 *   placeRGBA(dst, dstW, block, x, y, w, h)   writes a w×h RGBA block into dst at (x, y)
 *   scaleRect(rect, s)              the same rectangle at s times the size */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopUpscaleTiling = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const int = (v, name) => {
    if (!Number.isInteger(v) || v < 1) throw new RangeError(`${name} must be a whole number above 0`);
    return v;
  };

  /** Splits W×H into tiles, see the header. Deterministic: the same arguments always give the same tiles. */
  function plan(W, H, o = {}) {
    int(W, 'width'); int(H, 'height');
    const tile = Math.max(8, Math.floor(o.tile || 128));
    const overlap = Math.max(0, Math.floor(o.overlap == null ? 16 : o.overlap));
    const cols = Math.ceil(W / tile), rows = Math.ceil(H / tile);
    const tiles = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * tile, y = row * tile;
        const w = Math.min(tile, W - x), h = Math.min(tile, H - y);
        const sx = Math.max(0, x - overlap), sy = Math.max(0, y - overlap);
        const ex = Math.min(W, x + w + overlap), ey = Math.min(H, y + h + overlap);
        tiles.push({
          col, row,
          core: { x, y, w, h },
          src: { x: sx, y: sy, w: ex - sx, h: ey - sy },
          inner: { x: x - sx, y: y - sy, w, h },
        });
      }
    }
    return { cols, rows, tiles };
  }

  /** A copy of rect r from an RGBA buffer whose rows are srcW pixels wide. */
  function cropRGBA(data, srcW, r) {
    const out = new Uint8ClampedArray(r.w * r.h * 4);
    const row = r.w * 4;
    for (let y = 0; y < r.h; y++) {
      const s = ((r.y + y) * srcW + r.x) * 4;
      out.set(data.subarray(s, s + row), y * row);
    }
    return out;
  }

  /** Writes a w×h RGBA block into dst (rows dstW pixels wide) with its top-left corner at (x, y). */
  function placeRGBA(dst, dstW, block, x, y, w, h) {
    const row = w * 4;
    for (let r = 0; r < h; r++) {
      const d = ((y + r) * dstW + x) * 4;
      dst.set(block.subarray(r * row, r * row + row), d);
    }
    return dst;
  }

  /** The rectangle r at s times the size (for output pixels). */
  function scaleRect(r, s) {
    return { x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s };
  }

  return { plan, cropRGBA, placeRGBA, scaleRect };
});
