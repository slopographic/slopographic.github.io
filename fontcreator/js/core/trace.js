/* Slop Font: a picture of a drawn letter traced into an outline. Dark ink on light paper (or opaque ink on a transparent
 * background) becomes filled contours: the pixels are split into ink and paper (Otsu's threshold unless one is given),
 * the boundary between them is walked into closed loops (holes included), each loop's pixel steps are smoothed and
 * simplified, and the curves are fitted with SlopVector's fitter (SVGeom.fitRings). Pure; needs the paths module and
 * SVGeom (in Node, pass them).
 *   binarize(img, threshold?) → { bits, w, h, threshold }   img: { data (RGBA), width, height }
 *   loops(bits, w, h) → [[{ x, y }]]   every ink boundary as a closed polygon of pixel corners
 *   fromBits(bits, w, h, { minArea, smooth }) → fitted contours in pixels (y down): also how core/stroke.js outlines
 *   trace(img, opts) → { contours, advance, threshold, loops }   in font units. opts.place:
 *       { mode: 'fit', height, left?, bottom? }   the ink's box scaled to height (default 700) on the baseline
 *       { mode: 'box', top, bottom, ascender, descender, left? }  pixel rows top/bottom are the ascender and descender
 *       { mode: 'lines', baseline, capline, capHeight, left? }    pixel rows of the baseline and the cap line (sheets)
 *     opts.threshold (0–255), opts.minArea (pixels; specks smaller are dropped), opts.smooth (curve tolerance, px) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else { const F = root.SlopFont; F.trace = factory(F.paths, root.SVGeom); }
})(typeof window !== 'undefined' ? window : globalThis, function (P, G) {
  'use strict';
  function gray(img) {
    const { data, width: w, height: h } = img, out = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < out.length; i++, j += 4) {
      const lum = 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2], a = data[j + 3] / 255;
      out[i] = Math.round(255 - (255 - lum) * a);   // onto white paper
    }
    return out;
  }
  function otsu(g) {
    const hist = new Array(256).fill(0);
    for (const v of g) hist[v]++;
    const total = g.length;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, t = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      const wF = total - wB; if (!wF) break;
      sumB += i * hist[i];
      const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; t = i; }
    }
    return t + 1;
  }
  function binarize(img, threshold) {
    const g = gray(img), t = threshold == null ? otsu(g) : threshold, bits = new Uint8Array(g.length);
    for (let i = 0; i < g.length; i++) bits[i] = g[i] < t ? 1 : 0;
    return { bits, w: img.width, h: img.height, threshold: t };
  }
  /** Boundary edges with the ink on their right (y down), chained into loops; at a corner where two ink pixels touch
   * only diagonally, the walk turns right, so they stay two shapes. */
  function loops(bits, w, h) {
    const ink = (x, y) => x >= 0 && y >= 0 && x < w && y < h && bits[y * w + x] === 1;
    const W = w + 1, out = new Map();   // vertex → [next vertices]
    const edge = (x0, y0, x1, y1) => { const k = y0 * W + x0; if (!out.has(k)) out.set(k, []); out.get(k).push(y1 * W + x1); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!ink(x, y)) continue;
      if (!ink(x, y - 1)) edge(x, y, x + 1, y);
      if (!ink(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
      if (!ink(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
      if (!ink(x - 1, y)) edge(x, y + 1, x, y);
    }
    const res = [];
    const xy = (k) => ({ x: k % W, y: Math.floor(k / W) });
    for (const start of out.keys()) {
      while (out.get(start) && out.get(start).length) {
        const poly = [];
        let cur = start, prev = null;
        for (let guard = 0; guard < 4 * W * (h + 1); guard++) {
          const nexts = out.get(cur);
          if (!nexts || !nexts.length) break;
          let i = 0;
          if (nexts.length > 1 && prev != null) {   // a saddle: take the right turn
            const a = xy(prev), b = xy(cur), dx = b.x - a.x, dy = b.y - a.y;
            i = nexts.findIndex((n) => { const c = xy(n); return (c.x - b.x) === -dy && (c.y - b.y) === dx; });
            if (i < 0) i = 0;
          }
          const nx = nexts.splice(i, 1)[0];
          poly.push(xy(cur));
          prev = cur; cur = nx;
          if (cur === start) break;
        }
        if (poly.length >= 4) res.push(poly);
      }
    }
    return res;
  }
  const areaOf = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return a / 2; };
  /** The midpoints of the pixel steps (so a staircase becomes a slope), then Douglas–Peucker. */
  function smoothLoop(poly, eps) {
    const n = poly.length, mids = [];
    for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; mids.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); }
    const dp = (pts, a, b, keep) => {
      let far = -1, best = eps;
      const A = pts[a], B = pts[b], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i].x - A.x) * dy - (pts[i].y - A.y) * dx) / L; if (d > best) { best = d; far = i; } }
      if (far >= 0) { dp(pts, a, far, keep); keep.push(far); dp(pts, far, b, keep); }
    };
    // a closed ring: split it at the point farthest from its start, and simplify both halves
    const ring = [...mids, mids[0]], last = ring.length - 1;
    let far = 1, fd = -1;
    for (let i = 1; i < last; i++) { const d = Math.hypot(ring[i].x - ring[0].x, ring[i].y - ring[0].y); if (d > fd) { fd = d; far = i; } }
    const keep = [0, far];
    dp(ring, 0, far, keep); dp(ring, far, last, keep);
    keep.sort((a, b) => a - b);
    return keep.map((i) => ring[i]);
  }
  function placement(box, place, pxBox) {
    const left = place.left == null ? 50 : place.left;
    if (place.mode === 'box') {
      const s = (place.ascender - place.descender) / Math.max(1, place.bottom - place.top);
      return { s, tx: left - pxBox.x * s, ty: place.ascender + place.top * s };
    }
    if (place.mode === 'lines') {
      const s = place.capHeight / Math.max(1, place.baseline - place.capline);
      return { s, tx: left - pxBox.x * s, ty: place.baseline * s };
    }
    const s = (place.height || 700) / Math.max(1, pxBox.h);
    return { s, tx: left - pxBox.x * s, ty: (place.bottom || 0) + (pxBox.y + pxBox.h) * s };
  }
  /** Ink pixels (bits, 1 = ink) as fitted curves in pixel units (y down): the boundary loops, smoothed and fitted. */
  function fromBits(bits, w, h, opts = {}) {
    const minArea = opts.minArea == null ? Math.max(4, w * h * 0.0002) : opts.minArea;
    const raw = loops(bits, w, h).filter((l) => Math.abs(areaOf(l)) >= minArea);
    const eps = opts.smooth == null ? 0.7 : opts.smooth;
    const rings = raw.map((l) => smoothLoop(l, eps)).filter((r) => r.length >= 3);
    return rings.map((ring) => fitSafely(ring, { err: Math.max(0.4, eps), cornerAngle: opts.cornerAngle || 55 })).filter(Boolean);
  }
  /** One ring's curve fit, or its polygon when the fit strays out of it (a handle overshooting on noisy edges). */
  function fitSafely(ring, o) {
    const pb = G.boxOfPoints(ring), slack = Math.max(2, 0.06 * Math.max(pb.w, pb.h));
    let sub = null;
    try { sub = G.fitRings([ring], null, o)[0]; } catch (e) { sub = null; }
    const fb = sub && G.subsBBox([sub]);
    const ok = fb && fb.x >= pb.x - slack && fb.y >= pb.y - slack && fb.x + fb.w <= pb.x + pb.w + slack && fb.y + fb.h <= pb.y + pb.h + slack;
    return ok ? sub : { closed: true, pts: ring.map((p) => ({ x: p.x, y: p.y, ix: p.x, iy: p.y, ox: p.x, oy: p.y })) };
  }
  function trace(img, opts = {}) {
    const b = binarize(img, opts.threshold);
    const fitted = fromBits(b.bits, b.w, b.h, opts);
    if (!fitted.length) return { contours: [], advance: null, threshold: b.threshold, loops: 0 };
    const pxBox = G.subsBBox(fitted);
    const pl = placement(pxBox, opts.place || {}, pxBox);
    const contours = P.orient(P.clean(P.transform(fitted, [pl.s, 0, 0, -pl.s, pl.tx, pl.ty])));
    const fb = P.bbox(contours), side = opts.place && opts.place.left != null ? opts.place.left : 50;
    return { contours, advance: fb ? Math.round(fb.x + fb.w + side) : null, threshold: b.threshold, loops: contours.length };
  }
  return { binarize, loops, smoothLoop, fromBits, trace, otsu };
});
