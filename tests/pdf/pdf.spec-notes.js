/* Slop PDF comments and callouts: a comment is placed, replied to and resolved, and downloads as a PDF text annotation
   with its reply and state; a callout is placed with its leader line from the box edge to the clicked point, and the
   line is drawn into the page. Pointer events go to the page element the way a mouse would send them. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const Ed = () => PT.SP.editor;
  const pageEl = () => Ed()._.pageEl;
  const at = (el, x, y) => { const r = el.getBoundingClientRect(), z = Ed().zoom; return { clientX: r.left + x * z, clientY: r.top + y * z }; };
  const pe = (type, init) => new PT.win.PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }, init));
  /** A click (or a drag through the points) on the active page, in page points from the top-left. */
  function press(x, y) { const el = pageEl(); el.setPointerCapture = () => {}; el.releasePointerCapture = () => {}; el.dispatchEvent(pe('pointerdown', at(el, x, y))); }
  function move(x, y) { const el = pageEl(); el.dispatchEvent(pe('pointermove', at(el, x, y))); }
  function release(x, y) { const el = pageEl(); el.dispatchEvent(pe('pointerup', Object.assign(at(el, x, y), { buttons: 0 }))); }
  const btn = (scope, label) => [...PT.win.document.querySelectorAll(scope + ' button')].find((b) => b.textContent.trim() === label);
  const annots = () => Ed().page().annots;
  async function openFirst(name, pages = [{ text: 'Figure 1', w: 300, h: 200 }]) {
    PT.reset();
    await PT.open(await PT.makePdf(pages), name);
    const id = PT.E.state.pages[0].id;
    PT.A.openPage(id);
    await waitFor(() => pageEl() && Ed().pid === id);
    return id;
  }

  describe('comments', () => {
    it('a comment is placed, replied to and resolved, and downloads as a PDF text annotation with its reply and state', async () => {
      await openFirst('notes.pdf');
      Ed().rememberAuthor('Ana');
      Ed().setTool('note');
      press(120, 80); release(120, 80);
      await waitFor(() => PT.win.document.querySelector('.note-pop textarea'));
      PT.win.document.querySelector('.note-pop textarea').value = 'Check this figure';
      btn('.note-pop', 'Save comment').click();
      const note = annots().find((a) => a.type === 'note');
      expect(note).toBeTruthy();
      expect(note.text).toBe('Check this figure');
      expect(note.author).toBe('Ana');
      expect(PT.E.undoLabel()).toBe('Add comment');
      expect(Ed().tool).toBe('select');

      // open the thread by clicking the icon, reply, then resolve
      const icon = pageEl().querySelector('.an-note[data-aid="' + note.id + '"]'); // the page's own icon, not the grid thumbnail's
      expect(!!icon).toBe(true);
      icon.dispatchEvent(pe('pointerdown', at(pageEl(), note.cx, note.cy)));
      release(note.cx, note.cy);
      await waitFor(() => PT.win.document.querySelector('.note-pop .np-reply textarea'));
      PT.win.document.querySelector('.note-pop .np-reply textarea').value = 'Fixed in v2';
      btn('.note-pop', 'Reply').click();
      expect(annots().find((a) => a.id === note.id).replies.length).toBe(1);
      expect(PT.E.undoLabel()).toBe('Reply to comment');
      await waitFor(() => PT.win.document.querySelector('.note-pop'));
      btn('.note-pop', 'Resolve').click();
      expect(annots().find((a) => a.id === note.id).resolved).toBe(true);
      expect(PT.E.undoLabel()).toBe('Resolve comment');

      // the export carries it as annotations, not as page content
      const bytes = await PT.E.build();
      const L = PT.win.PDFLib, out = await L.PDFDocument.load(bytes, { updateMetadata: false });
      const list = out.getPage(0).node.Annots();
      const dicts = []; for (let i = 0; i < list.size(); i++) dicts.push({ ref: list.get(i), d: out.context.lookup(list.get(i)) });
      const texts = dicts.filter((x) => x.d.get(L.PDFName.of('Subtype')) && x.d.get(L.PDFName.of('Subtype')).toString() === '/Text');
      expect(texts.length).toBe(2);
      const parent = texts[0], reply = texts[1];
      expect(parent.d.get(L.PDFName.of('Contents')).decodeText()).toBe('Check this figure');
      expect(parent.d.get(L.PDFName.of('T')).decodeText()).toBe('Ana');
      expect(parent.d.get(L.PDFName.of('M')).decodeText().slice(0, 2)).toBe('D:');
      expect(parent.d.get(L.PDFName.of('State')).decodeText()).toBe('Completed');
      expect(reply.d.get(L.PDFName.of('Contents')).decodeText()).toBe('Fixed in v2');
      expect(reply.d.get(L.PDFName.of('IRT')).toString()).toBe(parent.ref.toString());
      expect((await PT.read(bytes)).pages[0].text.includes('Check this figure')).toBe(false);
    }, { timeout: 90000 });

    it('the Comments list shows each comment with its page and author, and a click jumps to it', async () => {
      const id = await openFirst('list.pdf', [{ text: 'one', w: 300, h: 200 }, { text: 'two', w: 300, h: 200 }]);
      Ed().rememberAuthor('Ben');
      Ed().setTool('note');
      press(60, 60); release(60, 60);
      await waitFor(() => PT.win.document.querySelector('.note-pop textarea'));
      PT.win.document.querySelector('.note-pop textarea').value = 'On page one';
      btn('.note-pop', 'Save comment').click();
      PT.A.openPage(PT.E.state.pages[1].id);
      PT.A.setTool('comments');
      const items = [...PT.win.document.querySelectorAll('.cm-item')];
      expect(items.length).toBe(1);
      expect(items[0].textContent.includes('Page 1 · Ben')).toBe(true);
      items[0].click();
      await waitFor(() => Ed().pid === id && PT.win.document.querySelector('.note-pop'));
      expect(PT.win.document.querySelector('.note-pop').textContent.includes('On page one')).toBe(true);
    }, { timeout: 90000 });
  });

  describe('callouts', () => {
    it('a callout is placed with its leader line from the box edge to the clicked point, and the line is drawn into the page', async () => {
      await openFirst('callout.pdf');
      Ed().setTool('callout');
      press(40, 40); move(120, 90); release(120, 90);
      expect(!!Ed()._.callDraft).toBe(true);
      expect(annots().some((a) => a.type === 'callout')).toBe(false);
      press(250, 170); release(250, 170);
      const co = annots().find((a) => a.type === 'callout');
      expect(!!co).toBe(true);
      expect(co.tip[0]).toBeCloseTo(250, 0);
      expect(co.tip[1]).toBeCloseTo(170, 0);
      const ln = PT.SP.engine.calloutLine(co);
      // the line starts on the box edge (the right or bottom edge, towards the tip) and ends at the tip
      expect(Math.abs(ln.from[0] - (co.cx + co.w / 2)) < 0.01 || Math.abs(ln.from[1] - (co.cy + co.h / 2)) < 0.01).toBe(true);
      expect(ln.to[0]).toBe(250);
      expect(PT.E.undoLabel()).toBe('Add callout');
      // a sample on the line, between the edge and the tip, is coloured by the border
      const mid = [(ln.from[0] + 250) / 2, (ln.from[1] + 170) / 2];
      const c = await PT.render(await PT.E.build(), 0, 1);
      let red = false;
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const p = PT.px(c, mid[0] + dx, mid[1] + dy); if (p[0] > 150 && p[1] < 120 && p[2] < 150) red = true; }
      expect(red).toBe(true);
      // undo removes the callout as one step
      PT.A.undo();
      expect(annots().some((a) => a.type === 'callout')).toBe(false);
    }, { timeout: 90000 });
  });
})();
