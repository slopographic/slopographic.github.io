/* SlopLabel Objects tab: rows pick like Photoshop's layers. A click selects one, Shift the rows from the anchor to the
 * clicked one (top of the list first), Ctrl/Cmd adds or takes one away, Ctrl/Cmd+Shift adds a range; a group comes whole.
 * Delete then removes every object picked.
 * Covers: label/js/ui/panels.js */
(function () {
  const { describe, it, expect } = SlopTest;
  let objs;
  const rowOf = (id) => { W.App.tab = 'objects'; W.refreshNow(); return W.$('dockBody').querySelector('.li[data-id="' + id + '"]'); };
  const click = (o, mods = {}) => rowOf(o.id).dispatchEvent(new WIN.MouseEvent('click', Object.assign({ bubbles: true, cancelable: true }, mods)));
  const sel = () => W.App.sel.slice().sort();
  const ids = (...os) => os.map((o) => o.id).sort();
  function setup() {
    const d = W.newDoc({ stock: W.stockById('roll-62x29') });
    for (let i = 0; i < 5; i++) d.objects.push(W.makeObject('rect', { x: 2 + i * 8, y: 2, w: 6, h: 6, name: 'R' + i }));
    W.setDoc(d, 'Pick test');
    objs = W.App.doc.objects.slice(); // the list shows R4 R3 R2 R1 R0
    W.select([]);
  }

  describe('Objects tab: Shift range and Ctrl/Cmd toggle', () => {
    it('a click selects one; Shift the range from the anchor, both ways', () => {
      setup();
      click(objs[1]); click(objs[3]);
      expect(sel()).toEqual(ids(objs[3]));
      click(objs[0], { shiftKey: true });
      expect(sel()).toEqual(ids(objs[0], objs[1], objs[2], objs[3]));
      click(objs[4], { shiftKey: true }); // the anchor stays on R3
      expect(sel()).toEqual(ids(objs[3], objs[4]));
      expect(rowOf(objs[4].id).classList.contains('on')).toBe(true);
      expect(rowOf(objs[2].id).getAttribute('aria-selected')).toBe('false');
    });
    it('Ctrl or Cmd adds or takes one away and moves the anchor; Ctrl+Shift adds a range', () => {
      setup();
      click(objs[0]); click(objs[2], { ctrlKey: true }); click(objs[4], { metaKey: true });
      expect(sel()).toEqual(ids(objs[0], objs[2], objs[4]));
      click(objs[2], { ctrlKey: true });
      expect(sel()).toEqual(ids(objs[0], objs[4]));
      click(objs[0], { shiftKey: true }); // from the new anchor (R2)
      expect(sel()).toEqual(ids(objs[0], objs[1], objs[2]));
      click(objs[4]); click(objs[1], { ctrlKey: true }); click(objs[0], { ctrlKey: true, shiftKey: true });
      expect(sel()).toEqual(ids(objs[0], objs[1], objs[4]));
    });
    it('a pick on the label is the anchor, a group comes whole, and Delete removes every row picked', () => {
      setup();
      W.select([objs[3].id, objs[4].id]); W.groupSel();
      W.select([objs[1].id]); // as if clicked on the label
      click(objs[2], { shiftKey: true });
      expect(sel()).toEqual(ids(objs[1], objs[2]));
      click(objs[0], { ctrlKey: true, shiftKey: true });
      expect(sel()).toEqual(ids(objs[0], objs[1], objs[2]));
      click(objs[3], { ctrlKey: true }); // grouped with R4
      expect(sel()).toEqual(ids(...objs));
      click(objs[4], { ctrlKey: true }); // the group goes out whole
      W.deleteSel();
      expect(W.App.doc.objects.map((o) => o.name)).toEqual(['R3', 'R4']);
    });
  });
})();
