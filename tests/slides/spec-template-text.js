/* Slop Slides: text on a deck made from a template (New from template) opens for editing by double-click and by Enter,
   and typed text replaces it. The prompt of an empty placeholder is replaced when editing starts. Runs the real editor. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;

  /** A double-click as a browser sends it. Synthetic events skip the browser's default actions, so this one also does
      the mousedown step: a press that is not cancelled moves focus to the canvas (it is focusable). */
  function dblclick(w, x, y) {
    const c = w.SS.stage.toClient(x, y), init = { clientX: c.x, clientY: c.y, bubbles: true, cancelable: true, button: 0, buttons: 1 };
    for (let i = 0; i < 2; i++) {
      const down = w.SS.stage.cv.dispatchEvent(new w.PointerEvent('pointerdown', Object.assign({ pointerId: 1, isPrimary: true }, init)));
      if (down) {
        const md = w.SS.stage.cv.dispatchEvent(new w.MouseEvent('mousedown', init));
        if (md) w.SS.stage.cv.focus();
      }
      w.SS.stage.cv.dispatchEvent(new w.PointerEvent('pointerup', Object.assign({ pointerId: 1, isPrimary: true }, init, { buttons: 0 })));
      w.SS.stage.cv.dispatchEvent(new w.MouseEvent('mouseup', Object.assign({}, init, { buttons: 0 })));
    }
  }
  /** Types text into the focused editor as the keyboard does (it replaces the selection). */
  function typeText(w, text) {
    const ta = w.document.getElementById('editor');
    expect(w.document.activeElement).toBe(ta);
    w.document.execCommand('insertText', false, text);
  }
  /** A new editor with a template deck (its unsaved state cleared first, as the New from template test does). */
  async function fromTemplate(id) {
    const w = await ST.open('../../slides/');
    w.SS.files.fromTemplate(id);
    expect(w.SS.app.deck.title).toBe(w.SS.templates.byId(id).build().title);
    return w;
  }
  const ph = (w, slideIdx, type) => w.SS.app.deck.slides[slideIdx].objects.find((o) => o.placeholder === type);
  const plainOf = (w, slideIdx, type) => w.SS.objects.plain(ph(w, slideIdx, type).text);

  describe('template text', () => {
    it('New from template: the title is "Gooey" and a double-click opens it; typed text replaces it', async () => {
      const w = await fromTemplate('pitch');
      expect(plainOf(w, 0, 'title')).toBe('Gooey');
      w.SS.app.idx = 0;
      const t = ph(w, 0, 'title'), c = ST.centre(t);
      dblclick(w, c.x, c.y);
      expect(w.SS.textEdit.editing).toBe(t.id);
      expect(w.document.getElementById('editor').hidden).toBe(false);
      typeText(w, 'Our new pitch');
      ST.key(w, 'Enter', { ctrlKey: true });
      expect(w.SS.textEdit.editing).toBe(null);
      expect(plainOf(w, 0, 'title')).toBe('Our new pitch');
      ST.close(w);
    }, { timeout: 30000 });

    it('Enter on the selected title opens it; typed text replaces it', async () => {
      const w = await fromTemplate('pitch');
      const t = ph(w, 0, 'title');
      w.SS.app.select([t.id]);
      ST.key(w, 'Enter');
      expect(w.SS.textEdit.editing).toBe(t.id);
      typeText(w, 'Typed with Enter');
      ST.key(w, 'Escape');
      expect(plainOf(w, 0, 'title')).toBe('Typed with Enter');
      ST.close(w);
    }, { timeout: 30000 });

    it('subtitle and body text of template slides open by double-click and take typed text', async () => {
      const w = await fromTemplate('pitch');
      w.SS.app.idx = 0;
      const sub = ph(w, 0, 'subtitle'), cs = ST.centre(sub);
      dblclick(w, cs.x, cs.y);
      expect(w.SS.textEdit.editing).toBe(sub.id);
      typeText(w, 'New subtitle');
      ST.key(w, 'Enter', { ctrlKey: true });
      expect(plainOf(w, 0, 'subtitle')).toBe('New subtitle');
      w.SS.app.idx = 1;
      const body = ph(w, 1, 'body'), cb = ST.centre(body);
      dblclick(w, cb.x, cb.y);
      expect(w.SS.textEdit.editing).toBe(body.id);
      typeText(w, 'Only one point');
      ST.key(w, 'Enter', { ctrlKey: true });
      expect(plainOf(w, 1, 'body')).toBe('Only one point');
      ST.close(w);
    }, { timeout: 30000 });

    it('an empty placeholder (its prompt shows) opens empty, and typed text replaces the prompt', async () => {
      const w = await fromTemplate('pitch');
      const t = ph(w, 0, 'title');
      w.SS.app.change('Clear title', () => { w.SS.objects.setPlain(t, ''); });
      w.SS.app.idx = 0;
      const c = ST.centre(ph(w, 0, 'title'));
      dblclick(w, c.x, c.y);
      expect(w.SS.textEdit.editing).toBe(t.id);
      expect(w.document.getElementById('editor').value).toBe('');
      typeText(w, 'Fresh title');
      ST.key(w, 'Enter', { ctrlKey: true });
      expect(plainOf(w, 0, 'title')).toBe('Fresh title');
      ST.close(w);
    }, { timeout: 30000 });
  });
})();
