/* Slop Tables templates: the built-in set, From template… (dialog), Save as template (IndexedDB and the
   Drive Templates folder), .stab-template export and import round trip, broken imports, and Drive import. */
(function () {
  'use strict';
  const { describe, it, expect, sleep, waitFor } = SlopTest;
  const BUILTIN_IDS = ['budget', 'invoice', 'inventory', 'timesheet', 'project-plan', 'sales-pipeline', 'expense-claim', 'grade-book'];
  const cardNames = () => [...TB.doc.querySelectorAll('.tpl-card h4')].map((h) => h.textContent);
  const footButton = (label) => [...TB.doc.querySelectorAll('.tpl-dlg .sui-foot button')].find((b) => b.textContent === label);
  const closeDialog = async () => { footButton('Close').click(); await sleep(200); };
  const nativeText = async () => (await TB.T.native()).text();
  const saveNamed = async (name, fill) => {
    fill();
    TB.win.SlopUI.prompt = async () => name;
    expect(await TB.T.command('file.saveTemplate')).toBeTruthy();
  };

  describe('built-in templates', () => {
    it('every built-in template opens and every formula computes', async () => {
      await TB.boot();
      for (const id of BUILTIN_IDS) {
        expect(await TB.T.templates.openBuiltin(id)).toBeTruthy();
        const errors = [];
        let formulas = 0;
        for (const sh of TB.T.wb.sheets) for (const [, cell] of sh.cells) {
          if (!cell.f) continue;
          formulas++;
          if (cell.v && typeof cell.v === 'object' && 'code' in cell.v) errors.push(cell.f);
        }
        expect(formulas).toBeGreaterThan(0);
        expect(errors).toEqual([]);
      }
    });

    it('every built-in template has readable columns: its widths are characters, never a few pixels (A–E of Budget)', async () => {
      for (const id of BUILTIN_IDS) {
        await TB.T.templates.openBuiltin(id);
        const sh = TB.T.wb.sheets[0];
        for (const c of sh.cols.keys()) expect(id + ' ' + c + ' ' + (sh.colW(c) >= 60)).toBe(id + ' ' + c + ' true');
      }
      await TB.T.templates.openBuiltin('budget');
      const sh = TB.T.wb.sheets[0];
      for (let c = 0; c <= 4; c++) expect(sh.colW(c)).toBeGreaterThan(60);
      expect(sh.colW(0)).toBe(22 * 7);
    });

    it('Budget: the quarter income equals the sum of the monthly amounts, and the balance is income less expenses', async () => {
      await TB.T.templates.openBuiltin('budget');
      const T = TB.T;
      expect(T.value('E7')).toBe(3200 * 3 + 450 + 0 + 620);
      expect(T.value('E14')).toBe(4200 + 1250 + 485 + 340);
      expect(T.value('E7')).toBe(T.value('B7') + T.value('C7') + T.value('D7'));
      expect(T.value('E16')).toBe(T.value('E7') - T.value('E14'));
      expect(T.value('B16')).toBe(T.value('B7') - T.value('B14'));
    });

    it('Invoice: a line total equals quantity times price plus tax', async () => {
      await TB.T.templates.openBuiltin('invoice');
      const T = TB.T;
      const qty = T.value('B9'), price = T.value('C9'), rate = T.value('B5');
      expect(rate).toBeCloseTo(0.2, 1e-12);
      expect(T.value('F9')).toBeCloseTo(qty * price + qty * price * rate, 1e-9);
      expect(T.value('F9')).toBe(1440);
    });
  });

  describe('From template', () => {
    it('File ▸ New ▸ From template… shows the built-in templates as cards with a preview table', async () => {
      await TB.boot();
      await TB.T.command('file.fromTemplate');
      await waitFor(() => TB.doc.querySelectorAll('.tpl-card').length >= BUILTIN_IDS.length);
      expect(cardNames().slice(0, 8)).toEqual(['Budget', 'Invoice', 'Inventory list', 'Timesheet', 'Project plan', 'Sales pipeline', 'Expense claim', 'Grade book']);
      expect(TB.doc.querySelector('.tpl-card .tpl-mini tr').textContent.length).toBeGreaterThan(0);
      expect(TB.doc.querySelectorAll('.tpl-card .tpl-mini tr').length).toBeGreaterThan(8);
      await closeDialog();
    });

    it('choosing a card opens a new workbook from it', async () => {
      await TB.T.command('file.fromTemplate');
      await waitFor(() => TB.doc.querySelectorAll('.tpl-card').length >= 8);
      const card = TB.doc.querySelectorAll('.tpl-card')[1];
      card.querySelector('.sui-primary').click();
      await waitFor(() => TB.T.S.file.name === 'Invoice');
      expect(TB.T.value('F9')).toBe(1440);
      expect(TB.T.S.file.dirty).toBeFalsy();
      // through the dialog (the native round trip) the columns keep their widths too
      for (let c = 0; c <= 5; c++) expect(TB.T.wb.sheets[0].colW(c)).toBeGreaterThan(60);
    });
  });

  describe('Save as template', () => {
    it('Save as template then From template lists it, and a copy is in the Drive Templates folder', async () => {
      await TB.boot();
      await saveNamed('Monthly report', () => { TB.T.setCell('A1', 'Quarter'); TB.T.setCell('B1', '=2*21'); });
      const mine = await TB.T.templates.listMine();
      expect(mine.some((r) => r.name === 'Monthly report')).toBeTruthy();
      await TB.T.command('file.fromTemplate');
      await waitFor(() => cardNames().includes('Monthly report'));
      await closeDialog();
      const folder = (await TB.hub.listFolders({ parentId: null })).find((f) => f.name === 'Templates');
      expect(folder).toBeTruthy();
      const files = await TB.hub.list({ folderId: folder.id });
      expect(files.some((f) => f.name === 'Monthly report.stab-template')).toBeTruthy();
    });
  });

  describe('template files', () => {
    it('export then import gives the same cells', async () => {
      await TB.boot();
      const T = TB.T;
      T.setCell('A1', 'Item'); T.setCell('B1', 'Qty'); T.setCell('A2', 'Pen'); T.setCell('B2', '=3*4'); T.setCell('B3', '0.25');
      await saveNamed('Round trip', () => {});
      const rec = (await T.templates.listMine()).find((r) => r.name === 'Round trip');
      const blob = T.templates.exportBlob(rec);
      const before = (await T.templates.listMine()).length;
      const back = await T.templates.importBlob(blob);
      expect(back.name).toBe('Round trip');
      expect(back.native.sheets).toEqual(rec.native.sheets);
      expect((await T.templates.listMine()).length).toBe(before + 1);
    });

    it('an import of a broken template changes nothing', async () => {
      await TB.boot();
      const T = TB.T;
      const before = (await T.templates.listMine()).length;
      const snapshot = await nativeText();
      const broken = [
        '{"format":"slop-tables-template","version":1',
        JSON.stringify({ format: 'slop-tables-template', version: 1, name: 'Bad', workbook: { format: 'slop-tables', version: 1, sheets: [{ name: 'S', cells: [[0, 0, { f: 5 }]] }] } }),
        JSON.stringify({ format: 'slop-tables-template', version: 1, name: 'Bad2', workbook: { format: 'slop-tables', version: 1, sheets: [{ cells: [[-1, 0, { v: 1 }]] }] } }),
        JSON.stringify({ format: 'something-else', version: 1, name: 'Nope' }),
      ];
      for (const text of broken) await expect(T.templates.importBlob(new Blob([text]))).rejects();
      expect((await T.templates.listMine()).length).toBe(before);
      expect(await nativeText()).toBe(snapshot);
    });

    it('Import from Drive reads the template record and adds it to My templates', async () => {
      await TB.boot();
      const text = JSON.stringify({ format: 'slop-tables-template', version: 1, name: 'From Drive', description: 'x', workbook: { format: 'slop-tables', version: 1, sheets: [{ name: 'Sheet1', cells: [[0, 0, { v: 'hi' }]] }] } });
      TB.hub.pickFromDrive = async () => ({ name: 'From Drive.stab-template', blob: new Blob([text]) });
      await TB.T.command('file.fromTemplate');
      await waitFor(() => footButton('Import from Drive…'));
      footButton('Import from Drive…').click();
      await waitFor(async () => (await TB.T.templates.listMine()).some((r) => r.name === 'From Drive'));
      await waitFor(() => cardNames().includes('From Drive'));
      await closeDialog();
    });
  });
})();
