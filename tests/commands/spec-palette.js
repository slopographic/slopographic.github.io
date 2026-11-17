/* The palette: ARIA combobox/listbox, keyboard, focus trap and restore, disabled items, phone sheet, lazy parts. */
(function () {
  const { describe, it, expect, waitFor } = SlopTest;
  const st = () => SlopCmd._parts.palette.state;
  const type = (v) => { st().input.value = v; st().input.dispatchEvent(new Event('input')); };
  describe('palette', () => {
    it('is an ARIA combobox driving a listbox, with shortcut badges', async () => {
      T.fresh();
      T.spy({ id: 't.save', title: 'Save file', group: 'File', keys: ['Mod+S'] });
      await SlopCmd.open();
      const s = st();
      expect(s.input.getAttribute('role')).toBe('combobox');
      expect(s.input.getAttribute('aria-expanded')).toBe('true');
      const list = document.getElementById(s.input.getAttribute('aria-controls'));
      expect(list.getAttribute('role')).toBe('listbox');
      expect(document.activeElement).toBe(s.input);
      type('save file');
      const opt = list.querySelector('[role="option"]');
      expect(opt.dataset.id).toBe('t.save');
      expect(opt.getAttribute('aria-selected')).toBe('true');
      expect(s.input.getAttribute('aria-activedescendant')).toBe(opt.id);
      expect(opt.querySelector('kbd').textContent).toBe('Ctrl+S');
      expect(s.box.getAttribute('role')).toBe('dialog');
      SlopCmd.close();
    });
    it('moves with arrows, skips disabled items, runs on Enter and restores focus', async () => {
      T.fresh();
      const a = T.spy({ id: 't.a', title: 'Frob alpha' }), b = T.spy({ id: 't.b', title: 'Frob beta', when: () => false }), c = T.spy({ id: 't.c', title: 'Frob gamma' });
      const btn = document.getElementById('btn'); btn.focus();
      await SlopCmd.open('frob');
      const s = st();
      expect(s.items.map((x) => x.id)).toEqual(['t.a', 't.c', 't.b']);
      expect(s.list.querySelector('[data-id="t.b"]').getAttribute('aria-disabled')).toBe('true');
      T.press('ArrowDown', s.input);
      expect(s.items[s.active].id).toBe('t.c');
      T.press('ArrowDown', s.input);
      expect(s.items[s.active].id).toBe('t.a');
      T.press('ArrowUp', s.input);
      T.press('Enter', s.input);
      expect(c.calls).toBe(1);
      expect(c.ctx.source).toBe('palette');
      expect(a.calls + b.calls).toBe(0);
      expect(SlopCmd.isOpen).toBe(false);
      expect(document.activeElement).toBe(btn);
      expect(SlopCmd.recent()[0]).toBe('t.c');
    });
    it('clicking an option runs it; Esc clears the query then closes; Tab stays inside', async () => {
      T.fresh();
      const a = T.spy({ id: 't.a', title: 'Click me' });
      await SlopCmd.open('click me');
      st().list.querySelector('[data-id="t.a"]').click();
      expect(a.calls).toBe(1);
      await SlopCmd.open('xyz');
      const s = st();
      T.press('Escape', s.input);
      expect(s.input.value).toBe('');
      expect(SlopCmd.isOpen).toBe(true);
      for (let i = 0; i < 5; i++) { T.press('Tab', document.activeElement); expect(s.box.contains(document.activeElement)).toBe(true); }
      T.press('Escape', document.activeElement);
      expect(SlopCmd.isOpen).toBe(false);
    });
    it('lists Help entries (shortcuts editor, palette) and opens the editor from the footer', async () => {
      T.fresh();
      await SlopCmd.open();
      const s = st();
      expect(s.items.some((x) => x.id === 'cmd.keymap')).toBe(true);
      s.box.querySelector('.scmd-link').click();
      await waitFor(() => SlopCmd._parts.keymap.current);
      expect(SlopCmd.isOpen).toBe(false);
      document.querySelector('.scmd-km-dlg .sui-x').click();
      await T.tick(170);
    });
    it('shows "no results" and a check mark for toggles', async () => {
      T.fresh();
      T.spy({ id: 't.grid', title: 'Show grid', checked: () => true });
      await SlopCmd.open('show grid');
      expect(st().list.querySelector('[data-id="t.grid"] .scmd-check')).toBeTruthy();
      type('qqqqqq');
      expect(st().list.querySelector('.scmd-empty').textContent).toContain('qqqqqq');
      SlopCmd.close();
    });
    it('loads its UI parts on demand and is a full-width sheet on a phone', async () => {
      const f = document.createElement('iframe');
      f.style.cssText = 'width:390px;height:700px;border:0';
      f.src = 'frame.html';
      document.body.append(f);
      const w = f.contentWindow;
      await waitFor(() => w.SlopCmd && w.document.readyState === 'complete');
      await w.SlopCmd.open('hello');
      const pal = w.document.querySelector('.scmd-pal');
      expect(pal.offsetWidth).toBe(390);
      const opt = w.document.querySelector('.scmd-opt');
      expect(opt.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      w.document.querySelector('.scmd-opt').click();
      expect(w.hello).toBe(1);
      const fab = await waitFor(() => w.document.querySelector('.scmd-fab'));
      expect(w.getComputedStyle(fab).display).toBe('grid');
      fab.click();
      await waitFor(() => w.SlopCmd.isOpen);
      w.SlopCmd.close();
      f.remove();
    });
  });
})();
