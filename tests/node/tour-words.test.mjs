// SlopTour words: a tour file is data only (app, ns, step ids and targets) and holds no words; the engine reads them
// from the app's own string tables as keys: <ns>.tour.title, <ns>.tour.<step>_title and <ns>.tour.<step>_text (a '-'
// in a step id is '_'; ns is the app's registry id, given in the tour when it differs from the folder).
// Checks: (a) no tour file carries a title or text, or reads SlopI18n itself, and the validator refuses words in a tour;
// (b) every key of every tour is in the English and the Swedish tables of its app, and the English is short enough.
// Covers: shared/tour/core.js, shared/tour/tours/3d.js, shared/tour/tours/aitools.js, shared/tour/tours/calendar.js,
//   shared/tour/tours/code.js, shared/tour/tours/crm.js, shared/tour/tours/docs.js, shared/tour/tours/drive.js,
//   shared/tour/tours/effects.js, shared/tour/tours/fontcreator.js, shared/tour/tours/gallery.js, shared/tour/tours/hex.js,
//   shared/tour/tours/img3d.js, shared/tour/tours/invoices.js, shared/tour/tours/label.js, shared/tour/tours/notes.js,
//   shared/tour/tours/orders.js, shared/tour/tours/paste.js, shared/tour/tours/photoslop.js, shared/tour/tours/projects.js,
//   shared/tour/tours/remix.js, shared/tour/tours/resize.js, shared/tour/tours/scan.js, shared/tour/tours/slides.js, shared/tour/tours/slopcut.js,
//   shared/tour/tours/slopisolate.js, shared/tour/tours/slopvector.js, shared/tour/tours/tables.js, shared/tour/tours/todo.js,
//   shared/tour/tours/upscale.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, apps, appTables } from '../../tools/i18n/tables.mjs';

const DIR = path.join(ROOT, 'shared', 'tour', 'tours');
const run = (src, box, name) => { vm.createContext(box); vm.runInContext(src, box, { filename: name }); return box; };
const coreBox = { console }; coreBox.window = coreBox; coreBox.globalThis = coreBox;
const logic = run(readFileSync(path.join(ROOT, 'shared', 'tour', 'core.js'), 'utf8'), coreBox, 'core.js').SlopTour.logic;

const tours = readdirSync(DIR).filter((f) => f.endsWith('.js')).sort().map((f) => {
  const src = readFileSync(path.join(DIR, f), 'utf8'), got = [];
  run(src, { SlopTour: { define: (t) => got.push(t) } }, f);
  return { file: f, folder: f.slice(0, -3), src, tour: got[0] };
});
const registry = apps();

test('(a) a tour file is data only: no title or text, no words read by the file itself', () => {
  assert.equal(tours.length, 29);
  for (const { file, src, tour } of tours) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\b(title|text)\s*[:(]|SlopI18n|\bget\s+\w+\s*\(/, file + ' holds words or reads them');
    assert.deepEqual(Object.keys(tour).filter((k) => !['app', 'ns', 'steps'].includes(k)), [], file + ' tour fields');
    for (const s of tour.steps) assert.deepEqual(Object.keys(s).filter((k) => !['id', 'target', 'action', 'check'].includes(k)), [], file + ' step ' + s.id);
  }
});

test('(a) the validator refuses a tour that carries words, and builds the keys', () => {
  const bad = { app: 'x', title: 'X tour', steps: [{ id: 'a', title: 'A', text: 'B', target: '#a' }] };
  const p = [...logic.problems(bad)].join('; ');
  assert.match(p, /title is not data/);
  assert.match(p, /step 1 has words/);
  const good = { app: 'slopcut', ns: 'slopedit', steps: [{ id: 'from-order', target: '#a' }] };
  assert.equal(logic.problems(good).length, 0);
  assert.equal(logic.keyOf(good, 'title'), 'slopedit.tour.title');
  assert.equal(logic.stepKey(good, good.steps[0], 'title'), 'slopedit.tour.from_order_title');
  assert.equal(logic.stepKey(good, good.steps[0], 'text'), 'slopedit.tour.from_order_text');
  const w = logic.words(good, (k) => '<' + k + '>');
  assert.equal(w.title, '<slopedit.tour.title>');
  assert.equal(w.steps[0].text, '<slopedit.tour.from_order_text>');
});

test('(b) every tour key is in the English and the Swedish tables of its app', () => {
  const missing = [], long = [];
  for (const { file, folder, tour } of tours) {
    const app = registry.find((a) => a.dir === folder + '/');
    assert.ok(app, file + ': no registry app with the folder ' + folder);
    assert.equal(tour.ns || tour.app, app.id, file + ': ns must be the registry id ' + app.id + ' (set ns when it differs from the folder)');
    const { tables } = appTables(app);
    const keys = [logic.keyOf(tour, 'title')];
    for (const s of tour.steps) keys.push(logic.stepKey(tour, s, 'title'), logic.stepKey(tour, s, 'text'));
    for (const code of ['en', 'sv']) for (const k of keys) if (!(tables[code] && tables[code].get(k))) missing.push(code + ' ' + k);
    for (const s of tour.steps) {
      if ((tables.en.get(logic.stepKey(tour, s, 'title')) || '').length > 40) long.push(file + ' ' + s.id + ' title');
      if ((tables.en.get(logic.stepKey(tour, s, 'text')) || '').length > 160) long.push(file + ' ' + s.id + ' text');
    }
  }
  assert.deepEqual(missing, [], 'tour keys missing from the app tables');
  assert.deepEqual(long, [], 'tour words too long');
});
