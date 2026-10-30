/* Slop Tables point mode: while a formula is edited, arrows insert cell references (Shift makes a range), a click on a
   cell inserts its address, an operator returns to typing, and normal text and arrows outside editing are unchanged. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const doc = () => TB.doc, T = () => TB.T;
  const ed = () => doc().getElementById('editor');
  const key = (k, shift = false) => ed().dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));
  /** Types text into the editor the way a keystroke does: the value changes and the input event fires. */
  const typed = (text) => { const el = ed(); el.value = text; el.setSelectionRange(text.length, text.length); el.dispatchEvent(new Event('input')); };
  /** Starts a formula in cell ref (the "=" key starts the edit). */
  async function formulaAt(ref) {
    await TB.boot();
    T().select(ref);
    TB.key('=');
    expect(ed().value).toBe('=');
  }

  describe('point mode in formulas', () => {
    it('arrow keys insert the reference of the cell next to the edited one, replacing the last one', async () => {
      await formulaAt('E1');
      key('ArrowLeft');
      expect(ed().value).toBe('=D1');
      key('ArrowLeft');
      expect(ed().value).toBe('=C1');
      key('ArrowDown');
      expect(ed().value).toBe('=C2');
      expect(T().S.edit.text).toBe('=C2');
      expect(doc().getElementById('fx').value).toBe('=C2');
      T().flush();
    });

    it('Shift+arrow extends the reference to a range such as D1:E2', async () => {
      await formulaAt('E1');
      key('ArrowLeft');
      expect(ed().value).toBe('=D1');
      key('ArrowDown', true);
      expect(ed().value).toBe('=D1:D2');
      key('ArrowRight', true);
      expect(ed().value).toBe('=D1:E2');
    });

    it('an operator returns to typing, so the next arrow inserts a new reference', async () => {
      await formulaAt('E1');
      key('ArrowLeft');
      expect(ed().value).toBe('=D1');
      typed('=D1+');
      key('ArrowLeft');
      expect(ed().value).toBe('=D1+D1');
    });

    it('Enter commits the pointed formula', async () => {
      await TB.boot();
      T().type('D1', '1');
      T().type('D2', '2');
      T().select('E1');
      TB.key('=');
      typed('=SUM(');
      key('ArrowLeft');
      key('ArrowDown', true);
      expect(ed().value).toBe('=SUM(D1:D2');
      typed('=SUM(D1:D2)');
      key('Enter');
      expect(T().value('E1')).toBe(3);
    });

    it('a click on a cell inserts its address while the formula is edited', async () => {
      await TB.boot();
      T().type('A1', '5');
      T().flush();
      T().select('E1');
      TB.key('=');
      const a1 = T().el('A1').getBoundingClientRect();
      doc().getElementById('grid').dispatchEvent(new PointerEvent('pointerdown', {
        clientX: a1.left + a1.width / 2, clientY: a1.top + a1.height / 2, button: 0, bubbles: true, cancelable: true,
      }));
      expect(ed().value).toBe('=A1');
      expect(T().S.edit).toBeTruthy();
    });
  });

  describe('normal text is unaffected', () => {
    it('arrows in plain text do not insert references', async () => {
      await TB.boot();
      T().select('F1');
      TB.key('h');
      typed('hello');
      key('ArrowLeft');
      key('ArrowRight');
      expect(ed().value).toBe('hello');
      expect(T().S.edit.text).toBe('hello');
      key('Escape');
    });

    it('arrows outside editing still move the active cell', async () => {
      await TB.boot();
      T().select('A1');
      TB.key('ArrowRight');
      expect(T().S.sel.c).toBe(1);
      TB.key('ArrowDown');
      expect(T().S.sel.r).toBe(1);
    });
  });
})();
