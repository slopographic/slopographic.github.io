/* Key binding parser, canonical form, platform display and keydown → step. */
(function () {
  const { describe, it, expect } = SlopTest;
  describe('parser', () => {
    it('maps Mod to Ctrl on Windows/Linux and to ⌘ on a Mac, in a fixed modifier order', () => {
      expect(SlopCmd.parse('Mod+S', false)).toEqual(['Mod+S']);
      expect(SlopCmd.parse('Ctrl+S', false)).toEqual(['Mod+S']);
      expect(SlopCmd.parse('Ctrl+S', true)).toEqual(['Ctrl+S']);
      expect(SlopCmd.parse('Cmd+S', true)).toEqual(['Mod+S']);
      expect(SlopCmd.parse('Meta+S', true)).toEqual(['Mod+S']);
      expect(SlopCmd.canon('Shift+Mod+Z', false)).toBe('Mod+Shift+Z');
      expect(SlopCmd.canon('shift+mod+z', false)).toBe('Mod+Shift+Z');
      expect(SlopCmd.canon('Alt+Shift+Mod+arrowup', false)).toBe('Mod+Alt+Shift+ArrowUp');
    });
    it('parses chords, special keys, aliases and the plus key', () => {
      expect(SlopCmd.parse('Mod+K Mod+S', false)).toEqual(['Mod+K', 'Mod+S']);
      expect(SlopCmd.parse('g  g')).toEqual(['G', 'G']);
      expect(SlopCmd.canon('Esc')).toBe('Escape');
      expect(SlopCmd.canon('Del')).toBe('Delete');
      expect(SlopCmd.canon('PgDn')).toBe('PageDown');
      expect(SlopCmd.canon('space')).toBe('Space');
      expect(SlopCmd.canon('Mod++', false)).toBe('Mod++');
      expect(SlopCmd.canon('Mod+Plus', false)).toBe('Mod++');
      expect(SlopCmd.canon('f5')).toBe('F5');
      expect(SlopCmd.canon('?')).toBe('?');
      expect(SlopCmd.canon('/')).toBe('/');
      expect(SlopCmd.parse(['Mod+K', 'Mod+S'], false)).toEqual(['Mod+K', 'Mod+S']);
    });
    it('rejects bindings with no key or unknown modifiers', () => {
      expect(SlopCmd.parse('Mod+')).toBe(null);
      expect(SlopCmd.parse('Shift')).toBe(null);
      expect(SlopCmd.parse('Ctrl+Shift')).toBe(null);
      expect(SlopCmd.parse('Hyper+S')).toBe(null);
      expect(SlopCmd.parse('')).toBe(null);
    });
  });
  describe('display', () => {
    it('shows ⌘/⇧/⌥ symbols on a Mac and Ctrl+… elsewhere', () => {
      expect(SlopCmd.format('Mod+S', true)).toBe('⌘S');
      expect(SlopCmd.format('Shift+Mod+Z', true)).toBe('⇧⌘Z');
      expect(SlopCmd.format('Alt+Mod+ArrowUp', true)).toBe('⌥⌘↑');
      expect(SlopCmd.format('Ctrl+Alt+Shift+Mod+K', true)).toBe('⌃⌥⇧⌘K');
      expect(SlopCmd.format('Mod+S', false)).toBe('Ctrl+S');
      expect(SlopCmd.format('Shift+Mod+Z', false)).toBe('Ctrl+Shift+Z');
      expect(SlopCmd.format('Mod+K Mod+S', false)).toBe('Ctrl+K Ctrl+S');
      expect(SlopCmd.format('Delete', false)).toBe('Del');
      expect(SlopCmd.format('Delete', true)).toBe('⌦');
      expect(SlopCmd.format('Escape', false)).toBe('Esc');
      expect(SlopCmd.format('t', false)).toBe('T');
    });
    it('keyFor gives the display string of the first binding', () => {
      T.fresh();
      T.spy({ id: 't.save', keys: ['Mod+S', 'F2'] });
      expect(SlopCmd.keyFor('t.save')).toBe('Ctrl+S');
      expect(SlopCmd.keysFor('t.save')).toEqual(['Ctrl+S', 'F2']);
      SlopCmd.mac = true;
      expect(SlopCmd.keyFor('t.save')).toBe('⌘S');
      SlopCmd.mac = false;
      expect(SlopCmd.keyFor('nope')).toBe('');
    });
  });
  describe('keydown → step', () => {
    const ev = (o) => new KeyboardEvent('keydown', o);
    it('uses Ctrl as Mod on PC and Meta as Mod on a Mac', () => {
      expect(SlopCmd.eventSteps(ev({ key: 's', code: 'KeyS', ctrlKey: true }), false)).toEqual(['Mod+S']);
      expect(SlopCmd.eventSteps(ev({ key: 's', code: 'KeyS', metaKey: true }), true)).toEqual(['Mod+S']);
      expect(SlopCmd.eventSteps(ev({ key: 's', code: 'KeyS', ctrlKey: true }), true)).toEqual(['Ctrl+S']);
      expect(SlopCmd.eventSteps(ev({ key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true }), false)).toEqual(['Mod+Shift+Z']);
    });
    it('reads letters from the code when Alt changes the character, and offers symbol forms', () => {
      expect(SlopCmd.eventSteps(ev({ key: 'å', code: 'KeyA', altKey: true }), true)).toEqual(['Alt+A']);
      expect(SlopCmd.eventSteps(ev({ key: '?', code: 'Slash', shiftKey: true }), false)).toEqual(['Shift+?', '?', 'Shift+/']);
      expect(SlopCmd.eventSteps(ev({ key: '+', code: 'Equal', ctrlKey: true, shiftKey: true }), false)).toEqual(['Mod+Shift++', 'Mod++', 'Mod+Shift+=']);
      expect(SlopCmd.eventSteps(ev({ key: '}', code: 'BracketRight', ctrlKey: true, shiftKey: true }), false)).toEqual(['Mod+Shift+}', 'Mod+}', 'Mod+Shift+]']);
      expect(SlopCmd.eventSteps(ev({ key: ']', code: 'BracketRight', ctrlKey: true }), false)).toEqual(['Mod+]']);
      expect(SlopCmd.eventSteps(ev({ key: ' ', code: 'Space' }), false)).toEqual(['Space']);
      expect(SlopCmd.eventSteps(ev({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }), false)).toBe(null);
    });
  });
})();
