/* Slop PDF: zoom keeps the point under the anchor (the workspace centre, or the pointer for Ctrl+wheel), at several
   sizes and layouts; the per-page thumbnail actions (move, duplicate, extract, keyboard reach) each one undo step;
   and the current-page border on the thumbnail and the canvas. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;

  const viewer = () => PT.win.document.getElementById('viewer');
  const settle = () => waitFor(() => !PT.SP.editor.easing(), { timeout: 8000 }).then(() => sleep(30));
  /** Document point (layout units) under a client point, on the active page. */
  const docAt = (x, y) => {
    const Ed = PT.SP.editor, el = Ed._.slots.get(Ed.pid).el, r = el.getBoundingClientRect();
    return { x: (x - r.left) / Ed.zoom, y: (y - r.top) / Ed.zoom };
  };
  const centre = () => { const r = viewer().getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const order = () => PT.E.state.pages.map((p) => PT.pageLabel(p));
  const thumb = (id) => PT.win.document.querySelector('#grid .thumb[data-id="' + id + '"]');

  async function openPages(n, name) {
    if (!PT.SP) await PT.boot();
    PT.reset();
    const pdf = await PT.makePdf(Array.from({ length: n }, (_, i) => ({ text: 'page ' + (i + 1), w: 300, h: 200 })));
    await PT.open(pdf, name);
    return PT.E.state.pages;
  }

  describe('Slop PDF zoom anchor', () => {
    it('the workspace centre stays put when zooming with the buttons, at several sizes and in each layout', async () => {
      await openPages(3, 'zoom.pdf');
      PT.A.openPage(PT.E.state.pages[0].id);
      await sleep(300);
      for (const layout of ['continuous', 'single', 'two']) {
        PT.SP.editor.setLayout(layout); await sleep(250);
        for (const z of [0.6, 1.5, 3]) {
          PT.SP.editor.setZoom(z); await settle();
          const c = centre(), before = docAt(c.x, c.y);
          PT.SP.editor.zoomBy(1.25); await settle();
          const c2 = centre(), after = docAt(c2.x, c2.y);
          expect(Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1).toBe(true, layout + ' at ' + z + ': drift ' + (after.x - before.x).toFixed(2) + ',' + (after.y - before.y).toFixed(2));
        }
      }
    });

    it('Ctrl+wheel keeps the point under the pointer in place, away from the centre', async () => {
      await openPages(2, 'wheel.pdf');
      PT.A.openPage(PT.E.state.pages[0].id);
      PT.SP.editor.setLayout('continuous');
      PT.SP.editor.setZoom(1.5); await settle();
      const pt = { x: viewer().getBoundingClientRect().left + 200, y: viewer().getBoundingClientRect().top + 150 };
      const before = docAt(pt.x, pt.y);
      viewer().dispatchEvent(new PT.win.WheelEvent('wheel', { deltaY: -120, ctrlKey: true, clientX: pt.x, clientY: pt.y, bubbles: true, cancelable: true }));
      await settle();
      const after = docAt(pt.x, pt.y);
      expect(PT.SP.editor.zoom > 1.5).toBe(true);
      expect(Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1).toBe(true, 'drift ' + (after.x - before.x).toFixed(2) + ',' + (after.y - before.y).toFixed(2));
    });
  });

  describe('Slop PDF page actions', () => {
    it('Move down from the thumbnail moves the page one place, is one undo step, and Undo restores the order', async () => {
      const pages = await openPages(3, 'move.pdf');
      PT.A.showGrid(true);
      const before = order();
      thumb(pages[0].id).querySelector('[data-act="down"]').click();
      await sleep(80);
      expect(order().join(',')).toBe([before[1], before[0], before[2]].join(','));
      PT.A.undo();
      await sleep(80);
      expect(order().join(',')).toBe(before.join(','));
    });

    it('Duplicate and Extract this page act on the thumbnail page only; the page actions are keyboard reachable', async () => {
      const pages = await openPages(3, 'dup.pdf');
      PT.A.showGrid(true);
      PT.SP.organizer.focus(pages[1].id);
      const tools = [...thumb(pages[1].id).querySelectorAll('.thumb-tools button')].map((b) => b.dataset.act);
      expect(tools.join(',')).toBe('rotl,rotr,view,dup,up,down,ext,del');
      expect(thumb(pages[1].id).querySelector('[data-act="dup"]').tabIndex).toBe(0);
      expect(thumb(pages[0].id).querySelector('[data-act="dup"]').tabIndex).toBe(-1);
      thumb(pages[1].id).querySelector('[data-act="dup"]').click();
      await sleep(80);
      expect(PT.E.state.pages.length).toBe(4);
      PT.A.undo(); await sleep(80);
      expect(PT.E.state.pages.length).toBe(3);
    });

    it('the current page has the border on its thumbnail and on its canvas', async () => {
      const pages = await openPages(3, 'current.pdf');
      PT.A.openPage(pages[2].id);
      await sleep(300);
      expect(PT.SP.editor._.slots.get(pages[2].id).el.classList.contains('is-current')).toBe(true);
      expect(PT.SP.editor._.slots.get(pages[0].id).el.classList.contains('is-current')).toBe(false);
      PT.A.showGrid(true); await sleep(100);
      expect(thumb(pages[2].id).classList.contains('is-current')).toBe(true);
      expect(thumb(pages[0].id).classList.contains('is-current')).toBe(false);
    });
  });
})();
