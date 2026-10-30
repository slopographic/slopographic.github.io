// shared/office/docx.js: builds a .docx from blocks, then re-reads the zip with readZip and checks the parts.
// Run: node --test tests/node/office-docx.test.mjs   (or node tests/run.mjs docx)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docxBlob, docxEntries } from '../../shared/office/docx.js';
import { readZip, readText } from '../../shared/office/zip.js';

const BLOCKS = [
  { type: 'heading', level: 1, text: 'Invoice 2026-0042' },
  { type: 'heading', level: 2, text: 'Customer' },
  { type: 'paragraph', text: 'Acme & Co <north> total 1,250.00\nSecond line' },
  { type: 'paragraph', runs: [{ text: 'Bold ', bold: true }, { text: 'and italic', italic: true }] },
  { type: 'item', text: 'First point' },
  { type: 'table', rows: [['Item', 'Qty'], ['Pens', '4'], ['Paper']] },
  { type: 'pagebreak' },
  { type: 'heading', level: 3, text: 'Page two' },
];

test('a Blob with the zip type comes back from docxBlob', async () => {
  const blob = await docxBlob(BLOCKS, { title: 'Test' });
  assert.equal(blob.type, 'application/zip');
  assert.ok(blob.size > 500);
});

test('the zip holds the seven parts, with [Content_Types].xml first', async () => {
  const zip = await readZip(await docxBlob(BLOCKS));
  assert.deepEqual([...zip.keys()], [
    '[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels',
    'word/styles.xml', 'docProps/core.xml', 'docProps/app.xml',
  ]);
});

test('the content types name the main document, the styles and the docProps parts', async () => {
  const zip = await readZip(await docxBlob(BLOCKS));
  const ct = readText(zip, '[Content_Types].xml');
  assert.match(ct, /PartName="\/word\/document\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml"/);
  assert.match(ct, /PartName="\/word\/styles\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.styles\+xml"/);
  assert.match(ct, /PartName="\/docProps\/core\.xml" ContentType="application\/vnd\.openxmlformats-package\.core-properties\+xml"/);
  assert.match(ct, /Extension="rels" ContentType="application\/vnd\.openxmlformats-package\.relationships\+xml"/);
});

test('the root relationships point at the document and the docProps', async () => {
  const zip = await readZip(await docxBlob(BLOCKS));
  const rels = readText(zip, '_rels/.rels');
  assert.match(rels, /Target="word\/document\.xml"/);
  assert.match(rels, /Target="docProps\/core\.xml"/);
  assert.match(readText(zip, 'word/_rels/document.xml.rels'), /Target="styles\.xml"/);
});

test('document.xml has the headings, runs, line breaks, escaped text, list item, table and page break', async () => {
  const zip = await readZip(await docxBlob(BLOCKS));
  const xml = readText(zip, 'word/document.xml');
  assert.match(xml, /<w:document [^>]*xmlns:w="http:\/\/schemas\.openxmlformats\.org\/wordprocessingml\/2006\/main"/);
  assert.match(xml, /<w:pStyle w:val="Heading1"\/>/);
  assert.match(xml, /<w:pStyle w:val="Heading2"\/>/);
  assert.match(xml, /<w:pStyle w:val="Heading3"\/>/);
  assert.ok(xml.includes('Invoice 2026-0042'));
  assert.ok(xml.includes('Acme &amp; Co &lt;north&gt; total 1,250.00'), 'text is escaped');
  assert.match(xml, /total 1,250\.00<\/w:t><w:br\/><w:t xml:space="preserve">Second line/, 'a newline is a line break');
  assert.match(xml, /<w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">Bold <\/w:t>/);
  assert.match(xml, /<w:rPr><w:i\/><\/w:rPr><w:t xml:space="preserve">and italic<\/w:t>/);
  assert.match(xml, /<w:ind w:left="360" w:hanging="360"\/>/);
  assert.match(xml, /<w:t xml:space="preserve">•<\/w:t><w:tab\/><\/w:r><w:r><w:t xml:space="preserve">First point/, 'the marker, a real tab, then the text');
  assert.ok(!xml.includes('\t'), 'no raw tab characters in the XML');
  assert.ok(xml.includes('First point'));
  assert.match(xml, /<w:tbl>/);
  assert.equal((xml.match(/<w:tr>/g) || []).length, 3, 'three rows');
  assert.equal((xml.match(/<w:tc>/g) || []).length, 6, 'two columns in every row');
  assert.match(xml, /<w:tblHeader\/>/, 'the first row repeats as a header');
  assert.match(xml, /<w:br w:type="page"\/>/);
  assert.match(xml, /<w:pgSz w:w="11906" w:h="16838"\/>/, 'A4 by default');
});

test('styles.xml defines Normal and Heading 1 to 3 with outline levels', async () => {
  const zip = await readZip(await docxBlob(BLOCKS));
  const styles = readText(zip, 'word/styles.xml');
  assert.match(styles, /<w:style w:type="paragraph" w:default="1" w:styleId="Normal">/);
  for (const n of [1, 2, 3]) assert.match(styles, new RegExp(`w:styleId="Heading${n}"[\\s\\S]*?<w:outlineLvl w:val="${n - 1}"/>`));
});

test('the core properties carry the title', async () => {
  const zip = await readZip(await docxBlob(BLOCKS, { title: 'Scan & save' }));
  assert.match(readText(zip, 'docProps/core.xml'), /<dc:title>Scan &amp; save<\/dc:title>/);
});

test('letter size is used when asked, and an unknown size is refused', () => {
  const parts = docxEntries([{ type: 'paragraph', text: 'x' }], { pageSize: 'letter' });
  assert.match(parts.find((p) => p.path === 'word/document.xml').data, /<w:pgSz w:w="12240" w:h="15840"\/>/);
  assert.throws(() => docxEntries([], { pageSize: 'folio' }), /unknown page size/);
});

test('an unknown block type is refused, not written as nothing', () => {
  assert.throws(() => docxEntries([{ type: 'image' }]), /unknown block type image/);
});
