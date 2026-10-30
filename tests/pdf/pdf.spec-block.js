/* Slop PDF: the block copy box (K). It sits on the page, so it moves with the page when it scrolls, and it goes
   when the tool changes or Escape is pressed. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;

  describe('block copy box', () => {
    it('stays on the page, moves with it, and goes when the tool changes', async () => {
      PT.reset();
      if (!PT.SP) await PT.boot();
      await PT.open(await PT.makePdf([{ text: 'alpha beta gamma' }]), 'block.pdf');
      const Ed = PT.SP.editor, S = Ed._, win = PT.win;
      const pid = PT.E.state.pages[0].id; PT.A.openPage(pid);
      await waitFor(() => PT.win.document.querySelector('.pv-textlayer span') && Ed.pid === pid, { timeout: 8000 });
      Ed.setTool('block');
      const page = S.pageEl, r = page.getBoundingClientRect();
      const ev = (type, x, y) => new win.PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1 });
      page.dispatchEvent(ev('pointerdown', r.left + 20, r.top + 20));
      win.dispatchEvent(ev('pointermove', r.left + 220, r.top + 60));
      win.dispatchEvent(ev('pointerup', r.left + 220, r.top + 60));
      const box = page.querySelector('.pv-blockbox');
      expect(!!box).toBeTruthy();
      expect(box.parentElement).toBe(page);
      const before = box.getBoundingClientRect().top - page.getBoundingClientRect().top;
      // Scrolling the page moves the box with it: its place on the page does not change.
      const scroller = PT.win.document.querySelector('.viewer') || page.parentElement;
      scroller.scrollTop += 40;
      await new Promise((res) => PT.win.requestAnimationFrame(() => res()));
      const after = box.getBoundingClientRect().top - page.getBoundingClientRect().top;
      expect(Math.round(after)).toBe(Math.round(before));
      // The box sits exactly under the drag, also when the page is zoomed in.
      Ed.zoomMode = 'num'; Ed.zoom = 1.5; Ed.layout();
      await new Promise((res) => setTimeout(res, 50));
      const r2 = page.getBoundingClientRect();
      const x0 = r2.left + 40, y0 = r2.top + 40, x1 = r2.left + 200, y1 = r2.top + 110;
      page.dispatchEvent(ev('pointerdown', x0, y0));
      win.dispatchEvent(ev('pointermove', x1, y1));
      win.dispatchEvent(ev('pointerup', x1, y1));
      const b2 = page.querySelector('.pv-blockbox').getBoundingClientRect();
      expect(Math.abs(b2.left - x0) < 1.5 && Math.abs(b2.top - y0) < 1.5).toBeTruthy();
      expect(Math.abs(b2.right - x1) < 1.5 && Math.abs(b2.bottom - y1) < 1.5).toBeTruthy();
      Ed.zoomMode = 'fit'; Ed.layout();
      // A tool change removes the box.
      Ed.setTool('select');
      await new Promise((res) => setTimeout(res, 0)); // the tool change is seen after the page's attribute changes
      expect(!!page.querySelector('.pv-blockbox')).toBeFalsy();
    });

    it('Escape removes the box', async () => {
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'one two' }]), 'block2.pdf');
      const Ed = PT.SP.editor, S = Ed._, win = PT.win;
      const pid = PT.E.state.pages[0].id; PT.A.openPage(pid);
      await waitFor(() => PT.win.document.querySelector('.pv-textlayer span') && Ed.pid === pid, { timeout: 8000 });
      Ed.setTool('block');
      const page = S.pageEl, r = page.getBoundingClientRect();
      const ev = (type, x, y) => new win.PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1 });
      page.dispatchEvent(ev('pointerdown', r.left + 20, r.top + 20));
      win.dispatchEvent(ev('pointermove', r.left + 120, r.top + 50));
      win.dispatchEvent(ev('pointerup', r.left + 120, r.top + 50));
      expect(!!page.querySelector('.pv-blockbox')).toBeTruthy();
      win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(!!page.querySelector('.pv-blockbox')).toBeFalsy();
      Ed.setTool('select');
    });

    it('zooming in and out keeps the box on the same place of the page and around the same words', async () => {
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'alpha beta' }, { text: 'gamma delta' }]), 'block3.pdf');
      const Ed = PT.SP.editor, S = Ed._, win = PT.win;
      const pid = PT.E.state.pages[0].id; PT.A.openPage(pid);
      await waitFor(() => PT.win.document.querySelector('.pv-textlayer span') && Ed.pid === pid, { timeout: 8000 });
      Ed.zoomMode = 'num'; Ed.zoom = 1; Ed.layout();
      Ed.setTool('block');
      const page = S.pageEl;
      const ev = (type, x, y) => new win.PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1 });
      // A box over the first word of the text layer, drawn at 100%: the word's own rectangle, a little wider.
      const word = page.querySelector('.pv-textlayer span').getBoundingClientRect();
      const x0 = word.left - 3, y0 = word.top - 3, x1 = word.right + 3, y1 = word.bottom + 3;
      page.dispatchEvent(ev('pointerdown', x0, y0));
      win.dispatchEvent(ev('pointermove', x1, y1));
      win.dispatchEvent(ev('pointerup', x1, y1));
      const box = page.querySelector('.pv-blockbox');
      // The text the box holds, read from the text layer against the box's own screen place.
      const wordsIn = () => {
        const pr = page.getBoundingClientRect(), b = box.getBoundingClientRect();
        const spans = [...page.querySelectorAll('.pv-textlayer span')].map((s) => {
          const rc = s.getBoundingClientRect(); return { text: s.textContent, rect: { left: rc.left, top: rc.top, right: rc.right, bottom: rc.bottom } };
        });
        return { text: PT.win.SPBlockText.extract(spans, { left: b.left, top: b.top, right: b.right, bottom: b.bottom }), at: { x: (b.left - pr.left) / pr.width, y: (b.top - pr.top) / pr.height, w: b.width / pr.width, h: b.height / pr.height } };
      };
      const base = wordsIn();
      expect(base.text.length > 0).toBeTruthy();
      const near = (a, b) => Math.abs(a - b) < 0.01;
      for (const z of [2, 0.5, 1.5]) {
        Ed.zoomMode = 'num'; Ed.zoom = z; Ed.layout();
        await new Promise((res) => setTimeout(res, 30));
        const now = wordsIn();
        expect(now.text).toBe(base.text);
        expect(near(now.at.x, base.at.x) && near(now.at.y, base.at.y)).toBeTruthy();
        expect(near(now.at.w, base.at.w) && near(now.at.h, base.at.h)).toBeTruthy();
      }
      // Fit lays the page out again, and the box follows it too.
      Ed.zoomMode = 'fit'; Ed.layout();
      await new Promise((res) => setTimeout(res, 30));
      const fit = wordsIn();
      expect(fit.text).toBe(base.text);
      expect(near(fit.at.x, base.at.x) && near(fit.at.w, base.at.w)).toBeTruthy();
      Ed.setTool('select');
    });
  });
})();
