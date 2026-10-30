/* Slop Font: the handwriting sheet. A printable page (A4 or US Letter at 150 dpi) with a box per character, its guide
 * lines (ascender, cap height, x-height, baseline, descender) placed from the font's metrics, and a black square in each
 * corner. A photo or scan of the filled sheet is read back by finding the four squares, mapping the page onto the photo
 * (a homography, so a photo taken at an angle still reads) and cutting out each box for the tracer. Pure, no DOM; the
 * page is drawn on a canvas by js/io/sheet-ui.js from layout().
 *   PAGES, COLS, ROWS               page sizes (px at 150 dpi), boxes per row and per page column
 *   layout(cps, metrics, opts) → { width, height, pages: [{ index, cells: [cell] }], markers, size }
 *     cell: { cp, x, y, w, h, area: { x, y, w, h }, lines: { asc, cap, x, base, desc } }   (page px; lines are rows)
 *   findMarkers(bits, w, h) → [{ x, y }] × 4 (top left, top right, bottom right, bottom left) or null
 *   homography(from[4], to[4]) → 3×3 (row-major, 9 numbers)    apply(H, x, y) → { x, y }
 *   cut(img, H, rect) → { data, width, height }   the page rectangle (page px) as an RGBA picture, sampled from img */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else { const F = root.SlopFont; F.sheet = factory(F.charset); }
})(typeof window !== 'undefined' ? window : globalThis, function (CS) {
  'use strict';
  const PAGES = Object.freeze({ a4: { w: 1240, h: 1754, label: 'A4' }, letter: { w: 1275, h: 1650, label: 'US Letter' } }); // i18n-ignore
  const COLS = 6, ROWS = 7, MARGIN = 54, MARK = 44, LABEL = 30;

  function layout(cps, metrics, opts = {}) {
    const pg = PAGES[opts.page] || PAGES.a4, W = pg.w, H = pg.h;
    const top = MARGIN + MARK + 36, bottom = H - MARGIN - MARK - 16;
    const cw = Math.floor((W - 2 * MARGIN) / COLS), ch = Math.floor((bottom - top) / ROWS);
    const asc = metrics.ascender, desc = metrics.descender, em = asc - desc;
    const per = COLS * ROWS, pages = [];
    for (let i = 0; i < cps.length; i += per) {
      const cells = cps.slice(i, i + per).map((cp, k) => {
        const x = MARGIN + (k % COLS) * cw, y = top + Math.floor(k / COLS) * ch;
        const area = { x: x + 6, y: y + LABEL, w: cw - 12, h: ch - LABEL - 6 };
        const row = (v) => Math.round(area.y + area.h * ((asc - v) / em));
        return { cp, label: CS.label(cp), x, y, w: cw, h: ch, area,
          lines: { asc: row(asc), cap: row(metrics.capHeight), x: row(metrics.xHeight), base: row(0), desc: row(desc) } };
      });
      pages.push({ index: pages.length, cells });
    }
    const markers = [[MARGIN, MARGIN], [W - MARGIN - MARK, MARGIN], [W - MARGIN - MARK, H - MARGIN - MARK], [MARGIN, H - MARGIN - MARK]]
      .map(([x, y]) => ({ x, y, size: MARK, cx: x + MARK / 2, cy: y + MARK / 2 }));
    return { width: W, height: H, page: opts.page === 'letter' ? 'letter' : 'a4', pages, markers, size: MARK };
  }
  /** Solid dark squares (4-connected ink blobs that fill most of their box), the one nearest each corner of the picture. */
  function findMarkers(bits, w, h) {
    const seen = new Uint8Array(w * h), stack = new Int32Array(w * h), found = [];
    const minSide = Math.min(w, h) * 0.015, maxSide = Math.min(w, h) * 0.12;
    for (let s = 0; s < w * h; s++) {
      if (!bits[s] || seen[s]) continue;
      let sp = 0, n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, sx = 0, sy = 0;
      stack[sp++] = s; seen[s] = 1;
      while (sp) {
        const i = stack[--sp], x = i % w, y = (i - x) / w;
        n++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && bits[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
        if (x < w - 1 && bits[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
        if (y > 0 && bits[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[sp++] = i - w; }
        if (y < h - 1 && bits[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[sp++] = i + w; }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (bw < minSide || bh < minSide || bw > maxSide || bh > maxSide) continue;
      if (bw / bh < 0.6 || bw / bh > 1.6 || n / (bw * bh) < 0.75) continue;
      found.push({ x: sx / n, y: sy / n, n });
    }
    if (found.length < 4) return null;
    const corners = [[0, 0], [w, 0], [w, h], [0, h]], out = [];
    for (const [cx, cy] of corners) {
      let best = null, bd = Infinity;
      for (const f of found) { const d = Math.hypot(f.x - cx, f.y - cy); if (d < bd && !out.includes(f)) { bd = d; best = f; } }
      if (!best || bd > Math.hypot(w, h) * 0.35) return null;
      out.push(best);
    }
    return out.map((f) => ({ x: f.x, y: f.y }));
  }
  function solve(A, b) {
    const n = b.length;
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-12) throw new Error('The four corner squares are in a line');
      [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    return b.map((v, i) => v / A[i][i]);
  }
  function homography(from, to) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = from[i], { x: u, y: v } = to[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    return [...solve(A, b), 1];
  }
  function apply(H, x, y) {
    const d = H[6] * x + H[7] * y + H[8];
    return { x: (H[0] * x + H[1] * y + H[2]) / d, y: (H[3] * x + H[4] * y + H[5]) / d };
  }
  function cut(img, H, rect) {
    const w = Math.max(1, Math.round(rect.w)), h = Math.max(1, Math.round(rect.h)), out = new Uint8ClampedArray(w * h * 4);
    const { data, width: iw, height: ih } = img;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = apply(H, rect.x + x + 0.5, rect.y + y + 0.5), o = (y * w + x) * 4;
      const px = Math.min(iw - 1, Math.max(0, p.x - 0.5)), py = Math.min(ih - 1, Math.max(0, p.y - 0.5));
      const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(iw - 1, x0 + 1), y1 = Math.min(ih - 1, y0 + 1), fx = px - x0, fy = py - y0;
      for (let c = 0; c < 4; c++) {
        const a = data[(y0 * iw + x0) * 4 + c], b2 = data[(y0 * iw + x1) * 4 + c], c2 = data[(y1 * iw + x0) * 4 + c], d = data[(y1 * iw + x1) * 4 + c];
        out[o + c] = (a * (1 - fx) + b2 * fx) * (1 - fy) + (c2 * (1 - fx) + d * fx) * fy;
      }
    }
    return { data: out, width: w, height: h };
  }
  return { PAGES, COLS, ROWS, layout, findMarkers, homography, apply, cut };
});
