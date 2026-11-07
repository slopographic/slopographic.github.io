// Outline builders for the assistant and the "Outline to …" operations: Slop Slides' deck from an outline
// (slides/js/core/outline.js), Slop Docs' document from an outline (docs/js/model/build.js), the array and object argument
// types (shared/commands/args.js) and the operations in the registry (shared/ops/create.js).
// Covers: slides/js/core/outline.js, docs/js/model/build.js, shared/ops/create.js, shared/commands/args.js
// Run: node --test tests/node/create-outline.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui-i18n-en.mjs';   // the shared components' words (shared/i18n/ui), as a page has them
import { createRequire } from 'node:module';
import { loadSlides, CORE } from './slides-env.mjs';
import { buildDoc, listBlocks, tableBlock, parseOutline } from '../../docs/js/model/build.js';
import { paraText } from '../../docs/js/model/doc.js';

const require = createRequire(import.meta.url);
const A = require('../../shared/commands/args.js');
const SS = loadSlides(CORE.concat(['slides/js/core/outline.js']));
const ph = (s, t) => s.objects.find((o) => o.placeholder === t);
const plain = (o) => SS.objects.plain(o.text);

test('slides: an outline object becomes a title slide plus one slide per item, with bullets, levels and notes', () => {
  const deck = SS.outline.build({ title: 'Bees', subtitle: 'Why they matter', theme: 'paper', size: '4:3',
    slides: [{ title: 'Pollination', bullets: ['Crops', '  Almonds', { text: 'Wild plants', level: 0 }], notes: 'Say hi' },
      { title: 'Threats', bullets: ['Pesticides'], right: ['Habitat loss'] }, { title: 'Questions?' }, { title: '“Busy”', subtitle: 'Anon', layout: 'quote' }] });
  assert.equal(deck.slides.length, 5);
  assert.equal(deck.theme.id, 'paper');
  assert.deepEqual(deck.size, { w: 720, h: 540, preset: '4:3' });
  assert.equal(plain(ph(deck.slides[0], 'title')), 'Bees');
  assert.equal(plain(ph(deck.slides[0], 'subtitle')), 'Why they matter');
  const s1 = deck.slides[1];
  assert.equal(s1.layout, 'title-content');
  assert.equal(plain(ph(s1, 'title')), 'Pollination');
  assert.deepEqual(ph(s1, 'body').text.paras.map((p) => [p.runs[0].t, p.level, p.bullet]), [['Crops', 0, 'disc'], ['Almonds', 1, 'disc'], ['Wild plants', 0, 'disc']]);
  assert.equal(s1.notes, 'Say hi');
  assert.equal(deck.slides[2].layout, 'two-content');
  assert.equal(plain(ph(deck.slides[2], 'body2')), 'Habitat loss');
  assert.equal(deck.slides[3].layout, 'title-only');
  assert.equal(plain(ph(deck.slides[4], 'quote')), '“Busy”');
  assert.equal(plain(ph(deck.slides[4], 'attribution')), 'Anon');
  const sum = SS.outline.summary(deck);
  assert.equal(sum[1].title, 'Pollination');
  assert.equal(sum[1].notes, 'Say hi');
});

test('slides: Markdown and JSON text outlines; limits; empty input is refused', () => {
  const md = '# Deck\nA subtitle\n\n## One\n- a\n  - b\n> note one\n## Two\nplain line\n1. first\n';
  const d = SS.outline.build(md);
  assert.equal(d.title, 'Deck');
  assert.deepEqual(d.slides.map((s) => plain(ph(s, 'title'))), ['Deck', 'One', 'Two']);
  assert.deepEqual(ph(d.slides[1], 'body').text.paras.map((p) => p.level), [0, 1]);
  assert.equal(d.slides[1].notes, 'note one');
  assert.equal(plain(ph(d.slides[2], 'body')), 'first');
  const j = SS.outline.build(JSON.stringify({ title: 'J', titleSlide: false, slides: ['Only'] }));
  assert.equal(j.slides.length, 1);
  assert.equal(plain(ph(j.slides[0], 'title')), 'Only');
  const many = SS.outline.build({ slides: Array.from({ length: 200 }, (_, i) => ({ title: 'S' + i, bullets: Array(40).fill('x') })) });
  assert.equal(many.slides.length, SS.outline.MAX_SLIDES);
  assert.equal(ph(many.slides[0], 'body').text.paras.length, SS.outline.MAX_BULLETS);
  assert.throws(() => SS.outline.parse('  '), /empty/);
  assert.throws(() => SS.outline.parse('{bad'), /JSON/);
});

test('docs: blocks, sections, lists and tables from an outline', () => {
  const doc = buildDoc({ title: 'Report', subtitle: 'Q3', page: 'letter', blocks: [
    { type: 'heading', text: 'Intro', level: 2 }, { type: 'paragraph', text: 'One\nTwo', align: 'center' },
    { type: 'bullets', items: ['a', '  b'] }, { type: 'numbered', items: ['x'] }, { type: 'table', rows: [['Name', 'Qty'], ['Tea', '3']] }, { type: 'page_break' }],
  sections: [{ heading: 'End', paragraphs: ['Bye'], bullets: ['z'] }] });
  const ps = doc.blocks.filter((b) => b.type === 'p');
  assert.equal(doc.section.size, 'Letter');
  assert.equal(doc.meta.title, 'Report');
  assert.deepEqual(ps.slice(0, 8).map((b) => [b.style, paraText(b)]), [['Title', 'Report'], ['Subtitle', 'Q3'], ['H2', 'Intro'], ['Normal', 'One'], ['Normal', 'Two'], ['Normal', 'a'], ['Normal', 'b'], ['Normal', 'x']]);
  assert.equal(ps[3].props.align, 'center');
  assert.deepEqual([ps[5].props.list, ps[6].props.list, ps[7].props.list], [{ id: 'bul', lvl: 0 }, { id: 'bul', lvl: 1 }, { id: 'num', lvl: 0 }]);
  assert.ok(doc.lists.bul && doc.lists.num);
  const t = doc.blocks.find((b) => b.type === 'table');
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[0].header, true);
  assert.deepEqual(t.rows[0].cells[0].blocks[0].runs, [{ b: true, text: 'Name' }]);
  assert.equal(paraText(t.rows[1].cells[1].blocks[0]), '3');
  assert.ok(ps.some((b) => b.runs[0] && b.runs[0].obj === 'pb'));
  assert.equal(paraText(ps.find((b) => b.style === 'H1')), 'End');
  assert.equal(doc.blocks[doc.blocks.length - 1].type, 'p');
});

test('docs: Markdown and JSON text; helpers; limits', () => {
  const doc = buildDoc('# Hello\n\nSome text\n- item');
  assert.equal(doc.meta.title, 'Hello');
  assert.equal(doc.section.size, 'A4');
  assert.deepEqual(doc.blocks.map((b) => b.style), ['H1', 'Normal', 'Normal']);
  assert.equal(buildDoc('{"blocks":[{"type":"quote","text":"Q"}]}').blocks[0].style, 'Quote');
  assert.equal(listBlocks(['', 'x']).length, 1);
  assert.equal(tableBlock([['a'], ['b', 'c']]).cols.length, 2);
  assert.throws(() => tableBlock([]), /row/);
  assert.deepEqual(parseOutline([{ type: 'paragraph', text: 'p' }]), { blocks: [{ type: 'paragraph', text: 'p' }] });
  assert.throws(() => parseOutline(''), /empty/);
});

test('args: array and object arguments (JSON text parsed, plain lines split, cut to maxItems, JSON schema)', () => {
  const S = [{ name: 'slides', type: 'array', maxItems: 2, required: true, items: { type: 'object' } }, { name: 'opts', type: 'object', properties: { a: { type: 'string' } } }];
  let r = A.validate(S, { slides: '[{"title":"a"},{"title":"b"},{"title":"c"}]', opts: '{"a":"x"}' });
  assert.ok(r.ok);
  assert.equal(r.args.slides.length, 2);
  assert.match(r.notes.join(' '), /cut to 2/);
  assert.deepEqual(r.args.opts, { a: 'x' });
  r = A.validate(S, { slides: '- one\n- two' });
  assert.deepEqual(r.args.slides, ['one', 'two']);
  assert.equal(A.validate(S, { slides: [] }).ok, false);
  assert.equal(A.validate(S, { slides: [1], opts: [1] }).ok, false);
  assert.equal(A.validate(S, { slides: '[bad' }).ok, false);
  const j = A.jsonSchema(S);
  assert.deepEqual(j.properties.slides, { type: 'array', items: { type: 'object' }, maxItems: 2 });
  assert.deepEqual(j.properties.opts, { type: 'object', properties: { a: { type: 'string' } } });
  assert.deepEqual(j.required, ['slides']);
  assert.match(A.hint(S[0]), /list/);
  assert.equal(A.summary('Build', S, { slides: [1, 2] }), 'Build, 2 slides');
});

test('operations: Outline to presentation and Outline to document are in the registry with checked options', async () => {
  globalThis.document = undefined;
  const R = await import('../../shared/ops/all.js');
  const p = R.byId('outline-to-presentation'), d = R.byId('outline-to-document');
  assert.ok(p && d);
  assert.equal(R.appLabel(p.app), 'Slop Slides');
  assert.equal(R.appLabel(d.app), 'Slop Docs');
  assert.ok(R.accepts(p, 'json') && R.accepts(p, 'md') && R.accepts(d, 'txt'));
  assert.equal(R.outOf(p, 'json', { format: 'pdf' }), 'pdf');
  assert.equal(R.outOf(d, 'md', {}), 'docx');
  const v = R.validateOptions(p, { format: 'PDF', theme: 'Paper', nonsense: 1 });
  assert.deepEqual([v.ok, v.options.format, v.options.theme], [true, 'pdf', 'paper']);
  assert.equal(R.validateOptions(d, { format: 'xlsx' }).ok, false);
  assert.ok(A.jsonSchema(R.argsOf(p)).properties.format.enum.includes('pptx'));
});
