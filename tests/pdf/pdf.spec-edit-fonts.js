/* Slop PDF edit text and the fonts of the document: a subset font the app does not have is asked about before the first edit
   (download from the library, drop a file, or the closest font); the new text is never set in the subset (it is set in the
   closest installed family, and the saved file says so); Download only opens the library's confirmation; a double press opens
   one editor. Barlow is built from tests/pdf/fixtures (not installed), so the prompt appears. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const doc = () => PT.win.document;

  /** A one-page PDF with "text" set in a subset of Barlow Regular (the way the test document embeds its fonts). */
  const barlowPdf = (text) => PT.barlowPdf(text, { subset: true });
  /** Opens bytes, turns edit text on, and returns where the first line of text is on screen (baseline 20 pt). */
  async function startEdit(bytes, name) {
    if (!PT.SP) await PT.boot();
    PT.reset();
    await PT.open(bytes, name);
    PT.A.openPage(PT.E.state.pages[0].id);
    await waitFor(() => doc().querySelector('.pv-textlayer span'), { timeout: 8000 });
    return editMode(PT.SP.editor._.slots.get(PT.E.state.pages[0].id).el);
  }
  /** Edit text on with the select tool (an earlier spec may have left it on), and the first line's point on the page. */
  function editMode(el) {
    PT.SP.editor.setTool('select');
    if (!PT.SP.editor.editText) PT.SP.editor.toggleEditText();
    const z = PT.SP.editor.zoom, r = el.getBoundingClientRect();
    return { el, x: r.left + 60 * z, y: r.top + (200 - 20 - 6) * z };
  }
  /** Turns edit text off again (only if it is on). */
  function editOff() { if (PT.SP.editor.editText) PT.SP.editor.toggleEditText(); }
  const press = (at, id) => at.el.dispatchEvent(new PT.win.PointerEvent('pointerdown', { clientX: at.x, clientY: at.y, button: 0, bubbles: true, cancelable: true, pointerId: id, pointerType: 'mouse', isPrimary: true }));
  const enter = (input) => input.dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  const clickText = (sel, text) => [...doc().querySelectorAll(sel)].find((b) => b.textContent.trim() === text).click();
  /** The face name the saved file uses for the text "text" (pdf.js reads it back). */
  async function savedFontOf(text) {
    const out = await PT.read(await PT.E.build());
    const pg = await out.doc.getPage(1);
    await pg.getOperatorList();
    const item = (await pg.getTextContent()).items.find((i) => i.str === text);
    return item ? pg.commonObjs.get(item.fontName).name : null;
  }
  /** The font store of the app, once its library scripts are on the page. */
  async function store() { if (!PT.SP) await PT.boot(); await PT.win.SlopFonts.ready(); return PT.win.SlopLibraryStore; }
  /** Removes the "drop your own file" fonts the test installed, so later tests start with Barlow missing. */
  async function removeUserFonts() {
    const s = await store();
    for (const p of await s.listPacks()) if (p.id.startsWith('user-barlow')) await s.removePack(p.id);
  }

  describe('Slop PDF edit text: fonts of the document', () => {
    it('a subset font the app does not have is asked about; the closest font is used and the subset is not written into', async () => {
      const at = await startEdit(await barlowPdf('hello world'), 'barlow.pdf');
      press(at, 11);
      await waitFor(() => doc().querySelector('.sf-ov'), { timeout: 8000 });
      const prompt = doc().querySelector('.sf-ov').textContent;
      expect(/This document uses: Barlow \(subset\) · not installed\./.test(prompt) && /Barlow · Missing\. It is not installed\./.test(prompt)).toBe(true, prompt);
      expect(/Drop your own font/.test(prompt) && /Use the closest font instead \(Source Sans 3\)/.test(prompt)).toBe(true, prompt);
      expect(doc().querySelector('.edit-run')).toBe(null);
      doc().querySelectorAll('.sf-row [data-how="closest"]').forEach((b) => b.click());
      await waitFor(() => doc().querySelector('.edit-run'), { timeout: 8000 });
      const input = doc().querySelector('.edit-run');
      expect(input.value).toBe('hello world');
      expect(/Barlow 400 · subset in the file · new text in Source Sans 3 400/.test(doc().querySelector('.edit-info').textContent)).toBe(true, doc().querySelector('.edit-info').textContent);
      expect(input.style.fontFamily.indexOf('Source Sans 3') > -1).toBe(true, input.style.fontFamily);
      input.value = 'goodbye';
      enter(input);
      const annot = await waitFor(() => PT.E.state.pages[0].annots.find((a) => a.type === 'text' && a.text === 'goodbye'), { timeout: 8000 }); // the old run leaves the content first (text-strip.js)
      expect(!!annot).toBe(true);
      expect(annot.font).toBe('Source Sans 3');
      const name = await savedFontOf('goodbye');
      expect(!!name && !/Barlow/.test(name)).toBe(true, 'saved font ' + name);
      expect(/SourceSans3/.test(name)).toBe(true, 'saved font ' + name);
      editOff();
    });

    it('Download from the library opens the pack confirmation only; nothing is stored until it is confirmed', async () => {
      const at = await startEdit(await barlowPdf('hello world'), 'barlow2.pdf');
      press(at, 12);
      await waitFor(() => doc().querySelector('.sf-ov'), { timeout: 8000 });
      clickText('.sf-row button', 'Download from the library');
      await waitFor(() => doc().querySelector('.slop-lib') && /Download Barlow and Barlow Condensed\?/.test(doc().querySelector('.slop-lib').textContent), { timeout: 8000 });
      expect((await (await store()).listPacks()).some((p) => p.id === 'barlow')).toBe(false, 'nothing is stored before the confirmation');
      clickText('.slop-lib button', 'Cancel');
      doc().querySelector('.slop-lib header button').click();
      expect(doc().querySelector('.slop-lib')).toBe(null);
      clickText('.sf-box button', 'Cancel edit');
      expect(doc().querySelector('.sf-ov')).toBe(null);
      expect(doc().querySelector('.edit-run')).toBe(null);
      expect(PT.E.state.pages[0].annots.length).toBe(0, 'a cancelled edit changes nothing');
      editOff();
    });

    it('a font file the person drops is stored on the device and used for the new text, with no prompt for it next time', async () => {
      await removeUserFonts();
      const at = await startEdit(await barlowPdf('hello world'), 'barlow3.pdf');
      press(at, 13);
      await waitFor(() => doc().querySelector('.sf-ov'), { timeout: 8000 });
      const picked = new PT.win.File([await PT.fixture('Barlow-Regular.ttf')], 'Barlow-Regular.ttf', { type: 'font/ttf' });
      PT.win.SlopUI.pickFiles = async () => [picked]; // the row's Drop your own font… is the intake's picker (part fonts.file)
      [...doc().querySelector('.sf-row').querySelectorAll('button')].find((b) => /Drop your own font/.test(b.textContent)).click();
      await waitFor(() => doc().querySelector('.edit-run'), { timeout: 8000 });
      expect((await (await store()).listPacks()).some((p) => p.id.startsWith('user-barlow'))).toBe(true, 'the file is stored');
      expect(doc().querySelector('.sf-ov')).toBe(null, 'the one family is answered by the file');
      expect(/new text in Barlow 400 \(installed\)/.test(doc().querySelector('.edit-info').textContent)).toBe(true, doc().querySelector('.edit-info').textContent);
      const run = doc().querySelector('.edit-run');
      run.value = 'goodbye';
      enter(run);
      const annot = await waitFor(() => PT.E.state.pages[0].annots.find((a) => a.type === 'text' && a.text === 'goodbye'), { timeout: 8000 }); // the old run leaves the content first (text-strip.js)
      expect(annot && annot.font).toBe('Barlow');
      const name = await savedFontOf('goodbye');
      expect(!!name && /Barlow-Regular/.test(name)).toBe(true, 'saved font ' + name);
      editOff();
      await removeUserFonts();
    });

    it('a double press on a run opens one editor, and a standard font needs no prompt', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'hello world', w: 300, h: 200 }]), 'double.pdf');
      PT.A.openPage(PT.E.state.pages[0].id);
      await waitFor(() => doc().querySelector('.pv-textlayer span'), { timeout: 8000 });
      const at = editMode(PT.SP.editor._.slots.get(PT.E.state.pages[0].id).el);
      press(at, 14); press(at, 15);
      await waitFor(() => doc().querySelector('.edit-run'), { timeout: 8000 });
      await sleep(150);
      expect(doc().querySelectorAll('.edit-run').length).toBe(1);
      expect(doc().querySelector('.sf-ov')).toBe(null);
      expect(/Helvetica/.test(doc().querySelector('.edit-info').textContent)).toBe(true, doc().querySelector('.edit-info').textContent);
      doc().querySelector('.edit-run').dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await sleep(60);
      expect(doc().querySelector('.edit-run')).toBe(null);
      editOff();
    });

    it('the text panel font list has the standard three and the bundled families, with a preview line', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'hello world', w: 300, h: 200 }]), 'text-panel.pdf');
      PT.A.openPage(PT.E.state.pages[0].id);
      await waitFor(() => doc().querySelector('.pv-textlayer span'), { timeout: 8000 });
      PT.A.setTool('edit');
      PT.SP.editor.setTool('text');
      const sel = await waitFor(() => doc().querySelector('.pp-body select[aria-label="Font"]'), { timeout: 8000 });
      const values = await waitFor(() => { const v = [...sel.options].map((o) => o.value); return v.includes('Inter') ? v : null; }, { timeout: 8000 });
      for (const f of ['Helvetica', 'Times', 'Courier', 'Inter', 'Source Sans 3']) expect(values.includes(f)).toBe(true, 'option ' + f);
      expect(!!sel.parentNode.querySelector('.slop-font-sample')).toBe(true, 'the preview line is after the select');
      // a family with an embeddable copy (Source Sans 3) has no note; one without (Inter) says the new text is saved in Helvetica
      const pick = (f) => { sel.value = f; sel.dispatchEvent(new PT.win.Event('change')); };
      pick('Inter');
      await waitFor(() => /saved in Helvetica/.test(sel.parentNode.querySelector('.font-tell').textContent), { timeout: 8000 });
      pick('Source Sans 3');
      await waitFor(() => sel.parentNode.querySelector('.font-tell').textContent === '', { timeout: 8000 });
      PT.SP.editor.setTool('select');
    });
  });
})();
