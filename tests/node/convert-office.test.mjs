// File convert: Word to Markdown, HTML and text, and PowerPoint to text, the pure parts. A Word file written part by part
// (tests/convert/office-fixture.js) is read by Slop Docs' own DOCX import (with the small DOMParser of slides-env.mjs),
// then written by Slop Docs' Markdown and HTML writers; a deck object goes through deckText.
// Covers: docs/js/io/md-out.js, docs/js/io/html-out.js, docs/js/io/sdoc.js, docs/js/io/docx-in.js, convert/js/core/deck-text.js
// Covers: convert/js/core/detect.js, convert/js/core/chain-flags.js
// Run: node --test tests/node/convert-office.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './slides-env.mjs';   // a namespace-aware DOMParser for the DOCX import
import { sampleDocx, DOCX_TEXT } from '../convert/office-fixture.js';
import { importDocx } from '../../docs/js/io/docx-in.js';
import { toMarkdown } from '../../docs/js/io/md-out.js';
import { toHtml } from '../../docs/js/io/html-out.js';
import { fromMarkdown, toText } from '../../docs/js/io/sdoc.js';
import { newDoc, para, paraText } from '../../docs/js/model/doc.js';
import { deckText } from '../../convert/js/core/deck-text.js';
import { detectKind, officeOfZip } from '../../convert/js/core/detect.js';
import { routeTo } from '../../convert/js/core/chain.js';

const doc = await importDocx(await sampleDocx());

test('Word to Markdown: headings, bold, italic, a link, nested and numbered lists, a pipe table, Swedish and Arabic', () => {
  const md = toMarkdown(doc, { underline: false });
  assert.equal(md, [
    `# ${DOCX_TEXT.title}`, '',
    `${DOCX_TEXT.swedish}, **fet** och *kursiv* text med en [länk](${DOCX_TEXT.link}).`, '',
    DOCX_TEXT.arabic, '',
    '## Lista', '',
    '- Ett', '- Två', '    - Under', '',
    '1. Första', '2. Andra', '',
    '| Namn | Stad |', '| --- | --- |', '| Åsa | Malmö |', '| Omar | حلب |', '',
    'Slut.', ''].join('\n'));
});

test('Markdown marks: spaces stay outside, underline only for Slop Docs, code, escapes that read back', () => {
  const d = newDoc();
  const p = para();
  p.runs = [{ text: 'a ' }, { text: 'bold ', b: true }, { text: 'under', u: true }, { text: ' 2*3_x', }, { text: 'code', font: 'Courier New' }, { text: ' gone', s: true }];
  d.blocks = [p, para('# not a heading'), para('1. not a list')];
  assert.equal(toMarkdown(d, { underline: false }), 'a **bold** under 2\\*3\\_x`code` ~~gone~~\n\n\\# not a heading\n\n1\\. not a list\n');
  assert.ok(toMarkdown(d).includes('__under__'));   // Slop Docs' own Markdown keeps underline as __
  const back = fromMarkdown(toMarkdown(d));
  assert.deepEqual(back.blocks.map(paraText).slice(1), ['# not a heading', '1. not a list']);
  assert.ok(paraText(back.blocks[0]).includes('2*3_x'));
});

test('a numbered list restarts after a paragraph; code paragraphs become one fenced block', () => {
  const d = newDoc();
  const li = (t) => ({ ...para(t), props: { list: { id: 'num', lvl: 0 } } });
  d.blocks = [li('a'), li('b'), para('between'), li('c'), para('x = 1', 'Code'), para('y = 2', 'Code')];
  d.lists.num = { kind: 'number', levels: [] };
  assert.equal(toMarkdown(d), '1. a\n2. b\n\nbetween\n\n1. c\n\n```\nx = 1\ny = 2\n```\n');
});

test('Word to HTML: right-to-left aware blocks, nested lists, a header row, safe links only', () => {
  const html = toHtml(doc, { title: 'Rapport' });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<title>Rapport</title>'));
  assert.ok(html.includes(`<h1 dir="auto">${DOCX_TEXT.title}</h1>`));
  assert.ok(html.includes('<strong>fet</strong>') && html.includes('<em>kursiv</em>'));
  assert.ok(html.includes(`<a href="${DOCX_TEXT.link}">länk</a>`));
  assert.ok(html.includes(`<p dir="auto" style="text-align:right">${DOCX_TEXT.arabic}</p>`));
  const flat = html.replace(/\n/g, '');
  assert.ok(flat.includes('<ul><li dir="auto">Ett</li><li dir="auto">Två<ul><li dir="auto">Under</li></ul></li></ul>'));
  assert.ok(flat.includes('<ol><li dir="auto">Första</li><li dir="auto">Andra</li></ol>'));
  assert.ok(html.includes('<th><p dir="auto">Namn</p></th>') && html.includes('<td><p dir="auto">Malmö</p></td>'));
  const bad = newDoc();
  bad.blocks = [{ ...para(), runs: [{ text: 'x<y', link: 'javascript:alert(1)' }] }];
  assert.equal(toHtml(bad, { standalone: false }), '<p dir="auto">x&lt;y</p>\n');
});

test('Word to text: one line per paragraph and table cell', () => {
  const t = toText(doc).split('\n');
  assert.deepEqual(t.slice(0, 4), [DOCX_TEXT.title, `${DOCX_TEXT.swedish}, fet och kursiv text med en länk.`, DOCX_TEXT.arabic, 'Lista']);
  assert.ok(t.includes('Malmö') && t.includes('حلب'));
});

test('a Word file is told by its name, its MIME type, or its first entry; routes start from it', async () => {
  const head = new Uint8Array(await (await sampleDocx()).slice(0, 512).arrayBuffer());
  assert.equal(officeOfZip(head), 'docx');
  assert.equal(detectKind('', '', head), 'docx');
  assert.equal(detectKind('a.zip', '', head), 'zip');   // a name that says zip is a zip
  assert.equal(detectKind('slides.pptx', '', new Uint8Array([0x50, 0x4b, 3, 4])), 'pptx');
  assert.equal(routeTo('docx', 'png'), 'docx-to-pdf>pdf-to-images');
  assert.ok(!routeTo('txt', 'md'));   // Word to Markdown only from a real Word file, never text made into Word on the way
});

test('PowerPoint to text: title first, reading order, bullets, tables, notes and hidden slides on request', () => {
  const t = (s, extra = {}) => ({ type: 'text', x: 0, y: 0, text: { paras: s.split('\n').map((l) => ({ runs: [{ t: l }] })) }, ...extra });
  const deck = { slides: [
    { objects: [t('Right', { x: 500, y: 200 }), t('Left', { x: 40, y: 200 }), t('Kvartalet', { y: 30, placeholder: 'title' })], notes: 'Säg hej' },
    { hidden: true, objects: [t('Dold')] },
    { objects: [{ type: 'group', children: [{ type: 'text', y: 10, text: { paras: [{ runs: [{ t: 'Punkt' }], bullet: 'disc' }, { runs: [{ t: 'Under' }], bullet: 'disc', level: 1 }] } }] },
      { type: 'table', y: 300, cells: [[{ text: { paras: [{ runs: [{ t: 'A' }] }] } }, { text: { paras: [{ runs: [{ t: 'مرحبا' }] }] } }]] }] }] };
  assert.equal(deckText(deck), 'Slide 1\nKvartalet\nLeft\nRight\n\nSlide 3\n• Punkt\n  • Under\nA\tمرحبا\n');
  assert.ok(deckText(deck, { notes: true }).startsWith('Slide 1\nKvartalet\nLeft\nRight\n\nNotes:\nSäg hej\n\nSlide 3\n'));
  assert.ok(deckText(deck, { hidden: true }).includes('Slide 2 (hidden)\nDold'));
});
