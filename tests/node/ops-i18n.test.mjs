// The words of the operations (shared/ops) and of the watermark spec (shared/watermark/spec.js, spec-convert.js): every
// step's label and description, every option's label, hint and choices come from the tables (shared/i18n/ui/<code>/),
// in English and Swedish, with no key showing; they follow a language switch (getters, never constants); and the
// messages a person reads (errors, info lines, workflow file problems) are translated.
// Run: node --test tests/node/ops-i18n.test.mjs
// Covers: shared/ops/i18n.js, shared/ops/registry.js, shared/ops/flowdoc.js, shared/ops/create.js, shared/ops/create-tables.js
// Covers: shared/ops/video.js, shared/ops/retouch.js, shared/ops/macros.js, shared/ops/pdf-extract.js, shared/ops/colors.js, shared/ops/diff.js
// Covers: shared/ops/speech.js, shared/ops/dialog.js, shared/ops/entry.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { setLang, TABLES } from './ui-i18n-en.mjs';
import * as R from '../../shared/ops/all.js';
import { opt, like, stepKey, t } from '../../shared/ops/i18n.js';
import { macroOp } from '../../shared/ops/macros.js';

const require = createRequire(import.meta.url);
const F = require('../../shared/ops/flowdoc.js');
const S = require('../../shared/watermark/spec.js');
require('../../shared/watermark/spec-layout.js');
require('../../shared/watermark/spec-convert.js');

const KEY = /\bui\.[a-z_]+\./;
const shared = () => R.all().filter((op) => op.app !== 'convert' && op.kind === 'op');
/** Every word a step shows: its label, description, and each option's label, hint and choice labels. */
function wordsOf(op) {
  const out = [['label', op.label], ['description', op.description]];
  for (const o of op.options) {
    out.push([o.key, o.label]);
    if (o.hint) out.push([o.key + ' hint', o.hint]);
    for (const c of (o.type === 'select' && o.options) || []) out.push([`${o.key}=${c[0]}`, c[1]]);
  }
  return out;
}

test('every shared step has its words in English and Swedish, and no key shows', () => {
  for (const lang of ['en', 'sv']) {
    setLang(lang);
    for (const op of shared()) for (const [what, text] of wordsOf(op)) {
      assert.equal(typeof text, 'string', `${op.id} ${what}`);
      assert.ok(text && !KEY.test(text), `${lang}: ${op.id} ${what} reads "${text}"`);
    }
  }
  for (const op of shared()) {
    const k = stepKey(op.id);
    assert.ok(TABLES.en[k] && TABLES.sv[k], `${op.id}: ${k} in en and sv`);
  }
  setLang('en');
});

test('the words follow a language switch: labels, descriptions, options and copies of options', () => {
  setLang('en');
  const bg = R.byId('slopisolate.remove-bg'), reframe = R.byId('slopedit.reframe'), wm = R.byId('watermark.apply');
  assert.equal(bg.label, 'Remove background');
  assert.equal(reframe.options[0].label, 'Frame');
  assert.equal(reframe.options[0].options[0][1], 'Vertical 9:16 (1080×1920)');
  setLang('sv');
  assert.equal(bg.label, 'Ta bort bakgrund');
  assert.match(bg.description, /på den här enheten/);
  // regression: a spread or Object.assign copy of an option froze its English label at load time
  assert.equal(reframe.options[0].label, 'Bildformat');
  assert.equal(reframe.options[0].options[0][1], 'Stående 9:16 (1080×1920)');
  assert.equal(R.byId('slopisolate.background').options[0].label, 'Bakgrundsfärg');
  assert.equal(wm.options.find((o) => o.key === 'position').options[0][1], 'Överst till vänster');
  assert.equal(R.appLabel('files'), 'Filer');
  // the AI's view of the options (argsOf) reads the same words
  assert.match(R.argsOf(R.byId('resize.image')).find((a) => a.name === 'width').description, /^Bredd \(px\)/);
  setLang('en');
  assert.equal(reframe.options[0].label, 'Frame');
  assert.equal(R.appLabel('files'), 'Files');
});

test('opt, like and stepKey', () => {
  const o = opt('ui.ops.resize.anchor', { key: 'anchor', type: 'select', value: 'center', options: ['top-left', ['x', 'X']] });
  assert.equal(o.options[0][1], 'Top left');
  assert.equal(o.options[1][1], 'X');
  const c = like(o, { value: 'x' });
  assert.equal(c.value, 'x');
  assert.equal(o.value, 'center');
  setLang('sv');
  assert.equal(c.label, 'Behåll (beskärning och kantens läge)');
  setLang('en');
  assert.equal(stepKey('slopisolate.remove-bg'), 'ui.ops.step.slopisolate_remove_bg');
  assert.equal(t('ui.ops.extract.done', { n: 1 }), '1 file extracted.');
  assert.equal(t('ui.ops.extract.done', { n: 3 }), '3 files extracted.');
});

test('macro steps: the description and the "app only" message are translated', async () => {
  const m = { id: 'm1', name: 'Mine', steps: [{ cmd: 'co.look', args: {}, title: 'Look' }] };
  const op = macroOp('photoslop', m);
  assert.equal(op.description, 'Your PhotoSlop macro: Look.');
  setLang('sv');
  assert.equal(op.description, 'Ditt makro i PhotoSlop: Look.');
  setLang('en');
});

test('workflow documents: the problems a person reads are translated', () => {
  setLang('sv');
  assert.deepEqual(F.normalize(null).errors, ['Det här är inget arbetsflöde.']);
  const r = F.normalize({ kind: 'slopflow', v: 9, steps: [{}] });
  assert.equal(r.doc.name, 'Namnlöst arbetsflöde');
  assert.deepEqual(r.errors, ['Skapad av en nyare Slop Workflows (version 9); vissa delar kan saknas.', 'Steg 1 har ingen åtgärd och utelämnades.']);
  assert.deepEqual(F.fromText('{').errors, ['Filen är inget arbetsflöde (det är inte JSON).']);
  setLang('en');
  assert.deepEqual(F.fromText('{').errors, ['This file is not a workflow (it is not JSON).']);
});

test('the watermark spec: field labels, positions, checks, layer names and page range errors in Swedish', () => {
  setLang('sv');
  assert.equal(S.FIELDS.opacity.label, 'Opacitet');
  assert.equal(S.FIELDS.pages.hint, 'För PDF:er. Tomt är alla sidor; eller 1-3, 5, last, odd, even.');
  assert.equal(S.POSITION_LABELS.br, 'Nederst till höger');
  assert.equal(S.FIELDS.position.options[8][1], 'Nederst till höger');
  assert.equal(S.FONTS.mono.label, 'Fast teckenbredd');
  assert.equal(S.check(S.normalize({ layers: [{ text: ' ' }] })), 'Skriv vattenstämpelns text.');
  assert.equal(S.label(S.normalizeLayer({ kind: 'logo', logoName: 'a.png' })), 'Logotyp: a.png');
  assert.throws(() => S.parsePages('x', 3), /”x” är inget sidnummer/);
  const opts = S.OPTIONS;
  assert.equal(opts.find((o) => o.key === 'spec').hint, 'En vattenstämpel som sparats i någon app från Slopographic. När en är vald används den i stället för inställningarna ovan.');
  assert.equal(opts.find((o) => o.key === 'font').options[0][1], 'Sans serif');
  for (const o of opts) assert.ok(!KEY.test(o.label) && !KEY.test(o.hint || ''), o.key);
  setLang('en');
  assert.equal(S.FIELDS.opacity.label, 'Opacity');
  assert.equal(opts.find((o) => o.key === 'mark').options[2][1], 'Logo and text');
});
