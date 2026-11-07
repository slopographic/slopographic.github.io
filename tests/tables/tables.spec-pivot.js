/* Slop Tables pivot tables: Insert ▸ Pivot table… to a new sheet, Refresh after the source changes, a place on the same
   sheet that asks before it overwrites, the right-click Edit (another summary function), the .stab round trip, and a
   rename of the source sheet. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const SALES = [['Region', 'Quarter', 'Rep', 'Sales'], ['North', 'Q1', 'Ann', 100], ['North', 'Q2', 'Ann', 150], ['South', 'Q1', 'Bo', 80],
    ['South', 'Q2', 'Bo', 120], ['North', 'Q1', 'Cy', 50], ['East', 'Q2', 'Di', 75], ['East', 'Q1', 'Di', 64]];
  const grid = (T, rows, cols) => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => T.sheet.value(r, c)));

  describe('pivot tables', () => {
    it('Insert ▸ Pivot table… summarizes by Region and Quarter on a new sheet, with totals', async () => {
      await TB.boot();
      TB.fill(SALES);
      const T = TB.T;
      T.select('B3');
      T.command('insert.pivot');
      const dlg = await TB.dialog();
      expect(dlg.querySelector('[aria-label="Source range"]').value).toBe('A1:D8');
      expect(dlg.querySelector('[aria-label="Rows"]').value).toBe('Region');
      expect(dlg.querySelector('[aria-label="Value field"]').value).toBe('Sales');
      TB.set(dlg, 'Columns', 'Quarter');
      await TB.ok(dlg);
      expect(T.sheet.name).toBe('Pivot 1');
      expect(grid(T, 5, 4)).toEqual([
        ['Region', 'Q1', 'Q2', 'Total'], ['East', 64, 75, 139], ['North', 150, 150, 300], ['South', 80, 120, 200], ['Grand total', 294, 345, 639]]);
      expect(T.wb.style(T.sheet.get(4, 0).s).b).toBe(true);
      expect(T.sheet.pivots[0].source).toEqual({ sheet: 'Sheet1', ref: 'A1:D8' });
      T.flush();
      expect(TB.doc.getElementById('sideObjects').textContent).toMatch(/Pivot table 1/);
    });

    it('the sidebar Refresh brings in source edits; undo puts the old numbers back', async () => {
      const T = TB.T, src = T.wb.sheets[0];
      T.wb.input(src, 1, 3, '1000');
      expect(T.sheet.value(2, 3)).toBe(300);
      const btn = [...TB.doc.querySelectorAll('#sideObjects button')].find((b) => b.textContent === 'Refresh');
      btn.click();
      expect(T.sheet.value(2, 3)).toBe(1200);
      expect(T.sheet.value(4, 3)).toBe(1539);
      T.undo();
      expect(T.wb.sheets[1].value(2, 3)).toBe(300);
      T.redo();
    });

    it('a place on the same sheet asks before replacing cells, then writes Count and Average there', async () => {
      const T = TB.T;
      TB.doc.querySelectorAll('#tabs .tab')[0].click();
      await sleep(30);
      T.setCell('G1', 'in the way');
      T.select('A1');
      T.command('insert.pivot');
      const dlg = await TB.dialog();
      TB.set(dlg, 'Rows', 'Rep');
      dlg.querySelector('[aria-label="Summarize by"]').value = 'count';
      TB.button(dlg, '+ Add value').click();
      const fns = dlg.querySelectorAll('[aria-label="Summarize by"]');
      fns[1].value = 'average';
      TB.set(dlg, 'Put it in', 'here');
      TB.set(dlg, 'Top-left cell', 'F1');
      dlg.querySelector('.sui-primary').click();
      const ask = await waitFor(() => { const b = [...TB.doc.querySelectorAll('.sui-back:not(.sui-out) .sui-dlg')]; return b.find((x) => /Replace cells/.test(x.textContent)); });
      ask.querySelector('.sui-primary').click();
      await TB.dialogGone();
      expect(T.sheet.name).toBe('Sheet1');
      expect(T.sheet.value(0, 6)).toBe('Count of Sales');
      expect(T.sheet.value(0, 7)).toBe('Average of Sales');
      expect(T.sheet.value(1, 5)).toBe('Ann');
      expect(T.sheet.value(1, 6)).toBe(2);
      expect(T.sheet.value(1, 7)).toBe(575);
      expect(T.wb.style(T.sheet.get(1, 7).s).nf).toBe('#,##0.00');
    });

    it('right-click in a pivot table offers Refresh, Edit and Delete; Edit changes the summary', async () => {
      const T = TB.T;
      T.flush();
      const cell = TB.doc.querySelector('#cells [data-rc="1,6"]');
      const r = cell.getBoundingClientRect();
      cell.dispatchEvent(new TB.win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 }));
      const menu = await waitFor(() => TB.doc.querySelector('.sui-menu'));
      expect(menu.textContent).toMatch(/Refresh pivot table/);
      expect(menu.textContent).toMatch(/Delete pivot table/);
      [...menu.querySelectorAll('.sui-row')].find((x) => /Edit pivot table/.test(x.textContent)).click();
      const dlg = await TB.dialog();
      expect(dlg.querySelector('.sui-title').textContent).toBe('Edit pivot table');
      dlg.querySelectorAll('[aria-label="Summarize by"]')[0].value = 'max';
      await TB.ok(dlg);
      expect(T.sheet.value(0, 6)).toBe('Max of Sales');
      expect(T.sheet.value(1, 6)).toBe(1000);
    });

    it('pivot tables are saved with the workbook and refresh after reopening', async () => {
      const win = await TB.saveAndReopen();
      const T2 = win.SlopTables;
      const out = T2.wb.sheetByName('Pivot 1');
      expect(out.pivots.length).toBe(1);
      expect(T2.wb.sheets[0].pivots[0].values.map((v) => v.fn)).toEqual(['max', 'average']);
      T2.wb.input(T2.wb.sheets[0], 7, 3, '1');
      T2.command('data.refreshPivots');
      expect(out.value(1, 1)).toBe(1);
    });

    it('renaming the source sheet keeps the pivot table working', async () => {
      const T = TB.T;
      TB.doc.querySelectorAll('#tabs .tab')[0].click();
      await sleep(20);
      const renaming = T.command('sheet.rename');
      const dlg = await TB.dialog();
      dlg.querySelector('input').value = 'Data 2026';
      await TB.ok(dlg);
      await renaming;
      expect(T.wb.sheetByName('Pivot 1').pivots[0].source.sheet).toBe('Data 2026');
      T.command('data.refreshPivots');
      await sleep(20);
      expect(TB.doc.querySelector('.sui-back:not(.sui-out)')).toBe(null);
      expect(T.wb.sheetByName('Pivot 1').value(4, 3)).toBe(1539);
    });
  });
})();
