/* PhotoSlop right-click and keyboard context menus. Loaded by photoslop.test.html, which passes the
 * harness and a getter for the app's global scope (W, a proxy over the iframe's eval). */
function contextMenuTests({ describe, it, expect, getW }) {
  const W = new Proxy({}, { get: (_, k) => getW()[k] });
  describe('context menus', () => {
    const win = () => document.getElementById('app').contentWindow;
    const ctxAt = (el) => { const r = el.getBoundingClientRect(); const ev = new (win().MouseEvent)('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }); el.dispatchEvent(ev); return ev.defaultPrevented; };
    const menuLabels = () => [...win().document.querySelectorAll('.sui-menu .sui-lbl')].map((x) => x.textContent);
    const clickItem = (label) => { const row = [...win().document.querySelectorAll('.sui-menu .sui-row')].find((r) => r.querySelector('.sui-lbl').textContent === label); expect(!!row).toBe(true); row.click(); };
    const closeAll = () => W.SlopUI.closeMenu();
    const activeRow = () => win().document.querySelector('.layers li.layer.active');
    const key = (el, k, shiftKey = false) => el.dispatchEvent(new (win().KeyboardEvent)('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));

    it('right-clicking a layer opens its menu with the expected items', () => {
      closeAll();
      expect(ctxAt(activeRow())).toBe(true);
      const labels = menuLabels();
      for (const l of ['Layer Properties…', 'Duplicate Layer', 'Delete', 'Merge Down', 'Flatten Image']) expect(labels).toContain(l);
      expect(win().document.querySelectorAll('.sui-menu').length).toBe(1);
      // Delete is a submenu: Delete Layer and Remove All Layers
      const del = [...win().document.querySelectorAll('.sui-menu .sui-row')].find((r) => r.querySelector('.sui-lbl').textContent === 'Delete');
      del.click();
      const flyout = [...win().document.querySelectorAll('.sui-menu')].pop();
      expect([...flyout.querySelectorAll('.sui-lbl')].map((x) => x.textContent)).toEqual(['Delete Layer', 'Remove All Layers']);
      closeAll();
    });
    it('clicking a layer menu item performs its action', () => {
      const n = W.D.layers.length;
      ctxAt(activeRow());
      clickItem('Duplicate Layer');
      expect(W.D.layers.length).toBe(n + 1);
      expect(win().document.querySelector('.sui-menu')).toBe(null);
    });
    it('shows Paste only when there is something to paste', () => {
      closeAll(); W.selectTool('move');
      const saved = W.CLIP.canvas;
      try {
        W.CLIP.canvas = null;
        ctxAt(win().document.getElementById('viewport'));
        expect(menuLabels()).not.toContain('Paste');
        closeAll();
        W.CLIP.canvas = W.mkCanvas(4, 4);
        ctxAt(win().document.getElementById('viewport'));
        expect(menuLabels()).toContain('Paste');
        closeAll();
      } finally { W.CLIP.canvas = saved; }
    });
    it('swatch menu sets the foreground colour and removes a custom swatch', () => {
      closeAll();
      W.store.set('swatches', ['#123456']); W.emit('swatches');
      const sw = win().document.querySelector('.swatch[aria-label="Swatch #123456"]');
      expect(!!sw).toBe(true);
      ctxAt(sw);
      expect(menuLabels()).toContain('Remove Swatch');
      clickItem('Set as Foreground');
      expect(W.C.fg).toBe('#123456');
      ctxAt(sw);
      clickItem('Remove Swatch');
      expect(W.store.get('swatches', []).includes('#123456')).toBe(false);
      expect(win().document.querySelector('.swatch[aria-label="Swatch #123456"]')).toBe(null);
      ctxAt(win().document.querySelector('.swatch[aria-label="Swatch #000000"]'));
      expect(menuLabels()).not.toContain('Remove Swatch');
      closeAll();
    });
    it('the Menu key and Shift+F10 open the menu of the focused layer', () => {
      closeAll();
      const eye = activeRow().querySelector('.lp-eye'); eye.focus();
      key(eye, 'ContextMenu');
      expect(menuLabels()).toContain('Layer Properties…');
      closeAll();
      key(eye, 'F10', true);
      expect(menuLabels()).toContain('Delete');
      closeAll();
    });
    it('the Menu key opens the canvas menu when nothing else has focus', () => {
      closeAll(); W.selectTool('move');
      const a = win().document.activeElement; if (a && a.blur) a.blur();
      key(win().document.body, 'ContextMenu');
      expect(menuLabels()).toContain('Copy');
      closeAll();
    });
    it('panel headers collapse and expand from their menu', () => {
      closeAll();
      const head = win().document.querySelector('#panel-swatches .panel-head');
      const panel = win().document.getElementById('panel-swatches');
      const wasCollapsed = panel.classList.contains('collapsed');
      ctxAt(head);
      clickItem(wasCollapsed ? 'Expand Panel' : 'Collapse Panel');
      expect(panel.classList.contains('collapsed')).toBe(!wasCollapsed);
      ctxAt(head);
      clickItem(wasCollapsed ? 'Collapse Panel' : 'Expand Panel');
      expect(panel.classList.contains('collapsed')).toBe(wasCollapsed);
      closeAll();
    });
    it('document tabs offer Close and Close Others', () => {
      closeAll();
      ctxAt(win().document.querySelector('.doctab'));
      expect(menuLabels()).toContain('Close');
      expect(menuLabels()).toContain('Close Others');
      closeAll();
    });
  });
}

/* Slop Paint Classic (single-file page in its own iframe): swatch menu on right-click, edit menu by keyboard. */
function classicContextTests({ describe, it, expect, waitFor }) {
  describe('context menus: Slop Paint Classic', () => {
    let f = null, w = null;
    const labels = () => [...w.document.querySelectorAll('.sui-menu .sui-lbl')].map((x) => x.textContent);
    const clickItem = (label) => { const row = [...w.document.querySelectorAll('.sui-menu .sui-row')].find((r) => r.querySelector('.sui-lbl').textContent === label); expect(!!row).toBe(true); row.click(); };
    const key = (el, k, shiftKey = false) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));

    it('loads Slop Paint Classic', async () => {
      f = document.createElement('iframe'); f.style.cssText = 'width:900px;height:700px;border:0'; f.src = '../../photoslop/classic/index.html';
      document.body.append(f); w = f.contentWindow;
      // Wait for 'load', not just for paint.js's state: ctx.js is a later script, and under load it can still be
      // unloaded when the palette exists, so a right-click would find no menu listeners yet.
      await waitFor(() => w.document.readyState === 'complete' && w.slopPaint && w.slopPaint.cmd && w.SlopUI && w.document.querySelector('#palette .sw'), { timeout: 20000 });
    }, { timeout: 30000 });
    it('right-clicking a palette swatch opens its menu, and Set as Primary Color sets it', () => {
      const cmd = w.slopPaint.cmd, sw = w.document.querySelectorAll('#palette .sw')[3];
      const ev = new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 40, clientY: 40 });
      sw.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      expect(labels()).toContain('Set as Secondary Color'); expect(labels()).toContain('Edit Color…');
      clickItem('Set as Primary Color');
      expect(w.slopPaint.state.primary).toBe(cmd.palette[3]);
    });
    it('the Menu key opens the edit menu, and Paste appears only with something to paste', () => {
      w.SlopUI.closeMenu(); w.document.activeElement && w.document.activeElement.blur && w.document.activeElement.blur();
      key(w.document.body, 'ContextMenu');
      expect(labels()).toContain('Undo'); expect(labels()).toContain('Select All');
      expect(labels()).not.toContain('Paste');
      w.SlopUI.closeMenu();
      expect(w.slopPaint.cmd.hasClip()).toBe(false);
    });
    it('clicking an edit menu item runs its action', () => {
      const before = w.slopPaint.undoDepth();
      key(w.document.body, 'F10', true);
      clickItem('Invert Colors');
      expect(w.slopPaint.undoDepth()).toBe(before + 1);
    });
    it('removes the test frame', () => { f.remove(); });
  });
}
