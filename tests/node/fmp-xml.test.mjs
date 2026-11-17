// Covers: shared/fmp/xml.js
// The XML FileMaker writes: FMPXMLRESULT read as a table (metadata, rows, repeating fields, entities, CDATA, encodings,
// ragged rows, paging), and the kinds of XML that are only recognised (fmxmlsnippet, FMPReport).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadFmp, plain } from './fmp-fixture.mjs';

const F = loadFmp();
const enc = (s) => new TextEncoder().encode(s);
const open = (s, opts) => F.open(typeof s === 'string' ? enc(s) : s, opts || {});

const head = (fields, extra = '') => `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FMPXMLRESULT xmlns="http://www.filemaker.com/fmpxmlresult">
<ERRORCODE>0</ERRORCODE>
<PRODUCT BUILD="01/01/2020" NAME="FileMaker" VERSION="Pro 19.0"/>
<DATABASE DATEFORMAT="M/d/yyyy" LAYOUT="" NAME="People.fmp12" RECORDS="3" TIMEFORMAT="h:mm:ss a"/>
<METADATA>
${fields.map((f) => `<FIELD EMPTYOK="YES" MAXREPEAT="1" NAME="${f[0]}" TYPE="${f[1]}"${extra}/>`).join('\n')}
</METADATA>
<RESULTSET FOUND="3">
`;
const row = (...cols) => `<ROW MODID="0" RECORDID="1">${cols.map((c) => `<COL>${[].concat(c).map((d) => `<DATA>${d}</DATA>`).join('')}</COL>`).join('')}</ROW>\n`;
const FIELDS = [['Name', 'TEXT'], ['Age', 'NUMBER'], ['Born', 'DATE'], ['At', 'TIME'], ['Stamp', 'TIMESTAMP'], ['Photo', 'CONTAINER']];
const SAMPLE = head(FIELDS) + row('Ann', '30', '1/2/1990', '1:02:03 PM', '1/2/1990 1:02:03 PM', '') + row('Bob &amp; Co', '', '', '', '', '') + row(['x', 'y', 'z'], '5', '', '', '', '') + '</RESULTSET>\n</FMPXMLRESULT>\n';

describe('FMPXMLRESULT as a table', () => {
  test('the table, its columns (name and lower-case type) and its rows', async () => {
    const db = await open(SAMPLE);
    assert.equal(db.format, 'fmpxmlresult'); assert.equal(db.label, 'FileMaker XML export');
    assert.deepEqual(plain(db.tables), [{ id: '1', name: 'People', rowCount: 3, columns: FIELDS.map(([name, type]) => ({ name, type: type.toLowerCase() })) }]);
    const rows = plain(await db.rows('1', 0, 10));
    assert.deepEqual(rows[0], ['Ann', '30', '1/2/1990', '1:02:03 PM', '1/2/1990 1:02:03 PM', '']);
    assert.equal(rows[1][0], 'Bob & Co');
    assert.equal(rows[2][0], 'x\x1Dy\x1Dz'); // a repeating field: its values joined with the group separator
  });
  test('paging: any slice of the rows, in order', async () => {
    const many = head([['n', 'NUMBER']]) + Array.from({ length: 1500 }, (_, i) => row(String(i))).join('') + '</RESULTSET></FMPXMLRESULT>';
    const db = await open(many);
    assert.equal(db.tables[0].rowCount, 1500);
    assert.deepEqual(plain(await db.rows('1', 1000, 3)), [['1000'], ['1001'], ['1002']]);
    assert.deepEqual(plain(await db.rows('1', 1498, 10)), [['1498'], ['1499']]);
    assert.deepEqual(plain(await db.rows('1', 1500, 10)), []);
    const csv = await (await db.csv('1')).arrayBuffer();
    assert.equal(new TextDecoder().decode(csv).split('\r\n').length, 1502); // BOM + header + rows + the empty piece at the end
  });
  test('entities, character references, CDATA, single-quoted attributes, empty and self-closing cells', async () => {
    const xml = `<?xml version='1.0'?><FMPXMLRESULT><DATABASE NAME='a&amp;b.fp7' LAYOUT=''/><METADATA><FIELD NAME='Q &quot;1&quot;' TYPE='TEXT'/><FIELD NAME="B" TYPE="TEXT"/></METADATA><RESULTSET><ROW><COL><DATA>&lt;b&gt; &#233;&#x65E5;&#x1F600; &amp;amp; &apos;</DATA></COL><COL/></ROW><ROW><COL><DATA><![CDATA[<raw> & stuff]]></DATA></COL><COL><DATA/></COL></ROW></RESULTSET></FMPXMLRESULT>`;
    const db = await open(xml);
    assert.equal(db.tables[0].name, 'a&b');
    assert.deepEqual(plain(db.tables[0].columns.map((c) => c.name)), ['Q "1"', 'B']);
    assert.deepEqual(plain(await db.rows('1', 0, 5)), [['<b> é日😀 &amp; \'', ''], ['<raw> & stuff', '']]);
  });
  test('ragged rows are padded or cut to the number of columns; no metadata gives numbered columns', async () => {
    const db = await open(head([['a', 'TEXT'], ['b', 'TEXT']]) + row('1') + row('1', '2', '3') + '</RESULTSET></FMPXMLRESULT>');
    assert.deepEqual(plain(await db.rows('1', 0, 5)), [['1', ''], ['1', '2']]);
    const bare = await open('<FMPXMLRESULT><RESULTSET>' + row('p', 'q') + '</RESULTSET></FMPXMLRESULT>', { name: 'dir/export.xml' });
    assert.deepEqual(plain(bare.tables[0].columns), [{ name: 'Field 1' }, { name: 'Field 2' }]);
    assert.equal(bare.tables[0].name, 'export');
  });
  test('a file cut off in the middle of a row, and one with no rows', async () => {
    const cut = await open(head([['a', 'TEXT']]) + row('1') + '<ROW><COL><DATA>2</DATA></COL>');
    assert.deepEqual(plain(await cut.rows('1', 0, 5)), [['1'], ['2']]);
    const none = await open(head([['a', 'TEXT']]) + '</RESULTSET></FMPXMLRESULT>');
    assert.equal(none.tables[0].rowCount, 0);
    assert.deepEqual(plain(await none.rows('1', 0, 5)), []);
  });
  test('encodings: a BOM, UTF-16, a declared ISO-8859-1', async () => {
    const small = head([['é', 'TEXT']]) + row('ü') + '</RESULTSET></FMPXMLRESULT>';
    const bom = Uint8Array.from([0xEF, 0xBB, 0xBF, ...enc(small)]);
    assert.equal((await open(bom)).tables[0].columns[0].name, 'é');
    const u16 = new Uint8Array(2 + small.length * 2);
    u16.set([0xFF, 0xFE]); for (let i = 0; i < small.length; i++) { u16[2 + 2 * i] = small.charCodeAt(i) & 255; u16[3 + 2 * i] = small.charCodeAt(i) >> 8; }
    const db16 = await open(u16);
    assert.deepEqual(plain(await db16.rows('1', 0, 5)), [['ü']]);
    const latin = Uint8Array.from(Array.from(small.replace('UTF-8', 'ISO-8859-1'), (c) => c.charCodeAt(0)));
    assert.deepEqual(plain(await (await open(latin)).rows('1', 0, 5)), [['ü']]);
  });
});

describe('what the XML helpers see', () => {
  test('sniff: the first element decides, after a declaration, comments and a doctype', () => {
    const X = F.xml;
    assert.equal(X.sniff(SAMPLE), 'fmpxmlresult');
    assert.equal(X.sniff('<?xml version="1.0"?>\n<!-- made by x -->\n<!DOCTYPE a>\n<fmxmlsnippet type="FMObjectList"><Step/></fmxmlsnippet>'), 'fmxmlsnippet');
    assert.equal(X.sniff('<FMPReport link="Summary.xml" type="Report" version="19"></FMPReport>'), 'ddr');
    assert.equal(X.sniff('<html><body>FMPXMLRESULT</body></html>'), null);
    assert.equal(X.sniff('stray text before <FMPXMLRESULT>'), 'fmpxmlresult'); // tolerant of what comes before the first tag
    assert.equal(X.sniff(''), null);
  });
  test('detect names them, and open() says a snippet or a report is not a table ("unsupported")', async () => {
    const snippet = '<?xml version="1.0" encoding="UTF-8"?><fmxmlsnippet type="FMObjectList"><Step name="Show Custom Dialog"/></fmxmlsnippet>';
    const report = '<?xml version="1.0"?><FMPReport link="Summary.xml" type="Report" version="19.1.2"/>';
    assert.deepEqual(plain(F.detect(enc(snippet), 'script.xml')), { kind: 'fmxmlsnippet', label: 'FileMaker XML snippet' });
    assert.deepEqual(plain(F.detect(enc(report), '')), { kind: 'ddr', label: 'FileMaker Database Design Report' });
    for (const xml of [snippet, report]) await assert.rejects(() => open(xml), (e) => e.code === 'unsupported');
    await assert.rejects(() => open('<?xml version="1.0"?><other/>'), (e) => e.code === 'not-filemaker');
  });
  test('unescape and attrs', () => {
    assert.equal(F.xml.unescape('a &lt; b &#65;&#x42; &unknown; &#0; &#xD800;'), 'a < b AB &unknown; � �');
    assert.deepEqual(plain(F.xml.attrs(' name="x y" Type=\'t\' flag=1')), { NAME: 'x y', TYPE: 't' });
  });
});
