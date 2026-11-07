/* Slop PDF layers and text: a locked layer is selectable but cannot be dragged, shows a lock cue and no handles, and unlocking
   restores the drag; with Edit text on, a press on a text annotation moves it (it is not read as a press on the text under it);
   after an edit, the old run under the new text's white cover is not offered, and a double click on the new text edits it;
   a text selection shows a box with the handles, and dragging the box lifts the text into an annotation (one undo step). */
// Covers: pdf/js/editor/sel-lift.js, pdf/js/editor/sel-actions.js, pdf/js/editor/pointer.js, pdf/js/editor/view-pages.js, pdf/js/editor/select-edit.js, pdf/js/editor/view.js
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const doc = () => PT.win.document;
  const Ed = () => PT.SP.editor;
  const S = () => PT.SP.editor._;
  const pageEl = () => S().pageEl;
  const pe = (type, init) => new PT.win.PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }, init));
  const centre = (el) => { const r = el.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; };
  /** The annotation's element on the active page (the sidebar thumbnails repeat the annotations, so the page is searched). */
  const elOf = (aid) => pageEl().querySelector('.annots [data-aid="' + aid + '"]');
  const annot = (aid) => PT.E.state.pages[0].annots.find((a) => a.id === aid);
  const spanFor = (text) => [...doc().querySelectorAll('.pv-textlayer span')].find((s) => s.textContent === text);

  /** A document on its first page, in page view, with the select tool and Edit text off. */
  async function openFixture(name, pages) {
    if (!PT.SP) await PT.boot();
    PT.reset();
    PT.win.getSelection().removeAllRanges();
    // a Replace dialog left open by an earlier spec covers the page and takes the pointer (it is modal)
    const fm = doc().querySelector('.find-modal'); if (fm) fm.hidden = true;
    await PT.open(await PT.makePdf(pages), name);
    const id = PT.E.state.pages[0].id;
    PT.A.openPage(id);
    await waitFor(() => pageEl() && Ed().pid === id && doc().querySelector('.pv-page'), { timeout: 8000 });
    // the page element's pointer capture is a no-op for synthetic pointers (as in the comments spec)
    pageEl().setPointerCapture = () => {}; pageEl().releasePointerCapture = () => {};
    if (Ed().editText) Ed().toggleEditText();
    Ed().setTool('select');
    return id;
  }
  /** A press on an element and a drag by (dx, dy) screen pixels, released on the page element where the editor listens. */
  function drag(el, dx, dy) {
    const c = centre(el);
    el.dispatchEvent(pe('pointerdown', c));
    pageEl().dispatchEvent(pe('pointermove', { clientX: c.clientX + dx / 2, clientY: c.clientY + dy / 2 }));
    pageEl().dispatchEvent(pe('pointermove', { clientX: c.clientX + dx, clientY: c.clientY + dy }));
    pageEl().dispatchEvent(pe('pointerup', { clientX: c.clientX + dx, clientY: c.clientY + dy, buttons: 0 }));
  }
  /** A press and release with no movement on an element. */
  function click(el) {
    const c = centre(el);
    el.dispatchEvent(pe('pointerdown', c));
    pageEl().dispatchEvent(pe('pointerup', Object.assign({}, c, { buttons: 0 })));
  }
  /** A click on the annotation with this id, once its element is on the page (it is found again after each paint). */
  async function clickAid(aid) { await waitFor(() => elOf(aid), { timeout: 8000 }); click(elOf(aid)); }
  const hl = (id, cx = 60, cy = 60) => ({ id, type: 'hlbox', rot: 0, cx, cy, w: 80, h: 40, fill: '#ff0000', opacity: 1 });

  describe('Slop PDF layers and text: locks, presses in Edit text mode, edited text, text selection box', () => {
    it('a locked layer is selectable, shows a lock cue and no handles, and cannot be dragged; unlocking restores the drag', async () => {
      const pid = await openFixture('lock-drag.pdf', [{ text: 'a', w: 300, h: 200 }]);
      Ed().addAnnot(hl('LK'), 'Add highlight');
      await waitFor(() => elOf('LK'), { timeout: 8000 });
      PT.SP.layers.set(pid, 'LK', 'locked', true);
      Ed().select(null); Ed().select('LK');
      expect(!!doc().querySelector('.sel-box.is-locked')).toBe(true);
      expect(!!doc().querySelector('.sel-lock')).toBe(true);
      expect(S().overlay.querySelectorAll('.handle').length).toBe(0);
      expect(Ed().selId).toBe('LK'); // still selectable, so it can be unlocked
      drag(elOf('LK'), 40, 0);
      await sleep(40);
      expect(annot('LK').cx).toBe(60);
      expect(PT.E.undoLabel()).toBe('Lock layer');
      PT.SP.layers.set(pid, 'LK', 'locked', false);
      Ed().select(null); Ed().select('LK');
      expect(!!doc().querySelector('.sel-lock')).toBe(false);
      expect(S().overlay.querySelectorAll('.handle').length).toBe(8);
      drag(elOf('LK'), 40, 0);
      await sleep(40);
      expect(annot('LK').cx > 60).toBe(true);
      expect(PT.E.undoLabel()).toBe('Move annotation');
    }, { timeout: 60000 });

    it('with Edit text on, a press on a text annotation moves it; it is not read as a press on the text under it', async () => {
      await openFixture('no-text.pdf', [{ text: 'hello world', w: 300, h: 200 }]);
      // over the page's own line of text, so the text layer's spans lie over the annotation
      const a = { id: 'TX', type: 'text', text: 'Note', font: 'Helvetica', bold: false, italic: false, size: 16, color: '#111111', opacity: 1, rot: 0, cx: 90, cy: 176 };
      const t = PT.E.textLayout(a); a.w = t.w; a.h = t.h;
      Ed().addAnnot(a, 'Add text');
      if (!Ed().editText) Ed().toggleEditText(); // on, whatever an earlier spec left it as (toggle flips it)
      await waitFor(() => elOf('TX'), { timeout: 8000 });
      const c = centre(elOf('TX'));
      // the press lands on the annotation's own glyphs (its element is the target)
      const hit = doc().elementFromPoint(c.clientX, c.clientY);
      expect(!!hit.closest('.annots [data-aid]')).toBe(true, 'the press lands on the annotation, not ' + hit.className + ' ' + hit.tagName);
      hit.dispatchEvent(pe('pointerdown', c));
      pageEl().dispatchEvent(pe('pointermove', { clientX: c.clientX + 20, clientY: c.clientY }));
      pageEl().dispatchEvent(pe('pointermove', { clientX: c.clientX + 40, clientY: c.clientY }));
      pageEl().dispatchEvent(pe('pointerup', { clientX: c.clientX + 40, clientY: c.clientY, buttons: 0 }));
      await sleep(40);
      expect(annot('TX').cx > 90).toBe(true, 'moved: cx ' + annot('TX').cx + ', last step ' + PT.E.undoLabel());
      expect(PT.E.undoLabel()).toBe('Move annotation');
      // a press on the page itself, where the page's text lies under the annotation: the annotation still takes it
      // (a pause first: presses on the same annotation close together are a double click)
      await sleep(500);
      const before = annot('TX').cx, c2 = centre(elOf('TX'));
      pageEl().dispatchEvent(pe('pointerdown', c2));
      pageEl().dispatchEvent(pe('pointermove', { clientX: c2.clientX + 20, clientY: c2.clientY }));
      pageEl().dispatchEvent(pe('pointerup', { clientX: c2.clientX + 20, clientY: c2.clientY, buttons: 0 }));
      await sleep(40);
      expect(annot('TX').cx > before).toBe(true);
      expect(Ed().editText).toBe(true);
      expect(pageEl().querySelector('.edit-run')).toBe(null);
      Ed().toggleEditText();
    }, { timeout: 60000 });

    it('after an edit, the old run under the new text is not offered, and a double click on the new text edits the new text', async () => {
      const pid = await openFixture('dbl.pdf', [{ text: 'hello world', w: 300, h: 200 }]);
      Ed().toggleEditText();
      const z = Ed().zoom, el = S().slots.get(pid).el, r = el.getBoundingClientRect();
      const wordsAt = { clientX: r.left + 60 * z, clientY: r.top + (200 - 20 - 6) * z };
      // a press on the words (as the edit-text spec does), then the new text and Enter
      el.dispatchEvent(pe('pointerdown', Object.assign({ pointerId: 1 }, wordsAt)));
      await waitFor(() => pageEl().querySelector('.edit-run'), { timeout: 5000 });
      const input = pageEl().querySelector('.edit-run');
      input.value = 'goodbye';
      input.dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      const text = await waitFor(() => PT.E.state.pages[0].annots.find((x) => x.type === 'text' && x.text === 'goodbye'), { timeout: 8000 }); // the old run leaves the content first (text-strip.js)
      expect(!!text).toBe(true);
      await waitFor(() => elOf(text.id), { timeout: 8000 });
      // a press on the old words, where the white cover is: the old run is not offered again
      el.dispatchEvent(pe('pointerdown', Object.assign({ pointerId: 2 }, wordsAt)));
      pageEl().dispatchEvent(pe('pointerup', Object.assign({}, wordsAt, { buttons: 0 })));
      await sleep(150);
      expect(pageEl().querySelector('.edit-run')).toBe(null);
      // the old-words press was a tap on the new text too: a pause keeps it from pairing with the next presses
      await sleep(500);
      // a double click on the new text (two presses on it, close together): its editor opens with the new text
      await clickAid(text.id);
      await sleep(60);
      await clickAid(text.id);
      await waitFor(() => !S().ta.hidden, { timeout: 3000 });
      expect(S().ta.value).toBe('goodbye');
      expect(pageEl().querySelector('.edit-run')).toBe(null);
      Ed().toggleEditText();
    }, { timeout: 60000 });

    it('with Edit text off, a press and drag on a text annotation over the page text moves it (the text layer does not take it)', async () => {
      await openFixture('over-text.pdf', [{ text: 'hello world', w: 300, h: 200 }]);
      const a = { id: 'TO', type: 'text', text: 'Note', font: 'Helvetica', bold: false, italic: false, size: 16, color: '#111111', opacity: 1, rot: 0, cx: 90, cy: 176 };
      const t = PT.E.textLayout(a); a.w = t.w; a.h = t.h;
      Ed().addAnnot(a, 'Add text');
      expect(Ed().editText).toBe(false);
      await waitFor(() => elOf('TO'), { timeout: 8000 });
      // the press lands on the page's text (the text layer), inside the annotation's box but off its own glyphs, as a press
      // in a gap between its letters does
      const span = await waitFor(() => spanFor('hello world'), { timeout: 8000 }), c = centre(elOf('TO'));
      span.dispatchEvent(pe('pointerdown', c));
      pageEl().dispatchEvent(pe('pointermove', { clientX: c.clientX + 20, clientY: c.clientY }));
      pageEl().dispatchEvent(pe('pointermove', { clientX: c.clientX + 40, clientY: c.clientY }));
      pageEl().dispatchEvent(pe('pointerup', { clientX: c.clientX + 40, clientY: c.clientY, buttons: 0 }));
      await sleep(40);
      expect(annot('TO').cx > 90).toBe(true, 'moved: cx ' + annot('TO').cx);
      expect(PT.E.undoLabel()).toBe('Move annotation');
      expect(Ed().selId).toBe('TO');
    }, { timeout: 60000 });

    it('a single click on a line of the page text selects its block, with the frame and handles that move and edit it', async () => {
      await openFixture('click.pdf', [{ text: 'Hello world', w: 300, h: 200 }]);
      const span = await waitFor(() => spanFor('Hello world'), { timeout: 8000 });
      const r = span.getBoundingClientRect(), at = { clientX: r.left + 10, clientY: r.top + r.height / 2 };
      // the one-click selection is the block's frame now (select-edit.js), not a character selection with a lift box
      span.dispatchEvent(pe('pointerdown', at));
      pageEl().dispatchEvent(pe('pointerup', Object.assign({}, at, { buttons: 0 })));
      const fr = await waitFor(() => { const f = doc().querySelector('.para-frame'); return f && !f.classList.contains('is-busy') ? f : null; }, { timeout: 8000 });
      expect(fr.querySelectorAll('.para-h, .para-c, .para-r').length).toBe(7);
      expect(PT.win.getSelection().isCollapsed).toBe(true);
      expect(doc().querySelector('.sel-box.is-text')).toBe(null);
      PT.SP.editor._.para.clear();
    }, { timeout: 60000 });

    it('moving text on a coloured band covers the old place in the band colour and keeps the text light', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      PT.win.getSelection().removeAllRanges();
      const L = PT.win.PDFLib, d = await L.PDFDocument.create(), pg = d.addPage(PT.win.Array.of(300, 200));
      pg.drawRectangle({ x: 10, y: 140, width: 280, height: 50, color: L.rgb(0.1, 0.3, 0.7) });
      pg.drawText('On the band', { x: 20, y: 160, size: 18, font: await d.embedFont(L.StandardFonts.Helvetica), color: L.rgb(1, 1, 1) });
      d.setCreationDate(new PT.win.Date(PT.win.Date.UTC(2025, 0, 1) + (++PT._nonce) * 1000));
      await PT.open(await d.save(), 'band-move.pdf');
      PT.A.openPage(PT.E.state.pages[0].id);
      await waitFor(() => pageEl() && doc().querySelector('.pv-page'), { timeout: 8000 });
      pageEl().setPointerCapture = () => {}; pageEl().releasePointerCapture = () => {};
      if (Ed().editText) Ed().toggleEditText();
      Ed().setTool('select');
      const span = await waitFor(() => spanFor('On the band'), { timeout: 8000 });
      const range = doc().createRange(); range.selectNodeContents(span);
      PT.win.getSelection().removeAllRanges(); PT.win.getSelection().addRange(range);
      await waitFor(() => doc().querySelector('.sel-box.is-text'), { timeout: 5000 });
      drag(doc().querySelector('.sel-box.is-text'), 30, 0);
      await sleep(60);
      const annots = PT.E.state.pages[0].annots, cover = annots.find((a) => a.type === 'whiteout'), moved = annots.find((a) => a.type === 'text');
      const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      expect(rgb(cover.fill)[2] > 150 && rgb(cover.fill)[0] < 80).toBe(true, 'the cover is the band blue: ' + cover.fill);
      expect(rgb(moved.color).every((v) => v > 200)).toBe(true, 'the moved text stays white: ' + moved.color);
    }, { timeout: 60000 });

    it('a text selection shows a box with handles; a press without movement lifts nothing; dragging the box lifts the text into an annotation', async () => {
      await openFixture('lift.pdf', [{ text: 'Hello world', w: 300, h: 200 }]);
      const span = await waitFor(() => spanFor('Hello world'), { timeout: 8000 });
      const range = doc().createRange(); range.selectNodeContents(span);
      const sel = PT.win.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      await waitFor(() => doc().querySelector('.sel-box.is-text'), { timeout: 5000 });
      expect(doc().querySelectorAll('.handle[data-tb]').length).toBe(8);
      const count = PT.E.state.pages[0].annots.length;
      click(doc().querySelector('.sel-box.is-text'));
      await sleep(40);
      expect(PT.E.state.pages[0].annots.length).toBe(count);
      // the press goes to what is on top at the box's centre, as a mouse's does (the text layer must not take it)
      const bc = centre(doc().querySelector('.sel-box.is-text')), top = doc().elementFromPoint(bc.clientX, bc.clientY);
      expect(!!top.closest('.sel-box.is-text')).toBe(true);
      // one move between the press and the release, as a quick drag (or an automated one) sends: it must still move the text
      top.dispatchEvent(pe('pointerdown', bc));
      pageEl().dispatchEvent(pe('pointermove', { clientX: bc.clientX + 40, clientY: bc.clientY }));
      pageEl().dispatchEvent(pe('pointerup', { clientX: bc.clientX + 40, clientY: bc.clientY, buttons: 0 }));
      await sleep(60);
      const lifted = PT.E.state.pages[0].annots.filter((a) => a.type === 'text' && a.text === 'Hello world');
      expect(lifted.length).toBe(1);
      expect(PT.E.state.pages[0].annots.filter((a) => a.type === 'whiteout').length).toBe(1);
      expect(lifted[0].cx > 60).toBe(true);
      expect(PT.E.undoLabel()).toBe('Move annotation');
      PT.A.undo(); await sleep(40);
      expect(PT.E.state.pages[0].annots.filter((a) => a.type === 'text' && a.text === 'Hello world').length).toBe(1);
      PT.A.undo(); await sleep(40);
      expect(PT.E.state.pages[0].annots.filter((a) => a.type === 'text').length).toBe(0);
    }, { timeout: 60000 });
  });
})();
