/* Slop PDF: Recognise text on small print. A picture whose lines are small is read again at 2x (enhanced, see
   ocr/recognise.js), and that reading's boxes must come back in the picture's own pixels. The engine is stubbed: the
   stub boxes each line in the pixels of the picture it is given, as the real engine does. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;

  /** A blank picture of 400 x 200 points at 2 px per point. */
  function picture(paper = '#ffffff') {
    const c = document.createElement('canvas');
    c.width = 800; c.height = 400;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = paper; g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  /** Replaces SP.ocr.read: boxes the lines (points, top-left) in the given picture's pixels; records each picture's width. */
  function stubRead(lines, widths) {
    PT.SP.ocr.read = async (canvas) => {
      widths.push(canvas.width);
      const k = canvas.width / 400;
      return lines.map((l) => ({ text: l.text, score: 0.9, box: { x: Math.round(l.x * k), y: Math.round(l.y * k), w: Math.round(l.w * k), h: Math.round(l.h * k) } }));
    };
  }
  async function withRead(fn) {
    const O = PT.SP.ocr, saved = O.read;
    try { return await fn(); } finally { O.read = saved; }
  }

  describe('OCR text layer: small text', () => {
    it('enhance makes the picture k times larger, stretches its contrast and keeps the paper white', async () => {
      if (!PT.SP) await PT.boot();
      const c = picture('#c8c8c8'), g = c.getContext('2d');
      g.fillStyle = '#646464'; g.fillRect(100, 100, 200, 100); // dark ink on grey paper, a fifth of the picture
      const big = PT.SP.ocr.enhance(c, 2), px = big.getContext('2d').getImageData(0, 0, big.width, big.height).data;
      expect([big.width, big.height]).toEqual([1600, 800]);
      const at = (x, y) => Array.from(px.slice((y * big.width + x) * 4, (y * big.width + x) * 4 + 3));
      expect(at(10, 10)[0]).toBe(255); // the paper goes to white
      expect(at(400, 300)[0]).toBeLessThan(10); // the ink goes to black
    });

    it('mapBack takes boxes read on a picture k times larger back to the smaller picture', async () => {
      if (!PT.SP) await PT.boot();
      const out = PT.SP.ocr.mapBack([{ text: 'Add to cart', score: 0.8, box: { x: 300, y: 84, w: 240, h: 40 } }], 2);
      expect(out).toEqual([{ text: 'Add to cart', score: 0.8, box: { x: 150, y: 42, w: 120, h: 20 } }]);
    });

    it('small lines are read again at 2x, and the boxes come back in the first picture\'s pixels', async () => {
      if (!PT.SP) await PT.boot();
      await withRead(async () => {
        const widths = [];
        stubRead([{ text: 'Add to cart', x: 40, y: 30, w: 60, h: 10 }, { text: '$437.00', x: 40, y: 60, w: 50, h: 9 }], widths);
        const lines = await PT.SP.ocr.readPicture(picture());
        expect(widths).toEqual([800, 1600]);
        expect(lines.map((l) => l.text)).toEqual(['Add to cart', '$437.00']);
        expect(lines[0].box).toEqual({ x: 80, y: 60, w: 120, h: 20 }); // 2 px per point, as on the first picture
        expect(lines[1].box).toEqual({ x: 80, y: 120, w: 100, h: 18 });
      });
    });

    it('lines of normal size are read once, as before', async () => {
      if (!PT.SP) await PT.boot();
      await withRead(async () => {
        const widths = [];
        stubRead([{ text: 'Invoice 2026-0042', x: 40, y: 30, w: 170, h: 22 }], widths);
        const lines = await PT.SP.ocr.readPicture(picture());
        expect(widths).toEqual([800]);
        expect(lines[0].box).toEqual({ x: 80, y: 60, w: 340, h: 44 });
      });
    });
  });
})();
