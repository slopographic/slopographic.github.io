/* Slop PDF: SlopCmd integration: commands registered, default keys dispatch in the right mode,
   menus show the bound keys, palette and shortcut editor open from Help. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const key = (el, k, o = {}) => el.dispatchEvent(new PT.win.KeyboardEvent('keydown', Object.assign({ key: k, code: o.code || '', bubbles: true, cancelable: true }, o)));

  describe('commands & shortcuts', () => {
    it('registers tools, page operations and menu actions with default keys', async () => {
      if (!PT.SP) await PT.boot();
      const C = PT.win.SlopCmd, ids = C.list().map((c) => c.id);
      for (const id of ['file.open', 'file.save', 'file.download', 'edit.undo', 'edit.redo', 'edit.delete', 'pages.rotateRight', 'pages.reverse', 'view.zoomIn', 'tool.text', 'tool.redact', 'panel.redact', 'redact.apply', 'cmd.palette', 'cmd.keymap']) expect(ids).toContain(id);
      expect(C.get('tool.text').keys).toEqual(['T']);
      expect(C.get('file.save').keys).toEqual(['Mod+S']);
      expect(C.app).toBe('pdf');
    });

    it('dispatches keys by mode: R rotates in the grid, T picks the text tool in page view, Mod+Z undoes', async () => {
      PT.reset();
      const E = PT.E, d = PT.win.document, O = PT.SP.organizer;
      await PT.open(await PT.makePdf([{ text: 'k1' }, { text: 'k2' }]), 'keys.pdf');
      const id = E.state.pages[0].id;
      O.setSelection([id], id); O.focus(id);
      key(d.activeElement, 'r', { code: 'KeyR' });
      expect(E.state.pages[0].rot).toBe(90);
      key(d.activeElement, 'R', { code: 'KeyR', shiftKey: true });
      expect(E.state.pages[0].rot).toBe(0);
      key(d.body, 'z', { code: 'KeyZ', ctrlKey: true, metaKey: PT.win.SlopCmd.mac });
      expect(E.state.pages[0].rot).toBe(90);
      PT.A.openPage(id);
      key(d.body, 't', { code: 'KeyT' });
      expect(PT.SP.editor.tool).toBe('text');
      key(d.body, 'x', { code: 'KeyX' });
      expect(PT.SP.editor.tool).toBe('redact');
      key(d.body, 'Escape');
      expect(PT.SP.editor.tool).toBe('select');
      key(d.body, 'Escape');
      expect(PT.A.mode).toBe('grid');
      PT.A.setTool('organize');
    });

    it('shows bound keys in menus and opens the palette and the shortcut editor', async () => {
      const d = PT.win.document, C = PT.win.SlopCmd;
      const help = [...d.querySelectorAll('#menus .menu-b')].find((b) => b.textContent === 'Help');
      help.click();
      const menu = d.querySelector('.sui-menu');
      expect(menu.textContent).toContain('Search commands');
      expect(menu.textContent).toContain('Keyboard shortcuts');
      expect(menu.textContent).toContain(C.keyFor('cmd.palette'));
      key(d.body, 'Escape'); d.body.click();
      d.querySelectorAll('.sui-menu').forEach((m) => m.remove());
      C.setKeys('file.download', ['Shift+Mod+S']);
      expect(PT.A.key('file.download')).toBe(C.format('Shift+Mod+S'));
      C.resetKeys('file.download');
      d.getElementById('btnCmd').click();
      await waitFor(() => C.isOpen, { timeout: 5000 });
      C.close();
      PT.A._.showKeys();
      await waitFor(() => d.querySelector('.sui-dlg'), { timeout: 5000 });
      PT.closeDialogs();
    });
  });
})();
