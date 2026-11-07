/* Slop PDF: edited text keeps its colour. White text on a dark page, pink text on a light one, CMYK and grey text, text in
   a Form XObject and a page whose canvas cannot be read back: the editor shows the text in its own colour on a field it
   reads on (at least 3:1), and the saved file draws the new text in the colour pdf.js reads for the old (its operator
   list, before and after). Lines, Paragraphs and Replace share the path (edit-colours.js S.textInk). */
// Covers: pdf/js/core/content-ink.js, pdf/js/core/content-res.js, pdf/js/core/content-strip.js, pdf/js/core/content-fills.js,
//   pdf/js/editor/edit-colours.js, pdf/js/editor/edit-text.js, pdf/js/editor/text-strip.js, pdf/js/editor/para-model.js,
//   pdf/js/editor/para-edit.js, pdf/js/find/replace.js, pdf/js/find/replace-ui.js
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const doc = () => PT.win.document;
  const Ed = () => PT.SP.editor, S = () => PT.SP.editor._;
  const H = 300;

  /** A 400 × 300 page: a background, and a 42 pt bold line "Shine on" at baseline 150 drawn by text(pg, font, L). */
  async function page(bg, text, opts = {}) {
    if (!PT.SP) await PT.boot();
    const L = PT.win.PDFLib, d = await L.PDFDocument.create(), bold = await d.embedFont(L.StandardFonts.HelveticaBold);
    const pg = d.addPage(PT.win.Array.of(400, H));
    if (bg) pg.drawRectangle({ x: 0, y: 0, width: 400, height: H, color: bg(L) });
    text(pg, bold, L);
    d.setCreationDate(new PT.win.Date(PT.win.Date.UTC(2026, 0, 1) + (++PT._nonce) * 1000));
    if (!opts.form) return d.save();
    // the page drawn into another page as a Form XObject: its text is inside the form
    const out = await L.PDFDocument.create(), [form] = await out.embedPdf(await d.save(), PT.win.Array.of(0));
    out.addPage(PT.win.Array.of(400, H)).drawPage(form, { x: 0, y: 0 });
    return out.save();
  }
  const line = (colour) => (pg, f, L) => pg.drawText('Shine on', { x: 30, y: 150, size: 42, font: f, color: colour(L) });

  /** Each shown text of page i with the fill colour pdf.js draws it in: [{ text, rgb: [0..255 ×3] }]. */
  async function shown(bytes, i = 0) {
    const lib = await PT.E.pdfjs(), d = await lib.getDocument(PT.E.docParams(new PT.win.Uint8Array(bytes))).promise;
    const pg = await d.getPage(i + 1), ol = await pg.getOperatorList(), O = lib.OPS, out = [], stack = [];
    let fill = [0, 0, 0];
    const rgbOf = (a) => (typeof a[0] === 'string' ? [1, 3, 5].map((k) => parseInt(a[0].slice(k, k + 2), 16)) : a.slice(0, 3).map((v) => Math.round(v)));
    ol.fnArray.forEach((fn, k) => {
      const a = ol.argsArray[k];
      if (fn === O.save) stack.push(fill); else if (fn === O.restore) fill = stack.pop() || fill;
      else if (fn === O.setFillRGBColor) fill = rgbOf(a);
      else if (fn === O.showText) out.push({ text: a[0].map((g) => (g && g.unicode) || '').join(''), rgb: fill });
    });
    await d.destroy();
    return out;
  }
  const close = (a, b, t = 3) => a.every((v, k) => Math.abs(v - b[k]) <= t);
  const rgbOfHex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const cssRgb = (c) => (c.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);

  /** Opens bytes on its page in Edit text ▸ Lines and opens the editor on "Shine on". */
  async function openEditor(bytes, name) {
    if (!PT.SP) await PT.boot();
    PT.reset();
    await PT.open(bytes, name);
    const p = PT.E.state.pages[0];
    PT.A.openPage(p.id);
    await waitFor(() => Ed().pid === p.id && doc().querySelector('.pv-textlayer span'), { timeout: 10000 });
    Ed().setEditTextMode('lines');
    if (!Ed().editText) Ed().toggleEditText();
    await Ed().editSelectionRun(p, { x0: 40, y0: H - 150 - 25, x1: 120, y1: H - 150 });
    return waitFor(() => doc().querySelector('.edit-run'), { timeout: 10000 });
  }
  /** Types into the editor, applies it, and reads the saved file's new text colour against the original's. */
  async function editAndSave(input, orig) {
    input.value = 'Shine brighter';
    input.dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitFor(() => PT.E.state.pages[0].annots.some((a) => a.type === 'text'), { timeout: 10000 });
    Ed().toggleEditText();
    const was = (await shown(orig)).find((s) => s.text.includes('Shine on')), now = (await shown(await PT.E.build())).find((s) => s.text.includes('Shine brighter'));
    return { was: was.rgb, now: now.rgb, annot: PT.E.state.pages[0].annots.find((a) => a.type === 'text') };
  }
  /** The editor shows the ink, on a field it reads on. */
  function editorReads(input, ink) {
    const cs = PT.win.getComputedStyle(input), fg = cssRgb(cs.color), bg = cssRgb(cs.backgroundColor);
    expect(close(fg, ink)).toBe(true, 'editor text ' + cs.color + ' is the run colour ' + ink);
    expect(S().contrast(fg.map((v) => v / 255), bg.map((v) => v / 255)) >= 3).toBe(true, cs.color + ' on ' + cs.backgroundColor);
  }

  describe('Slop PDF: edited text keeps its colour', () => {
    const cases = [
      ['white text on a near-black page', (L) => L.rgb(0.04, 0.04, 0.04), (L) => L.rgb(1, 1, 1)],
      ['pink text on a light page', (L) => L.rgb(0.945, 0.929, 0.894), (L) => L.rgb(1, 0.37, 0.64)],
      ['CMYK text (cyan) on white', null, (L) => L.cmyk(1, 0, 0, 0)],
      ['grey text on a dark page', (L) => L.rgb(0.1, 0.1, 0.12), (L) => L.grayscale(0.7)],
    ];
    cases.forEach(([name, bg, ink]) => it(name + ': the editor and the saved file use the original colour', async () => {
      const bytes = await page(bg, line(ink)), orig = (await shown(bytes)).find((s) => s.text.includes('Shine on')).rgb;
      const input = await openEditor(bytes, 'ink.pdf');
      editorReads(input, orig);
      const r = await editAndSave(input, bytes);
      expect(close(r.now, r.was)).toBe(true, 'saved ' + r.now + ' vs original ' + r.was);
    }, { timeout: 60000 }));

    it('text in a Form XObject keeps its colour (it is covered, not removed, and its colour is read inside the form)', async () => {
      const bytes = await page((L) => L.rgb(0.05, 0.1, 0.3), line((L) => L.rgb(1, 0.85, 0.2)), { form: true });
      const orig = (await shown(bytes)).find((s) => s.text.includes('Shine on')).rgb;
      const input = await openEditor(bytes, 'ink-form.pdf');
      editorReads(input, orig);
      const r = await editAndSave(input, bytes);
      expect(close(r.now, r.was)).toBe(true, 'saved ' + r.now + ' vs original ' + r.was);
    }, { timeout: 60000 });

    it('with canvas reads blocked the colour still comes from the content, and the field reads', async () => {
      const bytes = await page((L) => L.rgb(0.04, 0.04, 0.04), line((L) => L.rgb(0.3, 0.9, 0.5)));
      const orig = (await shown(bytes)).find((s) => s.text.includes('Shine on')).rgb, readable = S().canvasReadable;
      S().canvasReadable = () => false; // every pixel reads back white, as with fingerprinting resistance
      try {
        const input = await openEditor(bytes, 'ink-blocked.pdf');
        editorReads(input, orig);
        const r = await editAndSave(input, bytes);
        expect(close(r.now, r.was)).toBe(true, 'saved ' + r.now + ' vs original ' + r.was);
      } finally { S().canvasReadable = readable; }
    }, { timeout: 60000 });

    it('Paragraphs and Replace take the colour the same way', async () => {
      const bytes = await page((L) => L.rgb(0.04, 0.04, 0.04), line((L) => L.rgb(1, 0.37, 0.64)));
      const orig = (await shown(bytes)).find((s) => s.text.includes('Shine on')).rgb;
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(bytes, 'ink-para.pdf');
      const p = PT.E.state.pages[0];
      PT.A.openPage(p.id);
      await waitFor(() => Ed().pid === p.id && doc().querySelector('.pv-textlayer span'), { timeout: 10000 });
      Ed().setEditTextMode('paragraphs');
      if (!Ed().editText) Ed().toggleEditText();
      const sel = S().para.selectBlocks(p, (await S().para.blocksOf(p)).slice(0, 1));
      await sel.ready;
      expect(close(rgbOfHex(sel.model.color), orig)).toBe(true, 'frame ' + sel.model.color + ' vs ' + orig);
      S().para.clear(); Ed().toggleEditText(); Ed().setEditTextMode('lines');
      PT.win.SlopPdfFind.openReplace('Shine on', { caseSensitive: false, wholeWord: false }); // the whole item: its place is exact
      await waitFor(() => doc().querySelectorAll('.find-rlist li').length === 1, { timeout: 5000 });
      doc().querySelector('.find-modal input[aria-label="Replace with"]').value = 'Glow';
      doc().querySelector('.find-go').click();
      const a = await waitFor(() => PT.E.state.pages[0].annots.find((x) => x.type === 'text' && x.text === 'Glow'), { timeout: 8000 });
      expect(close(rgbOfHex(a.color), orig)).toBe(true, 'replacement ' + a.color + ' vs ' + orig);
      await sleep(50);
    }, { timeout: 60000 });
  });
})();
