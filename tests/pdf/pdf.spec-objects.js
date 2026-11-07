/* Slop PDF: page objects (Objects mode). A page made in the test with two images and a placed form: the objects are found
   with their boxes; an image is selected and dragged, and the saved PDF paints it there (pdf.js operator list) while the
   other image and the form stay; resize, turn, arrange, duplicate, delete and replace through the selection bar, each one
   undo step that undo takes back; the arrow keys nudge in one step; Save image gives the JPEG as stored; a form as SVG;
   the assistant's pdf.objects.* commands. */
// Covers: pdf/js/core/content-objs.js, pdf/js/core/content-move.js, pdf/js/core/content-svg.js, pdf/js/editor/obj-derive.js,
//   pdf/js/editor/obj-mode.js, pdf/js/editor/obj-bar.js, pdf/js/editor/obj-files.js, pdf/js/editor/text-strip.js,
//   pdf/js/editor/sel-bar.js, pdf/js/editor/pointer.js, pdf/js/ui/commands.js, pdf/js/ui/ctxbars.js, pdf/js/ui/menus.js,
//   pdf/js/ui/ai-objects.js, pdf/js/io/edit-log.js, pdf/js/io/export.js, pdf/js/io/export-oc.js, pdf/js/core/pdfjs.js
(function () {
  'use strict';
  const ok = (c, msg) => { if (!c) throw new Error('not so: ' + msg); };
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const Ed = () => PT.SP.editor, S = () => PT.SP.editor._, O = () => PT.SP.editor._.obj;
  const doc = () => PT.win.document;
  const H = 800; // page height: page space y = 800 − user y
  const bar = (act) => doc().querySelector('.selbar [data-act="obj-' + act + '"]');
  let fx;
  const saved = async () => PT.painted(await PT.E.build({}));
  const images = (list) => list.filter((x) => x.kind === 'image');
  /** Selects the object whose user-space box starts at x0, y0 with a click on its centre. */
  async function pick(x0, y0) {
    const o = (await PT.objects()).find((x) => Math.abs(x.box[0] - x0) < 1 && Math.abs(x.box[1] - y0) < 1);
    const cx = (o.box[0] + o.box[2]) / 2, cy = H - (o.box[1] + o.box[3]) / 2;
    PT.drag([cx, cy], [cx, cy]);
    await waitFor(() => O().selected() && O().selected().id === o.id && bar('delete'), { timeout: 5000 });
    return o;
  }
  /** Waits for a commit that points the page at a new derived copy. */
  const changed = (f0) => waitFor(() => PT.E.state.pages[0].f !== f0 && O().list(PT.E.state.pages[0]), { timeout: 15000 });

  describe('Slop PDF: page objects', () => {
    it('finds the two images and the placed form with their boxes; Objects mode turns on from the toolbar', async () => {
      if (!PT.SP) await PT.boot();
      fx = await PT.objectsPdf();
      await PT.openView(fx.bytes, 'objects.pdf');
      doc().getElementById('btnObjects').click();
      ok(Ed().objMode, 'Ed().objMode');
      expect(doc().getElementById('btnObjects').getAttribute('aria-pressed')).toBe('true');
      const l = await PT.objects();
      expect(l.map((o) => o.kind)).toEqual(['image', 'image', 'form']);
      ok(PT.near(l[0].box, [100, 500, 300, 600]), JSON.stringify(l[0].box));
      ok(PT.near(l[1].box, [350, 550, 410, 610]), 'PT.near(l[1].box, [350, 550, 410, 610])');
      ok(PT.near(l[2].box, [100, 200, 250, 300]), JSON.stringify(l[2].box));
      expect([l[0].w, l[0].h]).toEqual([40, 20]);
    }, { timeout: 60000 });

    it('drag an image: the saved PDF paints it moved, the rest where it was; undo puts it back', async () => {
      const f0 = PT.E.state.pages[0].f;
      await pick(100, 500);
      PT.drag([200, H - 550], [250, H - 580], { el: doc().querySelector('.obj-layer .obj-box') }); // 50 right, 30 up
      await changed(f0);
      expect(PT.E.undoLabel()).toBe('Move image');
      expect(PT.E.files.get(PT.E.state.pages[0].f).derived.edit.op).toBe('transform');
      const p = await saved(), im = images(p);
      ok(PT.near(im[0].box, [150, 530, 350, 630]), JSON.stringify(im[0].box));
      ok(PT.near(im[1].box, [350, 550, 410, 610]), JSON.stringify(im[1].box));
      ok(PT.near(p.find((x) => x.kind === 'form').box, [100, 200, 250, 300]), JSON.stringify(p));
      await waitFor(() => O().selected() && PT.near(O().selected().box, [150, 530, 350, 630]), { timeout: 5000 });
      PT.A.undo();
      expect(PT.E.state.pages[0].f).toBe(f0);
      ok(PT.near(images(await saved())[0].box, [100, 500, 300, 600]), 'after undo');
    }, { timeout: 60000 });

    it('resize from a corner with Shift keeps the shape; turn 90°; both one undo step each', async () => {
      const f0 = PT.E.state.pages[0].f;
      await pick(100, 500);
      const h = doc().querySelector('.obj-layer .obj-h-se');
      PT.drag([300, H - 500], [400, H - 450], { el: h, shift: true });
      await changed(f0);
      let im = images(await saved())[0];
      ok(PT.near(im.box, [100, 450, 400, 600], 1), JSON.stringify(im.box)); // 1.5× from the top-left corner
      const f1 = PT.E.state.pages[0].f;
      bar('turn').click();
      await changed(f1);
      im = images(await saved())[0];
      ok(PT.near(im.box, [175, 375, 325, 675], 1), JSON.stringify(im.box)); // 150 wide, 300 tall about its centre
      PT.A.undo(); PT.A.undo();
      expect(PT.E.state.pages[0].f).toBe(f0);
    }, { timeout: 60000 });

    it('arrange, duplicate and delete from the bar; undo for each', async () => {
      const f0 = PT.E.state.pages[0].f;
      await pick(100, 500);
      bar('arrange').click();
      doc().querySelector('.selbar [data-act="obj-forward"]').click();
      await changed(f0);
      let p = await saved();
      expect(images(p).map((x) => x.w)).toEqual([10, 40], 'the JPEG now paints after the PNG');
      expect(PT.E.undoLabel()).toBe('Bring forward');
      PT.A.undo();
      await waitFor(() => O().list(PT.E.state.pages[0]));
      await pick(100, 500);
      bar('duplicate').click();
      await changed(f0);
      expect(images(await saved()).length).toBe(3);
      PT.A.undo();
      await waitFor(() => O().list(PT.E.state.pages[0]));
      await pick(100, 500);
      bar('delete').click();
      await changed(f0);
      p = await saved();
      expect(images(p).map((x) => x.w)).toEqual([10]);
      ok(p.some((x) => x.kind === 'form'), "p.some((x) => x.kind === 'form')");
      expect(O().selected()).toBe(null);
      PT.A.undo();
      expect(images(await saved()).length).toBe(2);
    }, { timeout: 90000 });

    it('replace an image keeps its place, fitted to the new picture; Save image gives the JPEG as stored', async () => {
      const f0 = PT.E.state.pages[0].f, o = await pick(100, 500);
      const out = await O().file(Ed().page(), o);
      expect(out.type).toBe('image/jpeg');
      const got = new Uint8Array(await out.blob.arrayBuffer());
      expect(got.length).toBe(fx.jpeg.length);
      ok(got.every((b, k) => b === fx.jpeg[k]), 'the stored JPEG, byte for byte');
      const sq = await PT.picture(30, 30, '#3366ff', 'png');
      await O().act.replaceWith(new PT.win.File([sq.bytes], 'square.png', { type: 'image/png' }));
      await changed(f0);
      const im = images(await saved())[0];
      expect([im.w, im.h]).toEqual([30, 30]);
      ok(PT.near(im.box, [150, 500, 250, 600]), JSON.stringify(im.box));
      PT.A.undo();
      expect(images(await saved())[0].w).toBe(40);
    }, { timeout: 60000 });

    it('the arrow keys nudge the selected object: a run of presses is one step', async () => {
      const f0 = PT.E.state.pages[0].f;
      await pick(350, 550);
      const key = (k, shift) => doc().dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: k, code: k, shiftKey: !!shift, bubbles: true, cancelable: true }));
      key('ArrowRight'); key('ArrowRight', true); key('ArrowDown');
      await changed(f0);
      const im = images(await saved())[1];
      ok(PT.near(im.box, [361, 549, 421, 609]), JSON.stringify(im.box));
      PT.A.undo();
      expect(PT.E.state.pages[0].f).toBe(f0);
    }, { timeout: 60000 });

    it('a placed form opens as SVG; the assistant lists and moves objects', async () => {
      const l = await PT.objects(), form = l.find((x) => x.kind === 'form');
      const svg = await O().svg(Ed().page(), form);
      ok(/^<\?xml[\s\S]*<svg[^>]+width="150pt" height="100pt"/.test(svg), svg.slice(0, 200));
      ok((svg.match(/<path /g) || []).length >= 2, '(svg.match(/<path /g) || []).length >= 2');
      ok(svg.includes('fill="#ff0000"') && svg.includes('fill="#0000ff"'), 'svg.includes(’fill="#ff0000"’) && svg.includes(’fill="#0000ff"’)');
      const C = PT.win.SlopCmd;
      await C.prepare();
      const r = await C.exec('pdf.objects.list', { page: 1 });
      ok(r.ok, 'r.ok');
      const objs = r.value.objects;
      expect(objs.length).toBe(3);
      expect([objs[0].kind, objs[0].x, objs[0].y, objs[0].width, objs[0].height]).toEqual(['image', 100, 200, 200, 100]);
      const f0 = PT.E.state.pages[0].f;
      const mv = await C.exec('pdf.objects.move', { page: 1, object: objs[2].id, x: 300, y: 450 });
      ok(mv.ok, mv.error);
      await changed(f0);
      ok(PT.near((await saved()).find((x) => x.kind === 'form').box, [300, 250, 450, 350]), "PT.near((await saved()).find((x) => x.kind === 'form').box, [300, 250,");
      PT.A.undo();
      Ed().toggleObjects(false);
      ok(doc().querySelector('.obj-layer').hidden, "doc().querySelector('.obj-layer').hidden");
    }, { timeout: 60000 });
  });
})();
