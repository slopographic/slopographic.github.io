/* Slop Tables: CSV and XLSX export, and the native file round trip. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const readText = async (blob, name) => {
    const { readZip, readText: rt } = await import('../../shared/office/zip.js');
    const files = await readZip(blob);
    return rt(files, name);
  };

  describe('CSV', () => {
    it('exports the used range as displayed, with quoting and CRLF', async () => {
      await TB.boot();
      const T = TB.T;
      T.setCell('A1', 'Name');
      T.setCell('B1', 'Qty');
      T.setCell('A2', 'Pen');
      T.setCell('B2', '=2*3');
      T.setCell('A3', 'Hi, there');
      expect(T.csv()).toBe('Name,Qty\r\nPen,6\r\n"Hi, there",\r\n');
    });
    it('exports numbers with their number format applied', () => {
      const T = TB.T;
      T.select('B2');
      const nf = TB.doc.getElementById('nf');
      nf.value = '0.00';
      nf.dispatchEvent(new Event('change'));
      expect(T.csv()).toBe('Name,Qty\r\nPen,6.00\r\n"Hi, there",\r\n');
    });
    it('quotes embedded quotes and keeps leading zeros as text', () => {
      const T = TB.T;
      T.setCell('D1', 'say "hi"');
      T.setCell('D2', "'0042");
      const lines = T.csv().split('\r\n');
      expect(lines[0]).toBe('Name,Qty,,"say ""hi"""');
      expect(lines[1]).toBe('Pen,6.00,,0042');
    });
    it('the File ▸ Download CSV command saves the active sheet as a .csv file', async () => {
      const ui = TB.win.SlopUI, real = ui.download;
      let got = null;
      ui.download = (blob, name) => { got = { blob, name }; };
      try { TB.T.command('file.csv'); } finally { ui.download = real; }
      expect(got).toBeTruthy();
      expect(got.name).toBe('Untitled spreadsheet.csv');
      expect(await got.blob.text()).toMatch(/^Name,Qty/);
    });
  });

  describe('XLSX', () => {
    it('writes a valid package with values, formulas and styles', async () => {
      const T = TB.T;
      const blob = await T.xlsx();
      expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const sheet = await readText(blob, 'xl/worksheets/sheet1.xml');
      expect(sheet).toMatch(/<c r="A2" t="inlineStr"><is><t xml:space="preserve">Pen<\/t><\/is><\/c>/);
      expect(sheet).toMatch(/<c r="B2" s="\d+"><f>2\*3<\/f><v>6<\/v><\/c>/);
      const wbx = await readText(blob, 'xl/workbook.xml');
      expect(wbx).toMatch(/<sheet name="Sheet1" sheetId="1" r:id="rId1"\/>/);
      const styles = await readText(blob, 'xl/styles.xml');
      expect(styles).toMatch(/<xf numFmtId="2" fontId="0"/);
      expect(styles).toMatch(/<cellXfs count="\d+">/);
      const ct = await readText(blob, '[Content_Types].xml');
      expect(ct).toMatch(/spreadsheetml\.worksheet\+xml/);
    });
    it('keeps bold, number formats and column widths', async () => {
      const T = TB.T;
      T.select('A2');
      TB.doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
      T.sheet.colProp(1).w = 200;
      const blob = await T.xlsx();
      const sheet = await readText(blob, 'xl/worksheets/sheet1.xml');
      expect(sheet).toMatch(/<col min="2" max="2" width="28\.57"/);
      const styles = await readText(blob, 'xl/styles.xml');
      expect(styles).toMatch(/<b\/>/);
      T.undo();
    });
  });

  describe('native file', () => {
    it('round-trips through the .stab JSON format', async () => {
      const T = TB.T;
      const blob = T.native();
      const obj = JSON.parse(await blob.text());
      expect(obj.format).toBe('slop-tables');
      expect(obj.sheets[0].cells.length).toBeGreaterThan(3);
      expect(blob.type).toBe('application/x-slop-table');
    });
  });
})();
