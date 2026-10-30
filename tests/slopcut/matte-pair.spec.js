/* Slop Cut: a matte pair is drawn with the matte as alpha (white keeps, black removes), in the same canvas the
 * compositor uses for preview and export. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const SE = window.SE;

  function canvas(W, H) { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
  /** A solid colour, or a left/right split (white left, black right) for the matte. */
  function fill(g, W, H, fn) { const img = g.createImageData(W, H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, v = fn(x, y); img.data[i] = v[0]; img.data[i + 1] = v[1]; img.data[i + 2] = v[2]; img.data[i + 3] = 255; } g.putImageData(img, 0, 0); }

  describe('matte pair compositing', () => {
    it('uses the matte as alpha: opaque where it is white, transparent where it is black', () => {
      const W = 8, H = 4, out = canvas(W, H), g = out.getContext('2d');
      SE.matteDraw.layer(g, W, H,
        (lg) => fill(lg, W, H, () => [200, 40, 30]),
        (lg) => fill(lg, W, H, (x) => (x < W / 2 ? [255, 255, 255] : [0, 0, 0])));
      const left = Array.from(g.getImageData(1, 1, 1, 1).data), right = Array.from(g.getImageData(6, 1, 1, 1).data);
      expect(left[3]).toBe(255);
      expect(left[0]).toBe(200);
      expect(right[3]).toBe(0);
    });

    it('a grey matte gives a partial alpha, and the clip id for the matte is distinct', () => {
      const W = 4, H = 2, out = canvas(W, H), g = out.getContext('2d');
      SE.matteDraw.layer(g, W, H, (lg) => fill(lg, W, H, () => [0, 0, 255]), (lg) => fill(lg, W, H, () => [128, 128, 128]));
      const a = g.getImageData(2, 0, 1, 1).data[3];
      expect(a > 120 && a < 136).toBeTruthy();
      const c = { id: 'c1', media: 'm1', matteMedia: 'm2', kind: 'video' };
      expect(SE.matteDraw.clipOf(c).id).toBe('c1:matte');
      expect(SE.matteDraw.clipOf(c).media).toBe('m2');
    });
  });
})();
