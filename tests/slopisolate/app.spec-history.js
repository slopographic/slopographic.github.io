/* Slop Cutout: per-image undo/redo for brush strokes and look changes. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const CO = window.CO;

  const image = (w, h) => { const it = CO.state.createItem(null, 'x.png'); it.w = w; it.h = h; return it; };

  describe('history: brush strokes', () => {
    it('undoes and redoes a keep stroke exactly', () => {
      const it = image(8, 8);
      const st = CO.brush.begin(it, 'keep');
      CO.brush.line(st, 1, 1, 6, 6, 2, 1);
      const entry = CO.brush.end(st);
      CO.history.push(it, entry);
      const painted = Array.from(it.edit);
      expect(painted.some((v) => v !== 128)).toBe(true);
      expect(CO.history.can(it, 'undo')).toBe(true);

      CO.history.undo(it);
      expect(Array.from(it.edit).every((v) => v === 128)).toBe(true);
      expect(CO.history.can(it, 'redo')).toBe(true);

      CO.history.redo(it);
      expect(Array.from(it.edit)).toEqual(painted);
    });
    it('a new change clears the redo stack', () => {
      const it = image(4, 4);
      CO.history.push(it, { kind: 'look', label: 'a', before: CO.history.snapLook(it), after: CO.history.snapLook(it) });
      CO.history.undo(it);
      expect(CO.history.can(it, 'redo')).toBe(true);
      CO.history.push(it, { kind: 'look', label: 'b', before: CO.history.snapLook(it), after: CO.history.snapLook(it) });
      expect(CO.history.can(it, 'redo')).toBe(false);
    });
    it('does not record a stroke that changed nothing', () => {
      const it = image(4, 4);
      const st = CO.brush.begin(it, 'keep');
      expect(CO.brush.end(st)).toBe(null);
    });
  });

  describe('history: look changes', () => {
    it('pushLook records only real changes and restores them', () => {
      const it = image(4, 4);
      const before = CO.history.snapLook(it);
      it.s.threshold = 0.8;
      CO.history.pushLook(it, before, 'Threshold');
      expect(CO.history.label(it, 'undo')).toBe('Threshold');
      CO.history.undo(it);
      expect(it.s.threshold).toBe(before.s.threshold);
      CO.history.redo(it);
      expect(it.s.threshold).toBe(0.8);
    });
    it('pushLook ignores an unchanged look', () => {
      const it = image(4, 4);
      CO.history.pushLook(it, CO.history.snapLook(it), 'None');
      expect(CO.history.can(it, 'undo')).toBe(false);
    });
    it('keeps at most 200 steps', () => {
      const it = image(2, 2);
      for (let i = 0; i < 260; i++) CO.history.push(it, { kind: 'look', label: 'n', before: CO.history.snapLook(it), after: CO.history.snapLook(it) });
      expect(it.hist.undo.length).toBe(200);
    });
  });
})();
