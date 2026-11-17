/* Slop PDF select tool: text markup comes back with the block selection. A selected block's bar has Highlight, Underline,
   Strikethrough, Colour, Comment and Redact for the whole block (the page text's lines, or an edited frame's own lines);
   on a narrow screen they fold into "Mark up". A mouse drag across words, a second click on a selected block's text,
   Edit ▸ Select text in block, and a long press (with drag handles) give a text range, whose bar is the full markup row
   and marks only those words. The block's own bar (Edit text, Copy, Cut, Duplicate, Delete) stays.
   Covers: pdf/js/editor/block-mark.js, pdf/js/editor/sel-handles.js, pdf/js/editor/para-bar.js, pdf/js/editor/para-xform.js,
     pdf/js/editor/select-edit.js, pdf/js/editor/sel-actions.js, pdf/js/editor/sel-bar.js, pdf/js/ui/commands.js,
     pdf/js/ui/menus.js, pdf/css/selbar.css */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const doc = () => PT.win.document;
  const bar = () => doc().querySelector('.selbar');
  const btn = (act) => bar().querySelector('[data-act="' + act + '"]');
  const visible = (el) => !!el && !el.closest('[hidden]') && PT.win.getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  const marks = (style) => PT.E.state.pages[0].annots.filter((a) => a.type === 'texthl' && (a.style || 'highlight') === style);
  const rects = (a) => PT.win.SlopPdfSel.rectsOf(a.pts);
  const P1 = () => SE.at(60, 36);
  const textRow = () => [...bar().querySelectorAll('.selbar-row')].find((r) => !r.classList.contains('para-row') && !r.classList.contains('is-annot') && r.querySelector('[data-act="highlight"]'));
  async function block(name) {
    await SE.open(await SE.paras(), name);
    await SE.tap(P1());
    await SE.frame();
    await waitFor(() => visible(btn('para-edit')), { timeout: 5000 });
  }

  describe('Mark up a selected text block', () => {
    it('the block bar keeps Edit text, Copy, Cut, Duplicate, Delete and adds the markup tools', async () => {
      await block('mk1.pdf');
      for (const a of ['para-edit', 'para-copy', 'para-cut', 'para-duplicate', 'para-delete', 'para-highlight', 'para-underline', 'para-strike', 'para-colour', 'para-comment', 'para-redact']) expect(visible(btn(a))).toBe(true, a);
      expect(visible(btn('para-markup'))).toBe(false, 'no Mark up button on a wide screen');
      expect(bar().getAttribute('aria-label')).toBe('Text block');
    }, { timeout: 60000 });

    it('Highlight, Underline and Strikethrough cover the block\'s three lines and nothing else; a second press takes it off', async () => {
      for (const style of ['highlight', 'underline', 'strike']) {
        btn('para-' + style).click();
        await waitFor(() => marks(style).length === 1, { timeout: 5000 });
        const rs = rects(marks(style)[0]);
        expect(rs.length).toBe(3, style + ': one quad per line');
        expect(rs.every((r) => r.x0 > 37 && r.x0 < 43 && r.y0 > 26 && r.y1 < 76)).toBe(true, style + ' ' + JSON.stringify(rs));
        expect(rs[0].x1 - rs[0].x0 > 150).toBe(true, 'the whole line');
      }
      expect(PT.E.undoLabel()).toBe('Strike through text');
      expect(!!SE.P().sel).toBe(true, 'the block stays selected');
      await waitFor(() => btn('para-highlight').getAttribute('aria-pressed') === 'true', { timeout: 3000 });
      btn('para-highlight').click();
      await waitFor(() => marks('highlight').length === 0, { timeout: 5000 });
      expect(marks('underline').length).toBe(1);
    }, { timeout: 60000 });

    it('Colour recolours the block\'s markup; Redact marks its lines', async () => {
      btn('para-colour').click();
      const pop = await waitFor(() => { const el = doc().querySelector('.para-mk-pop'); return visible(el) ? el : null; }, { timeout: 3000 });
      pop.querySelector('[data-colour="#34c759"]').click();
      await waitFor(() => marks('underline')[0].color === '#34c759', { timeout: 5000 });
      expect(pop.hidden).toBe(true);
      btn('para-redact').click();
      await waitFor(() => PT.E.state.pages[0].annots.filter((a) => a.type === 'redact').length === 3, { timeout: 5000 });
      SE.S().selAct.setColour('#ffe14d');
    }, { timeout: 60000 });

    it('an edited (moved) block is marked where it is now, from its own lines', async () => {
      await block('mk2.pdf');
      const z = SE.Ed().zoom;
      await SE.drag(doc().querySelector('.para-frame'), 30 * z, 20 * z);
      expect(PT.E.undoLabel()).toBe('Move paragraph');
      expect(SE.P().sel.kind).toBe('annot');
      await waitFor(() => visible(btn('para-highlight')), { timeout: 5000 });
      btn('para-highlight').click();
      await waitFor(() => marks('highlight').length === 1, { timeout: 5000 });
      const rs = rects(marks('highlight')[0]);
      expect(rs.length).toBe(3);
      expect(rs[0].x0 > 66 && rs[0].x0 < 74 && rs[0].y0 > 45 && rs[0].y0 < 56).toBe(true, JSON.stringify(rs[0]));
    }, { timeout: 60000 });

    it('on a narrow screen the tools fold into Mark up, which opens them', async () => {
      const ifr = document.getElementById('app');
      ifr.style.width = '390px';
      try {
        await sleep(600);
        await block('mk3.pdf');
        expect(visible(btn('para-markup'))).toBe(true);
        expect(visible(btn('para-strike'))).toBe(false, 'folded');
        btn('para-markup').click();
        expect(btn('para-markup').getAttribute('aria-expanded')).toBe('true');
        expect(visible(btn('para-strike'))).toBe(true, 'open');
        btn('para-strike').click();
        await waitFor(() => marks('strike').length === 1, { timeout: 5000 });
        const r = bar().getBoundingClientRect();
        expect(r.left >= 0 && r.right <= 390).toBe(true, r.left + '..' + r.right);
      } finally { ifr.style.width = ''; await sleep(400); }
    }, { timeout: 60000 });
  });

  describe('Mark up a range of words', () => {
    it('a mouse drag across two words shows the full markup row; Underline marks only those words', async () => {
      await SE.open(await SE.paras(), 'mk4.pdf');
      const span = [...doc().querySelectorAll('.pv-textlayer span')].find((s) => /quick brown/.test(s.textContent)), r = span.getBoundingClientRect(), y = r.top + r.height / 2;
      const node = span.firstChild, at = node.textContent.indexOf('quick');
      const pe = (type, x) => new PT.win.PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
      span.dispatchEvent(pe('pointerdown', r.left + 30));
      PT.win.getSelection().setBaseAndExtent(node, at, node, at + 'quick brown'.length); // what the browser's drag selects
      PT.win.dispatchEvent(pe('pointermove', r.left + 90)); PT.win.dispatchEvent(pe('pointerup', r.left + 90));
      await waitFor(() => textRow() && visible(textRow()), { timeout: 5000 });
      expect(doc().querySelector('.para-frame')).toBe(null, 'a range, not the block');
      for (const a of ['highlight', 'underline', 'strike', 'colour', 'copy', 'comment', 'remove', 'redact', 'replace', 'find']) expect(visible(btn(a))).toBe(true, a);
      btn('underline').click();
      await waitFor(() => marks('underline').length === 1, { timeout: 5000 });
      const rs = rects(marks('underline')[0]);
      expect(rs.length).toBe(1, 'one line');
      expect(rs[0].x0 > 55 && rs[0].x1 - rs[0].x0 < 90).toBe(true, 'only "quick brown": ' + JSON.stringify(rs[0]));
      PT.win.getSelection().removeAllRanges();
    }, { timeout: 60000 });

    it('a second click on a selected block\'s text selects the word there (a double click still edits)', async () => {
      await block('mk5.pdf');
      await sleep(600);
      await SE.tap(SE.at(100, 36));
      await waitFor(() => !SE.P().sel && !PT.win.getSelection().isCollapsed, { timeout: 3000 });
      expect(/^[a-z]+$/i.test(PT.win.getSelection().toString())).toBe(true, 'a word: ' + PT.win.getSelection().toString());
      await waitFor(() => textRow() && visible(btn('highlight')), { timeout: 5000 });
      btn('highlight').click();
      await waitFor(() => marks('highlight').length === 1, { timeout: 5000 });
      expect(rects(marks('highlight')[0])[0].x1 - rects(marks('highlight')[0])[0].x0 < 50).toBe(true, 'one word');
    }, { timeout: 60000 });

    it('Edit ▸ Select text in block turns the block into a text selection of all its words', async () => {
      await block('mk6.pdf');
      const item = PT.A._.editMenu().find((m) => m && m.label === 'Select text in block');
      expect(!!item && !item.disabled).toBe(true);
      expect(PT.win.SlopCmd.run('edit.selectBlockText')).toBe(true);
      await waitFor(() => !SE.P().sel && /quick brown fox[\s\S]*end of it/.test(PT.win.getSelection().toString()), { timeout: 3000 });
      expect(/second paragraph/.test(PT.win.getSelection().toString())).toBe(false, 'only the block');
      await waitFor(() => textRow() && visible(btn('strike')), { timeout: 5000 });
      PT.win.getSelection().removeAllRanges();
    }, { timeout: 60000 });

    it('touch: a long press selects a word with two handles; dragging the end handle extends it', async () => {
      await SE.open(await SE.paras(), 'mk7.pdf');
      await SE.tap(SE.at(60, 101), { touch: true, hold: 700 });
      const word = PT.win.getSelection().toString();
      expect(word.trim().length > 0).toBe(true);
      const knobs = await waitFor(() => { const k = [...doc().querySelectorAll('.sel-knob')].filter(visible); return k.length === 2 ? k : null; }, { timeout: 3000 });
      const k = knobs[1], kr = k.getBoundingClientRect(), x = kr.left + kr.width / 2, y = kr.top + 10, z = SE.Ed().zoom;
      const pe = (type, dx) => new PT.win.PointerEvent(type, { clientX: x + dx, clientY: y, bubbles: true, cancelable: true, pointerId: 21, pointerType: 'touch', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
      k.dispatchEvent(pe('pointerdown', 0));
      for (let i = 1; i <= 4; i++) PT.win.dispatchEvent(pe('pointermove', 15 * z * i));
      PT.win.dispatchEvent(pe('pointerup', 60 * z));
      await sleep(100);
      const now = PT.win.getSelection().toString();
      expect(now.length > word.length && now.startsWith(word.trim())).toBe(true, word + ' → ' + now);
      await waitFor(() => textRow() && visible(btn('highlight')), { timeout: 5000 });
      PT.win.getSelection().removeAllRanges();
      await waitFor(() => !doc().querySelector('.sel-knob:not([hidden])'), { timeout: 3000 });
    }, { timeout: 60000 });
  });
})();
