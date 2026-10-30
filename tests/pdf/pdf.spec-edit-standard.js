/* Slop PDF edit text in the standard fonts. A PDF that writes Helvetica, Times and Courier without embedding them (as jsPDF
   does) has no fonts to check: the first edit opens with no prompt and no "no fonts" wording, the run is set in its own
   standard font, and the applied text is in the saved file in that font. Built here with pdf-lib, the way jsPDF writes them. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const doc = () => PT.win.document;

  /** A one-page PDF with three lines, each in a standard font that is not embedded: Helvetica 18, Times 18, Courier 18. */
  async function standardPdf() {
    const L = PT.win.PDFLib, d = await L.PDFDocument.create();
    const page = d.addPage(PT.win.Array.of(300, 200));
    page.drawText('Helvetica line', { x: 20, y: 150, size: 18, font: await d.embedFont(L.StandardFonts.Helvetica) });
    page.drawText('Times line', { x: 20, y: 100, size: 18, font: await d.embedFont(L.StandardFonts.TimesRoman) });
    page.drawText('Courier line', { x: 20, y: 50, size: 18, font: await d.embedFont(L.StandardFonts.Courier) });
    d.setCreationDate(new PT.win.Date(PT.win.Date.UTC(2022, 0, 1) + (++PT._nonce) * 1000));
    return d.save();
  }
  /** Screen point 6 pt above a baseline of the first page, the way a double click lands on a line. */
  function pointAt(baseline) {
    const el = PT.SP.editor._.slots.get(PT.E.state.pages[0].id).el, z = PT.SP.editor.zoom, r = el.getBoundingClientRect();
    return { el, x: r.left + 60 * z, y: r.top + (200 - baseline - 6) * z };
  }
  /** A double press (two presses, one editor) on the run at a baseline. */
  function doublePress(at, id) {
    const init = { clientX: at.x, clientY: at.y, button: 0, bubbles: true, cancelable: true, pointerType: 'mouse', isPrimary: true };
    at.el.dispatchEvent(new PT.win.PointerEvent('pointerdown', { ...init, pointerId: id }));
    at.el.dispatchEvent(new PT.win.PointerEvent('pointerdown', { ...init, pointerId: id + 1 }));
  }
  /** The face name the saved file uses for the text "text" (pdf.js reads it back), and the text of the page. */
  async function savedFace(text) {
    const out = await PT.read(await PT.E.build());
    const pg = await out.doc.getPage(1);
    await pg.getOperatorList();
    const item = (await pg.getTextContent()).items.find((i) => i.str.includes(text));
    return { face: item ? pg.commonObjs.get(item.fontName).name : null, text: out.pages[0].text };
  }

  describe('Slop PDF edit text: standard fonts', () => {
    it('text in Helvetica, Times and Courier (not embedded) is editable at once, with no prompt, and the saved page draws it in that font', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await standardPdf(), 'standard-only.pdf');
      PT.A.openPage(PT.E.state.pages[0].id);
      await waitFor(() => doc().querySelector('.pv-textlayer span'), { timeout: 8000 });
      PT.SP.editor.setTool('select');
      if (!PT.SP.editor.editText) PT.SP.editor.toggleEditText();
      const edits = [[150, 'Helvetica', 'Helvetica edited'], [100, 'Times', 'Times edited'], [50, 'Courier', 'Courier edited']];
      for (let i = 0; i < edits.length; i++) {
        const [baseline, family, next] = edits[i];
        doublePress(pointAt(baseline), 21 + i * 2);
        const input = await waitFor(() => doc().querySelector('.edit-run'), { timeout: 8000 });
        await sleep(120);
        expect(doc().querySelector('.sf-ov')).toBe(null, 'no missing-font prompt for ' + family);
        expect(/no fonts/i.test(doc().body.textContent)).toBe(false, 'no "no fonts" wording');
        const info = doc().querySelector('.edit-info').textContent;
        expect(info.includes('not embedded') && info.includes('new text in ' + family)).toBe(true, info);
        input.value = next;
        input.dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        const annot = await waitFor(() => PT.E.state.pages[0].annots.find((a) => a.type === 'text' && a.text === next), { timeout: 8000 }); // the old run leaves the content first (text-strip.js)
        expect(!!annot && annot.font).toBe(family, 'annotation font for ' + next);
      }
      // the saved file: each applied text is drawn in its standard font (pdf.js reads the face back)
      for (const [, family, next] of edits) {
        const saved = await savedFace(next);
        expect(saved.face && saved.face.startsWith(family)).toBe(true, next + ' saved in ' + saved.face);
        expect(saved.text.includes(next)).toBe(true, saved.text);
      }
      PT.SP.editor.toggleEditText();
    });
  });
})();
