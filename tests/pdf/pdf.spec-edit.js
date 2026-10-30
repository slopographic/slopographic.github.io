/* Slop PDF Edit text in place: Edit text mode on, a click on a text run opens it, Enter applies one undo step; the saved
   file has the new text at the same baseline and size as the old run, the info line says the font is not embedded, and
   Undo restores the old text in the editor's model. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const doc = () => PT.win.document;

  describe('Slop PDF edit text in place', () => {
    it('a click on a run edits it in place; the saved file has the new text at the old position and size', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'hello world', w: 300, h: 200 }]), 'edit.pdf');
      PT.A.openPage(PT.E.state.pages[0].id);
      await waitFor(() => doc().querySelector('.pv-textlayer span'), { timeout: 8000 });
      PT.SP.editor.toggleEditText();
      expect(PT.SP.editor.editText).toBe(true);
      const pid = PT.E.state.pages[0].id, el = PT.SP.editor._.slots.get(pid).el, z = PT.SP.editor.zoom, r = el.getBoundingClientRect();
      // a point inside the words: about 40 pt from the left, halfway up the 18 pt line whose baseline is 20 pt up from the bottom
      const cx = r.left + 60 * z, cy = r.top + (200 - 20 - 6) * z;
      el.dispatchEvent(new PT.win.PointerEvent('pointerdown', { clientX: cx, clientY: cy, button: 0, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
      await waitFor(() => doc().querySelector('.edit-run'), { timeout: 5000 });
      const input = doc().querySelector('.edit-run');
      expect(input.value).toBe('hello world');
      const file0 = PT.E.state.pages[0].f;
      input.value = 'goodbye';
      input.dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      const texts = () => PT.E.state.pages[0].annots.filter((a) => a.type === 'text' && a.text === 'goodbye');
      await waitFor(() => texts().length, { timeout: 8000 });
      expect(doc().querySelector('.edit-run')).toBe(null);
      expect(texts().length).toBe(1);
      // the old run is taken out of the page's content (a derived copy of the file), not covered
      expect(PT.E.state.pages[0].annots.filter((a) => a.type === 'whiteout').length).toBe(0);
      expect(PT.E.files.get(PT.E.state.pages[0].f).derived.from).toBe(file0);
      const info = doc().querySelector('.edit-info');
      expect(!!info).toBe(false, 'the info line goes with the editor');
      PT.A.undo(); await sleep(80);
      expect(texts().length).toBe(0);
      expect(PT.E.state.pages[0].f).toBe(file0, 'undo puts the original page back');
      PT.A.redo(); await sleep(80);
      expect(texts().length).toBe(1);
      const r2 = await PT.read(await PT.E.build());
      expect(r2.pages[0].text).toBe('goodbye', 'the old text is not in the saved file');
      const items = (await r2.doc.getPage(1).then((pg) => pg.getTextContent())).items.filter((it) => it.str === 'goodbye');
      expect(items.length).toBe(1);
      const t = items[0].transform;
      expect(Math.abs(t[4] - 20) < 1.5 && Math.abs(t[5] - 20) < 1.5).toBe(true, 'position ' + t[4] + ',' + t[5]);
      expect(Math.abs(Math.hypot(t[2], t[3]) - 18) < 0.8).toBe(true, 'size ' + Math.hypot(t[2], t[3]));
      PT.SP.editor.toggleEditText();
    });

    it('the info line names the font and says whether the file embeds it', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'hello world', w: 300, h: 200 }]), 'info.pdf');
      PT.A.openPage(PT.E.state.pages[0].id);
      await waitFor(() => doc().querySelector('.pv-textlayer span'), { timeout: 8000 });
      PT.SP.editor.toggleEditText();
      const pid = PT.E.state.pages[0].id, el = PT.SP.editor._.slots.get(pid).el, z = PT.SP.editor.zoom, r = el.getBoundingClientRect();
      el.dispatchEvent(new PT.win.PointerEvent('pointerdown', { clientX: r.left + 60 * z, clientY: r.top + (200 - 26) * z, button: 0, bubbles: true, cancelable: true, pointerId: 2, pointerType: 'mouse', isPrimary: true }));
      await waitFor(() => doc().querySelector('.edit-info') && !/Checking/.test(doc().querySelector('.edit-info').textContent), { timeout: 5000 });
      const text = doc().querySelector('.edit-info').textContent;
      expect(/not embedded/.test(text)).toBe(true, text);
      expect(/new text in Helvetica/.test(text)).toBe(true, text);
      doc().querySelector('.edit-run').dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await sleep(60);
      expect(doc().querySelector('.edit-run')).toBe(null);
      PT.SP.editor.toggleEditText();
    });
  });
})();
