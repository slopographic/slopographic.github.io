/* Overrides persistence, conflicts, the shortcut editor (recording, conflicts, reset, export/import). */
(function () {
  const { describe, it, expect, waitFor } = SlopTest;
  const R = () => SlopCmd._parts.recorder;
  const closeDialogs = async () => { document.querySelectorAll('.sui-dlg .sui-x').forEach((x) => x.click()); await T.tick(170); };
  describe('overrides', () => {
    it('persist per app in localStorage slop.keys.<app> and survive init', () => {
      const app = T.fresh();
      const s = T.spy({ id: 't.save', keys: ['Mod+S'] });
      SlopCmd.setKeys('t.save', ['Mod+Shift+S', 'F2']);
      expect(JSON.parse(localStorage.getItem('slop.keys.' + app))).toEqual({ 't.save': ['Mod+Shift+S', 'F2'] });
      T.press('Mod+s'); expect(s.calls).toBe(0);
      T.press('F2'); expect(s.calls).toBe(1);
      SlopCmd.init({ app: 'elsewhere-' + app });
      expect(SlopCmd.bindings('t.save')).toEqual(['Mod+S']);
      SlopCmd.init({ app });
      expect(SlopCmd.bindings('t.save')).toEqual(['Mod+Shift+S', 'F2']);
      expect(SlopCmd.list().find((c) => c.id === 't.save').defaults).toEqual(['Mod+S']);
    });
    it('an empty override unbinds; setting the defaults back removes the override', () => {
      const app = T.fresh();
      T.spy({ id: 't.x', keys: ['X'] });
      SlopCmd.setKeys('t.x', []);
      expect(SlopCmd.keyFor('t.x')).toBe('');
      SlopCmd.setKeys('t.x', ['x']);
      expect(SlopCmd.overrides()).toEqual({});
      SlopCmd.setKeys('t.x', ['Y']); SlopCmd.resetKeys('t.x');
      expect(SlopCmd.bindings('t.x')).toEqual(['X']);
      SlopCmd.setKeys('t.x', ['Y']); SlopCmd.resetKeys();
      expect(JSON.parse(localStorage.getItem('slop.keys.' + app))).toEqual({});
    });
    it('exports and imports JSON, rejecting junk', () => {
      T.fresh();
      T.spy({ id: 't.a', keys: ['A'] });
      SlopCmd.setKeys('t.a', ['Mod+Alt+A']);
      const data = SlopCmd.exportKeys();
      expect(data.format).toBe('slop-keys');
      expect(data.keys).toEqual({ 't.a': ['Mod+Alt+A'] });
      SlopCmd.resetKeys();
      expect(SlopCmd.importKeys(JSON.parse(JSON.stringify(data)))).toBe(1);
      expect(SlopCmd.bindings('t.a')).toEqual(['Mod+Alt+A']);
      expect(() => SlopCmd.importKeys([1, 2])).toThrow(/shortcuts/);
      expect(() => SlopCmd.importKeys({ keys: { 't.a': 'A' } })).toThrow(/Bad entry/);
    });
  });
  describe('conflicts', () => {
    it('finds equal bindings and chord prefixes, ignoring the command itself', () => {
      T.fresh();
      T.spy({ id: 't.save', title: 'Save', keys: ['Mod+S'] });
      T.spy({ id: 't.chord', title: 'Chord', keys: ['Mod+G Mod+S'] });
      expect(SlopCmd.conflicts('Ctrl+S').map((c) => c.id)).toEqual(['t.save']);
      expect(SlopCmd.conflicts('Mod+S', 't.save')).toEqual([]);
      expect(SlopCmd.conflicts('Mod+G').map((c) => c.id)).toEqual(['t.chord']);
      T.spy({ id: 't.save2', title: 'Save copy', keys: ['Mod+S'] });
      expect(Object.keys(SlopCmd.allConflicts()).sort()).toEqual(['t.save', 't.save2']);
    });
    it('assign asks before stealing a shortcut and moves it on yes', async () => {
      T.fresh();
      T.spy({ id: 't.save', title: 'Save', keys: ['Mod+S'] }); T.spy({ id: 't.sel', title: 'Select', keys: ['V'] });
      expect(await R().assign('t.sel', null, 'Mod+S', { confirm: async () => false, quiet: true })).toBe(false);
      expect(SlopCmd.bindings('t.sel')).toEqual(['V']);
      let asked = '';
      expect(await R().assign('t.sel', 'V', 'Mod+S', { confirm: async (t, m) => { asked = m; return true; }, quiet: true })).toBe(true);
      expect(asked).toContain('Save');
      expect(SlopCmd.bindings('t.sel')).toEqual(['Mod+S']);
      expect(SlopCmd.bindings('t.save')).toEqual([]);
    });
  });
  describe('shortcut editor', () => {
    it('opens a dialog listing commands by group, with search', async () => {
      T.fresh();
      T.spy({ id: 't.save', title: 'Save file', group: 'File', keys: ['Mod+S'] });
      await SlopCmd.openKeymap();
      const km = SlopCmd._parts.keymap.current;
      expect(!!km).toBe(true);
      expect(document.querySelector('.scmd-km-dlg .sui-title').textContent).toBe('Keyboard shortcuts');
      expect(!!km.list.querySelector('[data-id="t.save"]')).toBe(true);
      expect(km.list.querySelector('[data-id="t.save"] kbd').textContent).toBe('Ctrl+S');
      km.search.value = 'save'; km.search.dispatchEvent(new Event('input'));
      expect(km.list.querySelectorAll('.scmd-km-row').length).toBe(1);
      km.search.value = 'ctrl+s'; km.search.dispatchEvent(new Event('input'));
      expect(!!km.list.querySelector('[data-id="t.save"]')).toBe(true);
      await closeDialogs();
    });
    it('records a new shortcut by click + keypress, suppressing app shortcuts while recording', async () => {
      T.fresh();
      const save = T.spy({ id: 't.save', title: 'Save file', keys: ['Mod+S'] }), b = T.spy({ id: 't.b', title: 'Brush', keys: ['B'] });
      await SlopCmd.openKeymap();
      const km = SlopCmd._parts.keymap.current;
      km.list.querySelector('[data-id="t.save"] .scmd-chip').click();
      expect(!!km.recording).toBe(true);
      expect(km.list.querySelector('.scmd-recording').textContent).toBe('Press keys…');
      T.press('Mod+Alt+s', document.activeElement);
      await waitFor(() => !km.recording, { timeout: 3000 });
      expect(SlopCmd.bindings('t.save')).toEqual(['Mod+Alt+S']);
      expect(save.calls + b.calls).toBe(0);
      expect(km.list.querySelector('[data-id="t.save"]').classList.contains('scmd-changed')).toBe(true);
      // Escape cancels and leaves the dialog open
      km.list.querySelector('[data-id="t.b"] .scmd-add').click();
      T.press('Escape', document.activeElement);
      await T.tick(20);
      expect(SlopCmd.bindings('t.b')).toEqual(['B']);
      expect(!!document.querySelector('.scmd-km-dlg')).toBe(true);
      // reset one
      km.list.querySelector('[data-id="t.save"] .scmd-reset').click();
      await T.tick();
      expect(SlopCmd.bindings('t.save')).toEqual(['Mod+S']);
      await closeDialogs();
    }, { timeout: 8000 });
    it('records chords and asks before replacing a conflicting shortcut', async () => {
      T.fresh();
      T.spy({ id: 't.save', title: 'Save file', keys: ['Mod+S'] }); T.spy({ id: 't.open', title: 'Open file', keys: ['Mod+O'] });
      await SlopCmd.openKeymap();
      const km = SlopCmd._parts.keymap.current;
      km.list.querySelector('[data-id="t.open"] .scmd-add').click();
      T.press('Mod+g', document.activeElement); T.press('Mod+o', document.activeElement);
      await waitFor(() => !km.recording, { timeout: 3000 });
      expect(SlopCmd.bindings('t.open')).toEqual(['Mod+O', 'Mod+G Mod+O']);
      km.list.querySelector('[data-id="t.open"] .scmd-chip').click();
      T.press('Mod+s', document.activeElement);
      const confirmBtn = await waitFor(() => [...document.querySelectorAll('.sui-dlg .sui-btn.sui-primary')].find((x) => x.textContent === 'Replace'), { timeout: 3000 });
      expect([...document.querySelectorAll('.sui-p')].some((x) => x.textContent.includes('Save file'))).toBe(true);
      confirmBtn.click();
      await waitFor(() => SlopCmd.bindings('t.open')[0] === 'Mod+S', { timeout: 3000 });
      expect(SlopCmd.bindings('t.save')).toEqual([]);
      await T.tick(170);
      await closeDialogs();
    }, { timeout: 8000 });
    it('removes a binding with × and imports a file', async () => {
      T.fresh();
      T.spy({ id: 't.a', title: 'Alpha', keys: ['A', 'Mod+1'] });
      await SlopCmd.openKeymap();
      const km = SlopCmd._parts.keymap.current;
      km.list.querySelector('[data-id="t.a"] .scmd-chip-x').click();
      await T.tick();
      expect(SlopCmd.bindings('t.a')).toEqual(['Mod+1']);
      const f = new File([JSON.stringify({ format: 'slop-keys', version: 1, app: SlopCmd.app, keys: { 't.a': ['Mod+2'] } })], 'k.json', { type: 'application/json' });
      expect(await R().importFile(f)).toBe(1);
      expect(SlopCmd.bindings('t.a')).toEqual(['Mod+2']);
      expect(await R().importFile(new File(['nope'], 'bad.json'))).toBe(-1);
      await T.tick(50);
      await closeDialogs();
      const { name, blob } = R().exportFile();
      expect(name).toBe('slop-keys-' + SlopCmd.app + '.json');
      expect(JSON.parse(await blob.text()).keys['t.a']).toEqual(['Mod+2']);
    });
  });
})();
