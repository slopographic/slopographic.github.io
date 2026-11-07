/* Dispatch: one capturing listener, text-field rules, when() gating, chords, dialog suppression. */
(function () {
  const { describe, it, expect } = SlopTest;
  const $ = (id) => document.getElementById(id);
  describe('dispatch', () => {
    it('runs a command for its key and consumes the event', () => {
      T.fresh();
      const s = T.spy({ id: 't.save', keys: ['Mod+S'] });
      let bubbled = 0;
      const l = () => bubbled++;
      document.addEventListener('keydown', l);
      const e = T.press('Mod+s');
      document.removeEventListener('keydown', l);
      expect(s.calls).toBe(1);
      expect(s.ctx.source).toBe('key');
      expect(e.defaultPrevented).toBe(true);
      expect(bubbled).toBe(0);
      T.press('s');
      expect(s.calls).toBe(1);
    });
    it('matches Shift+Mod+Z only with Shift, and Mod+Z only without', () => {
      T.fresh();
      const undo = T.spy({ id: 't.undo', keys: ['Mod+Z'] }), redo = T.spy({ id: 't.redo', keys: ['Shift+Mod+Z', 'Mod+Y'] });
      T.press('Mod+Shift+Z'); T.press('Mod+z'); T.press('Mod+y');
      expect(undo.calls).toBe(1);
      expect(redo.calls).toBe(2);
    });
    it('ignores plain keys while typing in inputs, textareas and contenteditable, but fires Mod bindings', () => {
      T.fresh();
      const tool = T.spy({ id: 't.text', keys: ['T'] }), save = T.spy({ id: 't.save', keys: ['Mod+S'] });
      for (const el of [$('field'), $('area'), $('editable')]) {
        el.focus();
        const e = T.press('t', el);
        expect(e.defaultPrevented).toBe(false);
        T.press('Mod+s', el);
      }
      expect(tool.calls).toBe(0);
      expect(save.calls).toBe(3);
      T.press('t', $('btn'));
      expect(tool.calls).toBe(1);
      $('btn').focus();
    });
    it('"/" opens the palette only outside text fields', async () => {
      T.fresh();
      T.press('/', $('field'));
      expect(SlopCmd.isOpen).toBe(false);
      T.press('/');
      await T.tick(20);
      expect(SlopCmd.isOpen).toBe(true);
      SlopCmd.close();
      expect(SlopCmd.isOpen).toBe(false);
    });
    it('gates commands with when(): a disabled command neither runs nor swallows the key', () => {
      T.fresh();
      let on = false;
      const s = T.spy({ id: 't.del', keys: ['Delete'], when: () => on });
      const e = T.press('Delete');
      expect(s.calls).toBe(0);
      expect(e.defaultPrevented).toBe(false);
      expect(SlopCmd.run('t.del')).toBe(false);
      on = true;
      T.press('Delete');
      expect(s.calls).toBe(1);
      expect(SlopCmd.list().find((c) => c.id === 't.del').enabled).toBe(true);
    });
    it('falls through to the next command bound to the same key when the first is disabled', () => {
      T.fresh();
      const a = T.spy({ id: 't.a', keys: ['P'], when: () => false }), b = T.spy({ id: 't.b', keys: ['P'] });
      T.press('p');
      expect(a.calls).toBe(0);
      expect(b.calls).toBe(1);
    });
    it('runs chords (Mod+K Mod+S) and lets a single binding share the first step only through the chord', async () => {
      T.fresh();
      const chord = T.spy({ id: 't.chord', keys: ['Mod+G Mod+S'] }), plain = T.spy({ id: 't.plain', keys: ['Mod+S'] });
      T.press('Mod+g'); T.press('Mod+s');
      expect(chord.calls).toBe(1);
      expect(plain.calls).toBe(0);
      T.press('Mod+s');
      expect(plain.calls).toBe(1);
      T.press('Mod+g'); T.press('x'); T.press('Mod+s');
      expect(chord.calls).toBe(1);
      expect(plain.calls).toBe(2);
    });
    it('ignores auto-repeat unless the command opts in', () => {
      T.fresh();
      const once = T.spy({ id: 't.once', keys: ['O'] }), rep = T.spy({ id: 't.rep', keys: ['ArrowUp'], repeat: true });
      T.press('o', document.body, { repeat: true });
      T.press('ArrowUp', document.body, { repeat: true });
      expect(once.calls).toBe(0);
      expect(rep.calls).toBe(1);
    });
    it('never fires while a SlopUI dialog is open, except the palette toggle', async () => {
      T.fresh();
      const s = T.spy({ id: 't.save', keys: ['Mod+S'] }), tool = T.spy({ id: 't.tool', keys: ['B'] });
      const d = SlopUI.dialog({ title: 'Busy', body: 'x', buttons: [{ label: 'OK', primary: true }] });
      T.press('Mod+s', d.box); T.press('b', d.box);
      expect(s.calls + tool.calls).toBe(0);
      T.press('Mod+k', d.box);
      await T.tick(20);
      expect(SlopCmd.isOpen).toBe(true);
      T.press('Mod+k', document.activeElement);
      expect(SlopCmd.isOpen).toBe(false);
      d.close();
      await T.tick(160);
      T.press('Mod+s');
      expect(s.calls).toBe(1);
    });
    it('does not run app shortcuts while the palette is open', async () => {
      T.fresh();
      const tool = T.spy({ id: 't.tool', keys: ['B'] });
      await SlopCmd.open();
      T.press('b', document.activeElement);
      expect(tool.calls).toBe(0);
      SlopCmd.close();
    });
    it('emits change on register/unregister and run events', async () => {
      T.fresh();
      const seen = [];
      const off1 = SlopCmd.on('change', () => seen.push('change')), off2 = SlopCmd.on('run', (r) => seen.push('run:' + r.id));
      T.spy({ id: 't.ev', keys: ['E'] });
      await T.tick();
      SlopCmd.run('t.ev');
      off1(); off2();
      expect(seen).toEqual(['change', 'run:t.ev']);
    });
  });
})();
