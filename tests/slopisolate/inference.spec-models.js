/* Slop Cutout: real inference with the Quality (IS-Net) and Portrait (MODNet) models. Slow: ~1 min each. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  describe('Quality model (IS-Net w8, WebAssembly)', () => {
    it('mask is high inside the shape and low outside', async () => {
      if (!(await CT.tryLoad('quality'))) return;
      const sc = CT.scene(640, 480), r = await SlopCutout.removeBackground(sc.canvas, { model: 'quality' });
      const s = CT.score(r.mask, 640, 480, sc);
      console.log('[cutout] quality circle: inside ' + s.inside.toFixed(1) + ' outside ' + s.outside.toFixed(1) + ', infer ' + Math.round(r.timings.infer) + ' ms');
      expect(r.timings.input).toEqual([1024, 1024]);
      expect(s.inside).toBeGreaterThan(200);
      expect(s.outside).toBeLessThan(40);
    }, { timeout: 200000 });
  });
  describe('Portrait model (MODNet, WebAssembly)', () => {
    it('runs with a dynamic input size and returns a full-resolution matte', async () => {
      if (!(await CT.tryLoad('portrait'))) return;
      const sc = CT.scene(480, 640), r = await SlopCutout.removeBackground(sc.canvas, { model: 'portrait' });
      expect(r.timings.input).toEqual([512, 672]);
      expect(r.mask.length).toBe(480 * 640);
      const s = CT.score(r.mask, 480, 640, sc);
      console.log('[cutout] portrait circle: inside ' + s.inside.toFixed(1) + ' outside ' + s.outside.toFixed(1) + ', infer ' + Math.round(r.timings.infer) + ' ms');
      expect(s.inside).toBeGreaterThan(s.outside); // MODNet is trained on people; a disc still separates
    }, { timeout: 200000 });
  });
})();
