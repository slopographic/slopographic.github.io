/* Slop PDF: right-click and keyboard context menus. Each target opens its menu with the expected items,
   and clicking an item performs the action. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const menuRows = () => [...PT.win.document.querySelectorAll('.sui-menu .sui-row')];
  const menuText = () => menuRows().map((r) => r.querySelector('.sui-lbl').textContent);
  const clickItem = (label) => {
    const row = menuRows().find((r) => r.querySelector('.sui-lbl').textContent === label);
    if (!row) throw new Error('no menu item "' + label + '" in [' + menuText().join(' | ') + ']');
    row.click();
  };
  const rightClick = (el) => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PT.win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + 8, button: 2 }));
  };
  const pressKey = (el, k, o = {}) => el.dispatchEvent(new PT.win.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o)));
  const closeMenus = () => PT.win.SlopUI.closeMenu();
  const annotEl = (id) => PT.win.document.querySelector('.pv-page .annots [data-aid="' + id + '"]');
  async function openPageView() {
    if (!PT.SP) await PT.boot();
    PT.reset();
    await PT.open(await PT.makePdf([{ text: 'one' }, { text: 'two' }]), 'ctx.pdf');
    const id = PT.E.state.pages[0].id;
    PT.A.openPage(id);
    await waitFor(() => PT.win.document.querySelector('.pv-page') && PT.SP.editor.pid === id);
    return id;
  }
  function addRect() {
    const a = { id: 'ctx-rect', type: 'rect', rot: 0, cx: 60, cy: 60, w: 80, h: 40, color: '#e0245e', width: 2.5, fill: 'none', opacity: 1 };
    PT.SP.editor.addAnnot(a, 'Add rectangle');
    return a;
  }
  function addText() {
    const a = { id: 'ctx-text', type: 'text', text: 'Hello', rot: 0, cx: 120, cy: 120, w: 90, h: 20, font: 'Helvetica', size: 16, color: '#111111', bold: false, italic: false, opacity: 1 };
    PT.SP.editor.addAnnot(a, 'Add text');
    return a;
  }

  describe('context menus: organizer page', () => {
    it('right-click on a page thumbnail opens the page menu and Rotate right rotates it', async () => {
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'k1' }, { text: 'k2' }]), 'ctx-grid.pdf');
      await waitFor(() => PT.win.document.querySelector('#grid .thumb'));
      const id = PT.E.state.pages[0].id, thumb = PT.win.document.querySelector('.thumb[data-id="' + id + '"]');
      PT.SP.organizer.setSelection([id], id);
      rightClick(thumb);
      expect(menuText()).toContain('Open page view');
      expect(menuText()).toContain('Rotate right');
      expect(menuText()).toContain('Delete');
      clickItem('Rotate right');
      expect(PT.E.state.pages[0].rot).toBe(90);
      closeMenus();
    });
  });

  describe('context menus: page view', () => {
    it('right-click on the empty page opens the page menu and Rotate page right rotates the page', async () => {
      const id = await openPageView();
      const before = PT.E.state.pages.find((p) => p.id === id).rot || 0;
      rightClick(PT.win.document.querySelector('.pv-page'));
      expect(menuText()).toContain('Fit page');
      expect(menuText()).toContain('Rotate page right');
      expect(menuText()).toContain('Back to all pages');
      expect(menuText()).not.toContain('Edit text…');
      clickItem('Rotate page right');
      expect(PT.E.state.pages.find((p) => p.id === id).rot).toBe((before + 90) % 360);
      closeMenus();
    });

    it('right-click on an annotation selects it and offers annotation items (no Edit text)', async () => {
      await openPageView();
      PT.SP.editor.select(null);
      const a = addRect();
      await waitFor(() => annotEl(a.id));
      rightClick(annotEl(a.id));
      expect(PT.SP.editor.selId).toBe(a.id);
      expect(menuText()).toContain('Duplicate');
      expect(menuText()).toContain('Delete');
      expect(menuText()).not.toContain('Edit text…');
      expect(menuText()).not.toContain('Fit page');
      clickItem('Duplicate');
      const n = PT.E.state.pages[0].annots.length;
      expect(n).toBeGreaterThanOrEqual(2);
      closeMenus();
    });

    it('right-click on a text annotation offers Edit text, which opens the text editor', async () => {
      await openPageView();
      PT.SP.editor.select(null);
      const t = addText();
      await waitFor(() => annotEl(t.id));
      rightClick(annotEl(t.id));
      expect(menuText()[0]).toBe('Edit text…');
      clickItem('Edit text…');
      const ta = PT.win.document.querySelector('.pv-text');
      expect(ta.hidden).toBe(false);
      PT.SP.editor.cancelInteraction();
      closeMenus();
    });

    it('Shift+F10 on a selected annotation opens its menu, and Delete removes it', async () => {
      await openPageView();
      PT.SP.editor.select(null);
      const a = addRect();
      await waitFor(() => annotEl(a.id));
      PT.SP.editor.select(a.id);
      pressKey(PT.win.document.body, 'F10', { shiftKey: true });
      expect(menuText()).toContain('Copy');
      expect(menuText()).toContain('Delete');
      clickItem('Delete');
      expect(PT.SP.editor.getSelected()).toBe(null);
      expect(PT.E.state.pages[0].annots.some((x) => x.id === a.id)).toBe(false);
      closeMenus();
    });

    it('the ContextMenu key on the page view with no selection opens the page menu', async () => {
      await openPageView();
      PT.SP.editor.select(null);
      pressKey(PT.win.document.body, 'ContextMenu');
      expect(menuText()).toContain('Rotate page right');
      expect(menuText()).not.toContain('Delete');
      closeMenus();
    });
  });
})();
