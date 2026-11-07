/* Slop PDF: layers. Each annotation on a page is a layer item in the Layers section of the sidebar: hidden layers are not
   drawn or exported, locked layers cannot be moved, edited or deleted, layers move up and down the stack, and delete is
   one undoable step. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const doc = () => PT.win.document;
  const openPage = async (id) => { PT.A.openPage(id); await waitFor(() => doc().querySelector('.pv-page') && PT.SP.editor.pid === id); };
  const rows = () => [...doc().querySelectorAll('#dock-layers .lyr')];
  const row = (aid) => doc().querySelector('#dock-layers .lyr[data-aid="' + aid + '"]');
  const btn = (aid, key) => row(aid).querySelector('[data-key^="' + key + ':"]');
  const page = () => PT.E.state.pages[0];
  const annot = (aid) => page().annots.find((a) => a.id === aid);
  /** A red box over the page's top-left area, in view points (the page is 300 × 200): fill is red when it is drawn. */
  const red = (id, cx = 60, cy = 60) => ({ id, type: 'hlbox', rot: 0, cx, cy, w: 80, h: 40, fill: '#ff0000', opacity: 1 });
  async function exported() {
    const bytes = await PT.SP.engine.build();
    return PT.render(bytes, 0, 1);
  }

  describe('layers', () => {
    it('lists the page\'s layers top first, with the type and a number, and shows an edit as a new layer', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'a' }]), 'layers1.pdf');
      await openPage(page().id);
      PT.SP.editor.addAnnot(red('L1'), 'Add highlight');
      PT.SP.editor.addAnnot({ id: 'L2', type: 'rect', rot: 0, cx: 150, cy: 120, w: 60, h: 30, stroke: '#000000', fill: 'none', lineWidth: 1, opacity: 1 }, 'Add rectangle');
      PT.SP.editor.addAnnot(red('L3', 200, 40), 'Add highlight');
      await waitFor(() => rows().length === 3);
      expect(rows().map((r) => r.querySelector('.lyr-name').textContent)).toEqual(['Highlight 2', 'Rectangle 1', 'Highlight 1']);
      expect(rows()[0].getAttribute('data-aid')).toBe('L3');
      expect(doc().querySelector('[data-dock="layers"] .pp-dock-meta').textContent).toBe('3');
    }, { timeout: 60000 });

    it('hide takes the layer off the page view and out of the export; show puts it back', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'a' }]), 'layers2.pdf');
      await openPage(page().id);
      PT.SP.editor.addAnnot(red('H1'), 'Add highlight');
      await waitFor(() => doc().querySelector('.annots [data-aid="H1"]'));
      expect(PT.isRed(PT.px(await exported(), 60, 60))).toBe(true);
      btn('H1', 'vis').click();
      expect(annot('H1').hidden).toBe(true);
      expect(row('H1').classList.contains('is-hidden')).toBe(true);
      await waitFor(() => !doc().querySelector('.annots [data-aid="H1"]'));
      expect(PT.isRed(PT.px(await exported(), 60, 60))).toBe(false);
      btn('H1', 'vis').click();
      expect(annot('H1').hidden).toBe(undefined);
      await waitFor(() => doc().querySelector('.annots [data-aid="H1"]'));
      expect(PT.isRed(PT.px(await exported(), 60, 60))).toBe(true);
    }, { timeout: 60000 });

    it('hiding the selected layer clears the selection', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'a' }]), 'layers3.pdf');
      await openPage(page().id);
      PT.SP.editor.addAnnot(red('S1'), 'Add highlight');
      PT.SP.editor.select('S1');
      expect(PT.SP.editor.selId).toBe('S1');
      btn('S1', 'vis').click();
      expect(PT.SP.editor.selId).toBe(null);
    }, { timeout: 60000 });

    it('lock: a locked layer is drawn and exported but cannot be moved, deleted or edited; unlock restores that', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      const E = PT.E, Ed = PT.SP.editor;
      await PT.open(await PT.makePdf([{ text: 'a' }]), 'layers4.pdf');
      await openPage(page().id);
      PT.SP.editor.addAnnot(red('K1'), 'Add highlight');
      btn('K1', 'lock').click();
      expect(annot('K1').locked).toBe(true);
      Ed.select('K1');
      Ed.nudgeSelected(30, 0);
      expect(annot('K1').cx).toBe(60);
      Ed.setProp('opacity', 0.5);
      expect(annot('K1').opacity).toBe(1);
      Ed.deleteSelected();
      expect(page().annots.length).toBe(1);
      expect(PT.isRed(PT.px(await exported(), 60, 60))).toBe(true);
      btn('K1', 'lock').click();
      expect(annot('K1').locked).toBe(undefined);
      Ed.select('K1');
      Ed.nudgeSelected(30, 0);
      expect(annot('K1').cx).toBe(90);
      expect(E.undoLabel()).toBe('Move annotation');
    }, { timeout: 60000 });

    it('move up and down reorder the stack, and the top layer cannot move further up', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'a' }]), 'layers5.pdf');
      await openPage(page().id);
      PT.SP.editor.addAnnot(red('M1'), 'Add highlight');
      PT.SP.editor.addAnnot(red('M2', 70, 70), 'Add highlight');
      await waitFor(() => rows().length === 2);
      expect(page().annots.map((a) => a.id)).toEqual(['M1', 'M2']);
      expect(btn('M2', 'up').disabled).toBe(true);
      btn('M1', 'up').click();
      expect(page().annots.map((a) => a.id)).toEqual(['M2', 'M1']);
      expect(rows()[0].getAttribute('data-aid')).toBe('M1');
      btn('M1', 'down').click();
      expect(page().annots.map((a) => a.id)).toEqual(['M1', 'M2']);
      expect(PT.E.undoLabel()).toBe('Move layer down');
    }, { timeout: 60000 });

    it('delete removes the layer as one undoable step', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'a' }]), 'layers6.pdf');
      await openPage(page().id);
      PT.SP.editor.addAnnot(red('D1'), 'Add highlight');
      PT.SP.editor.addAnnot(red('D2', 200, 40), 'Add highlight');
      await waitFor(() => rows().length === 2);
      btn('D1', 'del').click();
      expect(page().annots.map((a) => a.id)).toEqual(['D2']);
      expect(PT.E.undoLabel()).toBe('Delete layer');
      PT.E.undo();
      expect(page().annots.map((a) => a.id)).toEqual(['D1', 'D2']);
    }, { timeout: 60000 });

    it('a duplicate of a hidden or locked layer is a visible, unlocked layer', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      const Ed = PT.SP.editor;
      await PT.open(await PT.makePdf([{ text: 'a' }]), 'layers7.pdf');
      await openPage(page().id);
      PT.SP.editor.addAnnot(red('C1'), 'Add highlight');
      btn('C1', 'vis').click();
      btn('C1', 'lock').click();
      Ed.select('C1');
      Ed.duplicateSelected();
      const copy = page().annots[page().annots.length - 1];
      expect(copy.id).not.toBe('C1');
      expect(copy.hidden).toBe(undefined);
      expect(copy.locked).toBe(undefined);
    }, { timeout: 60000 });
  });
})();
