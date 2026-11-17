/* Slop Tables: saving to Slop Drive, reopening by ?drive=<id>, the blank .stab from the New menu,
   CSV in Drive, and the autosave draft. Uses the real SlopHub (same origin) and stubs only the folder picker. */
(function () {
  'use strict';
  const { describe, it, expect, sleep } = SlopTest;

  describe('Slop Drive', () => {
    it('first save asks for a folder, writes a .stab record, and the app remembers its id', async () => {
      await TB.boot();
      // The folder picker is a dialog: the save goes to the root instead (the strip's save calls SlopHub.saveToDrive).
      TB.hub.saveToDrive = (blob, name, o) => TB.hub.put(blob, { name, from: (o && o.from) || 'tables', folderId: null });
      TB.T.setCell('A1', '7');
      TB.T.setCell('A2', '=A1*6');
      const ok = await TB.T.save();
      expect(ok).toBeTruthy();
      const id = TB.T.S.file.driveId;
      expect(id).toBeTruthy();
      const rec = await TB.hub.get(id);
      expect(rec.name).toBe('Untitled spreadsheet.stab');
      expect(rec.type).toBe('application/x-slop-table');
      expect(rec.from).toBe('tables');
      expect(rec.size).toBeGreaterThan(20);
      expect(TB.T.S.file.dirty).toBeFalsy();
    });

    it('reopening with ?drive=<id> restores the workbook and recalculates it', async () => {
      const id = TB.T.S.file.driveId;
      await TB.boot('?drive=' + id, 'app2');
      const T2 = TB.frame('app2').SlopTables;
      expect(T2.value('A1')).toBe(7);
      expect(T2.value('A2')).toBe(42);
      expect(T2.S.file.driveId).toBe(id);
      expect(T2.S.file.name).toBe('Untitled spreadsheet');
    });

    it('saving again writes the same Drive record', async () => {
      const id = TB.T.S.file.driveId;
      const app2 = TB.frame('app2').SlopTables;
      app2.setCell('A3', 'more');
      await TB.frame('app2').SlopTables.save();
      const rec = await TB.hub.get(id);
      expect(rec.id).toBe(id);
      const again = await TB.boot('?drive=' + id, 'app2');
      expect(again.SlopTables.value('A3')).toBe('more');
    });

    it('a zero-byte .stab (New from Drive) opens blank and saves back to that record', async () => {
      const blank = await TB.hub.put(new Blob([], { type: 'application/x-slop-table' }), { name: 'Untitled spreadsheet.stab', from: 'drive' });
      await TB.boot('?drive=' + blank, 'app2');
      const T2 = TB.frame('app2').SlopTables;
      expect(T2.value('A1')).toBe(null);
      expect(T2.S.file.driveId).toBe(blank);
      T2.setCell('B2', 'hello');
      await T2.save();
      const rec = await TB.hub.get(blank);
      expect(rec.size).toBeGreaterThan(0);
      expect(rec.id).toBe(blank);
    });

    it('a CSV in Drive opens as an unsaved import with numbers typed as numbers', async () => {
      const csv = await TB.hub.put(new Blob(['name,qty\r\nPen,2\r\n'], { type: 'text/csv' }), { name: 'pens.csv', from: 'drive' });
      await TB.boot('?drive=' + csv, 'app2');
      const T2 = TB.frame('app2').SlopTables;
      expect(T2.value('A2')).toBe('Pen');
      expect(T2.value('B2')).toBe(2);
      expect(T2.S.file.driveId).toBe(null);
      expect(T2.S.file.dirty).toBeTruthy();
    });

    it('an unknown ?drive id opens a blank workbook instead of failing', async () => {
      await TB.boot('?drive=does-not-exist', 'app2');
      const T2 = TB.frame('app2').SlopTables;
      expect(T2.wb.sheets.length).toBe(1);
      expect(T2.value('A1')).toBe(null);
    });
  });

  describe('autosave', () => {
    it('a plain start restores the open tabs with their unsaved workbook', async () => {
      await TB.boot('', 'app', { keepDrafts: false });
      TB.T.setCell('C5', 'unsaved draft text');
      await TB.frame('app').SlopTables.flushTabs();
      await TB.boot('', 'app2', { keepDrafts: true });
      expect(TB.frame('app2').SlopTables.value('C5')).toBe('unsaved draft text');
    });
  });
})();
