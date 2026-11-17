/* Slop Cutout: real inference with the Fast model (U²-Netp), plus keep/finish and the cache. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  let ok = null;
  const ready = async () => (ok === null ? (ok = await CT.tryLoad('fast')) : ok);

  describe('Fast model (U²-Netp, WebAssembly)', () => {
    it('loads, verifies and caches the model', async () => {
      if (!(await ready())) return;
      const c = await SlopCutout.cached();
      expect(c.fast).toBe(true);
      expect((await SlopCutout.info()).backend).toBe('wasm');
    }, { timeout: 120000 });
    it('mask is high inside a red circle and low on the blue background', async () => {
      if (!(await ready())) return;
      const sc = CT.scene(640, 480), r = await SlopCutout.removeBackground(sc.canvas, { model: 'fast' });
      expect(r.width).toBe(640); expect(r.height).toBe(480);
      expect(r.mask.length).toBe(640 * 480);
      const s = CT.score(r.mask, 640, 480, sc);
      console.log('[cutout] fast circle: inside ' + s.inside.toFixed(1) + ' outside ' + s.outside.toFixed(1) + ', infer ' + Math.round(r.timings.infer) + ' ms, post ' + Math.round(r.timings.post) + ' ms');
      expect(s.inside).toBeGreaterThan(200);
      expect(s.outside).toBeLessThan(40);
      expect(r.cutout.data[(240 * 640 + 320) * 4 + 3]).toBeGreaterThan(200);
      expect(r.cutout.data[(20 * 640 + 20) * 4 + 3]).toBeLessThan(40);
      expect(r.timings.input).toEqual([320, 320]);
    }, { timeout: 120000 });
    it('works on a non-square, larger image (rectangle on a light background)', async () => {
      if (!(await ready())) return;
      const sc = CT.scene(1200, 500, { shape: 'rect', bg: '#e8e4d8', fg: '#1a6b3a' });
      const r = await SlopCutout.removeBackground(sc.canvas, { model: 'fast' });
      const s = CT.score(r.mask, 1200, 500, sc);
      expect(s.inside).toBeGreaterThan(180);
      expect(s.outside).toBeLessThan(50);
      const blob = await r.toBlob('image/png'), bmp = await createImageBitmap(blob);
      expect([bmp.width, bmp.height]).toEqual([1200, 500]);
    }, { timeout: 120000 });
    it('keep + finish re-runs threshold and brush edits at full resolution', async () => {
      if (!(await ready())) return;
      const sc = CT.scene(320, 240), r = await SlopCutout.removeBackground(sc.canvas, { model: 'fast', keep: true });
      expect(typeof r.jobId).toBe('string');
      const edit = new Uint8ClampedArray(320 * 240).fill(128);
      for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) edit[y * 320 + x] = 255; // keep a corner
      for (let y = 110; y < 130; y++) for (let x = 150; x < 170; x++) edit[y * 320 + x] = 0; // punch a hole
      const f = await SlopCutout.finish(r.jobId, { threshold: 0.5, softness: 0 }, edit);
      expect(f.mask[5 * 320 + 5]).toBe(255);
      expect(f.mask[120 * 320 + 160]).toBe(0);
      expect(f.mask[120 * 320 + 120]).toBe(255);
      expect(new Set(f.mask).size).toBe(2); // hard threshold
      expect(edit[0]).toBe(255); // caller's edit buffer is not detached
      await SlopCutout.release(r.jobId);
      await expect(SlopCutout.finish(r.jobId, {})).rejects(/Unknown cutout job/);
    }, { timeout: 120000 });
    it('accepts a Blob (PNG file) as input', async () => {
      if (!(await ready())) return;
      const sc = CT.scene(400, 300), blob = await new Promise((res) => sc.canvas.toBlob(res, 'image/png'));
      const r = await SlopCutout.removeBackground(blob, { model: 'fast', refine: false });
      const s = CT.score(r.mask, 400, 300, sc);
      expect(s.inside).toBeGreaterThan(200); expect(s.outside).toBeLessThan(40);
    }, { timeout: 120000 });
  });
})();
