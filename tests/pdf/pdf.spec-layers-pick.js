/* Slop PDF: the Layers section picks rows like Photoshop's layers. A click selects one, Shift the rows from the anchor to
   the clicked one (top layer first, as listed), Ctrl/Cmd adds or takes one away, Ctrl/Cmd+Shift adds a range. The rows
   picked are the select tool's multi-selection, so Delete removes them all in one step.
   Covers: pdf/js/tools/layers-panel.js, pdf/js/editor/multi-sel.js */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const doc = () => PT.win.document;
  const rows = () => [...doc().querySelectorAll('#dock-layers .lyr')];
  const name = (aid) => doc().querySelector('#dock-layers .lyr[data-aid="' + aid + '"] .lyr-name');
  const click = (aid, mods = {}) => name(aid).dispatchEvent(new PT.win.MouseEvent('click', Object.assign({ bubbles: true, cancelable: true }, mods)));
  const page = () => PT.E.state.pages[0];
  const sel = () => PT.SP.editor._.selectedIds().slice().sort();
  const on = () => rows().filter((r) => r.classList.contains('on')).map((r) => r.getAttribute('data-aid')).sort();
  const box = (id, cx) => ({ id, type: 'rect', rot: 0, cx, cy: 60, w: 30, h: 30, stroke: '#000000', fill: 'none', lineWidth: 1, opacity: 1 });

  describe('layers: Shift range and Ctrl/Cmd toggle', () => {
    it('picks a range from the anchor, toggles with Ctrl/Cmd, and Delete removes every row picked', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'a' }]), 'layers-pick.pdf');
      PT.A.openPage(page().id);
      await waitFor(() => doc().querySelector('.pv-page') && PT.SP.editor.pid === page().id && PT.SP.editor._.groupSet);
      const Ed = PT.SP.editor;
      Ed.setTool('select');
      ['P1', 'P2', 'P3', 'P4', 'P5'].forEach((id, i) => Ed.addAnnot(box(id, 30 + i * 50), 'Add rectangle'));
      await waitFor(() => rows().length === 5); // listed top first: P5 P4 P3 P2 P1
      click('P2'); click('P4');
      expect(sel()).toEqual(['P4']);
      click('P1', { shiftKey: true });
      expect(sel()).toEqual(['P1', 'P2', 'P3', 'P4']);
      expect(Ed.selId).toBe('P1');
      click('P5', { shiftKey: true }); // the anchor stays on P4
      expect(sel()).toEqual(['P4', 'P5']);
      await waitFor(() => on().join() === 'P4,P5');
      click('P2', { ctrlKey: true });
      expect(sel()).toEqual(['P2', 'P4', 'P5']);
      click('P4', { metaKey: true });
      expect(sel()).toEqual(['P2', 'P5']);
      click('P1', { ctrlKey: true, shiftKey: true }); // adds the range from the anchor (P4) to P1
      expect(sel()).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
      click('P3', { ctrlKey: true });
      Ed.deleteSelected();
      await waitFor(() => rows().length === 1);
      expect(page().annots.map((a) => a.id)).toEqual(['P3']);
      click('P3');
      expect(sel()).toEqual(['P3']);
    }, { timeout: 60000 });
  });
})();
