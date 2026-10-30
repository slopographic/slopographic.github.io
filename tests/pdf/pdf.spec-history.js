/* Slop PDF: undo and redo as commands (per tab, capped at 300), saved edits that survive a reload (replay
   and discard), and the text highlight rectangles on real text positions. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const key = (el, k, o = {}) => el.dispatchEvent(new PT.win.KeyboardEvent('keydown', Object.assign({ key: k, code: o.code || '', bubbles: true, cancelable: true }, o)));
  const dialogText = () => [...PT.win.document.querySelectorAll('.sui-dlg')].map((d) => d.textContent).join('\n');
  const clickDialog = (label) => {
    const b = [...PT.win.document.querySelectorAll('.sui-dlg .sui-btn')].find((x) => x.textContent === label);
    if (!b) throw new Error('no dialog button "' + label + '" in: ' + dialogText());
    b.click();
  };
  const openPage = async (id) => { PT.A.openPage(id); await waitFor(() => PT.win.document.querySelector('.pv-page') && PT.SP.editor.pid === id); };
  let nonce = 500;
  /** Two lines of Helvetica 18 pt at known positions on a 300 × 200 page (page points, origin bottom-left). */
  async function twoLines() {
    const L = PT.win.PDFLib, doc = await L.PDFDocument.create(), font = await doc.embedFont(L.StandardFonts.Helvetica);
    const pg = doc.addPage(PT.win.Array.of(300, 200));
    pg.drawText('Hello world', { x: 40, y: 150, size: 18, font });
    pg.drawText('Second line', { x: 40, y: 120, size: 18, font });
    doc.setCreationDate(new PT.win.Date(PT.win.Date.UTC(2021, 0, 1) + (++nonce) * 1000));
    return doc.save();
  }

  describe('undo and redo', () => {
    it('makes every change one command: add, move, rotate, delete and property changes undo and redo one by one', async () => {
      PT.reset();
      const E = PT.E, S = PT.SP.editor;
      await PT.open(await PT.makePdf([{ text: 'a' }, { text: 'b' }, { text: 'c' }]), 'steps.pdf');
      const [p1, p2] = E.state.pages;
      PT.A.rotate([p1.id], 90);
      expect(E.undoLabel()).toBe('Rotate page');
      PT.A.remove([p2.id]);
      expect(PT.texts()).toEqual(['1', '3']);
      await openPage(E.state.pages[0].id);
      S.addAnnot({ id: 'hl1', type: 'hlbox', rot: 0, cx: 60, cy: 60, w: 80, h: 20, fill: '#ffe14d', opacity: 0.4 }, 'Add highlight');
      S.select('hl1');
      S.nudgeSelected(10, 0);
      expect(E.undoLabel()).toBe('Move annotation');
      const moved = JSON.stringify([E.state.pages[0].annots[0].cx, E.state.pages[0].annots[0].cy]);
      expect(moved).not.toBe(JSON.stringify([60, 60]));
      S.setProp('opacity', 0.5);
      expect(E.undoLabel()).toBe('Change opacity');
      const labels = [];
      for (let i = 0; i < 4; i++) { labels.push(E.undoLabel()); E.undo(); }
      expect(labels).toEqual(['Change opacity', 'Move annotation', 'Add highlight', 'Delete page']);
      expect(PT.texts()).toEqual(['1', '2', '3']);
      expect(E.state.pages[0].rot).toBe(90);
      expect(E.state.pages[0].annots.length).toBe(0);
      for (let i = 0; i < 4; i++) E.redo();
      expect(PT.texts()).toEqual(['1', '3']);
      expect(E.state.pages[0].annots[0].opacity).toBe(0.5);
      expect(JSON.stringify([E.state.pages[0].annots[0].cx, E.state.pages[0].annots[0].cy])).toBe(moved);
      expect(E.canRedo()).toBe(false);
    });

    it('caps the history at 300 steps', async () => {
      PT.reset();
      const E = PT.E;
      await PT.open(await PT.makePdf([{ text: 'x' }]), 'cap.pdf');
      for (let i = 0; i < 310; i++) E.commit('Step ' + i, (st) => { st.meta.title = 't' + i; });
      let n = 0;
      while (E.canUndo()) { E.undo(); n++; }
      expect(n).toBe(300);
      expect(E.state.meta.title).toBe('t9'); // 310 steps, the oldest 10 are gone: the 300 undone steps end at step 9
    });

    it('keeps a separate history for each tab', async () => {
      PT.reset();
      const E = PT.E, H = PT.SP.history;
      await PT.open(await PT.makePdf([{ text: 'x' }]), 'tabs.pdf');
      // each open tab has its own stack, keyed by the tab's document (the key of the document on screen is H.stackKey())
      const home = H.stackKey(), before = E.undoLabel();
      H.useStack('tab-two');
      expect(E.canUndo()).toBe(false);
      E.commit('Tab two edit', (st) => { st.meta.title = 'two'; });
      expect(E.undoLabel()).toBe('Tab two edit');
      H.useStack(home);
      expect(E.undoLabel()).toBe(before);
      H.useStack('tab-two');
      expect(E.undoLabel()).toBe('Tab two edit');
      H.useStack(home);
    });

    it('Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo', async () => {
      PT.reset();
      const E = PT.E, d = PT.win.document;
      await PT.open(await PT.makePdf([{ text: 'k' }]), 'keys.pdf');
      PT.A.rotate([E.state.pages[0].id], 90);
      key(d.body, 'z', { code: 'KeyZ', ctrlKey: true });
      expect(E.state.pages[0].rot).toBe(0);
      key(d.body, 'Z', { code: 'KeyZ', ctrlKey: true, shiftKey: true });
      expect(E.state.pages[0].rot).toBe(90);
      key(d.body, 'z', { code: 'KeyZ', ctrlKey: true });
      expect(E.state.pages[0].rot).toBe(0);
      key(d.body, 'y', { code: 'KeyY', ctrlKey: true });
      expect(E.state.pages[0].rot).toBe(90);
    });
  });

  describe('saved edits', () => {
    it('keeps the edits per file and replays them when the same file is opened again, with undo', async () => {
      PT.reset();
      const E = PT.E, S = PT.SP.editor, bytes = await PT.makePdf([{ text: 'alpha' }, { text: 'beta' }]);
      const f1 = await PT.open(bytes, 'keep.pdf');
      expect(f1.fp).toMatch(/^[0-9a-f]{64}$/);
      expect(f1.id).toBe('f' + f1.fp.slice(0, 16));
      PT.A.rotate([E.state.pages[0].id], 90);
      await openPage(E.state.pages[0].id);
      S.addAnnot({ id: 'kept', type: 'hlbox', rot: 0, cx: 60, cy: 60, w: 80, h: 20, fill: '#ffe14d', opacity: 0.4 }, 'Add highlight');
      await PT.U.sleep(900);
      const rec = await PT.U.idb.get('edits/' + f1.fp);
      expect(rec && rec.v).toBe(1);
      expect(rec.entries.length).toBe(2);
      expect(JSON.stringify(rec)).not.toContain('%PDF');
      PT.reset();
      const again = PT.open(bytes, 'keep.pdf');
      await waitFor(() => dialogText().includes('Saved edits found'));
      expect(dialogText()).toContain('2 edits');
      clickDialog('Replay');
      await again;
      expect(E.state.pages[0].rot).toBe(90);
      expect(E.state.pages[0].annots.map((a) => a.id)).toEqual(['kept']);
      E.undo();
      expect(E.state.pages[0].annots.length).toBe(0);
      expect(E.state.pages[0].rot).toBe(90);
      E.undo();
      expect(E.state.pages[0].rot).toBe(0);
      expect(E.state.pages.length).toBe(2);
    }, { timeout: 60000 });

    it('discard deletes the saved log; the file opens clean', async () => {
      PT.reset();
      const E = PT.E, bytes = await PT.makePdf([{ text: 'gamma' }]);
      const f1 = await PT.open(bytes, 'drop.pdf');
      PT.A.rotate([E.state.pages[0].id], 90);
      await PT.U.sleep(900);
      expect((await PT.U.idb.get('edits/' + f1.fp)) != null).toBe(true);
      PT.reset();
      const again = PT.open(bytes, 'drop.pdf');
      await waitFor(() => dialogText().includes('Saved edits found'));
      clickDialog('Discard');
      await again;
      expect(E.state.pages[0].rot).toBe(0);
      await PT.U.sleep(900);
      expect(await PT.U.idb.get('edits/' + f1.fp)).toBeFalsy();
    }, { timeout: 60000 });

    it('applying redactions drops the saved log, so a reopened file never loses its redactions', async () => {
      PT.reset();
      const E = PT.E, bytes = await PT.makePdf([{ text: 'secret' }]);
      const f1 = await PT.open(bytes, 'redact-log.pdf');
      PT.A.rotate([E.state.pages[0].id], 90);
      await PT.U.sleep(900);
      expect((await PT.U.idb.get('edits/' + f1.fp)) != null).toBe(true);
      E.commit('Mark for redaction', (st) => { st.pages[0].annots.push({ id: 'rm1', type: 'redact', rot: 0, cx: 60, cy: 60, w: 120, h: 40 }); });
      await E.applyRedactions({ dpi: 100 });
      await PT.U.sleep(900);
      expect(await PT.U.idb.get('edits/' + f1.fp)).toBeFalsy();
    }, { timeout: 60000 });

    it('a blocked store does not break editing', async () => {
      PT.reset();
      const E = PT.E, U = PT.U, bytes = await PT.makePdf([{ text: 'delta' }]);
      const get = U.idb.get, set = U.idb.set;
      U.idb.get = () => { throw new Error('blocked'); };
      U.idb.set = () => { throw new Error('blocked'); };
      try {
        await PT.open(bytes, 'blocked.pdf');
        PT.A.rotate([E.state.pages[0].id], 90);
        await PT.U.sleep(500);
        expect(E.state.pages[0].rot).toBe(90);
        expect(E.canUndo()).toBe(true);
      } finally { U.idb.get = get; U.idb.set = set; }
    }, { timeout: 30000 });
  });

  describe('text highlight', () => {
    it('one quad per line for a drag across two lines, from the first selected glyph to the last one', async () => {
      PT.reset();
      const E = PT.E, S = PT.SP.editor._, bytes = await twoLines();
      await PT.open(bytes, 'lines.pdf');
      const p = E.state.pages[0];
      await openPage(p.id);
      const w1 = E.measure('Hello world', 'Helvetica', 18), w2 = E.measure('Second line', 'Helvetica', 18);
      const rect = PT.win.document.querySelector('.pv-page').getBoundingClientRect(), z = PT.SP.editor.zoom;
      const e = (u, v) => ({ clientX: rect.left + u * z, clientY: rect.top + v * z, pointerId: 1 });
      await E.pageTextLines(p);
      S.texthlDown(e(40, 44), p, [40, 44]);
      S.texthlMove(e(260, 80));
      expect(S.draft.pts.length).toBe(8);
      await S.texthlUp();
      const a = E.pageById(p.id).annots.find((x) => x.type === 'texthl');
      expect(a).toBeTruthy();
      expect(a.pts.length).toBe(8);
      const [l1, l2] = [a.pts.slice(0, 4), a.pts.slice(4)];
      expect(Math.abs(l1[0][0] - 40)).toBeLessThan(0.6);
      expect(Math.abs(l1[1][0] - (40 + w1))).toBeLessThan(0.6);
      expect(Math.abs(l2[0][0] - 40)).toBeLessThan(0.6);
      expect(Math.abs(l2[1][0] - (40 + w2))).toBeLessThan(0.6);
      // the first line's band is the text's band (top at ascender, bottom below the baseline)
      expect(l1[0][1]).toBeGreaterThan(30); expect(l1[0][1]).toBeLessThan(40);
      expect(l1[2][1]).toBeGreaterThan(50); expect(l1[2][1]).toBeLessThan(58);
      expect(l2[0][1]).toBeGreaterThan(l1[2][1]);
    }, { timeout: 60000 });

    it('a line only partly covered highlights only the characters the drag covers', async () => {
      PT.reset();
      const E = PT.E, S = PT.SP.editor._, bytes = await twoLines();
      await PT.open(bytes, 'partial.pdf');
      const p = E.state.pages[0];
      const lines = await E.pageTextLines(p);
      const start = E.measure('Hello ', 'Helvetica', 18);
      const pts = E.textHighlightPts(lines, [40 + start + 1, 44], [300, 44]);
      expect(pts.length).toBe(4);
      expect(pts[0][0]).toBeGreaterThan(40 + start - 3);
      expect(pts[0][0]).toBeLessThan(40 + start + 3);
      expect(Math.abs(pts[1][0] - (40 + E.measure('Hello world', 'Helvetica', 18)))).toBeLessThan(0.6);
      expect(E.textHighlightPts(lines, [200, 100], [250, 110])).toEqual([]);
      void S;
    });

    it('exports the highlight into the PDF and keeps the quads on the annotation', async () => {
      PT.reset();
      const E = PT.E, S = PT.SP.editor._, bytes = await twoLines();
      await PT.open(bytes, 'export-hl.pdf');
      const p = E.state.pages[0];
      await openPage(p.id);
      const lines = await E.pageTextLines(p);
      E.commit('Add text highlight', (st) => { E.pageById(p.id).annots.push({ id: 'th', type: 'texthl', color: '#ffe14d', opacity: 1, pts: E.textHighlightPts(lines, [40, 44], [260, 80]) }); });
      // a quad in an empty part of the page (no glyphs under it) shows the highlight colour after export
      E.commit('Add text highlight', (st) => { E.pageById(p.id).annots.push({ id: 'th2', type: 'texthl', color: '#ffe14d', opacity: 1, pts: [[200, 20], [280, 20], [280, 40], [200, 40]] }); });
      const bytes2 = await E.build(), out = await PT.read(bytes2), c = await PT.render(bytes2, 0, 1);
      const inside = PT.px(c, 240, 30), outside = PT.px(c, 250, 150);
      expect(inside[2]).toBeLessThan(235);
      expect(inside[0]).toBeGreaterThan(235);
      expect(PT.isWhite(outside)).toBe(true);
      expect(out.n).toBe(1);
      void S;
    }, { timeout: 60000 });
  });
})();
