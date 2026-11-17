// Slop Sheets: the parser in shared/sheets (CSV, TSV, XLSX, number formats) run in Node. Node has no DOMParser, so a
// small XML reader stands in for it here (only what shared/office/xml.js calls). Fixtures are built in the test.
// Run: node --test tests/node/sheets-read.test.mjs    (or: node tests/run.mjs sheets-read)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globalI18n } from './ui-i18n-env.mjs';

const EN = globalI18n('en');   // the reader's messages, as a page has them (shared/i18n/ui/en/sheets.js)

// ---- minimal DOMParser: elements with namespaces, attributes, text; enough for shared/office/xml.js ----
const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const unescape = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m));
class Node {
  constructor(type) { this.nodeType = type; this.childNodes = []; this.parentNode = null; }
  get firstChild() { return this.childNodes[0] ?? null; }
  get nextSibling() { if (!this.parentNode) return null; const k = this.parentNode.childNodes; return k[k.indexOf(this) + 1] ?? null; }
  get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.map((c) => c.textContent).join(''); }
  getElementsByTagNameNS(ns, local) {
    const out = [];
    const walk = (n) => { for (const c of n.childNodes) if (c.nodeType === 1) { if ((ns === '*' || c.namespaceURI === ns) && (local === '*' || c.localName === local)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
}
class Elem extends Node {
  constructor(qname, attrs, scope) {
    super(1);
    this.nodeName = qname;
    const i = qname.indexOf(':');
    this.prefix = i < 0 ? null : qname.slice(0, i);
    this.localName = i < 0 ? qname : qname.slice(i + 1);
    this.namespaceURI = scope[this.prefix ?? ''] ?? null;
    this.attributes = attrs.map(([name, value]) => {
      const j = name.indexOf(':');
      const prefix = j < 0 ? null : name.slice(0, j);
      return { name, value, local: j < 0 ? name : name.slice(j + 1), ns: prefix ? scope[prefix] ?? null : null };
    });
  }
  getAttribute(name) { const a = this.attributes.find((x) => x.name === name); return a ? a.value : null; }
  getAttributeNS(ns, local) { const a = this.attributes.find((x) => x.ns === ns && x.local === local); return a ? a.value : null; }
  hasAttributeNS(ns, local) { return this.attributes.some((x) => x.ns === ns && x.local === local); }
}
function parseXmlDoc(src) {
  const doc = new Node(9);
  const stack = [{ node: doc, scope: { xml: 'http://www.w3.org/XML/1998/namespace' } }];
  const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = tag.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) { const t = new Node(3); t.data = m[1]; t.parentNode = top.node; top.node.childNodes.push(t); continue; }
    if (m[2] !== undefined) { stack.pop(); continue; }
    if (m[3] !== undefined) {
      const attrs = [...m[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((a) => [a[1], unescape(a[2] ?? a[3])]);
      const scope = { ...top.scope };
      for (const [n, v] of attrs) if (n === 'xmlns') scope[''] = v; else if (n.startsWith('xmlns:')) scope[n.slice(6)] = v;
      const el = new Elem(m[3], attrs, scope);
      el.parentNode = top.node; top.node.childNodes.push(el);
      if (!m[5]) stack.push({ node: el, scope });
      continue;
    }
    if (m[6] !== undefined) {
      const t = new Node(3); t.data = unescape(m[6]); t.parentNode = top.node; top.node.childNodes.push(t);
    }
  }
  const doc2 = { nodeType: 9, get documentElement() { return doc.childNodes.find((c) => c.nodeType === 1) ?? null; }, getElementsByTagName: () => [] };
  doc2.getElementsByTagNameNS = (ns, l) => doc.getElementsByTagNameNS(ns, l);
  return doc2;
}
globalThis.DOMParser = class { parseFromString(s) { return parseXmlDoc(String(s)); } };

const { read, UNSUPPORTED } = await import('../../shared/sheets/read.js');
const { formatNumber, serialOf, isDateCode } = await import('../../shared/sheets/numfmt.js');
const { csvBlob } = await import('../../shared/sheets/csv.js');
const { writeZip } = await import('../../shared/office/zip.js');

const enc = (s) => new TextEncoder().encode(s);
const csvFile = (text, name = 'data.csv') => new Blob([enc(text)], { type: 'text/csv' }) && Object.assign(new Blob([enc(text)]), { name });

// ---- XLSX fixture builder ----
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const cS = (ref, idx, s = 0) => `<c r="${ref}" t="s"${s ? ` s="${s}"` : ''}><v>${idx}</v></c>`;
const cN = (ref, v, s = 0) => `<c r="${ref}"${s ? ` s="${s}"` : ''}><v>${v}</v></c>`;
const cI = (ref, text) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
const cB = (ref, v) => `<c r="${ref}" t="b"><v>${v}</v></c>`;
const cE = (ref, code) => `<c r="${ref}" t="e"><v>${code}</v></c>`;
const cF = (ref, f, v, t) => `<c r="${ref}"${t ? ` t="${t}"` : ''}><f>${f}</f><v>${v}</v></c>`;
const sheetXml = (rows) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}" xmlns:r="${RNS}"><sheetData>${rows.map(([r, cells]) => `<row r="${r}">${cells.join('')}</row>`).join('')}</sheetData></worksheet>`;
const STYLES = `<?xml version="1.0"?><styleSheet xmlns="${NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.00%"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/></font><font><b/><sz val="11"/></font></fonts>` +
  `<cellXfs count="5"><xf numFmtId="0" fontId="0"/><xf numFmtId="14" fontId="0"/><xf numFmtId="164" fontId="0"/><xf numFmtId="0" fontId="1"/><xf numFmtId="0" fontId="0"/></cellXfs></styleSheet>`;
async function xlsxFile(sheets, shared, name = 'book.xlsx') {
  const parts = [
    ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${RNS}"><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="x" Target="${s.target || `worksheets/sheet${i + 1}.xml`}"/>`).join('')}</Relationships>`],
    ['xl/styles.xml', STYLES],
    ['xl/sharedStrings.xml', `<?xml version="1.0"?><sst xmlns="${NS}">${shared.map((t) => (t.startsWith('<') ? `<si>${t}</si>` : `<si><t>${t}</t></si>`)).join('')}</sst>`],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)]),
  ];
  const blob = await writeZip(parts.map(([path, data]) => ({ path, data })));
  return Object.assign(blob, { name });
}
const SERIAL_2026_10_11 = serialOf(new Date(Date.UTC(2026, 9, 11)));

// ---- CSV and TSV ----
test('CSV: quotes, doubled quotes, quoted line breaks, CRLF, BOM and no phantom row at the end', async () => {
  const text = '﻿name,qty,code\r\n"Smith, J",3,007\r\n"say ""hi""",1e3,\r\n"line\nbreak",,x\r\n';
  const { format, sheets: [s] } = await read(csvFile(text));
  assert.equal(format, 'csv');
  assert.equal(s.height, 4);
  assert.equal(s.width, 3);
  assert.deepEqual(s.text[0], ['name', 'qty', 'code']);
  assert.deepEqual(s.text[1], ['Smith, J', '3', '007']);
  assert.deepEqual(s.text[2], ['say "hi"', '1e3', '']);
  assert.deepEqual(s.text[3], ['line\nbreak', '', 'x']);
});

test('CSV: plain numbers are typed as numbers, but 007 and 16+ digit IDs stay text', async () => {
  const { sheets: [s] } = await read(csvFile('a,b,c,d\n3,007,12345678901234567,\n-0.5,1e3,TRUE,\n'));
  assert.equal(s.rows[1][0], 3);
  assert.equal(s.rows[1][1], '007');
  assert.equal(s.rows[1][2], '12345678901234567');
  assert.equal(s.rows[1][3], null);
  assert.equal(s.rows[2][0], -0.5);
  assert.equal(s.rows[2][1], 1000);
  assert.equal(s.rows[2][2], 'TRUE');
});

test('CSV: text that is not UTF-8 is read as Latin-1', async () => {
  const bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0a, 0x31]); // "caf" + e-acute (Latin-1) + newline + "1"
  const { sheets: [s] } = await read(Object.assign(new Blob([bytes]), { name: 'latin.csv' }));
  assert.equal(s.text[0][0], 'café');
  assert.equal(s.text[1][0], '1');
});

test('TSV: by extension, and sniffed from the first line when there is no extension', async () => {
  const tsv = await read(Object.assign(new Blob([enc('a\tb\n1\t2\n')]), { name: 'x.tsv' }));
  assert.equal(tsv.format, 'tsv');
  assert.deepEqual(tsv.sheets[0].text, [['a', 'b'], ['1', '2']]);
  const sniffed = await read(Object.assign(new Blob([enc('a\tb\n')]), { name: 'noext' }));
  assert.equal(sniffed.format, 'tsv');
});

test('CSV: an empty file has no rows', async () => {
  const { sheets: [s] } = await read(csvFile(''));
  assert.equal(s.height, 0);
  assert.equal(s.width, 0);
});

test('CSV writer output reads back to the same text', async () => {
  const text = 'a,b\r\n"x, y","say ""hi"""\r\n"two\nlines",3\r\n';
  const { sheets: [s] } = await read(csvFile(text));
  const back = await read(csvBlob(s));
  assert.deepEqual(back.sheets[0].text, s.text);
  const tsv = await read(Object.assign(csvBlob(s, null, '\t'), { name: 'o.tsv' }));
  assert.equal(tsv.sheets[0].text[1][1], 'say "hi"');
});

test('XLS and ODS are refused with the reason, and a broken XLSX says so', async () => {
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
  await assert.rejects(read(Object.assign(new Blob([ole]), { name: 'old.xls' })), (e) => e.message === EN.t(UNSUPPORTED) && /^Old \.xls files/.test(e.message));
  await assert.rejects(read(Object.assign(new Blob([enc('not zip')]), { name: 'bad.xlsx' })), /not a valid workbook/);
  globalI18n('sv');   // the message is in the chosen language
  try {
    await assert.rejects(read(Object.assign(new Blob([ole]), { name: 'old.xls' })), /^Error: Gamla \.xls-filer stöds inte/);
    await assert.rejects(read(Object.assign(new Blob([enc('not zip')]), { name: 'bad.xlsx' })), /ingen giltig arbetsbok/);
  } finally { globalThis.SlopI18n = EN; }
});

// ---- XLSX ----
test('XLSX: sheet names, shared and inline strings, rich text, booleans, errors and formula results', async () => {
  const file = await xlsxFile([
    { name: 'Sales', rows: [
      [1, [cS('A1', 0, 3), cS('B1', 1, 3), cS('C1', 2, 3), cS('D1', 3, 3)]],
      [2, [cS('A2', 4), cN('B2', 1234.5), cN('C2', SERIAL_2026_10_11, 1), cN('D2', 0.125, 2)]],
      [4, [cI('A4', 'Note with &lt;tags&gt; &amp; more'), cB('B4', 1)]],
      [5, [cF('B5', 'B2*2', 2469)]],
    ] },
    { name: 'Notes', target: '/xl/worksheets/sheet2.xml', rows: [[1, [cI('A1', 'Hello')]], [2, [cE('B2', '#DIV/0!')]]] },
  ], ['Item', 'Price', 'Date', 'Share', 'Pen']);
  const r = await read(file);
  assert.equal(r.format, 'xlsx');
  assert.deepEqual(r.sheets.map((s) => s.name), ['Sales', 'Notes']);
  const [s, n] = r.sheets;
  assert.equal(s.width, 4);
  assert.equal(s.height, 5);
  assert.deepEqual(s.text[0], ['Item', 'Price', 'Date', 'Share']);
  assert.ok(s.bold.has(0 * 16384 + 0), 'header is bold');
  assert.equal(s.rows[1][0], 'Pen');
  assert.equal(s.rows[1][1], 1234.5);
  assert.equal(s.text[1][1], '1234.5');
  assert.ok(s.rows[1][2] instanceof Date);
  assert.equal(s.rows[1][2].toISOString().slice(0, 10), '2026-10-11');
  assert.equal(s.text[1][2], '10/11/2026');
  assert.equal(s.text[1][3], '12.50%');
  assert.deepEqual(s.rows[2], [null, null, null, null], 'an empty row between data rows is blank');
  assert.equal(s.text[2][0], '');
  assert.equal(s.text[3][0], 'Note with <tags> & more');
  assert.equal(s.rows[3][1], true);
  assert.equal(s.text[3][1], 'TRUE');
  assert.equal(s.rows[4][1], 2469);
  assert.equal(n.text[0][0], 'Hello');
  assert.equal(n.rows[1][1], '#DIV/0!');
});

test('XLSX: rich text runs join up, and phonetic runs are not added', async () => {
  const si = '<r><t>Hel</t></r><r><t>lo</t></r><rPh><t>X</t></rPh>';
  const file = await xlsxFile([{ name: 'S', rows: [[1, [cS('A1', 0)]]] }], [si]);
  const { sheets: [s] } = await read(file);
  assert.equal(s.text[0][0], 'Hello');
});

test('XLSX: a worksheet with no cells is an empty sheet', async () => {
  const { sheets: [s] } = await read(await xlsxFile([{ name: 'Empty', rows: [] }], []));
  assert.equal(s.height, 0);
});

// ---- number formats ----
test('number formats: grouping, decimals, percent, negatives, literals and colour blocks', () => {
  assert.equal(formatNumber(1234.5, '#,##0.00'), '1,234.50');
  assert.equal(formatNumber(-1234.5, '#,##0.00'), '-1,234.50');
  assert.equal(formatNumber(0.125, '0.00%'), '12.50%');
  assert.equal(formatNumber(0.5, '0%'), '50%');
  assert.equal(formatNumber(-42, '0;(0)'), '(42)');
  assert.equal(formatNumber(7, '00'), '07');
  assert.equal(formatNumber(12, '"Total: "0 "units"'), 'Total: 12 units');
  assert.equal(formatNumber(5, '[Red]0.0'), '5.0');
  assert.equal(formatNumber(1234567, '[$$-409]#,##0'), '$1,234,567');
  assert.equal(formatNumber(0.00012, '0.00E+00'), '1.20E-04');
  assert.equal(formatNumber(0.1 + 0.2, 'General'), '0.3');
  assert.equal(formatNumber(true, 'General'), 'TRUE');
});

test('number formats: dates and times, with 12-hour clocks and duration totals', () => {
  const d = new Date(Date.UTC(2026, 9, 11));
  assert.equal(formatNumber(d, 'd mmm yyyy'), '11 Oct 2026');
  assert.equal(formatNumber(d, 'm/d/yyyy'), '10/11/2026');
  assert.equal(formatNumber(d, 'dddd'), 'Sunday');
  assert.equal(formatNumber(0.75, 'h:mm AM/PM'), '6:00 PM');
  assert.equal(formatNumber(1.5, 'h:mm'), '12:00');
  assert.equal(formatNumber(45000.5, 'yyyy-mm-dd hh:mm:ss'), '2023-03-15 12:00:00');
  assert.equal(formatNumber(1.25, '[h]:mm'), '30:00');
  assert.equal(formatNumber(3.5, '[h]:mm:ss'), '84:00:00');
  assert.ok(isDateCode('d-mmm-yy'));
  assert.ok(!isDateCode('0.00'));
  assert.ok(!isDateCode('"days "0'), 'quoted letters are not date codes');
});

test('what a file holds that is not imported is listed in the chosen language', async () => {
  const { skippedParts } = await import('../../shared/sheets/xlsx-charts.js');
  const files = new Map([['xl/media/image1.png', new Uint8Array(1)], ['xl/vbaProject.bin', new Uint8Array(1)]]);
  assert.deepEqual(skippedParts(files, true), ['pictures', 'chart sheets', 'macros']);
  globalI18n('sv');
  try { assert.deepEqual(skippedParts(files, true), ['bilder', 'diagramblad', 'makron']); } finally { globalThis.SlopI18n = EN; }
});
