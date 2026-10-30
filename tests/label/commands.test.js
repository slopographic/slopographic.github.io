/* SlopLabel + the shared command palette (SlopCmd): every tool and menu action is a command,
 * shortcuts go through SlopCmd and can be rebound, the palette and shortcut editor open from Help. */
(function () {
  const { describe, it, expect, waitFor } = SlopTest;
  const C = () => WIN.SlopCmd;
  // Classic 98 when the build offers it, else Light (a profile can hide themes: tests/brand-facts.js)
  const CLASSIC = BRAND_FACTS.themes.includes('classic'), TH = CLASSIC ? 'classic' : 'light';
  const key = (k, o = {}) => WIN.dispatchEvent(new WIN.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o)));
  describe('command palette', () => {
    it('registers every tool and menu action', async () => {
      // earlier suites may leave dialogs open; shortcuts are (rightly) suspended while they are
      W.document.querySelectorAll('.sui-dlg .sui-x').forEach((x) => x.click());
      await waitFor(() => WIN.SlopUI.openDialogs === 0);
      const ids = C().list().map((c) => c.id);
      for (const id of ['save', 'open', 'print', 'undo', 'redo', 'tool.text', 'tool.select', 'insert.qr', 'align.left', 'group', 'nextRecord', 'zoomIn', 'theme.' + TH, 'about']) expect(ids).toContain('label.' + id);
      expect(ids.includes('label.theme.classic')).toBe(CLASSIC);   // a hidden theme is no command
      expect(ids.filter((i) => i.startsWith('label.tool.')).length).toBe(W.TOOLS.filter((t) => t && t !== '-').length);
      expect(C().app).toBe('label');
    });
    it('runs tool shortcuts through SlopCmd and follows a rebinding', async () => {
      W.setTool('select');
      key('t'); expect(W.App.tool).toBe('text');
      C().setKeys('label.tool.text', ['Shift+T']);
      W.setTool('select');
      key('t'); expect(W.App.tool).toBe('select');
      key('T', { shiftKey: true }); expect(W.App.tool).toBe('text');
      await new Promise((r) => setTimeout(r, 10));
      expect(W.document.querySelector('.tool[data-tool="text"]').title).toBe('Text (Shift+T)');
      C().resetKeys('label.tool.text');
      W.setTool('select');
    });
    it('keeps undo/redo/zoom shortcuts and gates them by state', () => {
      const z = W.App.zoom;
      key('=', { ctrlKey: true, code: 'Equal' });
      expect(W.App.zoom).toBeGreaterThan(z);
      key('0', { ctrlKey: true, code: 'Digit0' });
      expect(C().list().find((c) => c.id === 'label.cut').enabled).toBe(W.App.sel.length > 0);
    });
    it('opens with Ctrl+K and from the toolbar button, and runs the chosen command', async () => {
      key('k', { ctrlKey: true });
      await waitFor(() => C().isOpen);
      const st = C()._parts.palette.state;
      st.input.value = CLASSIC ? 'classic theme' : 'theme: light'; st.input.dispatchEvent(new WIN.Event('input'));
      expect(st.items[0].id).toBe('label.theme.' + TH);
      st.input.dispatchEvent(new WIN.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      expect(W.document.documentElement.dataset.theme).toBe(TH);
      expect(C().isOpen).toBe(false);
      W.$('btnCmd').click();
      await waitFor(() => C().isOpen);
      C().close();
      W.setTheme('pro');
    });
    it('Help lists "Search commands…" and "Keyboard shortcuts…"; the editor opens', async () => {
      const items = W.menuHelp().filter(Boolean).map((i) => i.label);
      expect(items).toContain('Search commands…');
      expect(items).toContain('Keyboard shortcuts…');
      W.menuHelp().find((i) => i && i.label === 'Keyboard shortcuts…').act();
      await waitFor(() => W.document.querySelector('.scmd-km-dlg'));
      expect(W.document.querySelectorAll('.scmd-km-row').length).toBeGreaterThan(60);
      W.document.querySelector('.scmd-km-dlg .sui-x').click();
    });
    it('menus show the current shortcut labels', () => {
      const save = W.menuFile().find((i) => i && i.label === 'Save');
      expect(save.key).toBe(C().keyFor('label.save'));
      expect(save.key).toMatch(/S$/);
    });
    it('ships the palette in the offline single-file build', () => {
      const html = W.document.documentElement.outerHTML;
      const list = W.offlineManifest(html);
      for (const p of ['commands.css', 'commands.js', 'search.js', 'palette.js', 'recorder.js', 'keymap.js']) expect(list).toContain('../shared/commands/' + p);
    });
  });
})();
