/* Slop PDF markup toggle: pressing Highlight, Underline or Strikethrough on text already marked in that style removes the
   markup (one undo step, toast "Removed the highlight."). A partly covered selection adds markup as before, and a markup
   of another style is left alone. Helpers come from pdf.spec-selbar.js (PT.selbar). */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const { fixture, select, act, shown, texthls, spanFor } = PT.selbar;
  const doc = () => PT.win.document;
  /** Whether a markup button shows pressed: aria-pressed="true" and the is-on class together. */
  const pressed = (id) => act(id).getAttribute('aria-pressed') === 'true' && act(id).classList.contains('is-on');
  const TEXT = 'Hello world';
  const hasToast = (words) => waitFor(() => doc().body.textContent.includes(words), { timeout: 3000 });

  /** Adds a texthl over the text's characters with x in [0, x1] (page points) on the first page, as one undo step. */
  async function markPart(x1, style) {
    const p = PT.E.state.pages[0], lines = await PT.E.pageTextLines(p);
    const pts = PT.win.SlopPdfSel.selectionQuads(lines, [{ x0: 0, y0: 0, x1, y1: 1000 }]);
    PT.E.commit('Add test markup', () => { PT.E.pageById(p.id).annots.push({ id: 'm' + Math.random().toString(36).slice(2), type: 'texthl', style, color: '#ffe14d', opacity: 0.4, pts }); });
    return pts;
  }
  /** The x of the right edge of the text "Hello" in the fixture line. */
  const helloEnd = () => 20 + PT.E.measure('Hello', 'Helvetica', 18);
  const fullEnd = () => 20 + PT.E.measure(TEXT, 'Helvetica', 18);

  describe('Slop PDF markup toggle', () => {
    it('pressing Highlight again on the same text removes the highlight, and the toast says so', async () => {
      await fixture([{ text: TEXT, w: 300, h: 200 }]);
      await select(TEXT);
      act('highlight').click();
      await waitFor(() => texthls().length === 1, { timeout: 5000 });
      await select(TEXT);
      act('highlight').click();
      await waitFor(() => texthls().length === 0, { timeout: 5000 });
      await hasToast('Removed the highlight');
    });

    it('undo restores the removed highlight, as one step', async () => {
      await fixture([{ text: TEXT, w: 300, h: 200 }]);
      await select(TEXT);
      act('highlight').click();
      await waitFor(() => texthls().length === 1, { timeout: 5000 });
      await select(TEXT);
      act('highlight').click();
      await waitFor(() => texthls().length === 0, { timeout: 5000 });
      PT.A.undo();
      expect(texthls().length).toBe(1);
      expect(texthls()[0].style).toBe('highlight');
      expect(texthls()[0].pts.length).toBe(4);
    });

    it('a selection only partly covered by a highlight adds a second one instead of removing it', async () => {
      await fixture([{ text: TEXT, w: 300, h: 200 }]);
      await markPart(helloEnd(), 'highlight'); // covers "Hello": under 60 percent of "Hello world"
      await select(TEXT);
      act('highlight').click();
      await waitFor(() => texthls().length === 2, { timeout: 5000 });
      expect(texthls().every((a) => a.style === 'highlight')).toBe(true);
    });

    it('a markup of another style is not removed: Underline on a highlighted line adds an underline', async () => {
      await fixture([{ text: TEXT, w: 300, h: 200 }]);
      await select(TEXT);
      act('highlight').click();
      await waitFor(() => texthls().length === 1, { timeout: 5000 });
      await select(TEXT);
      act('underline').click();
      await waitFor(() => texthls().length === 2, { timeout: 5000 });
      expect(texthls().map((a) => a.style)).toEqual(['highlight', 'underline']);
    });

    it('pressing on part of a highlight removes only that part and keeps the rest of the markup', async () => {
      await fixture([{ text: TEXT, w: 300, h: 200 }]);
      await markPart(fullEnd() + 5, 'strike');
      const span = spanFor(TEXT), r = doc().createRange();
      r.setStart(span.firstChild, 0); r.setEnd(span.firstChild, 5); // "Hello" only
      const sel = PT.win.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      await waitFor(() => shown(), { timeout: 3000 });
      act('strike').click();
      await waitFor(() => texthls().length === 1 && Math.abs(texthls()[0].pts[0][0] - helloEnd()) < 1.5, { timeout: 5000 });
      const xs = texthls()[0].pts.map((q) => q[0]);
      expect(texthls()[0].pts.length).toBe(4);
      expect(Math.abs(Math.min(...xs) - helloEnd()) < 1.5).toBe(true);
      expect(Math.abs(Math.max(...xs) - fullEnd()) < 1.5).toBe(true);
    });

    it('the markup button is pressed while the selection is already marked, and clears when the selection moves away', async () => {
      await fixture([{ text: TEXT, w: 300, h: 200 }, { text: 'Other line', w: 300, h: 200 }]);
      await select(TEXT);
      expect(act('highlight').getAttribute('aria-pressed')).toBe('false');
      act('highlight').click();
      await waitFor(() => texthls().length === 1, { timeout: 5000 });
      await select(TEXT);
      await waitFor(() => pressed('highlight'), { timeout: 3000 });
      expect(act('underline').getAttribute('aria-pressed')).toBe('false');
      PT.A.openPage(PT.E.state.pages[1].id);
      await waitFor(() => spanFor('Other line'), { timeout: 8000 });
      await select('Other line');
      await waitFor(() => !pressed('highlight'), { timeout: 3000 });
      expect(act('highlight').getAttribute('aria-pressed')).toBe('false');
      expect(act('highlight').classList.contains('is-on')).toBe(false);
    });

    it('pressing the pressed Highlight removes the markup and clears its pressed state', async () => {
      await fixture([{ text: TEXT, w: 300, h: 200 }]);
      await select(TEXT);
      act('highlight').click();
      await waitFor(() => texthls().length === 1, { timeout: 5000 });
      await select(TEXT);
      await waitFor(() => pressed('highlight'), { timeout: 3000 });
      act('highlight').click();
      await waitFor(() => texthls().length === 0, { timeout: 5000 });
      await waitFor(() => !pressed('highlight'), { timeout: 3000 });
      expect(act('highlight').getAttribute('aria-pressed')).toBe('false');
    });
  });
})();
