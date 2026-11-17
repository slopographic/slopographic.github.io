/* Slop Tables charts: Insert ▸ Chart… from the selected range, the picture following cell edits, move and resize on the
   grid with undo, edit (type, series in rows), delete with the key, the .stab round trip through Slop Drive, and the chart
   part in the XLSX export. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const box = () => TB.doc.querySelector('#objects .chart-box');
  const marks = () => [...box().querySelectorAll('.mark')];
  const chart = () => TB.T.sheet.charts[0];

  describe('charts', () => {
    it('Insert ▸ Chart… charts the selected range: one bar per value, a legend for two series, the title', async () => {
      await TB.boot();
      TB.fill([['Month', 'North', 'South'], ['Jan', 120, 80], ['Feb', 135, 95], ['Mar', 150, 90]]);
      const T = TB.T;
      T.S.sel = { r: 0, c: 0, er: 3, ec: 2 };
      const menuBtn = [...TB.doc.querySelectorAll('#menus .menu-b')].find((b) => b.textContent === 'Insert');
      expect(!!menuBtn).toBe(true);
      menuBtn.click();
      const row = await waitFor(() => [...TB.doc.querySelectorAll('.sui-menu .sui-row')].find((r) => /Chart…/.test(r.textContent)));
      row.click();
      const dlg = await TB.dialog();
      expect(dlg.querySelector('[aria-label="Data range"]').value).toBe('A1:C4');
      await waitFor(() => dlg.querySelectorAll('.chart-preview .mark').length === 6);
      TB.set(dlg, 'Chart title', 'Sales by month');
      await TB.ok(dlg);
      T.flush();
      expect(T.sheet.charts.length).toBe(1);
      expect(chart().type).toBe('column');
      expect(chart().range).toBe('A1:C4');
      expect(marks().length).toBe(6);
      expect(box().querySelector('.legend').textContent).toMatch(/North.*South/);
      expect(box().querySelector('svg').getAttribute('aria-label')).toBe('Sales by month');
      expect(box().classList.contains('on')).toBe(true);
      expect(T.S.file.dirty).toBeTruthy();
    });

    it('the picture follows cell edits at once', async () => {
      const T = TB.T;
      T.setCell('B2', '400');
      T.setCell('C4', '=B2/2');
      T.flush();
      const tips = marks().map((m) => m.querySelector('title').textContent);
      expect(tips).toContain('Jan · North: 400');
      expect(tips).toContain('Mar · South: 200');
    });

    it('dragging moves it and a corner handle resizes it; each is one undo step', async () => {
      const T = TB.T, x0 = chart().x, y0 = chart().y, w0 = chart().w;
      await TB.drag(box(), 60, 40);
      expect(chart().x).toBe(x0 + 60);
      expect(chart().y).toBe(y0 + 40);
      T.flush();
      await TB.drag(box().querySelector('.chart-h[data-h="se"]'), 50, 30);
      expect(chart().w).toBe(w0 + 50);
      T.undo(); T.flush();
      expect(chart().w).toBe(w0);
      T.undo(); T.flush();
      expect(chart().x).toBe(x0);
    });

    it('double-click edits it: a pie of the first series, or the rows as series', async () => {
      const T = TB.T;
      T.flush();
      box().dispatchEvent(new TB.win.MouseEvent('dblclick', { bubbles: true }));
      let dlg = await TB.dialog();
      expect(dlg.querySelector('.sui-title').textContent).toBe('Edit chart');
      TB.set(dlg, 'Chart title', 'Share');
      dlg.querySelector('select').value = 'pie';
      dlg.querySelector('select').dispatchEvent(new Event('change'));
      await TB.ok(dlg);
      T.flush();
      expect(chart().type).toBe('pie');
      expect(marks().length).toBe(3);
      expect(box().querySelector('.legend').textContent).toMatch(/Jan \d+%/);
      T.objects.editChart();
      dlg = await TB.dialog();
      dlg.querySelector('select').value = 'line';
      dlg.querySelector('select').dispatchEvent(new Event('change'));
      TB.set(dlg, 'Series in', 'rows');
      await TB.ok(dlg);
      T.flush();
      expect(chart().by).toBe('rows');
      expect(box().querySelector('.legend').textContent).toMatch(/Jan.*Feb.*Mar/);
    });

    it('Delete removes the selected chart; undo brings it back', async () => {
      const T = TB.T;
      T.objects.render();
      TB.T.S.chart = chart().id;
      await waitFor(() => !TB.doc.querySelector('.sui-back, .sui-menu')); // keys go to the grid once no dialog is up
      TB.key('Delete');
      T.flush();
      expect(T.sheet.charts.length).toBe(0);
      expect(box()).toBe(null);
      T.undo(); T.flush();
      expect(T.sheet.charts.length).toBe(1);
      expect(!!box()).toBe(true);
    });

    it('a saved workbook keeps its chart, and it draws again on reopen', async () => {
      const win = await TB.saveAndReopen();
      const T2 = win.SlopTables;
      await waitFor(() => win.document.querySelector('#objects .chart-box .mark'));
      expect(T2.sheet.charts.length).toBe(1);
      expect(T2.sheet.charts[0].title).toBe('Share');
      expect(T2.sheet.charts[0].by).toBe('rows');
    });

    it('the XLSX export holds the chart with its series references', async () => {
      const { readZip, readText } = await import('../../shared/office/zip.js');
      const files = await readZip(await TB.T.xlsx());
      const xml = readText(files, 'xl/charts/chart1.xml');
      expect(xml).toMatch(/<c:lineChart>/);
      expect(xml).toMatch(/Sheet1!\$B\$2:\$C\$2/);
      expect(readText(files, 'xl/worksheets/sheet1.xml')).toMatch(/<drawing r:id="rId1"\/>/);
      await sleep(10);
    });

    it('a range with no numbers says so in the dialog and inserts nothing', async () => {
      await TB.boot();
      TB.T.command('file.new'); // a fresh tab, whatever a slow start restored
      TB.fill([['a', 'b'], ['c', 'd']]);
      TB.T.S.sel = { r: 0, c: 0, er: 1, ec: 1 };
      const before = TB.T.sheet.charts.length;
      TB.T.command('insert.chart');
      const dlg = await TB.dialog();
      await waitFor(() => /no numbers/.test(dlg.querySelector('.chart-msg').textContent));
      dlg.querySelector('.sui-primary').click();
      await sleep(80);
      expect(TB.T.sheet.charts.length).toBe(before);
      dlg.querySelector('.sui-x').click();
      await TB.dialogGone();
    });
  });
})();
