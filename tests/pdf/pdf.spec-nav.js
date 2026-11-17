/* Slop PDF: navigation on the page view, through shared/nav's engine. Ctrl/⌘ + wheel zooms about the pointer
   and eases over 120 ms, the plain wheel is left to the page, Shift + wheel scrolls sideways, the zoom is limited
   to 25%–800% (the status bar's figure), Ctrl/⌘ 0 fits the width, and the zoom comes back after a reload. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;

  /** Opens the first of two pages in page view at the given layout zoom. Returns the editor (SP.editor). */
  async function openAt(zoom) {
    if (!PT.SP) await PT.boot();
    PT.reset();
    await PT.open(await PT.makePdf([{ text: 'nav one', w: 300, h: 200 }, { text: 'nav two', w: 300, h: 200 }]), 'nav.pdf');
    PT.A.openPage(PT.E.state.pages[0].id);
    const Ed = PT.SP.editor;
    Ed.zoomMode = 'num'; Ed.zoom = zoom; Ed.layout();
    await sleep(250);
    return Ed;
  }
  /** Waits for an eased zoom to land (frames are paced by the browser, so a fixed sleep is not enough). */
  const settle = () => waitFor(() => !PT.SP.editor.easing(), { timeout: 8000 }).then(() => sleep(30));
  const page = () => PT.win.document.querySelector('#viewer .pv-page');
  const viewer = () => PT.win.document.getElementById('viewer');
  /** Dispatches a wheel event on the page; returns it so the caller can read defaultPrevented. */
  function wheel(el, init) {
    const ev = new PT.win.WheelEvent('wheel', Object.assign({ bubbles: true, cancelable: true }, init));
    el.dispatchEvent(ev);
    return ev;
  }
  /** Document point (layout units) under a client point on the page. */
  function docPoint(Ed, x, y) {
    const r = page().getBoundingClientRect();
    return { x: (x - r.left) / Ed.zoom, y: (y - r.top) / Ed.zoom };
  }

  describe('Slop PDF page navigation', () => {
    it('Ctrl+wheel zooms about the pointer and eases; the plain wheel is left to the page', async () => {
      const Ed = await openAt(1.5);
      const r = page().getBoundingClientRect();
      const x = r.left + r.width * 0.3, y = r.top + r.height * 0.6;
      const before = docPoint(Ed, x, y), z0 = Ed.zoom;
      const ev = wheel(page(), { deltaY: -100, ctrlKey: true, clientX: x, clientY: y });
      expect(ev.defaultPrevented).toBe(true);
      expect(Ed.zoom).toBe(z0); // the ease has not run yet
      await settle();
      // deltaY -100 is one mouse notch: a factor of exp(0.2) on the zoom
      expect(Ed.zoom / z0).toBeCloseTo(Math.exp(0.2), 1e-3);
      const after = docPoint(Ed, x, y);
      expect(after.x).toBeCloseTo(before.x, 0.5);
      expect(after.y).toBeCloseTo(before.y, 0.5);
      const z1 = Ed.zoom;
      const plain = wheel(page(), { deltaY: 120, clientX: x, clientY: y });
      expect(plain.defaultPrevented).toBe(false); // the viewer scrolls natively
      await sleep(200);
      expect(Ed.zoom).toBe(z1);
    });

    it('Shift+wheel scrolls sideways, the limits are 25% and 800%, and Ctrl/⌘ 0 fits the width', async () => {
      const Ed = await openAt(5);
      const v = viewer(), r = page().getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      v.scrollLeft = 0;
      wheel(page(), { deltaY: 120, shiftKey: true, clientX: x, clientY: y });
      await sleep(100);
      expect(v.scrollLeft).toBeGreaterThan(0);
      for (let i = 0; i < 40; i++) wheel(page(), { deltaY: -300, ctrlKey: true, clientX: x, clientY: y });
      await settle();
      expect(Ed.percent(Ed.zoom)).toBe(800);
      expect(Ed.zoom).toBeCloseTo(Ed.ZOOM_MAX, 1e-9);
      for (let i = 0; i < 80; i++) wheel(page(), { deltaY: 300, ctrlKey: true, clientX: x, clientY: y });
      await settle();
      expect(Ed.percent(Ed.zoom)).toBe(25);
      expect(Ed.zoom).toBeCloseTo(Ed.ZOOM_MIN, 1e-9);
      PT.win.document.body.dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: '0', code: 'Digit0', ctrlKey: true, bubbles: true, cancelable: true }));
      await settle();
      expect(Ed.zoomMode).toBe('width');
      expect(Ed.zoom).toBeCloseTo(Ed._.fitZoom('width'), 1e-6);
    }, { timeout: 60000 });

    it('the zoom and the view come back after a reload', async () => {
      const Ed = await openAt(1);
      const r = page().getBoundingClientRect();
      const x = r.left + r.width * 0.5, y = r.top + r.height * 0.5;
      wheel(page(), { deltaY: -100, ctrlKey: true, clientX: x, clientY: y });
      wheel(page(), { deltaY: -100, ctrlKey: true, clientX: x, clientY: y });
      await settle();
      const saved = Ed.zoom;
      expect(saved).toBeGreaterThan(1.3);
      await sleep(1600); // the view autosave is debounced
      await PT.boot();
      await waitFor(() => PT.E.state.pages.length > 0 && PT.A.mode === 'page', { timeout: 20000 });
      expect(PT.SP.editor.zoomMode).toBe('num');
      expect(PT.SP.editor.zoom).toBeCloseTo(saved, 1e-6);
    }, { timeout: 90000 });
  });
})();
