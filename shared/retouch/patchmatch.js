/* Slop retouch: content-aware fill by PatchMatch (Barnes et al. 2009) inside a multi-scale EM loop (Wexler et al. 2007).
 * Pure, no DOM: PhotoSlop runs it in a Worker (shared/retouch/inpaint-worker.js); Node tests load it (module.exports).
 *   inpaint(rgba, w, h, hole, { patch = 7, seed = 1, onProgress }) → a new RGBA array: the hole (Uint8Array, 1 = fill)
 *       filled with texture copied from the rest of the picture, every other pixel unchanged.
 * Per level, coarse to fine: each target patch (one that touches the hole) finds a similar source patch (one fully outside
 * the hole) by random init, propagation from its neighbours and a shrinking random search; then every hole pixel becomes
 * the weighted mean of the source pixels that the patches covering it point at (better matches weigh more). The coarsest
 * level starts from an onion-peel diffusion; each finer level starts from the coarser one's matches, scaled up. Good for
 * small and medium areas; for a big area a generative model invents more plausible content. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopRetouchPatchMatch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  /** The level below: 2 × 2 means of the known pixels; a coarse pixel is a hole when any of its four is. */
  function down(L) {
    const w = Math.ceil(L.w / 2), h = Math.ceil(L.h / 2), img = new Float32Array(w * h * 3), hole = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let n = 0, r = 0, g = 0, b = 0, any = 0;
      for (let k = 0; k < 4; k++) {
        const fx = Math.min(L.w - 1, 2 * x + (k & 1)), fy = Math.min(L.h - 1, 2 * y + (k >> 1)), i = fy * L.w + fx;
        if (L.hole[i]) { any = 1; continue; }
        n++; r += L.img[i * 3]; g += L.img[i * 3 + 1]; b += L.img[i * 3 + 2];
      }
      const o = y * w + x;
      hole[o] = any;
      if (n) { img[o * 3] = r / n; img[o * 3 + 1] = g / n; img[o * 3 + 2] = b / n; }
    }
    return { w, h, img, hole };
  }

  /** Onion-peel fill: hole pixels take the mean of their filled neighbours, ring by ring from the edge inwards. */
  function diffuse(L) {
    const { w, h, img } = L, done = Uint8Array.from(L.hole, (v) => 1 - v);
    let left = 0; for (const v of L.hole) left += v;
    while (left > 0) {
      const ring = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (done[i]) continue;
        let n = 0, r = 0, g = 0, b = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (done[j]) { n++; r += img[j * 3]; g += img[j * 3 + 1]; b += img[j * 3 + 2]; }
        }
        if (n) ring.push([i, r / n, g / n, b / n]);
      }
      if (!ring.length) break;
      for (const [i, r, g, b] of ring) { img[i * 3] = r; img[i * 3 + 1] = g; img[i * 3 + 2] = b; done[i] = 1; left--; }
    }
  }

  /** Sources (patch fully inside the picture and outside the hole) and targets (patch touches the hole) for a level. */
  function plan(L, r) {
    const { w, h, hole } = L, S = new Int32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += hole[y * w + x]; S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + row; } }
    const box = (x0, y0, x1, y1) => S[y1 * (w + 1) + x1] - S[y0 * (w + 1) + x1] - S[y1 * (w + 1) + x0] + S[y0 * (w + 1) + x0];
    const ok = new Uint8Array(w * h), src = [], tgt = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
      const holes = box(x0, y0, x1, y1);
      if (holes) tgt.push(y * w + x);
      else if (x >= r && y >= r && x < w - r && y < h - r) { ok[y * w + x] = 1; src.push(y * w + x); }
    }
    return { ok, src: Int32Array.from(src), tgt: Int32Array.from(tgt) };
  }

  /** Mean squared colour difference of the patches at p and q (q's patch is all known). With L.known set (the first
   *  passes at the coarsest level), only p's known pixels count, so the matches follow the real surroundings and not the
   *  smooth first guess; a patch with no known pixel then compares everything. */
  function dist(L, r, p, q, cap) {
    const { w, h, img } = L, px = p % w, py = (p - px) / w, qx = q % w, qy = (q - qx) / w, skip = L.known ? L.hole : null;
    let s = 0, n = 0;
    for (let dy = -r; dy <= r; dy++) {
      const y = py + dy; if (y < 0 || y >= h) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = px + dx; if (x < 0 || x >= w) continue;
        if (skip && skip[y * w + x]) continue;
        const a = (y * w + x) * 3, b = ((qy + dy) * w + qx + dx) * 3;
        const e0 = img[a] - img[b], e1 = img[a + 1] - img[b + 1], e2 = img[a + 2] - img[b + 2];
        s += e0 * e0 + e1 * e1 + e2 * e2; n++;
      }
      if (s > cap * (2 * r + 1) * (2 * r + 1)) return Infinity;
    }
    if (!n && skip) { L.known = false; const v = dist(L, r, p, q, cap); L.known = true; return v; }
    return n ? s / n : Infinity;
  }

  function search(L, P, r, nnf, cost, iters, rand) {
    const { w, h } = L, T = P.tgt, isT = L.isT;
    for (let it = 0; it < iters; it++) {
      const fwd = it % 2 === 0, step = fwd ? 1 : -1;
      for (let k = fwd ? 0 : T.length - 1; fwd ? k < T.length : k >= 0; k += step) {
        const p = T[k], px = p % w, py = (p - px) / w;
        const tryQ = (q) => { if (q >= 0 && q < w * h && P.ok[q] && q !== nnf[p]) { const d = dist(L, r, p, q, cost[p]); if (d < cost[p]) { cost[p] = d; nnf[p] = q; } } };
        for (const [nx, ny] of [[px - step, py], [px, py - step]]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nb = ny * w + nx; if (!isT[nb]) continue;
          const q = nnf[nb], qx = q % w + step * (nx === px ? 0 : 1), qy = (q - (q % w)) / w + step * (ny === py ? 0 : 1);
          if (qx >= 0 && qy >= 0 && qx < w && qy < h) tryQ(qy * w + qx);
        }
        for (let R = Math.max(w, h); R >= 1; R >>= 1) {
          const q = nnf[p], qx = q % w, qy = (q - qx) / w;
          const cx = Math.min(w - 1 - r, Math.max(r, qx + Math.round((rand() * 2 - 1) * R))), cy = Math.min(h - 1 - r, Math.max(r, qy + Math.round((rand() * 2 - 1) * R)));
          tryQ(cy * w + cx);
        }
      }
    }
  }

  function vote(L, P, r, nnf, cost) {
    const { w, h, img, hole } = L, n = w * h, acc = new Float32Array(n * 3), ws = new Float32Array(n);
    const cs = Array.from(P.tgt, (p) => cost[p]).filter(Number.isFinite).sort((a, b) => a - b);
    const sig = 2 * (cs.length ? cs[Math.floor(cs.length * 0.75)] : 1) + 1;
    for (const p of P.tgt) {
      const q = nnf[p], wt = Math.exp(-cost[p] / sig), px = p % w, py = (p - px) / w, qx = q % w, qy = (q - qx) / w;
      for (let dy = -r; dy <= r; dy++) {
        const y = py + dy; if (y < 0 || y >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const x = px + dx; if (x < 0 || x >= w) continue;
          const i = y * w + x; if (!hole[i]) continue;
          const b = ((qy + dy) * w + qx + dx) * 3;
          acc[i * 3] += wt * img[b]; acc[i * 3 + 1] += wt * img[b + 1]; acc[i * 3 + 2] += wt * img[b + 2]; ws[i] += wt;
        }
      }
    }
    for (let i = 0; i < n; i++) if (hole[i] && ws[i] > 0) { img[i * 3] = acc[i * 3] / ws[i]; img[i * 3 + 1] = acc[i * 3 + 1] / ws[i]; img[i * 3 + 2] = acc[i * 3 + 2] / ws[i]; }
  }

  function inpaint(rgba, w, h, hole, o = {}) {
    const r = (o.patch || 7) >> 1, rand = rng(o.seed || 1), n = w * h;
    const base = { w, h, img: new Float32Array(n * 3), hole: Uint8Array.from(hole, (v) => (v ? 1 : 0)) };
    for (let i = 0; i < n; i++) { base.img[i * 3] = rgba[i * 4]; base.img[i * 3 + 1] = rgba[i * 4 + 1]; base.img[i * 3 + 2] = rgba[i * 4 + 2]; }
    const levels = [base];
    const extent = (L) => { let x0 = L.w, x1 = -1, y0 = L.h, y1 = -1; for (let i = 0; i < L.w * L.h; i++) if (L.hole[i]) { const x = i % L.w, y = (i - x) / L.w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return Math.max(x1 - x0, y1 - y0) + 1; };
    while (levels.length < 8) {
      const L = levels[levels.length - 1];
      if (Math.min(L.w, L.h) < 8 * (2 * r + 1) || extent(L) <= 2 * r + 1) break;
      levels.push(down(L));
    }
    let prev = null;
    for (let li = levels.length - 1; li >= 0; li--) {
      const L = levels[li], P = plan(L, r), nnf = new Int32Array(L.w * L.h), cost = new Float32Array(L.w * L.h).fill(Infinity);
      L.isT = new Uint8Array(L.w * L.h); for (const p of P.tgt) L.isT[p] = 1;
      if (!P.src.length) { diffuse(L); prev = null; continue; }
      if (!prev) diffuse(L);
      else for (let i = 0; i < L.w * L.h; i++) if (L.hole[i]) {   // start from the coarser fill
        const x = i % L.w, y = (i - x) / L.w, j = Math.min(prev.L.h - 1, y >> 1) * prev.L.w + Math.min(prev.L.w - 1, x >> 1);
        L.img[i * 3] = prev.L.img[j * 3]; L.img[i * 3 + 1] = prev.L.img[j * 3 + 1]; L.img[i * 3 + 2] = prev.L.img[j * 3 + 2];
      }
      for (const p of P.tgt) {
        let q = -1;
        if (prev) {
          const x = p % L.w, y = (p - x) / L.w, pc = Math.min(prev.L.h - 1, y >> 1) * prev.L.w + Math.min(prev.L.w - 1, x >> 1);
          if (prev.L.isT[pc]) { const qc = prev.nnf[pc], qx = 2 * (qc % prev.L.w) + (x & 1), qy = 2 * ((qc - (qc % prev.L.w)) / prev.L.w) + (y & 1); if (qx < L.w && qy < L.h && P.ok[qy * L.w + qx]) q = qy * L.w + qx; }
        }
        if (q < 0) q = P.src[Math.floor(rand() * P.src.length)];
        nnf[p] = q; cost[p] = dist(L, r, p, q, Infinity);
      }
      if (prev) vote(L, P, r, nnf, cost);
      const coarsest = li === levels.length - 1, em = coarsest ? 6 : 3;
      for (let e = 0; e < em; e++) {
        L.known = coarsest && e < 2;
        for (const p of P.tgt) cost[p] = dist(L, r, p, nnf[p], Infinity);
        search(L, P, r, nnf, cost, e === 0 ? 5 : 2, rand);
        L.known = false;
        if (coarsest && e < 2) for (const p of P.tgt) cost[p] = dist(L, r, p, nnf[p], Infinity);
        vote(L, P, r, nnf, cost);
      }
      prev = { L, nnf };
      if (o.onProgress) o.onProgress((levels.length - li) / levels.length);
    }
    const out = new Uint8ClampedArray(rgba);
    for (let i = 0; i < n; i++) if (base.hole[i]) { out[i * 4] = base.img[i * 3]; out[i * 4 + 1] = base.img[i * 3 + 1]; out[i * 4 + 2] = base.img[i * 3 + 2]; out[i * 4 + 3] = 255; }
    return out;
  }

  return { inpaint };
});
