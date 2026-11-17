/* Slop PDF: edited and removed text leaves no bar. On the built-in sample (a beige page), Edit text (Lines and Paragraphs)
   and Remove take the old text out of the page's content: on screen the page under the old line is the beige paper again,
   with no cover and no selection box left, and the saved file has the new text once and the old text nowhere, with no
   lighter bar where the line was. Undo puts the original page back. Text over an image is removed the same way (the image
   shows through unchanged); where the content cannot be rewritten (text in a Form XObject) a cover is used, in the paper
   colour, also when the browser does not let the page read its canvas back (the colour then comes from the content). */
// Covers: pdf/js/core/content-lex.js, pdf/js/core/content-strip.js, pdf/js/core/content-fills.js, pdf/js/editor/text-strip.js,
//   pdf/js/editor/edit-colours.js, pdf/js/editor/edit-text.js, pdf/js/editor/para-model.js, pdf/js/editor/para-mode.js,
//   pdf/js/editor/sel-actions.js, pdf/js/io/edit-log.js, pdf/js/io/doc-changes.js, pdf/js/ui/app.js, pdf/js/find/replace.js, pdf/js/io/sample.js
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const doc = () => PT.win.document;
  const H = 841.89, BONE = [241, 237, 228];
  const LINE1 = 'Goo is any substance that is too thick to pour politely and too thin to stack. Scientists';
  const Ed = () => PT.SP.editor, S = () => PT.SP.editor._;
  const page = () => PT.E.state.pages[1];
  const spanFor = (t) => [...doc().querySelectorAll('.pv-textlayer span')].find((s) => s.textContent.includes(t));

  /** Opens the sample (made the way File ▸ Sample makes it, in its playful wording, whose lines these checks read: a plain
   *  build's own sample has other words and paper) on its beige page 2. */
  async function openSample() {
    if (!PT.SP) await PT.boot();
    PT.reset();
    PT.win.getSelection().removeAllRanges();
    await PT.open(await PT.E.makeSample('playful'), 'goo.pdf');
    PT.A.openPage(page().id);
    await waitFor(() => Ed().pid === page().id && spanFor('What is goo'), { timeout: 15000 });
    Ed().setTool('select');
    return page().f;
  }
  /** Waits until the page's canvas shows its current file. */
  const rendered = () => waitFor(() => { const s = S().slots.get(page().id); return s && s.key === S().keyOf(s) && s.canvas.width > 0; }, { timeout: 15000 });
  /** Pixels of a page-space box (from the top-left, points) on a canvas k pixels per point: [[r, g, b], …]. */
  function px(c, b, k) {
    const x0 = Math.round(b.x * k), y0 = Math.round(b.y * k), w = Math.round(b.w * k), h = Math.round(b.h * k);
    const d = c.getContext('2d').getImageData(x0, y0, w, h).data, out = [];
    for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
    return out;
  }
  const near = (a, b, t) => a.every((v, i) => Math.abs(v - b[i]) <= t);
  /** The box of the sample's first body line (baseline 680, 12.5 pt) and of the heading (baseline 722, 34 pt bold). */
  const LINE_BOX = { x: 50, y: H - 680 - 11, w: 500, h: 15 }, HEAD_BOX = { x: 50, y: H - 722 - 27, w: 240, h: 34 };
  /** Nothing but paper in a box of the page's canvas: no old glyphs and no bar. */
  function canvasIsPaper(b) {
    const s = S().slots.get(page().id), k = s.canvas.width / 595.28, bad = px(s.canvas, b, k).filter((p) => !near(p, BONE, 6));
    return bad.length;
  }
  /** The saved file: text of page 2 and its rendering at 2 px per point. */
  async function saved() {
    const bytes = await PT.E.build(), r = await PT.read(bytes);
    return { text: r.pages[1].text, canvas: await PT.render(bytes, 1, 2) };
  }
  /** In a saved rendering, a box holds paper and ink only: nothing lighter than the paper (a white bar), mostly paper. */
  function noBar(c, b) {
    const all = px(c, b, 2), lighter = all.filter((p) => p[0] + p[1] + p[2] > BONE[0] + BONE[1] + BONE[2] + 12).length;
    const paper = all.filter((p) => near(p, BONE, 6)).length;
    return { lighter, paperShare: paper / all.length };
  }
  const count = (text, t) => text.split(t).length - 1;

  describe('Slop PDF: edited text leaves no bar (the beige sample)', () => {
    it('Edit text, Lines: the old line leaves the content; screen and saved file show paper and the new text only; undo restores it', async () => {
      const f0 = await openSample();
      if (!Ed().editText) Ed().toggleEditText();
      Ed().setEditTextMode('lines');
      await Ed().editSelectionRun(page(), { x0: 60, y0: H - 680 - 8, x1: 300, y1: H - 680 + 1 });
      const input = await waitFor(() => doc().querySelector('.edit-run'), { timeout: 10000 });
      expect(input.value).toBe(LINE1);
      input.value = LINE1 + ' aaaa';
      input.dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await waitFor(() => page().annots.some((a) => a.type === 'text'), { timeout: 10000 });
      expect(page().annots.filter((a) => a.type === 'whiteout').length).toBe(0, 'nothing is painted over the old line');
      expect(PT.E.files.get(page().f).derived.from).toBe(f0);
      expect(doc().querySelector('#statusLeft').textContent.includes('1 file')).toBe(true, 'the derived copy is the same file');
      await rendered();
      expect(canvasIsPaper(LINE_BOX)).toBe(0, 'the page under the edited line is the paper');
      const out = await saved();
      expect(count(out.text, LINE1 + ' aaaa')).toBe(1, out.text);
      expect(count(out.text.replace(LINE1 + ' aaaa', ''), 'Scientists')).toBe(0, 'the old line is not in the file');
      const nb = noBar(out.canvas, LINE_BOX);
      expect(nb.lighter).toBe(0, 'no lighter bar where the line was');
      expect(nb.paperShare > 0.6).toBe(true, 'the line box is mostly paper: ' + nb.paperShare);
      PT.A.undo(); await sleep(60);
      expect(page().f).toBe(f0);
      expect(page().annots.length).toBe(0);
      expect((await saved()).text.includes(LINE1)).toBe(true, 'undo brings the original line back');
      Ed().toggleEditText();
    }, { timeout: 90000 });

    it('Remove on the heading: no selection box, bar or cover is left; the heading is gone from the screen and the file', async () => {
      const f0 = await openSample();
      if (Ed().editText) Ed().toggleEditText();
      const r = doc().createRange(); r.selectNodeContents(spanFor('What is goo'));
      PT.win.getSelection().removeAllRanges(); PT.win.getSelection().addRange(r);
      const bar = await waitFor(() => { const b = doc().querySelector('.selbar'); return b && !b.hidden ? b : null; }, { timeout: 5000 });
      bar.querySelector('[data-act="remove"]').click();
      await waitFor(() => page().f !== f0, { timeout: 10000 });
      await sleep(100);
      expect(!!doc().querySelector('.sel-box')).toBe(false, 'no selection box is left');
      expect(bar.hidden).toBe(true, 'the bar goes');
      expect(page().annots.length).toBe(0, 'no cover');
      await rendered();
      expect(canvasIsPaper(HEAD_BOX)).toBe(0, 'the heading is gone from the screen');
      const out = await saved();
      expect(out.text.includes('What is goo')).toBe(false, out.text);
      expect(out.text.includes('01')).toBe(true, 'the rest of the page stays');
      expect(noBar(out.canvas, HEAD_BOX).lighter).toBe(0);
      PT.A.undo(); await sleep(60);
      expect(page().f).toBe(f0);
    }, { timeout: 90000 });

    it('Edit text, Paragraphs: the old paragraph leaves the content; the new one is saved once, with no bar', async () => {
      const f0 = await openSample();
      Ed().setEditTextMode('paragraphs');
      if (!Ed().editText) Ed().toggleEditText();
      const el = S().slots.get(page().id).el, z = Ed().zoom, rc = el.getBoundingClientRect(), x = rc.left + 70 * z, y = rc.top + (H - 680 - 4) * z;
      const ev = (type) => new PT.win.PointerEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true });
      el.dispatchEvent(ev('pointerdown')); PT.win.dispatchEvent(ev('pointerup'));
      const sel = await waitFor(() => S().para.sel && S().para.sel.model ? S().para.sel : null, { timeout: 15000 });
      expect(sel.blocks[0].lines.length).toBe(2);
      expect(!!sel.to).toBe(true, 'the removal is ready before anything changes');
      expect(page().f).toBe(f0, 'selecting changes nothing');
      S().para.edit();
      const box = await waitFor(() => doc().querySelector('.para-edit'), { timeout: 8000 });
      box.focus(); doc().execCommand('selectAll'); doc().execCommand('insertText', false, 'Goo is mostly opinions.');
      box.dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
      await waitFor(() => page().annots.some((a) => a.type === 'para'), { timeout: 10000 });
      expect(page().annots.filter((a) => a.type === 'whiteout').length).toBe(0);
      expect(PT.E.files.get(page().f).derived.from).toBe(f0);
      await rendered();
      expect(canvasIsPaper({ x: 50, y: H - 680 - 11, w: 500, h: 33 })).toBe(0, 'both old lines are gone from the screen');
      const out = await saved();
      expect(count(out.text, 'Goo is mostly opinions.')).toBe(1, out.text);
      expect(out.text.includes('Scientists') || out.text.includes('non-Newtonian')).toBe(false, out.text);
      expect(noBar(out.canvas, { x: 50, y: H - 680 - 11, w: 500, h: 33 }).lighter).toBe(0);
      PT.A.undo(); await sleep(60);
      expect(page().f).toBe(f0);
      S().para.clear(); Ed().setEditTextMode('lines'); Ed().toggleEditText();
    }, { timeout: 90000 });
  });

  describe('Slop PDF: removed text in the saved edits', () => {
    const dialogText = () => [...doc().querySelectorAll('.sui-dlg')].map((d) => d.textContent).join('\n');
    it('a removal is kept in the edit log and made again when the file is opened again (the derived copy is rebuilt)', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      const E = PT.E, bytes = await PT.makePdf([{ text: 'Remove this line' }, { text: 'Other page' }]);
      const f1 = await PT.open(bytes, 'log.pdf'), p = E.state.pages[0];
      PT.A.openPage(p.id);
      await waitFor(() => Ed().pid === p.id && spanFor('Remove this'), { timeout: 10000 });
      if (Ed().editText) Ed().toggleEditText();
      const r = doc().createRange(); r.selectNodeContents(spanFor('Remove this'));
      PT.win.getSelection().removeAllRanges(); PT.win.getSelection().addRange(r);
      const bar = await waitFor(() => { const b = doc().querySelector('.selbar'); return b && !b.hidden ? b : null; }, { timeout: 5000 });
      bar.querySelector('[data-act="remove"]').click();
      await waitFor(() => E.state.pages[0].f !== f1.id, { timeout: 10000 });
      const derived = E.state.pages[0].f;
      await sleep(900);
      const rec = await PT.U.idb.get('edits/' + f1.fp);
      expect(rec.entries.length).toBe(1);
      expect(rec.derived.map((d) => d.id)).toEqual([derived]);
      expect(JSON.stringify(rec)).not.toContain('%PDF');
      PT.reset();
      E.files.delete(derived); // as in a new session: only the original is open
      const again = PT.open(bytes, 'log.pdf');
      await waitFor(() => dialogText().includes('Saved edits found'), { timeout: 10000 });
      [...doc().querySelectorAll('.sui-dlg .sui-btn')].find((x) => x.textContent === 'Replay').click();
      await again;
      expect(E.state.pages[0].f).toBe(derived);
      const out = await PT.read(await E.build());
      expect(out.pages[0].text).toBe('');
      expect(out.pages[1].text).toBe('Other page');
      E.undo();
      expect(E.state.pages[0].f).toBe(f1.id);
    }, { timeout: 60000 });
  });

  describe('Slop PDF: text over an image, in a form, and on a page that cannot be read back', () => {
    /** A page with a gradient image behind a line of text (or without the text: the control). */
    async function imagePdf(withText) {
      const L = PT.win.PDFLib, d = await L.PDFDocument.create(), hel = await d.embedFont(L.StandardFonts.Helvetica);
      const c = doc().createElement('canvas'); c.width = 300; c.height = 100;
      const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 300, 0); gr.addColorStop(0, '#2a6'); gr.addColorStop(1, '#fd3');
      g.fillStyle = gr; g.fillRect(0, 0, 300, 100);
      const png = await d.embedPng(await (await PT.win.fetch(c.toDataURL('image/png'))).arrayBuffer());
      const pg = d.addPage(PT.win.Array.of(300, 100));
      pg.drawImage(png, { x: 0, y: 0, width: 300, height: 100 });
      if (withText) pg.drawText('Over the gradient', { x: 20, y: 40, size: 18, font: hel });
      d.setCreationDate(new PT.win.Date(PT.win.Date.UTC(2025, 1, 1) + (++PT._nonce) * 1000));
      return d.save();
    }
    it('text over a gradient image is removed from the content: the saved page there matches the image without text', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      const f = await PT.open(await imagePdf(true), 'grad.pdf'), p = PT.E.state.pages[0];
      PT.A.openPage(p.id);
      await waitFor(() => Ed().pid === p.id && doc().querySelector('.pv-textlayer span'), { timeout: 10000 });
      if (Ed().editText) Ed().toggleEditText();
      const r = doc().createRange(); r.selectNodeContents([...doc().querySelectorAll('.pv-textlayer span')].find((s) => s.textContent.includes('Over')));
      PT.win.getSelection().removeAllRanges(); PT.win.getSelection().addRange(r);
      const bar = await waitFor(() => { const b = doc().querySelector('.selbar'); return b && !b.hidden ? b : null; }, { timeout: 5000 });
      bar.querySelector('[data-act="remove"]').click();
      await waitFor(() => PT.E.state.pages[0].f !== f.id, { timeout: 10000 });
      expect(PT.E.state.pages[0].annots.length).toBe(0, 'no cover over the gradient');
      const bytes = await PT.E.build(), got = await PT.render(bytes, 0, 2), want = await PT.render(await imagePdf(false), 0, 2);
      const box = { x: 15, y: 100 - 40 - 16, w: 180, h: 22 }, a = px(got, box, 2), b = px(want, box, 2);
      const worst = a.reduce((m, p, i) => Math.max(m, Math.abs(p[0] - b[i][0]) + Math.abs(p[1] - b[i][1]) + Math.abs(p[2] - b[i][2])), 0);
      expect(worst <= 12).toBe(true, 'the gradient is unchanged under the old text: worst ' + worst);
      expect((await PT.read(bytes)).pages[0].text).toBe('');
    }, { timeout: 60000 });

    it('text in a Form XObject cannot be rewritten: it is covered in the paper colour (also when the canvas cannot be read)', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      // the sample's page 2 drawn into a new page as a form: its text is inside the form, not in the page's own stream
      const L = PT.win.PDFLib, src = await L.PDFDocument.load(await PT.E.makeSample('playful')), d = await L.PDFDocument.create();
      const [form] = await d.embedPdf(src, PT.win.Array.of(1)), pg = d.addPage(PT.win.Array.of(595.28, H));
      pg.drawRectangle({ x: 0, y: 0, width: 595.28, height: H, color: L.rgb(0.945, 0.929, 0.894) });
      pg.drawPage(form, { x: 0, y: 0 });
      const f = await PT.open(await d.save(), 'form.pdf'), p = PT.E.state.pages[0];
      PT.A.openPage(p.id);
      await waitFor(() => Ed().pid === p.id && spanFor('What is goo'), { timeout: 15000 });
      const readable = S().canvasReadable;
      S().canvasReadable = () => false; // as Firefox with fingerprinting resistance: every pixel reads back white
      try {
        if (!Ed().editText) Ed().toggleEditText();
        Ed().setEditTextMode('lines');
        await Ed().editSelectionRun(p, { x0: 60, y0: H - 680 - 8, x1: 300, y1: H - 680 + 1 });
        const input = await waitFor(() => doc().querySelector('.edit-run'), { timeout: 10000 });
        input.value = 'Covered, not removed';
        input.dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        const cover = await waitFor(() => PT.E.state.pages[0].annots.find((a) => a.type === 'whiteout'), { timeout: 10000 });
        expect(PT.E.state.pages[0].f).toBe(f.id, 'the content is not rewritten');
        const rgb = [1, 3, 5].map((i) => parseInt(cover.fill.slice(i, i + 2), 16));
        expect(near(rgb, BONE, 4)).toBe(true, 'the cover is the paper colour from the content, not white: ' + cover.fill);
      } finally { S().canvasReadable = readable; Ed().toggleEditText(); }
    }, { timeout: 60000 });
  });
})();
