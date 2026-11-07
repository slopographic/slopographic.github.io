/* Slop PDF: organizer thumbnail size: presets + continuous slider up to one page per row, Ctrl+wheel,
   pinch, persistence, and sharp re-rendering per resolution bucket. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;

  describe('thumbnail size', () => {
    it('slider goes from tiny to one page per row, presets stay, and the size is remembered', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      const O = PT.SP.organizer, d = PT.win.document;
      await PT.open(await PT.makePdf([{ text: 'one', w: 600, h: 800 }, { text: 'two' }, { text: 'three' }]), 'thumbs.pdf');
      const range = d.querySelector('#ctxGrid input[type=range][aria-label="Thumbnail size"]');
      expect(!!range).toBe(true);
      expect(d.querySelectorAll('#ctxGrid .seg-sm .seg-b').length).toBe(3);
      d.querySelector('#ctxGrid .seg-b[data-size="228"]').click();
      expect(O.getSize()).toBe(228);
      expect(d.querySelector('#ctxGrid .seg-b[data-size="228"]').classList.contains('on')).toBe(true);
      O.setSize(10);
      expect(O.getSize()).toBe(80);
      range.dispatchEvent(new PT.win.Event('pointerdown'));
      range.value = range.max; range.dispatchEvent(new PT.win.Event('input'));
      expect(O.getSize()).toBe(O.maxSize());
      expect(+range.max).toBe(O.maxSize());
      expect(d.querySelector('#ctxGrid .seg-b.on')).toBe(null);
      // one page per row
      const tops = [...d.querySelectorAll('#grid .thumb')].map((t) => Math.round(t.getBoundingClientRect().top));
      expect(new Set(tops).size).toBe(3);
      expect(PT.win.localStorage.getItem('slop-pdf.thumbSize')).toBe(String(O.getSize()));
      // re-rendered sharp: the visible raster is at least as wide as it is shown
      const img = d.querySelector('#grid .thumb .sheet-img');
      img.closest('.thumb').scrollIntoView({ block: 'start' });
      await waitFor(() => img.naturalWidth >= img.getBoundingClientRect().width * 0.95, { timeout: 15000 });
      expect(PT.E.bucket(2500)).toBe(2800);
      expect(PT.E.bucket(150)).toBe(200);
    }, { timeout: 30000 });

    it('zooms with Ctrl + wheel and pinch on the grid', async () => {
      const O = PT.SP.organizer, sc = PT.win.document.getElementById('gridWrap');
      O.setSize(168);
      sc.dispatchEvent(new PT.win.WheelEvent('wheel', { deltaY: -50, ctrlKey: true, clientX: 200, clientY: 200, bubbles: true, cancelable: true }));
      expect(O.getSize() > 168).toBe(true);
      const big = O.getSize();
      sc.dispatchEvent(new PT.win.WheelEvent('wheel', { deltaY: 50, bubbles: true, cancelable: true }));
      expect(O.getSize()).toBe(big); // plain wheel scrolls
      if (PT.win.TouchEvent && PT.win.Touch) {
        const T = (x, y, id) => new PT.win.Touch({ identifier: id, target: sc, clientX: x, clientY: y });
        sc.dispatchEvent(new PT.win.TouchEvent('touchstart', { touches: [T(100, 100, 1), T(200, 100, 2)], bubbles: true }));
        sc.dispatchEvent(new PT.win.TouchEvent('touchmove', { touches: [T(100, 100, 1), T(150, 100, 2)], bubbles: true, cancelable: true }));
        sc.dispatchEvent(new PT.win.TouchEvent('touchend', { touches: [], bubbles: true }));
        expect(Math.abs(O.getSize() - Math.round(big / 2)) <= 1).toBe(true);
      }
      O.setSize(168);
    });
  });
})();
