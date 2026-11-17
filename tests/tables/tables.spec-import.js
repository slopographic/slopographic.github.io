/* Slop Tables: opening XLSX and ODS files (from this device, from Slop Drive and by a drop), what the notice says about the
   parts that were left out, and charts coming back from an XLSX export. Real files: the shared sample price list
   (shared/samples/docs.js, written by shared/sheets/write.js) and packages made here with shared/office/zip.js. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const zip = () => import('../../shared/office/zip.js');
  const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const tabCount = () => TB.T.tabs.api().tabs().length;

  describe('XLSX and ODS import', () => {
    it('File ▸ Open file reads a real .xlsx into a new, unsaved tab with values, formats and both sheets', async () => {
      await TB.boot();
      const before = tabCount();
      const file = await SlopSamples.docs.xlsx();
      expect(await TB.T.openFile(file)).toBeTruthy();
      expect(tabCount()).toBe(before + 1);
      const T = TB.T;
      expect(T.wb.sheets.map((s) => s.name)).toEqual(['Price list', 'Orders']);
      expect(T.value('A1')).toBe('SKU');
      expect(T.wb.style(T.sheet.get(0, 0).s).b).toBe(true);
      expect(T.value('D2')).toBe(2.85);
      expect(T.wb.style(T.sheet.get(1, 3).s).nf).toBe('#,##0.00');
      const orders = T.wb.sheets[1];
      expect(typeof orders.value(1, 1)).toBe('number');
      expect(T.wb.style(orders.get(1, 1).s).nf).toBe('yyyy-mm-dd');
      expect(T.S.file.name).toBe('Price list');
      expect(T.S.file.dirty).toBeTruthy();
      expect(T.S.file.driveId).toBe(null);
      expect(TB.doc.querySelector('.sui-back')).toBe(null); // nothing was left out, so no notice
      T.flush();
      expect(T.text('D2')).toBe('2.85');
    });

    it('an .xlsx in Slop Drive opens as an unsaved import, so the Excel file is never overwritten', async () => {
      const file = await SlopSamples.docs.xlsx();
      const id = await TB.hub.put(file, { name: 'Price list.xlsx', from: 'drive' });
      await TB.boot('?drive=' + id, 'app2');
      const T2 = TB.frame('app2').SlopTables;
      expect(T2.wb.sheets.length).toBe(2);
      expect(T2.value('B3')).toBe('Barista milk, 1 L');
      expect(T2.S.file.driveId).toBe(null);
      expect((await TB.hub.get(id)).type).toBe(XLSX);
    });

    it('a dropped .ods file opens with its formulas working; OpenFormula references are turned into A1 references', async () => {
      await TB.boot();
      const { writeZip } = await zip();
      const ns = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"';
      const cell = (v) => `<table:table-cell office:value-type="float" office:value="${v}"/>`;
      const content = `<office:document-content ${ns}><office:body><office:spreadsheet><table:table table:name="Costs">` +
        `<table:table-row><table:table-cell office:value-type="string"><text:p>Rent</text:p></table:table-cell>${cell(900)}</table:table-row>` +
        `<table:table-row><table:table-cell office:value-type="string"><text:p>Food</text:p></table:table-cell>${cell(250)}</table:table-row>` +
        '<table:table-row><table:table-cell/><table:table-cell table:formula="of:=SUM([.B1:.B2])" office:value-type="float" office:value="1150"/></table:table-row>' +
        '</table:table></office:spreadsheet></office:body></office:document-content>';
      const blob = await writeZip([{ path: 'mimetype', data: 'application/vnd.oasis.opendocument.spreadsheet' }, { path: 'content.xml', data: content }]);
      const file = new File([blob], 'Costs.ods', { type: 'application/vnd.oasis.opendocument.spreadsheet' });
      const dt = new TB.win.DataTransfer();
      dt.items.add(new TB.win.File([await file.arrayBuffer()], file.name, { type: file.type }));
      const grid = TB.doc.getElementById('grid');
      for (const type of ['dragenter', 'dragover', 'drop']) grid.dispatchEvent(new TB.win.DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      await waitFor(() => TB.T.wb.sheets[0].name === 'Costs');
      const T = TB.T;
      expect(T.sheet.get(2, 1).f).toBe('SUM(B1:B2)');
      T.setCell('B1', '1000');
      expect(T.value('B3')).toBe(1250);
    });

    it('a file with pictures and macros opens, and a notice names what was not imported', async () => {
      const { writeZip } = await zip();
      const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
      const parts = [
        ['[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
        ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`],
        ['xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'],
        ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1"><v>42</v></c></row></sheetData></worksheet>`],
        ['xl/media/image1.png', 'png'], ['xl/vbaProject.bin', 'vba'],
      ];
      const blob = await writeZip(parts.map(([path, data]) => ({ path, data })));
      const opening = TB.T.openFile(new TB.win.File([await blob.arrayBuffer()], 'Macro book.xlsm', { type: '' }));
      const box = await TB.dialog();
      expect(box.textContent).toMatch(/Opened with a few things left out/);
      expect(box.textContent).toMatch(/Not imported: pictures, macros\./);
      box.querySelector('.sui-primary').click();
      await TB.dialogGone();
      await opening;
      expect(TB.T.value('A1')).toBe(42);
    });

    it('an old .xls file is refused with the reason', async () => {
      const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
      const before = tabCount();
      const opening = TB.T.openFile(new TB.win.File([ole], 'old.xls', { type: 'application/vnd.ms-excel' }));
      const box = await TB.dialog();
      expect(box.textContent).toMatch(/\.xls files are not supported/);
      box.querySelector('.sui-primary').click();
      await TB.dialogGone();
      expect(await opening).toBe(false);
      expect(tabCount()).toBe(before);
    });

    it('charts written to XLSX by Slop Tables come back when that file is opened', async () => {
      await TB.boot();
      TB.fill([['Month', 'Sales'], ['Jan', 10], ['Feb', 14], ['Mar', 9]]);
      const T = TB.T;
      T.sheet.charts.push({ id: 'cx', type: 'bar', range: 'A1:B4', by: 'cols', title: 'Round trip', legend: false, x: 300, y: 30, w: 360, h: 240 });
      const blob = await T.xlsx();
      await T.openFile(new TB.win.File([await blob.arrayBuffer()], 'Round trip.xlsx', { type: XLSX }));
      await sleep(80);
      T.flush();
      const ch = T.sheet.charts[0];
      expect(ch.type).toBe('bar');
      expect(ch.range).toBe('A1:B4');
      expect(ch.title).toBe('Round trip');
      expect(TB.doc.querySelectorAll('#objects .chart-box').length).toBe(1);
    });
  });
})();
