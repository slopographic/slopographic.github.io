/* Slop PDF text selection bar: selecting a line of text shows the bar beside it, on screen, and it hides when the selection
   is cleared. Highlight adds one highlight over the line (one undo step). Escape dismisses the bar and Tab moves into it.
   Edit text, Find and Comment open their tools on the selection; Colour recolours the markup under it; Remove takes the
   selected text out of the page's content without rasterizing it (and lets the selection go), and Redact marks it for the
   Redact tool. Both can be undone. */
// Covers: pdf/js/editor/sel-actions.js, pdf/js/editor/text-strip.js
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const doc = () => PT.win.document;
  const bar = () => doc().querySelector('.selbar');
  const shown = () => !!bar() && !bar().hidden;
  const act = (id) => bar().querySelector('[data-act="' + id + '"]');
  const texthls = () => PT.E.state.pages.flatMap((p) => p.annots.filter((a) => a.type === 'texthl'));
  const spanFor = (text) => [...doc().querySelectorAll('.pv-textlayer span')].find((s) => s.textContent === text);

  async function openPage(id) {
    PT.A.openPage(id);
    await waitFor(() => doc().querySelector('.pv-page') && PT.SP.editor.pid === id, { timeout: 8000 });
  }
  /** A fixture document, opened on its first page in page view, with no selection. */
  async function fixture(pages) {
    if (!PT.SP) await PT.boot();
    PT.reset();
    PT.win.getSelection().removeAllRanges();
    await PT.open(await PT.makePdf(pages), 'sel.pdf');
    await openPage(PT.E.state.pages[0].id);
    await waitFor(() => spanFor(pages[0].text), { timeout: 8000 });
  }
  /** Selects the whole text-layer span with this text, as a mouse drag over the line would. */
  async function select(text) {
    await waitFor(() => spanFor(text), { timeout: 8000 });
    const span = spanFor(text), r = doc().createRange();
    r.selectNodeContents(span);
    const sel = PT.win.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    await waitFor(() => shown(), { timeout: 3000 });
    return span;
  }
  const key = (target, k, init = {}) => target.dispatchEvent(new PT.win.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, init)));

  PT.selbar = { fixture, select, act, bar, shown, texthls, spanFor }; // shared with pdf.spec-markup-toggle.js

  describe('Slop PDF text selection bar', () => {
    it('selecting a line shows the bar beside it, on screen; clearing the selection hides it', async () => {
      await fixture([{ text: 'Hello world', w: 300, h: 200 }]);
      const span = await select('Hello world');
      const r = bar().getBoundingClientRect(), s = span.getBoundingClientRect();
      expect(r.top >= 0 && r.bottom <= PT.win.innerHeight && r.left >= 0 && r.right <= PT.win.innerWidth).toBe(true);
      expect(r.bottom <= s.top + 1 || r.top >= s.bottom - 1).toBe(true);
      for (const id of ['highlight', 'underline', 'strike', 'copy', 'comment', 'edit', 'remove', 'redact', 'replace', 'find']) expect(!!act(id)).toBe(true);
      PT.win.getSelection().removeAllRanges();
      await waitFor(() => !shown(), { timeout: 3000 });
    });

    it('Highlight adds one highlight whose rectangles cover the line, as one undo step', async () => {
      await fixture([{ text: 'Hello world', w: 300, h: 200 }]);
      const p = PT.E.state.pages[0], lines = await PT.E.pageTextLines(p);
      await select('Hello world');
      const before = texthls().length;
      act('highlight').click();
      await waitFor(() => texthls().length === before + 1, { timeout: 5000 });
      const a = texthls()[before], xs = a.pts.map((q) => q[0]), ys = a.pts.map((q) => q[1]), line = lines[0];
      expect(a.style).toBe('highlight');
      expect(a.pts.length).toBe(4);
      expect(Math.min(...ys) <= line.top + 0.1 && Math.max(...ys) >= line.bottom - 0.1).toBe(true);
      expect(Math.abs(Math.min(...xs) - 20) < 1.5).toBe(true);
      expect(Math.abs(Math.max(...xs) - (20 + PT.E.measure('Hello world', 'Helvetica', 18))) < 1.5).toBe(true);
      PT.A.undo();
      expect(texthls().length).toBe(before);
    });

    it('Underline and Strikethrough add their own styles over the same line', async () => {
      await fixture([{ text: 'Hello world', w: 300, h: 200 }]);
      await select('Hello world');
      act('underline').click();
      await waitFor(() => texthls().length === 1, { timeout: 5000 });
      expect(texthls()[0].style).toBe('underline');
      expect(texthls()[0].opacity).toBe(1);
      expect(!!doc().querySelector('.pv-svg .an-texthl line')).toBe(true);
      act('strike').click();
      await waitFor(() => texthls().length === 2, { timeout: 5000 });
      expect(texthls()[1].style).toBe('strike');
    });

    it('Escape hides the bar; Tab from the selection moves into it, and Escape inside it leaves', async () => {
      await fixture([{ text: 'Hello world', w: 300, h: 200 }]);
      await select('Hello world');
      key(doc().body, 'Tab');
      expect(doc().activeElement.dataset.act).toBe('highlight');
      key(doc().activeElement, 'Escape');
      expect(shown()).toBe(false);
      // selecting the same text again shows the bar again
      PT.win.getSelection().removeAllRanges();
      await select('Hello world');
      key(doc().body, 'Escape');
      expect(shown()).toBe(false);
    });

    it('Edit text opens the edit-text mode on the run under the selection; Find and Replace take the selected text', async () => {
      await fixture([{ text: 'Hello world', w: 300, h: 200 }]);
      await select('Hello world');
      act('edit').click();
      await waitFor(() => doc().querySelector('.edit-run'), { timeout: 5000 });
      expect(doc().querySelector('.edit-run').value).toBe('Hello world');
      expect(PT.SP.editor.editText).toBe(true);
      doc().querySelector('.edit-run').dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await select('Hello world');
      act('find').click();
      await waitFor(() => doc().querySelector('.find-input') && doc().querySelector('.find-input').value === 'Hello world', { timeout: 3000 });
      await waitFor(() => doc().querySelectorAll('.pv-hits rect').length > 0, { timeout: 5000 });
      await select('Hello world');
      act('replace').click();
      await waitFor(() => doc().querySelector('.find-dialog') && !doc().querySelector('.find-dialog').hidden, { timeout: 3000 });
      expect(doc().querySelector('.find-dialog .find-input').value).toBe('Hello world');
    });

    it('Comment opens the comment tool at the selection', async () => {
      await fixture([{ text: 'Hello world', w: 300, h: 200 }]);
      await select('Hello world');
      act('comment').click();
      await waitFor(() => doc().querySelector('.note-pop textarea'), { timeout: 3000 });
      expect(PT.SP.editor.tool).toBe('note');
    });

    it('Colour recolours the highlight under the selection, in place, and sets the next colour', async () => {
      await fixture([{ text: 'Hello world', w: 300, h: 200 }]);
      await select('Hello world');
      act('highlight').click();
      await waitFor(() => texthls().length === 1, { timeout: 5000 });
      bar().querySelector('.selbar-btn[data-act="colour"]').click();
      expect(bar().querySelector('.selbar-pop').hidden).toBe(false);
      bar().querySelector('.selbar-sw[aria-label="Red"]').click();
      await waitFor(() => texthls()[0].color === '#e0102f', { timeout: 3000 });
      expect(texthls().length).toBe(1);
      expect(PT.A.undo() != null).toBe(true);
      expect(texthls()[0].color).not.toBe('#e0102f');
    });

    it('Remove takes the selected text out of the page without rasterizing or asking; the selection and its bar go; undo brings it back', async () => {
      await fixture([{ text: 'Hello world', w: 300, h: 200 }, { text: 'Keep me', w: 300, h: 200 }]);
      const E = PT.E, pg = () => E.state.pages[0], whites = () => pg().annots.filter((a) => a.type === 'whiteout').length;
      const fileBefore = pg().f, orig = E.applyRedactions;
      let applied = 0;
      E.applyRedactions = async (...args) => { applied++; return orig.apply(E, args); };
      try {
        await select('Hello world');
        act('remove').click();
        await waitFor(() => pg().f !== fileBefore, { timeout: 8000 });
        expect(doc().querySelector('.sui-dlg')).toBe(null);
        expect(applied).toBe(0);
        expect(!!pg().redacted).toBe(false);
        expect(whites()).toBe(0, 'removed from the content, nothing painted over it');
        expect(E.files.get(pg().f).derived.from).toBe(fileBefore);
        expect(E.state.pages[1].f).toBe(fileBefore, 'the other page keeps its file');
        await sleep(100);
        expect(PT.win.getSelection().isCollapsed).toBe(true);
        expect(!!doc().querySelector('.sel-box')).toBe(false, 'no selection box is left where the text was');
        expect(shown()).toBe(false, 'the bar goes with the selection');
        const r = await PT.read(await E.build());
        expect(r.pages[0].text).toBe('');
        expect(r.pages[1].text).toBe('Keep me');
        expect(PT.A.undo() != null).toBe(true);
        expect(pg().f).toBe(fileBefore);
      } finally { E.applyRedactions = orig; }
    });

    it('Redact marks the selected text for the Redact tool without applying it, and undo removes the mark', async () => {
      await fixture([{ text: 'Hello world', w: 300, h: 200 }]);
      const E = PT.E, marks = () => E.state.pages[0].annots.filter((a) => a.type === 'redact').length;
      await select('Hello world');
      act('redact').click();
      await waitFor(() => marks() === 1, { timeout: 5000 });
      expect(PT.SP.redact.pending().length).toBe(1);
      expect(!!E.state.pages[0].redacted).toBe(false);
      expect(PT.A.undo() != null).toBe(true);
      expect(marks()).toBe(0);
    });
  });
})();
