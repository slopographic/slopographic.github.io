/* Slop PDF select tool = edit tool: one click on the page's text selects its block with the transform handles at once (no
   mode switch); typing or a double click edits it in the same frame in its own font; Escape keeps the text and the frame; a
   click elsewhere lets it go and keeps what was typed (regression: the frame's derived file was released under the edit);
   move / scale / turn are each one undo step and the saved file follows; a mouse drag still selects characters to copy; a
   finger's tap selects and a long press picks a word; a page picture is selected and moved with one click; an added
   annotation turns from its round handle; Shift+click and a box select several and they move together.
   Covers: pdf/js/editor/select-edit.js, pdf/js/editor/para-xform.js, pdf/js/editor/para-mode.js, pdf/js/editor/para-edit.js,
     pdf/js/editor/para-model.js, pdf/js/editor/para-fonts.js, pdf/js/editor/para-bar.js, pdf/js/editor/annot-xform.js,
     pdf/js/editor/multi-sel.js, pdf/js/editor/obj-mode.js, pdf/js/editor/obj-bar.js, pdf/js/editor/pointer.js, pdf/js/core/model.js,
     pdf/js/tools/sel-panel.js, pdf/js/tools/edit-panel.js, pdf/js/editor/xform.js */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const doc = () => PT.win.document;
  const P1 = (y = 36) => SE.at(60, y), P2 = () => SE.at(60, 101);

  describe('Select tool: page text', () => {
    it('one click on page text selects its block with move, width, scale and turn handles; nothing changes yet', async () => {
      await SE.open(await SE.paras(), 'se1.pdf');
      await SE.tap(P1());
      const fr = await SE.frame(), sel = SE.P().sel;
      expect(sel.uni).toBe(true);
      expect(sel.blocks[0].lines.length).toBe(3);
      expect(fr.querySelectorAll('.para-h').length).toBe(2);
      expect(fr.querySelectorAll('.para-c').length).toBe(4);
      expect(fr.querySelectorAll('.para-r').length).toBe(1);
      expect(SE.Ed().editText).toBe(false, 'no mode switch');
      expect(PT.E.state.pages[0].annots.length).toBe(0);
      expect(PT.win.getSelection().isCollapsed).toBe(true, 'not a character selection');
      await waitFor(() => doc().querySelector('.selbar [data-act="para-edit"]'), { timeout: 3000 });
      // the panel shows its font, size and position
      await waitFor(() => doc().querySelector('#props .xf-font'), { timeout: 3000 });
      expect(/Helvetica/.test(doc().querySelector('#props .xf-font').textContent)).toBe(true);
    }, { timeout: 60000 });

    it('typing a letter edits in the same frame (handles stay); Escape keeps the text and the frame', async () => {
      const fr = doc().querySelector('.para-frame');
      fr.focus();
      // regression: a letter is the text's, not a tool shortcut (T is the Text tool), and keys typed while it opens all go in
      SE.key(fr, 'Z'); SE.key(fr, 'T');
      const box = await waitFor(() => doc().querySelector('.para-edit'), { timeout: 8000 });
      await waitFor(() => /ZT$/.test(box.textContent.trim()), { timeout: 3000 });
      expect(SE.Ed().tool).toBe('select');
      expect(PT.win.getComputedStyle(doc().querySelector('.para-frame .para-c')).display).not.toBe('none');
      SE.key(box, 'Escape');
      await waitFor(() => PT.E.undoLabel() === 'Edit paragraph', { timeout: 8000 });
      expect(!!SE.P().sel).toBe(true, 'still selected');
      expect(SE.P().sel.kind).toBe('annot');
      expect(PP.textOf(PP.para()).endsWith('it.ZT')).toBe(true, PP.textOf(PP.para()));
      const items = await SE.saved();
      expect(items.some((i) => /it\.ZT/.test(i.str))).toBe(true);
      expect(items.every((i) => /Helvetica/.test(i.font))).toBe(true, 'its own font');
    }, { timeout: 60000 });

    it('a click elsewhere while typing applies the text and lets the frame go (regression)', async () => {
      await SE.tap(P2());
      const fr = await SE.frame();
      fr.focus(); SE.key(fr, 'Q');
      await waitFor(() => doc().querySelector('.para-edit'), { timeout: 8000 });
      await SE.tap(SE.at(330, 280)); // empty page
      await waitFor(() => !doc().querySelector('.para-frame') && PT.E.state.pages[0].annots.filter((a) => a.type === 'para').length === 2, { timeout: 8000 });
      const text = (await SE.saved()).map((i) => i.str).join(' ');
      expect(/gap\.Q/.test(text)).toBe(true, text);
      expect((text.match(/second paragraph/g) || []).length).toBe(1, 'the old line left the content: ' + text);
    }, { timeout: 60000 });

    it('move, scale and turn are one undo step each and the saved file follows', async () => {
      await SE.open(await SE.paras(), 'se2.pdf');
      await SE.tap(P1()); await SE.frame();
      const z = SE.Ed().zoom;
      await SE.drag(doc().querySelector('.para-frame'), 30 * z, 20 * z);
      expect(PT.E.undoLabel()).toBe('Move paragraph');
      const a0 = PP.para();
      let items = await SE.saved();
      const first = items.find((i) => /quick brown/.test(i.str));
      expect(Math.abs(first.x - 70) < 1 && Math.abs(first.y - 260) < 1).toBe(true, first.x + ',' + first.y);
      await SE.drag(doc().querySelector('.para-frame .para-c[data-h="se"]'), 60 * z, 0);
      expect(PT.E.undoLabel()).toBe('Scale paragraph');
      expect(PP.para().fs > 13).toBe(true, 'font size ' + PP.para().fs);
      const fr = doc().querySelector('.para-frame'), c = SE.centre(fr), rh = doc().querySelector('.para-frame .para-r');
      const rc = SE.centre(rh);
      await SE.drag(rh, c.clientX + 120 - rc.clientX, c.clientY - rc.clientY); // from above the centre to its right: a quarter turn clockwise
      expect(PT.E.undoLabel()).toBe('Turn paragraph');
      expect(Math.abs(PP.para().rot + 90) < 3).toBe(true, 'rot ' + PP.para().rot);
      items = await SE.saved();
      const t = items.find((i) => /brown|lazy|until/.test(i.str)).t;
      expect(Math.abs(t[0]) < 1 && t[1] < -5).toBe(true, 'saved turned clockwise: ' + t.join(','));
      PT.A.undo(); PT.A.undo();
      expect(PP.para().cx).toBe(a0.cx);
      PT.A.undo();
      expect(PT.E.state.pages[0].annots.length).toBe(0, 'the first change undone: the page text is back');
    }, { timeout: 90000 });

    it('a double click on page text opens its block for typing, Edit text mode stays off', async () => {
      await SE.open(await SE.paras(), 'se3.pdf');
      await SE.dbl(P1());
      const box = await waitFor(() => doc().querySelector('.para-edit'), { timeout: 10000 });
      expect(/quick brown fox/.test(box.textContent)).toBe(true, box.textContent);
      expect(SE.Ed().editText).toBe(false);
      expect(doc().querySelector('.edit-run')).toBe(null, 'not the one-line editor');
      SE.key(box, 'Escape');
      await sleep(100);
    }, { timeout: 60000 });

    it('a mouse drag across the text still selects characters to copy (no frame)', async () => {
      await SE.open(await SE.paras(), 'se4.pdf');
      const span = [...doc().querySelectorAll('.pv-textlayer span')].find((s) => /quick/.test(s.textContent)), r = span.getBoundingClientRect();
      const y = r.top + r.height / 2, pt = { clientX: r.left + 2, clientY: y };
      span.dispatchEvent(new PT.win.PointerEvent('pointerdown', { clientX: pt.clientX, clientY: y, bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 }));
      const sel = PT.win.getSelection(), range = doc().createRange(); range.selectNodeContents(span); sel.removeAllRanges(); sel.addRange(range); // what the browser's drag selects
      PT.win.dispatchEvent(new PT.win.PointerEvent('pointermove', { clientX: r.right - 4, clientY: y, bubbles: true, pointerId: 9, pointerType: 'mouse', buttons: 1 }));
      PT.win.dispatchEvent(new PT.win.PointerEvent('pointerup', { clientX: r.right - 4, clientY: y, bubbles: true, pointerId: 9, pointerType: 'mouse' }));
      await sleep(400);
      expect(PT.win.getSelection().toString().length > 5).toBe(true);
      expect(doc().querySelector('.para-frame')).toBe(null);
      PT.win.getSelection().removeAllRanges();
    }, { timeout: 60000 });

    it('touch: a tap selects the block, a long press selects a word; at 390 px the frame fits the screen', async () => {
      await SE.open(await SE.paras(), 'se5.pdf');
      await SE.tap(P1(), { touch: true });
      await SE.frame();
      expect(SE.P().sel.uni).toBe(true);
      await SE.tap(P2(), { touch: true, hold: 700 });
      await sleep(100);
      expect(PT.win.getSelection().toString().trim().length > 0).toBe(true, 'a word: ' + PT.win.getSelection().toString());
      PT.win.getSelection().removeAllRanges();
      const ifr = document.getElementById('app');
      ifr.style.width = '390px';
      try {
        await sleep(600);
        SE.Ed().fit('width');
        await sleep(300);
        await SE.tap(P1(), { touch: true });
        const fr = await SE.frame(), r = fr.getBoundingClientRect();
        expect(r.left >= 0 && r.right <= 390).toBe(true, r.left + '..' + r.right);
        await SE.drag(fr, 0, 30, { touch: true });
        expect(PT.E.undoLabel()).toBe('Move paragraph');
      } finally { ifr.style.width = ''; await sleep(300); }
    }, { timeout: 60000 });
  });

  describe('Select tool: pictures and added objects', () => {
    it('one click on a page picture selects it with handles (no Objects mode); a drag moves it in the saved file', async () => {
      const f = await PT.objectsPdf();
      await SE.open(f.bytes, 'se-pic.pdf', { text: false });
      await waitFor(() => SE.S().obj.list(SE.Ed().page()), { timeout: 10000 });
      expect(SE.Ed().objMode).toBe(false);
      await SE.tap(SE.at(200, 250));
      await waitFor(() => doc().querySelectorAll('.obj-layer .obj-h').length === 8, { timeout: 5000 });
      await SE.drag(SE.at(200, 250), 40 * SE.Ed().zoom, 0);
      await waitFor(() => /^Move image/.test(PT.E.undoLabel()), { timeout: 10000 });
      const pics = await PT.painted(await PT.E.build());
      expect(pics.some((p) => p.kind === 'image' && Math.abs(p.box[0] - 140) < 1)).toBe(true, JSON.stringify(pics.map((p) => p.box)));
    }, { timeout: 60000 });

    it('an added annotation turns from its round handle (one undo step); a turned one keeps turned handles', async () => {
      await SE.open(await SE.paras(), 'se-rot.pdf');
      SE.Ed().addAnnot(SE.box('RB', 300, 200), 'Add highlight');
      await waitFor(() => SE.elOf('RB'));
      SE.Ed().select('RB');
      const rh = await waitFor(() => doc().querySelector('.sel-rot'), { timeout: 3000 }), c = SE.centre(SE.elOf('RB')), rc = SE.centre(rh);
      await SE.drag(rh, c.clientX + 80 - rc.clientX, c.clientY - 80 - rc.clientY); // to the upper right: an eighth turn clockwise
      expect(PT.E.undoLabel()).toBe('Turn annotation');
      expect(Math.abs(SE.annot('RB').rot + 45) < 3).toBe(true, 'rot ' + SE.annot('RB').rot);
      expect(!!doc().querySelector('.sel-box.is-turned')).toBe(true);
      expect(doc().querySelectorAll('.handle.is-turned').length).toBe(8);
      PT.A.undo();
      expect(SE.annot('RB').rot).toBe(0);
    }, { timeout: 60000 });

    it('Shift+click and a box on empty space select several; a drag moves them together in one undo step', async () => {
      await SE.open(await SE.paras(), 'se-multi.pdf');
      SE.Ed().addAnnot(SE.box('M1', 300, 200), 'Add'); SE.Ed().addAnnot(SE.box('M2', 360, 260), 'Add');
      await waitFor(() => SE.elOf('M2'));
      SE.Ed().select(null);
      await SE.tap(SE.centre(SE.elOf('M1')));
      await SE.tap(SE.centre(SE.elOf('M2')), { shift: true });
      expect(SE.S().selectedIds().sort()).toEqual(['M1', 'M2']);
      expect(doc().querySelectorAll('.sel-box.is-member').length).toBe(1);
      await sleep(500);
      await SE.drag(SE.elOf('M1'), 20 * SE.Ed().zoom, 0);
      expect(SE.annot('M1').cx).toBe(320); expect(SE.annot('M2').cx).toBe(380);
      expect(PT.E.undoLabel()).toBe('Move 2 items');
      PT.A.undo();
      expect(SE.annot('M1').cx).toBe(300); expect(SE.annot('M2').cx).toBe(360);
      SE.Ed().select(null);
      await SE.drag(SE.at(250, 160), 160 * SE.Ed().zoom, 130 * SE.Ed().zoom); // a box from the empty page over both
      expect(SE.S().selectedIds().sort()).toEqual(['M1', 'M2']);
    }, { timeout: 60000 });
  });
})();
