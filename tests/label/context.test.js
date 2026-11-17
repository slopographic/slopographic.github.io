/* SlopLabel context menus: right-click (canvas, layer rows) and the Menu key / Shift+F10 open the
   menu for each target kind with the expected items; clicking an item performs the action. */
(function () {
  const { describe, it, expect, waitFor } = SlopTest;
  const menuRows = () => [...W.document.querySelectorAll('.sui-menu .sui-row')];
  const menuText = () => menuRows().map((r) => r.querySelector('.sui-lbl').textContent);
  const clickItem = (label) => {
    const row = menuRows().find((r) => r.querySelector('.sui-lbl').textContent === label);
    if (!row) throw new Error('no menu item "' + label + '" in [' + menuText().join(' | ') + ']');
    row.click();
  };
  const contextOn = (el) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new WIN.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 6, clientY: r.top + 6, button: 2 })); };
  const menuKey = (el, o = {}) => el.dispatchEvent(new WIN.KeyboardEvent('keydown', Object.assign({ key: 'F10', shiftKey: true, bubbles: true, cancelable: true }, o)));
  const row = (id) => W.document.querySelector('.li[data-id="' + id + '"]');
  const closeMenus = () => W.SlopUI.closeMenu();
  const frame = () => new Promise((r) => WIN.requestAnimationFrame(() => WIN.requestAnimationFrame(r)));
  /** A blank roll label with one object of each kind, ids o-text, o-bar, o-img, o-box. */
  async function sample() {
    const d = W.newDoc({ stock: W.stockById('roll-100x50'), unit: 'mm' }); d.grid.snap = false;
    d.objects.push(
      W.makeObject('text', { id: 'o-text', x: 2, y: 2, w: 30, h: 8, content: 'Hello', size: 10, font: 'sans', fit: 'box', bold: false }),
      W.makeObject('barcode', { id: 'o-bar', x: 2, y: 12, content: 'SLOP-1', symbology: 'code128', module: 0.25, barHeight: 10, hr: 'none' }),
      W.makeObject('image', { id: 'o-img', x: 40, y: 2, w: 20, h: 20, aspect: 2 }),
      W.makeObject('rect', { id: 'o-box', x: 40, y: 30, w: 18, h: 8, fill: 'none', stroke: 0.5 }));
    W.setDoc(d, 'Context test');
    W.App.tab = 'objects'; W.renderPanels(); await frame();
    return d;
  }

  describe('context menus', () => {
    it('right-click on the empty canvas offers canvas items and Select all selects everything', async () => {
      await sample();
      W.select([]); await frame();
      contextOn(W.$('stage'));
      expect(menuText()).toContain('Paste');
      expect(menuText()).toContain('Select all');
      expect(menuText()).toContain('Fit label');
      expect(menuText()).not.toContain('Distribute');
      clickItem('Select all');
      expect(W.App.sel.length).toBe(4);
      closeMenus();
    });

    it('right-click on a text box offers Edit text and Bold, and Bold toggles the box', async () => {
      await sample(); await frame();
      contextOn(row('o-text'));
      expect(W.App.sel).toEqual(['o-text']);
      expect(menuText()[0]).toBe('Edit text…');
      expect(menuText()).toContain('Bold');
      expect(menuText()).not.toContain('Replace image…');
      clickItem('Bold');
      expect(W.objById('o-text').bold).toBe(true);
      closeMenus();
    });

    it('right-click on a barcode offers Edit data and not text styling', async () => {
      await sample(); await frame();
      contextOn(row('o-bar'));
      expect(menuText()[0]).toBe('Edit data…');
      expect(menuText()).not.toContain('Bold');
      closeMenus();
    });

    it('right-click on an image offers Replace and Original ratio, which restores the aspect', async () => {
      await sample(); await frame();
      contextOn(row('o-img'));
      expect(menuText()).toContain('Replace image…');
      expect(menuText()).toContain('Original ratio');
      clickItem('Original ratio');
      expect(W.objById('o-img').h).toBeCloseTo(10, 0.001);
      closeMenus();
    });

    it('right-click on a box offers the Fill choices, and choosing Black fills it', async () => {
      await sample(); await frame();
      contextOn(row('o-box'));
      expect(menuText()[0]).toBe('Fill');
      const fill = menuRows().find((r) => r.querySelector('.sui-lbl').textContent === 'Fill');
      fill.dispatchEvent(new WIN.PointerEvent('pointerenter', { bubbles: false }));
      await waitFor(() => menuText().includes('Black')); // the flyout opens after a short hover delay
      clickItem('Black');
      expect(W.objById('o-box').fill).toBe('black');
      closeMenus();
    });

    it('several selected objects offer Distribute only when there are three or more', async () => {
      await sample(); await frame();
      W.select(['o-text', 'o-bar']); await frame();
      contextOn(row('o-text'));
      expect(menuText()).not.toContain('Distribute');
      expect(menuText()).toContain('Group');
      closeMenus();
      W.select(['o-text', 'o-bar', 'o-img']); await frame();
      contextOn(row('o-text'));
      expect(menuText()[0]).toBe('Distribute');
      closeMenus();
    });

    it('the Menu key on a selected object on the canvas opens its menu', async () => {
      await sample(); await frame();
      W.select(['o-img']); await frame();
      const stage = W.$('stage');
      stage.focus();
      menuKey(stage);
      expect(menuText()).toContain('Replace image…');
      closeMenus();
    });

    it('Shift+F10 on a focused layer row opens that object’s menu', async () => {
      await sample(); await frame();
      W.select([]); await frame();
      row('o-text').focus();
      menuKey(row('o-text'));
      expect(menuText()[0]).toBe('Edit text…');
      expect(W.App.sel).toEqual(['o-text']);
      closeMenus();
    });
  });
})();
