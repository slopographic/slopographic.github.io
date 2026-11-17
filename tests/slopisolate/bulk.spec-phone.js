/* SlopIsolate bulk editing on a phone (390 × 844) with touch: a long press on a queue tile starts selecting (and the
 * browser's own menu for it stays shut), taps add more, the checkboxes show, the settings sheet says "Editing 3 pictures"
 * and changes all of them; Escape closes the sheet first, then clears the selection; nothing scrolls sideways.
 * Covers: slopisolate/js/ui/queue.js, slopisolate/js/ui/bulk.js, slopisolate/js/ui/panel-head.js, slopisolate/css/themes.css,
 * slopisolate/css/workspace.css */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  let W, CO, S, D;
  /** A finger on a tile: down, (held for ms), up, then the click the browser sends. */
  async function touch(el, ms = 0) {
    const r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 7, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    el.dispatchEvent(new W.PointerEvent('pointerdown', o));
    if (ms) await sleep(ms);
    el.dispatchEvent(new W.PointerEvent('pointerup', o));
    if (ms) el.dispatchEvent(new W.MouseEvent('contextmenu', o));
    el.dispatchEvent(new W.MouseEvent('click', o));
  }
  const esc = () => D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

  describe('390 px with touch', () => {
    it('a long press selects, taps add, the checkboxes show', async () => {
      W = await BT.open({ model: 'fast', workers: 2 }); CO = W.CO; S = CO.state; D = W.document;
      BT.frame.style.width = '390px'; BT.frame.style.height = '844px';
      await CO.viewState.clear();
      const files = [];
      for (let i = 0; i < 3; i++) files.push(await BT.photo(500 + i, 360, 360));
      BT.drop(files);
      await BT.settled(3);
      await waitFor(() => CO.sheet.isPhone(), { timeout: 3000 });
      await touch(BK.tile(1), 650);
      expect([...S.sel]).toEqual([S.items[1].id]);
      expect(!!D.querySelector('.sui-menu')).toBe(false);       // no menu for the long press
      expect(S.current()).toBe(S.items[1]);                      // the picture on screen is one it edits
      await touch(BK.tile(0));
      await touch(BK.tile(2));
      expect(S.sel.size).toBe(3);
      expect(D.querySelector('#queue .q-n').textContent).toBe('3 selected');
      expect(W.getComputedStyle(BK.tile(0).querySelector('.q-chk')).opacity).toBe('1');
      await touch(BK.tile(2));                                    // a tap on a selected one takes it out
      expect(S.sel.size).toBe(2);
      BK.tile(2).querySelector('.q-chk').click();                 // and the checkbox puts it back
      expect(S.sel.size).toBe(3);
    }, { timeout: 300000 });

    it('the settings sheet edits all three; Escape closes the sheet, then clears the selection', async () => {
      D.getElementById('btnPanel').click();
      expect(CO.sheet.isOpen()).toBe(true);
      expect(D.querySelector('#props .pp-title h2').textContent).toBe('Editing 3 pictures');
      BK.seg('Background', 'Colour');
      BK.colour('Background', 'Colour', '#00ff00');
      expect(S.items.map((it) => [it.bg.mode, it.bg.color])).toEqual(S.items.map(() => ['color', '#00ff00']));
      expect(D.documentElement.scrollWidth <= 390).toBe(true);
      const head = D.querySelector('#props .pp-title').getBoundingClientRect(), menu = D.getElementById('btnPanelMenu').getBoundingClientRect();
      const x = D.querySelector('#props > .ssh-x').getBoundingClientRect();
      expect(menu.right <= x.left + 1 || menu.top >= x.bottom).toBe(true);   // the menu button is not under the sheet's ×
      expect(menu.right <= head.right).toBe(true);
      esc();
      expect([CO.sheet.isOpen(), S.sel.size]).toEqual([false, 3]);
      esc();
      expect(S.sel.size).toBe(0);
      await CO.viewState.clear();
    }, { timeout: 60000 });
  });
})();
