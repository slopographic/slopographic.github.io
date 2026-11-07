/* Slop Cutout: edge-aware refinement (guided upsample, decontamination, finish). */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const P = window.SlopCutoutPipeline;

  /** W×H image: left half colour a, right half colour b (edge at x = W/2). */
  function split(W, H, a, b) {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = x < W / 2 ? a : b, i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
    return d;
  }
  /** Low-res step mask (mw×mh) with a soft (blurred) edge, 1 on the right. */
  function softStep(mw, mh) {
    const m = new Float32Array(mw * mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) m[y * mw + x] = Math.min(1, Math.max(0, (x + 0.5 - mw / 2) / 1.5 + 0.5));
    return m;
  }
  const width = (row, lo = 25, hi = 230) => row.filter((v) => v > lo && v < hi).length;

  describe('guided upsample', () => {
    it('follows the photo edge: a sharp step where bilinear gives a ramp', () => {
      const W = 256, H = 16, img = split(W, H, [20, 120, 220], [230, 60, 30]);
      const low = softStep(32, 2);
      const plain = P.plainUpsample(low, 32, 2, W, H), guided = P.guidedUpsample(img, W, H, low, 32, 2, { r: 8 });
      const row = (m) => Array.from(m.subarray(8 * W, 9 * W));
      const jump = (r) => { let best = 0, at = -1; for (let x = 1; x < r.length; x++) if (r[x] - r[x - 1] > best) { best = r[x] - r[x - 1]; at = x; } return { best, at }; };
      const jg = jump(row(guided)), jp = jump(row(plain));
      expect(jg.best).toBeGreaterThan(jp.best * 4);
      expect(Math.abs(jg.at - W / 2)).toBeLessThan(2); // the step sits on the photo's edge
      expect(guided[8 * W + 10]).toBeLessThan(10);
      expect(guided[8 * W + 245]).toBeGreaterThan(245);
    });
    it('output is full resolution, and the work resolution is capped', () => {
      expect(P.workSize(4000, 3000)).toEqual([1024, 768]);
      expect(P.workSize(300, 200)).toEqual([300, 200]);
      const img = split(300, 20, [0, 0, 0], [255, 255, 255]), out = P.guidedUpsample(img, 300, 20, softStep(10, 2), 10, 2, { work: 64 });
      expect(out.length).toBe(300 * 20);
      expect(out[10 * 300 + 5]).toBeLessThan(20); expect(out[10 * 300 + 295]).toBeGreaterThan(235);
    });
    it('a flat image keeps the mask (no texture to snap to)', () => {
      const W = 64, H = 8, img = new Uint8ClampedArray(W * H * 4).fill(128), low = softStep(16, 2);
      const g = P.guidedUpsample(img, W, H, low, 16, 2, { r: 4 }), p = P.plainUpsample(low, 16, 2, W, H);
      let maxd = 0; for (let i = 0; i < g.length; i++) maxd = Math.max(maxd, Math.abs(g[i] - p[i]));
      expect(maxd).toBeLessThan(40);
    });
  });

  describe('decontaminate', () => {
    it('pulls semi-transparent edge pixels back to the foreground colour', () => {
      // Red subject (right) on green background (left) with a 50/50 blended edge column band.
      const W = 64, H = 8, img = split(W, H, [0, 200, 0], [220, 0, 0]), alpha = new Uint8ClampedArray(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, a = x < 28 ? 0 : x >= 36 ? 1 : (x - 27) / 9;
        alpha[i] = a * 255;
        if (a > 0 && a < 1) { img[i * 4] = 220 * a; img[i * 4 + 1] = 200 * (1 - a); img[i * 4 + 2] = 0; }
      }
      const out = P.decontaminate(img, alpha, W, H, { r: 4 });
      const px = (d, x) => [d[(4 * W + x) * 4], d[(4 * W + x) * 4 + 1]];
      for (const x of [30, 32, 34]) {
        const [r0, g0] = px(img, x), [r1, g1] = px(out, x);
        expect(g1).toBeLessThan(g0 * 0.5); // green spill removed
        expect(r1).toBeGreaterThan(r0);     // red restored
      }
      expect(px(out, 50)).toEqual(px(img, 50)); // opaque pixels untouched
      expect(px(out, 10)).toEqual(px(img, 10)); // transparent pixels untouched
    });
  });

  describe('finish', () => {
    it('applies threshold → edit → feather and writes alpha into the cutout', () => {
      const W = 8, H = 1, rgba = new Uint8ClampedArray(W * 4).fill(200).map((v, i) => (i % 4 === 3 ? 255 : v)), base = Uint8ClampedArray.of(0, 40, 90, 130, 170, 220, 255, 255);
      const edit = new Uint8ClampedArray(W).fill(128); edit[0] = 255; edit[7] = 0;
      const r = P.finish(rgba, W, H, base, edit, { threshold: 0.5, softness: 0, decontaminate: false });
      expect(Array.from(r.mask)).toEqual([255, 0, 0, 255, 255, 255, 255, 0]);
      expect(r.cutout[3]).toBe(255); expect(r.cutout[7]).toBe(0); expect(r.cutout[0]).toBe(200);
      const f = P.finish(rgba, W, H, base, null, { feather: 2, decontaminate: false });
      expect(f.mask[0]).toBeGreaterThan(0); expect(f.mask.length).toBe(8);
    });
  });
})();
