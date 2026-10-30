/* Slop Cutout: pipeline math (resize, normalize, matte, edits, feather, bbox, compose, model sizes). */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const P = window.SlopCutoutPipeline, M = window.SlopCutoutModels;
  const arr = (a) => Array.from(a, (v) => Math.round(v * 1000) / 1000);

  describe('resize', () => {
    it('area-averages when shrinking (4×2 → 2×1, exact)', () => {
      const src = Float32Array.of(0, 2, 4, 8, 2, 4, 6, 10);
      expect(arr(P.resample(src, 4, 2, 1, 2, 1))).toEqual([2, 7]);
    });
    it('keeps a constant image constant at any scale', () => {
      const rgba = new Uint8ClampedArray(7 * 5 * 4).fill(77);
      const out = P.resizeRGBA(rgba, 7, 5, 3, 11);
      expect(out.length).toBe(3 * 11 * 4);
      expect(out.every((v) => v === 77)).toBe(true);
    });
    it('non-integer shrink preserves the mean', () => {
      const src = new Float32Array(10 * 10).map((_, i) => i % 10);
      const out = P.resample(src, 10, 10, 1, 3, 3);
      const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
      expect(mean(out)).toBeCloseTo(mean(src), 1e-4);
    });
    it('bilinear mask upscale is pixel-centre aligned', () => {
      expect(arr(P.resize1(Float32Array.of(0, 1), 2, 1, 4, 1))).toEqual([0, 0.25, 0.75, 1]);
      const up = P.resize1(Float32Array.of(0, 1, 1, 0), 2, 2, 6, 6);
      expect(up.length).toBe(36);
      expect(up[0]).toBeCloseTo(0); expect(up[5]).toBeCloseTo(1); expect(up[35]).toBeCloseTo(0);
    });
  });

  describe('normalize', () => {
    it('toTensor writes planar NCHW with (v/255 - mean)/std', () => {
      const rgba = Uint8ClampedArray.of(255, 0, 51, 255, 0, 255, 102, 255);
      const t = P.toTensor(rgba, 2, 1, { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] });
      expect(arr(t)).toEqual([1, -1, -1, 1, -0.6, -0.2]);
    });
    it('toTensor maxNorm divides by the brightest channel (U²-Net convention)', () => {
      const rgba = Uint8ClampedArray.of(100, 50, 0, 255, 25, 0, 0, 255);
      const t = P.toTensor(rgba, 2, 1, { maxNorm: true });
      expect(arr(t)).toEqual([1, 0.25, 0.5, 0, 0, 0]);
    });
    it('ImageNet mean/std for the Fast model', () => {
      const m = M.MODELS.fast, t = P.toTensor(Uint8ClampedArray.of(255, 255, 255, 255), 1, 1, m);
      expect(t[0]).toBeCloseTo((1 - 0.485) / 0.229, 1e-5);
      expect(t[2]).toBeCloseTo((1 - 0.406) / 0.225, 1e-5);
    });
    it('minMax stretches to 0..1 and survives a flat input', () => {
      expect(arr(P.minMax(Float32Array.of(2, 4, 3)))).toEqual([0, 1, 0.5]);
      expect(arr(P.minMax(Float32Array.of(5, 5)))).toEqual([0, 0]);
    });
    it('model input sizes: fixed for Fast/Quality, short side 512 in multiples of 32 for Portrait', () => {
      expect(M.inputSize('fast', 4000, 3000)).toEqual([320, 320]);
      expect(M.inputSize('quality', 10, 10)).toEqual([1024, 1024]);
      expect(M.inputSize('portrait', 1920, 1080)).toEqual([896, 512]);
      const [w, h] = M.inputSize('portrait', 4000, 1000);
      expect(w).toBe(1024); expect(h % 32).toBe(0); expect(h).toBe(256);
      expect(M.inputSize('portrait', 300, 400)).toEqual([512, 672]);
    });
  });

  describe('matte, edits and feather', () => {
    const ramp = Uint8ClampedArray.from({ length: 256 }, (_, i) => i);
    it('threshold .5 / softness 1 leaves the mask unchanged', () => {
      expect(P.matte(ramp, 0.5, 1)).toEqual(ramp);
    });
    it('softness 0 is a hard threshold', () => {
      const m = P.matte(ramp, 0.5, 0);
      expect(m[127]).toBe(0); expect(m[128]).toBe(255); expect(m[0]).toBe(0); expect(m[255]).toBe(255);
    });
    it('a narrow softness ramps linearly around the threshold', () => {
      const m = P.matte(ramp, 0.25, 0.2);
      expect(m[Math.round(0.15 * 255)]).toBeLessThan(5);
      expect(m[Math.round(0.25 * 255)]).toBeGreaterThan(120); expect(m[Math.round(0.25 * 255)]).toBeLessThan(135);
      expect(m[Math.round(0.36 * 255)]).toBe(255);
    });
    it('brush edits: 128 untouched, 255 keep, 0 remove, partial in between', () => {
      const a = Uint8ClampedArray.of(100, 100, 100, 100, 100);
      P.applyEdit(a, Uint8ClampedArray.of(128, 255, 0, 192, 64));
      expect(Array.from(a)).toEqual([100, 255, 0, 178, 50]);
    });
    it('feather smooths a step, keeps flat areas and is monotone', () => {
      const w = 40, h = 4, m = new Uint8ClampedArray(w * h);
      for (let y = 0; y < h; y++) for (let x = 20; x < w; x++) m[y * w + x] = 255;
      const f = P.feather(m, w, h, 6);
      expect(f[1 * w + 0]).toBe(0); expect(f[1 * w + 39]).toBe(255);
      expect(f[1 * w + 19]).toBeGreaterThan(40); expect(f[1 * w + 20]).toBeLessThan(215);
      for (let x = 1; x < w; x++) expect(f[w + x]).toBeGreaterThanOrEqual(f[w + x - 1]);
      expect(P.feather(m, w, h, 0)).toEqual(m);
    });
    it('boxBlur preserves constants and total mass', () => {
      const c = new Float32Array(30).fill(3), b = P.boxBlur(c, 6, 5, 2);
      expect(b.every((v) => Math.abs(v - 3) < 1e-6)).toBe(true);
      const imp = new Float32Array(81); imp[40] = 1;
      const s = P.boxBlur(imp, 9, 9, 1).reduce((a, v) => a + v, 0);
      expect(s).toBeCloseTo(1, 1e-5);
    });
  });

  describe('bbox and compose', () => {
    it('bbox finds the subject, null when empty', () => {
      const w = 10, h = 8, m = new Uint8ClampedArray(w * h);
      m[2 * w + 3] = 200; m[5 * w + 7] = 255; m[0] = 5;
      expect(P.bbox(m, w, h)).toEqual({ x: 3, y: 2, w: 5, h: 4 });
      expect(P.bbox(new Uint8ClampedArray(4), 2, 2)).toBe(null);
    });
    it('compose writes the mask into alpha (times the original alpha)', () => {
      const rgba = Uint8ClampedArray.of(10, 20, 30, 255, 40, 50, 60, 128);
      const out = P.compose(rgba, Uint8ClampedArray.of(0, 255));
      expect(Array.from(out)).toEqual([10, 20, 30, 0, 40, 50, 60, 128]);
    });
  });
})();
