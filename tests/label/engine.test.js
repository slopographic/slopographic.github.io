/* SlopLabel engine tests: units, check digits, Code 128, barcode validation, variables, CSV, JSON, xlsx. */
(function () {
  const { describe, it, expect } = SlopTest;

  describe('units', () => {
    it('converts mm, inches, points and printer dots', () => {
      expect(W.toMM(1, 'in')).toBe(25.4);
      expect(W.fromMM(25.4, 'dots', 203)).toBeCloseTo(203);
      expect(W.toMM(203, 'dots', 203)).toBeCloseTo(25.4);
      expect(W.fromMM(25.4, 'pt')).toBeCloseTo(72);
      expect(W.mmToDots(25.4, 300)).toBe(300);
      expect(W.mmToDots(10, 203)).toBe(80);
      expect(W.dotsToMM(8, 203)).toBeCloseTo(1.0010, 1e-3);
    });
    it('formats lengths without trailing zeros', () => {
      expect(W.num(12.5)).toBe('12.5');
      expect(W.num(3)).toBe('3');
      expect(W.num(0.12345, 3)).toBe('0.123');
      expect(W.fmtLen(25.4, 'in', 203)).toBe('1"');
      expect(W.fmtLen(10, 'mm', 203)).toBe('10 mm');
      expect(W.fmtLen(25.4, 'dots', 203)).toBe('203 dots');
      expect(W.clamp(5, 0, 3)).toBe(3);
      expect(W.round(1.23456, 2)).toBe(1.23);
    });
  });

  describe('check digits', () => {
    it('computes GS1 mod-10 check digits', () => {
      expect(W.gs1Check('400638133393')).toBe('1'); // EAN-13 4006381333931
      expect(W.gs1Check('590123412345')).toBe('7'); // 5901234123457
      expect(W.gs1Check('9638507')).toBe('4'); // EAN-8 96385074
      expect(W.gs1Check('03600029145')).toBe('2'); // UPC-A 036000291452
      expect(W.gs1Check('1540014128876')).toBe('3'); // ITF-14 15400141288763
      expect(W.gs1Check('00614141123456789')).toBe('0'); // SSCC 006141411234567890
    });
    it('expands UPC-E and checks Code 39 mod 43', () => {
      expect(W.upceToUpca('0425261')).toBe('04210000526');
      expect(W.upceCheck('0425261')).toBe('4');
      expect(W.code39Mod43('CODE39')).toBe('W');
    });
    it('normalises barcode data and explains mistakes', () => {
      expect(W.normalizeBarcode('ean13', '400638133393').data).toBe('4006381333931');
      expect(W.normalizeBarcode('ean13', '4006381333931').data).toBe('4006381333931');
      expect(() => W.normalizeBarcode('ean13', '4006381333932')).toThrow(/check digit should be 1/);
      expect(() => W.normalizeBarcode('ean13', '40063813')).toThrow(/needs 12 digits/);
      expect(() => W.normalizeBarcode('ean8', '96385O7')).toThrow(/digits only/);
      expect(W.normalizeBarcode('itf14', '1540014128876').text).toBe('1 54 00141 28876 3');
      expect(W.normalizeBarcode('upce', '425261').data).toBe('04252614');
      expect(() => W.normalizeBarcode('code39', 'abc*')).toThrow(/not allowed/);
      expect(W.normalizeBarcode('codabar', '12345').data).toBe('A12345A');
    });
    it('parses and validates GS1 element strings', () => {
      const els = W.parseGS1('(01)0950110153000(10)LOT42');
      expect(els).toEqual([{ ai: '01', value: '09501101530003' }, { ai: '10', value: 'LOT42' }]);
      expect(W.gs1Raw(els)).toBe('0109501101530003' + '10LOT42');
      expect(W.gs1Raw([{ ai: '10', value: 'A' }, { ai: '01', value: '09501101530003' }])).toBe('10A\x1d0109501101530003');
      expect(W.gs1FromRaw('0109501101530003' + '10LOT42')).toEqual(els);
      expect(() => W.parseGS1('(17)251399')).toThrow(/YYMMDD/);
      expect(() => W.parseGS1('01123')).toThrow(/brackets/);
      expect(() => W.parseGS1('(99999)x')).toThrow();
    });
  });

  describe('Code 128', () => {
    it('encodes subset B with the right check value', () => {
      expect(W.code128Encode('ABC123')).toEqual([104, 33, 34, 35, 17, 18, 19, 67, 106]);
    });
    it('uses subset C for digit runs and switches in the middle', () => {
      const v = W.code128Encode('123456');
      expect(v.slice(0, 4)).toEqual([105, 12, 34, 56]);
      const m = W.code128Encode('AB123456CD');
      expect(m.slice(0, 7)).toEqual([104, 33, 34, 99, 12, 34, 56]);
      expect(m[7]).toBe(100); // back to B
    });
    it('starts GS1-128 with FNC1 and separates variable fields', () => {
      const v = W.code128Encode('10A\x1d0109501101530003', { gs1: true });
      expect(v[0]).toBe(105); expect(v[1]).toBe(102);
      expect(v.includes(102, 2)).toBe(true);
    });
    it('turns values into bar widths of 11 modules each', () => {
      const w = W.code128Widths(W.code128Encode('Hi'));
      const total = w.reduce((a, b) => a + b, 0);
      expect(total).toBe(11 * 4 + 13); // start, H, i, check + 13-module stop
      expect(() => W.code128Encode('naïve')).toThrow(/ASCII/);
    });
  });

  describe('variables', () => {
    it('interpolates fields with filters and leaves unknown names', () => {
      const get = (n) => ({ Name: 'gadget', Price: '4.5', Code: '42' }[n]);
      expect(W.interpolate('{Name|upper} costs {Price|fixed:2}', get)).toBe('GADGET costs 4.50');
      expect(W.interpolate('{Code|pad:6}-{Missing}', get)).toBe('000042-{Missing}');
      expect(W.interpolate('{{literal}} {Price|mul:2}', get)).toBe('{literal} 9');
      expect(W.interpolate('{Name|left:3}{Name|right:2}', get)).toBe('gadet');
      expect(W.varRefs('{A} and {B|upper} {{x}}')).toEqual(['A', 'B']);
    });
    it('resolves prompts, counters, dates, formulas and system fields', () => {
      const d = W.newDoc();
      d.vars.push(W.makeVar('prompt', 'Lot', { def: 'L1' }), W.makeVar('counter', 'Serial', { start: 7, pad: 4, prefix: 'S' }),
        W.makeVar('date', 'BB', { format: 'DD.MM.YYYY', days: 10, fixed: '2024-02-25' }), W.makeVar('formula', 'Combo', { expr: '{Lot}/{Serial}' }),
        W.makeVar('formula', 'Loop', { expr: '{Loop}x' }));
      const get = W.makeResolver(d, { index: 2, prompts: { Lot: 'L9' } });
      expect(get('Lot')).toBe('L9');
      expect(get('Serial')).toBe('S0009');
      expect(get('BB')).toBe('06.03.2024');
      expect(get('Combo')).toBe('L9/S0009');
      expect(get('LABEL_NO')).toBe('3');
      expect(get('Loop')).toContain('#CYCLE');
    });
    it('formats dates and checks prompt answers', () => {
      const t = new Date(2026, 0, 5, 14, 7, 9);
      expect(W.formatDate(t, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-01-05 14:07:09');
      expect(W.formatDate(t, 'ddd D MMM YY, h A [week] WW')).toBe('Mon 5 Jan 26, 2 PM week 02');
      expect(W.formatDate(t, 'DDD')).toBe('005');
      const d = W.newDoc(); d.vars.push(W.makeVar('prompt', 'ZIP', { pattern: '\\d{5}', required: true }));
      expect(W.checkPrompts(d, { ZIP: '1234' })[0]).toContain('does not match');
      expect(W.checkPrompts(d, {})[0]).toContain('required');
      expect(W.checkPrompts(d, { ZIP: '12345' })).toEqual([]);
    });
  });

  describe('data sources', () => {
    it('parses CSV with quotes, embedded newlines, BOM and CRLF', () => {
      const rows = W.parseCSV('﻿Name,Note\r\n"Doe, Jane","said ""hi""\nthen left"\r\nBob,\r\n');
      expect(rows).toEqual([['Name', 'Note'], ['Doe, Jane', 'said "hi"\nthen left'], ['Bob', '']]);
    });
    it('detects semicolon and tab delimiters', () => {
      expect(W.parseCSV('a;b;c\n1;2;3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
      expect(W.parseCSV('a\tb\n"x;y"\t2')).toEqual([['a', 'b'], ['x;y', '2']]);
    });
    it('builds sources with unique headers and maps records', () => {
      const src = W.tableToSource([['SKU', '', 'SKU'], ['A1', 'x']]);
      expect(src.columns).toEqual(['SKU', 'Column2', 'SKU_2']);
      expect(src.rows).toEqual([['A1', 'x', '']]);
      const d = W.newDoc(); d.data = src; d.data.map = { Column2: 'Extra', SKU_2: '-' };
      expect(W.recordAt(d, 0)).toEqual({ SKU: 'A1', Extra: 'x' });
      expect(W.parseJSONSource('{"items":[{"a":1,"b":{"c":2}},{"a":3}]}').rows).toEqual([['1', '{"c":2}'], ['3', '']]);
    });
    it('reads an Excel .xlsx (shared and inline strings, numbers, dates, booleans)', async () => {
      const blob = makeXLSX();
      const rows = await W.readXLSX(await blob.arrayBuffer());
      expect(rows).toEqual([['SKU', 'Qty', 'Date', 'Ok'], ['SLP-1', '12', '2024-01-01', 'TRUE'], ['Inline', '2.5', '', 'FALSE']]);
      const src = await W.loadDataFile(new File([blob], 'stock.xlsx'));
      expect(src.columns).toEqual(['SKU', 'Qty', 'Date', 'Ok']);
    });
  });

  /* ---------- tiny .xlsx writer (stored zip) for the fixture ---------- */
  function crc32(u8) { let c, crc = -1; for (let i = 0; i < u8.length; i++) { c = (crc ^ u8[i]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ -1) >>> 0; }
  function zip(files) {
    const enc = new TextEncoder(), parts = [], dir = [];
    let off = 0;
    for (const [name, text] of Object.entries(files)) {
      const n = enc.encode(name), d = enc.encode(text), crc = crc32(d);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
      parts.push(new Uint8Array(h.buffer), n, d);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
      dir.push(new Uint8Array(c.buffer), n);
      off += 30 + n.length + d.length;
    }
    const size = dir.reduce((a, p) => a + p.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, Object.keys(files).length, true); e.setUint16(10, Object.keys(files).length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...dir, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function makeXLSX() {
    const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    return zip({
      'xl/workbook.xml': `<workbook ${ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Stock" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/data.xml"/></Relationships>',
      'xl/sharedStrings.xml': `<sst ${ns}><si><t>SKU</t></si><si><t>Qty</t></si><si><r><t>Da</t></r><r><t>te</t></r></si><si><t>Ok</t></si><si><t>SLP-1</t></si></sst>`,
      'xl/styles.xml': `<styleSheet ${ns}><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
      'xl/worksheets/data.xml': `<worksheet ${ns}><sheetData>` +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2"><v>12</v></c><c r="C2" s="1"><v>45292</v></c><c r="D2" t="b"><v>1</v></c></row>' +
        '<row r="4"><c r="A4" t="inlineStr"><is><t>Inline</t></is></c><c r="B4"><v>2.5</v></c><c r="D4" t="b"><v>0</v></c></row>' +
        '</sheetData></worksheet>',
    });
  }
})();
