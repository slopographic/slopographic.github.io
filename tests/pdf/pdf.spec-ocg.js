/* Slop PDF: PDF layers (optional content groups). A page made in the test with two layers, Red and Blue: the Layers section
   lists them; hiding Blue clears it from the page view and from the saved PDF (its default view has Blue off, and the
   red square still draws), and undo shows it again; Delete layer takes Red's content off the page and the group out of
   the file, and undo brings it back. */
// Covers: pdf/js/io/ocg.js, pdf/js/tools/ocg-panel.js, pdf/js/tools/layers-panel.js, pdf/js/io/export-oc.js, pdf/js/io/export.js,
//   pdf/js/core/pdfjs.js, pdf/js/core/content-move.js, pdf/js/editor/text-strip.js, pdf/js/io/edit-log.js
(function () {
  'use strict';
  const ok = (c, msg) => { if (!c) throw new Error('not so: ' + msg); };
  const { describe, it, expect, waitFor } = SlopTest;
  const S = () => PT.SP.editor._, doc = () => PT.win.document;
  const row = (name) => doc().querySelector('#dock-layers .ocg[data-ocg="' + name + '"]');
  /** The colour of the page view's canvas at a page point (points from the top-left). */
  function screen(x, y) {
    const s = S().slots.get(PT.E.state.pages[0].id), k = s.canvas.width / 500;
    return PT.px(s.canvas, x * k, y * k);
  }
  const rendered = () => waitFor(() => { const s = S().slots.get(PT.E.state.pages[0].id); return s && s.key === S().keyOf(s) && s.canvas.width > 0; }, { timeout: 15000 });
  const isBlue = (c) => c[2] > 200 && c[0] < 60 && c[1] < 60;

  describe('Slop PDF: PDF layers', () => {
    it('the Layers section lists the PDF\'s layers', async () => {
      if (!PT.SP) await PT.boot();
      await PT.openView(await PT.layersPdf(), 'layers.pdf');
      PT.SP.dock.setOpen('layers', true);
      await waitFor(() => row('Red') && row('Blue'), { timeout: 10000 });
      expect(doc().querySelector('#dock-layers .ocg-sec h4').textContent).toBe('PDF layers');
      await rendered();
      ok(PT.isRed(screen(100, 200)), 'PT.isRed(screen(100, 200))');
      ok(isBlue(screen(350, 200)), 'isBlue(screen(350, 200))');
    }, { timeout: 60000 });

    it('hide a layer: the page view and the saved PDF leave it out; undo shows it again', async () => {
      row('Blue').querySelector('.lyr-vis').click();
      expect(PT.E.undoLabel()).toBe('Hide layer “Blue”');
      await waitFor(() => row('Blue') && row('Blue').classList.contains('is-off'));
      await rendered();
      ok(PT.isWhite(screen(350, 200)), String(screen(350, 200)));
      ok(PT.isRed(screen(100, 200)), 'PT.isRed(screen(100, 200))');
      const out = await PT.E.build({});
      expect(await PT.layersOf(out)).toEqual({ Red: true, Blue: false });
      const c = await PT.render(out, 0, 1);
      ok(PT.isWhite(PT.px(c, 350, 200)), 'PT.isWhite(PT.px(c, 350, 200))');
      ok(PT.isRed(PT.px(c, 100, 200)), 'PT.isRed(PT.px(c, 100, 200))');
      PT.A.undo();
      await rendered();
      ok(isBlue(screen(350, 200)), 'isBlue(screen(350, 200))');
      expect(await PT.layersOf(await PT.E.build({}))).toEqual({ Red: true, Blue: true });
    }, { timeout: 60000 });

    it('delete a layer: its content and its group leave the file; undo brings both back', async () => {
      const f0 = PT.E.state.pages[0].f;
      row('Red').querySelector('.lyr-del').click();
      const del = await waitFor(() => [...doc().querySelectorAll('.sui-dlg .sui-btn')].find((b) => b.textContent === 'Delete layer'), { timeout: 5000 });
      del.click();
      await waitFor(() => PT.E.state.pages[0].f !== f0, { timeout: 15000 });
      expect(PT.E.undoLabel()).toBe('Delete layer “Red”');
      expect(PT.E.files.get(PT.E.state.pages[0].f).derived.edit.layer).toBe('Red');
      await waitFor(() => row('Blue') && !row('Red'), { timeout: 10000 });
      const out = await PT.E.build({});
      expect(await PT.layersOf(out)).toEqual({ Blue: true });
      const c = await PT.render(out, 0, 1);
      ok(PT.isWhite(PT.px(c, 100, 200)), 'the red square is gone');
      ok(isBlue(PT.px(c, 350, 200)), 'isBlue(PT.px(c, 350, 200))');
      ok(PT.px(c, 250, 19)[0] < 60, 'the content outside the layers stays');
      PT.A.undo();
      expect(PT.E.state.pages[0].f).toBe(f0);
      expect(await PT.layersOf(await PT.E.build({}))).toEqual({ Red: true, Blue: true });
    }, { timeout: 60000 });
  });
})();
