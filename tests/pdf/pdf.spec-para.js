/* Slop PDF Edit text ▸ Paragraphs: a three-line paragraph is one frame; typing in it rewraps within the frame (the saved
   file read back with pdf.js: its lines and where they are); a narrower frame makes more lines; undo is one step per change;
   a justified paragraph stays justified; the Lines mode is untouched; the mode is remembered. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const doc = () => PT.win.document;
  const P1 = ['The quick brown fox jumps over', 'the lazy dog and keeps on', 'running until the end of it.'];
  const NEW = 'Zebras quietly wander across wide golden plains while curious visitors watch them from distant hills every morning.';
  const NEW_RE = new RegExp('\\b(' + NEW.replace(/\./g, '').split(' ').join('|') + ')\\b');
  /** The saved file's rows of the new text. */
  const newRows = async () => PP.rows((await PP.saved()).filter((i) => NEW_RE.test(i.str)));
  /** Two paragraphs: three lines at baselines 280, 265, 250 and two lines under a gap (215, 200), Helvetica 12 at x 40. */
  const twoParas = () => PP.pdf((pg, f) => { PP.lines(pg, f.hel, P1, 40, 280); PP.lines(pg, f.hel, ['A second paragraph sits below', 'after a gap.'], 40, 215); });

  describe('Edit text ▸ Paragraphs', () => {
    it('a click selects the whole three-line block as one frame, with its alignment and pitch', async () => {
      await PP.open(await twoParas(), 'para1.pdf');
      await PP.click(60, 320 - 280 - 4);
      const sel = PP.P().sel;
      expect(sel.kind).toBe('block');
      expect(sel.blocks.length).toBe(1);
      expect(sel.blocks[0].lines.length).toBe(3);
      expect(sel.model.align).toBe('left');
      expect(Math.round(sel.model.lh)).toBe(15);
      expect(sel.model.lines.length).toBe(3, 'the old text wraps where it did');
      expect(sel.model.lines.map((l) => l.segs.map((s) => s.t).join(' ')).join('|')).toBe(P1.join('|'));
      const fr = doc().querySelector('.para-frame');
      expect(fr.querySelectorAll('.para-h').length).toBe(2);
      expect(/Paragraph · left/.test(fr.textContent)).toBe(true, fr.textContent);
      expect(PT.E.state.pages[0].annots.length).toBe(0, 'selecting changes nothing');
    }, { timeout: 60000 });

    it('typing a sentence rewraps it within the frame; the saved file has its lines inside the frame, one pitch apart', async () => {
      const before = PT.E.undoLabel();
      await PP.type(NEW);
      const a = PP.para();
      expect(PP.textOf(a)).toBe(NEW);
      expect(a.lines.length >= 4).toBe(true, 'lines ' + a.lines.length);
      a.lines.forEach((l) => l.segs.forEach((s) => expect(s.x >= -0.01 && s.x + s.w <= a.w + 0.01).toBe(true, JSON.stringify(s))));
      expect(PT.E.state.pages[0].annots.filter((x) => x.type === 'whiteout').length).toBe(0, 'the old lines are taken out of the content, not covered');
      const f0 = PT.E.files.get(PT.E.state.pages[0].f).derived.from;
      const e = PP.edges(a), rows = await newRows();
      expect(rows.length).toBe(a.lines.length);
      rows.forEach((r) => expect(r.x0 >= e.x0 - 0.5 && r.x1 <= e.x1 + 0.5).toBe(true, r.text + ' ' + r.x0 + '..' + r.x1 + ' in ' + e.x0 + '..' + e.x1));
      for (let k = 1; k < rows.length; k++) expect(Math.abs(rows[k - 1].y - rows[k].y - 15) < 0.2).toBe(true, 'pitch ' + (rows[k - 1].y - rows[k].y));
      expect(Math.abs(rows[0].y - 280) < 0.2).toBe(true, 'the first baseline stays ' + rows[0].y);
      const words = rows.map((r) => r.text).join(' ').replace(/\s+/g, ' ');
      expect(words.includes('Zebras quietly wander')).toBe(true, words);
      expect(rows.every((r) => /Helvetica/.test(r.items[0].font))).toBe(true, 'the paragraph keeps its font');
      PT.E.undo();
      expect(PT.E.state.pages[0].annots.length).toBe(0, 'one undo takes the frame away');
      expect(PT.E.state.pages[0].f).toBe(f0, 'and puts the old lines back');
      expect(PT.E.undoLabel()).toBe(before);
      PT.E.redo();
      expect(!!PP.para()).toBe(true);
    }, { timeout: 60000 });

    it('a narrower frame makes more lines, still inside it; undo puts the width back', async () => {
      const a0 = PP.para(), n0 = a0.lines.length, w0 = a0.w;
      await PP.click(60, 320 - 280 - 4); // the frame annotation is selected again (the undo let it go)
      expect(PP.P().sel.kind).toBe('annot');
      await PP.dragHandle('e', -90 * PP.Ed().zoom);
      const a = PP.para();
      expect(a.w < w0 - 60).toBe(true, 'width ' + a.w);
      expect(a.lines.length > n0).toBe(true, a.lines.length + ' lines, were ' + n0);
      expect(Math.abs((a.cx - a.w / 2) - (a0.cx - a0.w / 2)) < 0.01).toBe(true, 'the left edge stays');
      const e = PP.edges(a), rows = await newRows();
      expect(rows.length).toBe(a.lines.length);
      rows.forEach((r) => expect(r.x1 <= e.x1 + 0.5).toBe(true, r.text));
      PT.E.undo();
      expect(PP.para().w).toBe(w0);
      expect(PP.para().lines.length).toBe(n0);
    }, { timeout: 60000 });

    it('dragging the frame moves it (one undo step)', async () => {
      const a0 = PP.para();
      await PP.click(60, 320 - 280 - 4);
      await PP.dragFrame(30 * PP.Ed().zoom, 20 * PP.Ed().zoom);
      const a = PP.para();
      expect(Math.abs(a.cx - a0.cx - 30) < 0.5 && Math.abs(a.cy - a0.cy - 20) < 0.5).toBe(true, a.cx + ',' + a.cy);
      expect(PT.E.undoLabel()).toBe('Move paragraph');
      PT.E.undo();
      expect(PP.para().cx).toBe(a0.cx);
    }, { timeout: 60000 });

    it('a drag across two paragraphs makes one frame with both; Escape lets it go', async () => {
      await PP.open(await twoParas(), 'para2.pdf');
      await PP.drag(60, 320 - 280 - 4, 60, 320 - 200 - 4);
      const sel = PP.P().sel;
      expect(sel.blocks.length).toBe(2);
      expect(sel.model.paras.length).toBe(2);
      expect(sel.model.lines.length).toBe(5);
      expect(sel.model.pgap > 10).toBe(true, 'the gap between them is kept ' + sel.model.pgap);
      doc().querySelector('.para-frame').dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(doc().querySelector('.para-frame')).toBe(null);
      expect(PP.P().sel).toBe(null);
    }, { timeout: 60000 });

    it('a justified paragraph stays justified: every line but the last reaches both edges in the saved file', async () => {
      const words = 'Justified text in a column spreads its words so that every line but the last one reaches both of the edges of the column it sits in'.split(' ');
      let lines = null;
      await PP.open(await PP.pdf((pg, f) => { lines = PP.justify(pg, f.hel, words, 40, 280, 220); }), 'just.pdf');
      expect(lines.length >= 4).toBe(true);
      await PP.click(60, 320 - 280 - 4);
      expect(PP.P().sel.model.align).toBe('justify');
      await PP.type(' and more words are added at the end so it rewraps', { keep: true });
      const a = PP.para();
      expect(a.align).toBe('justify');
      a.lines.slice(0, -1).forEach((l) => { const s = l.segs[l.segs.length - 1]; expect(Math.abs(s.x + s.w - a.w) < 0.05).toBe(true, 'line ends at ' + (s.x + s.w) + ' of ' + a.w); });
      const last = a.lines[a.lines.length - 1].segs.slice(-1)[0];
      expect(last.x + last.w < a.w - 5).toBe(true, 'the last line is not spread');
      // moved down, below the old lines, so the saved file's new rows stand alone
      await PP.click(60, 320 - 280 - 4);
      await PP.dragFrame(0, 130 * PP.Ed().zoom);
      const b = PP.para(), e = PP.edges(b), rows = PP.rows((await PP.saved()).filter((i) => i.y < e.top + 1));
      expect(rows.length).toBe(b.lines.length);
      rows.slice(0, -1).forEach((r) => expect(Math.abs(r.x0 - e.x0) < 0.6 && Math.abs(r.x1 - e.x1) < 0.6).toBe(true, r.text + ' ' + r.x0 + '..' + r.x1 + ' in ' + e.x0 + '..' + e.x1));
      expect(rows[rows.length - 1].x1 < e.x1 - 5).toBe(true);
      const text = (await PP.saved()).map((i) => i.str).join(' ');
      expect(/rewraps/.test(text)).toBe(true, 'the text is real text');
    }, { timeout: 60000 });

    it('Lines mode works as before: a click opens the one line, and the mode is remembered', async () => {
      await PP.open(await twoParas(), 'lines.pdf');
      PP.Ed().setEditTextMode('lines');
      expect(PT.win.localStorage.getItem('slop-pdf.editTextMode')).toBe('lines');
      const at = PP.at(60, 320 - 280 - 4);
      at.el.dispatchEvent(new PT.win.PointerEvent('pointerdown', { clientX: at.x, clientY: at.y, button: 0, bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse', isPrimary: true }));
      const input = await waitFor(() => doc().querySelector('.edit-run'), { timeout: 8000 });
      expect(input.value).toBe(P1[0]);
      expect(doc().querySelector('.para-frame')).toBe(null);
      input.dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      const bar = doc().getElementById('ctxEditText');
      expect(!!bar && !bar.hidden).toBe(true, 'the Edit text bar shows while Edit text is on');
      const radios = [...bar.querySelectorAll('[role="radio"]')];
      expect(radios.map((b) => b.textContent)).toEqual(['Lines', 'Paragraphs']);
      expect(radios[0].getAttribute('aria-checked')).toBe('true');
      radios[0].focus();
      radios[0].dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      expect(PP.Ed().paraMode).toBe(true);
      expect(doc().activeElement).toBe(radios[1]);
      expect(PT.win.localStorage.getItem('slop-pdf.editTextMode')).toBe('paragraphs');
      PP.off();
      expect(bar.hidden).toBe(true);
      await sleep(20);
    }, { timeout: 60000 });
  });
})();
