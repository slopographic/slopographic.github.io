/* Slop PDF: one selection bar in every mode. In Edit text mode a drag over text selects it and shows the bar: Highlight
   applies there and the mode stays on; the bar's Edit text opens the line (or, in Paragraphs mode, the paragraph) at once,
   from Edit text mode and from Select mode. A selected annotation gets the same bar with its own actions (Edit, Colour,
   Opacity, Comment, Duplicate, Delete) in place of the lone delete button; each is one undo step, Del still deletes, and
   Escape puts the bar away. */
// Covers: pdf/js/editor/sel-bar.js, pdf/js/editor/sel-annot.js, pdf/js/editor/sel-actions.js, pdf/js/editor/pointer.js,
//   pdf/js/editor/view.js
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const doc = () => PT.win.document;
  const Ed = () => PT.SP.editor, S = () => PT.SP.editor._;
  const bar = () => doc().querySelector('.selbar');
  const shown = () => !!bar() && !bar().hidden;
  const btn = (act) => bar().querySelector('[data-act="' + act + '"]');
  const LINE = 'The selection bar works in every mode';
  const spanFor = (t) => [...doc().querySelectorAll('.pv-textlayer span')].find((s) => s.textContent.includes(t));
  const page = () => PT.E.state.pages[0];

  async function open(mode) {
    if (!PT.SP) await PT.boot();
    PT.reset();
    PT.win.getSelection().removeAllRanges();
    await PT.open(await PT.makePdf([{ text: LINE, w: 500, h: 200 }]), 'actions.pdf');
    PT.A.openPage(page().id);
    await waitFor(() => Ed().pid === page().id && spanFor('selection bar'), { timeout: 10000 });
    Ed().setTool('select');
    Ed().setEditTextMode(mode === 'paragraphs' ? 'paragraphs' : 'lines');
    if (mode && !Ed().editText) Ed().toggleEditText();
    if (!mode && Ed().editText) Ed().toggleEditText();
    await sleep(400); // the Edit text bar changes the view's height: the page settles first
    return waitFor(() => spanFor('selection bar'), { timeout: 10000 });
  }
  const pe = (type, x, y) => new PT.win.PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', isPrimary: true });
  /** A mouse drag across a span, from just inside its left edge to most of its width. */
  async function dragOver(span) {
    const r = span.getBoundingClientRect(), y = r.top + r.height / 2;
    span.dispatchEvent(pe('pointerdown', r.left + 2, y));
    for (let k = 1; k <= 5; k++) PT.win.dispatchEvent(pe('pointermove', r.left + 2 + (r.width - 6) * k / 5, y));
    PT.win.dispatchEvent(pe('pointerup', r.right - 4, y));
    await waitFor(() => shown(), { timeout: 5000 });
  }
  function selectSpan(span) {
    const r = doc().createRange(); r.selectNodeContents(span);
    PT.win.getSelection().removeAllRanges(); PT.win.getSelection().addRange(r);
    return waitFor(() => shown(), { timeout: 5000 });
  }

  describe('Slop PDF selection bar: text in Edit text mode', () => {
    it('a drag selects text and shows the bar; Highlight applies and Edit text mode stays on; undo takes it off', async () => {
      const span = await open('lines');
      await dragOver(span);
      expect(doc().querySelector('.edit-run')).toBe(null, 'a drag does not open the line');
      expect(PT.win.getSelection().toString().length > 10).toBe(true);
      btn('highlight').click();
      await waitFor(() => page().annots.some((a) => a.type === 'texthl'), { timeout: 5000 });
      expect(Ed().editText).toBe(true);
      expect(PT.E.undoLabel()).toBe('Highlight text');
      PT.A.undo();
      expect(page().annots.length).toBe(0);
      Ed().toggleEditText();
    });

    it('a press that stays put still opens the line', async () => {
      const span = await open('lines'), r = span.getBoundingClientRect(), y = r.top + r.height / 2;
      span.dispatchEvent(pe('pointerdown', r.left + 20, y)); PT.win.dispatchEvent(pe('pointerup', r.left + 20, y));
      const input = await waitFor(() => doc().querySelector('.edit-run'), { timeout: 8000 });
      expect(input.value).toBe(LINE);
      S().closeRun(); Ed().toggleEditText();
    });

    it("the bar's Edit text opens the line in one click, from Edit text mode and from Select mode", async () => {
      for (const mode of ['lines', null]) {
        const span = await open(mode);
        if (mode) await dragOver(span); else await selectSpan(span);
        btn('edit').click();
        const input = await waitFor(() => doc().querySelector('.edit-run'), { timeout: 8000 });
        expect(input.value).toBe(LINE);
        expect(Ed().editText).toBe(true, 'Edit text mode is on');
        expect(doc().activeElement).toBe(input);
        S().closeRun(); Ed().toggleEditText();
      }
    }, { timeout: 60000 });

    it("in Paragraphs mode the bar's Edit text opens the paragraph for typing", async () => {
      const span = await open(null);
      Ed().setEditTextMode('paragraphs');
      await selectSpan(span);
      btn('edit').click();
      const box = await waitFor(() => doc().querySelector('.para-edit'), { timeout: 10000 });
      expect(box.textContent.includes('selection bar')).toBe(true, box.textContent);
      S().para.editor.cancel(); S().para.clear(); Ed().setEditTextMode('lines'); if (Ed().editText) Ed().toggleEditText();
    }, { timeout: 60000 });
  });

  describe('Slop PDF selection bar: a selected annotation', () => {
    const rect = () => ({ type: 'rect', rot: 0, cx: 150, cy: 120, w: 100, h: 40, color: '#e0102f', fill: 'none', width: 2, opacity: 1 });
    it('shows its actions instead of a lone delete button: Colour, Opacity, Duplicate, Delete, each undone in one step', async () => {
      await open(null);
      const a = Ed().addAnnot(rect(), 'Add rect'), get = () => page().annots.find((x) => x.id === a.id);
      await waitFor(() => shown() && PT.win.SlopSelBar.mode() === 'annot', { timeout: 5000 });
      expect(!!doc().querySelector('.sel-del')).toBe(false);
      expect(btn('a-edit').hidden).toBe(true, 'a rectangle has no text to edit');
      btn('a-colour').click();
      bar().querySelector('.selbar-pop:not([hidden]) [data-colour="#0a84ff"]').click();
      await waitFor(() => get().color === '#0a84ff', { timeout: 3000 });
      PT.A.undo(); expect(get().color).toBe('#e0102f');
      btn('a-opacity').click();
      bar().querySelector('[data-opacity="0.5"]').click();
      await waitFor(() => get().opacity === 0.5, { timeout: 3000 });
      PT.A.undo(); expect(get().opacity).toBe(1);
      Ed().select(a.id); await sleep(30);
      btn('a-duplicate').click();
      await waitFor(() => page().annots.length === 2, { timeout: 3000 });
      PT.A.undo(); expect(page().annots.length).toBe(1);
      Ed().select(a.id); await sleep(30);
      btn('a-delete').click();
      await waitFor(() => page().annots.length === 0, { timeout: 3000 });
      expect(shown()).toBe(false, 'the bar goes with the annotation');
      PT.A.undo(); expect(page().annots.length).toBe(1);
    });

    it('sits beside the annotation without covering it; Escape puts it away, Del still deletes', async () => {
      await open(null);
      const a = Ed().addAnnot(rect(), 'Add rect');
      await waitFor(() => shown() && PT.win.SlopSelBar.mode() === 'annot', { timeout: 5000 });
      const b = bar().getBoundingClientRect(), box = doc().querySelector('.sel-box').getBoundingClientRect();
      expect(b.bottom <= box.top + 1 || b.top >= box.bottom - 1).toBe(true, 'the bar is above or below the box');
      btn('a-colour').dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(shown()).toBe(false);
      doc().body.dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
      await waitFor(() => !page().annots.some((x) => x.id === a.id), { timeout: 3000 });
    });

    it('Edit opens a text box for typing; Comment opens the comment composer beside the annotation', async () => {
      await open(null);
      Ed().addAnnot({ type: 'text', text: 'Note to self', font: 'Helvetica', size: 16, color: '#111111', rot: 0, cx: 120, cy: 60, w: 120, h: 24, opacity: 1 }, 'Add text');
      await waitFor(() => shown() && !btn('a-edit').hidden, { timeout: 5000 });
      btn('a-edit').click();
      await waitFor(() => !S().ta.hidden, { timeout: 3000 });
      expect(S().ta.value).toBe('Note to self');
      S().ta.blur(); await sleep(50);
      Ed().select(page().annots[0].id); await waitFor(() => shown(), { timeout: 3000 });
      btn('a-comment').click();
      await waitFor(() => doc().querySelector('.note-pop textarea'), { timeout: 3000 });
      PT.SP.editor.noteUI.close(); Ed().setTool('select');
    });
  });
})();
