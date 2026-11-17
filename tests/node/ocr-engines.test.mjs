// Text recognition engines (shared/ocr/engines.js): the registry, which engine Auto reads a language with, a site that
// hides PaddleOCR (the brand profile's ai field: hideOrigins CN) reading everything with Tesseract, the saved choice of a
// hidden engine falling back, the Tesseract models of the OCR list and the lines tesseract.js gives. Each "site" is the real
// classic scripts run in a fresh vm, in page order, with the profile's fields written into their markers as the build does
// (the build itself, and the profile's ocr field: tests/node/whitelabel-ocr.test.mjs).
// Run: node --test tests/node/ocr-engines.test.mjs
// Covers: shared/ocr/engines.js, shared/ocr/engine-tesseract.js, aitools/ocr-tesseract.js, aitools/ocr-models.js, aitools/model-registry.js
// Covers: shared/ai/makers.js, shared/ocr/suggest.js
// Covers: shared/ocr/i18n/index.js, shared/ocr/i18n/en/engines.js, shared/ocr/i18n/sv/engines.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { suggestModel } from '../../shared/ocr/suggest.js';
import { linesOf } from '../../shared/ocr/engine-tesseract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const SCRIPTS = ['shared/cdn/assets.js', 'shared/models/catalog.js', 'shared/ai/makers.js', 'shared/ocr/engines.js', 'aitools/ocr-tesseract.js', 'aitools/ocr-models.js', 'aitools/speech-models.js', 'aitools/model-registry.js'];
/** A storage that keeps strings, like localStorage. */
const memory = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
/** The OCR scripts of a page, run in order in a fresh vm, with the brand profile's ai and ocr fields written into their
 *  markers as the build does, and a localStorage. */
function site({ ai = {}, ocr = {}, storage = memory() } = {}) {
  const values = { aiModels: ai, ocrEngines: ocr };
  const applyMarkers = (src) => src.replace(/\/\*profile:(aiModels|ocrEngines)\*\/\{[^\n]*?\}(?=;)/g, (m, k) => `/*profile:${k}*/${JSON.stringify(values[k])}`);
  const win = { localStorage: storage, Intl, URL };
  win.window = win; win.globalThis = win;
  vm.createContext(win);
  for (const p of SCRIPTS) vm.runInContext(applyMarkers(read(p)), win, { filename: p });
  return win;
}
const ids = (list) => list.map((r) => r.model.id);
/** deepEqual across the vm's realm (its arrays and objects have other prototypes). */
const eq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);

test('the registry: two engines, each with a maker of the maker table, its quick model and its languages', () => {
  const w = site(), E = w.SlopOcrEngines, O = w.SlopOcrModels;
  eq(E.IDS, ['paddle', 'tesseract']);
  for (const e of E.ENGINES) {
    assert.ok(w.SlopAIKit.makers.byId(e.maker), e.id + ': its maker is in shared/ai/makers.js');
    assert.equal(O.byId(e.quick).engine, e.id, e.id + ': its quick model is its own');
    assert.equal(typeof e.load, 'function'); assert.equal(typeof e.recognize, 'function');
  }
  assert.equal(w.SlopAIKit.makers.byId('baidu').origin, 'CN');
  assert.equal(w.SlopAIKit.makers.byId('tesseract').origin, 'US');
  assert.ok(E.byId('paddle').languages().includes('ko'));
  for (const c of ['sv', 'he', 'vi', 'ka', 'bn', 'ru', 'zh', 'ja']) assert.ok(E.byId('tesseract').languages().includes(c), 'Tesseract reads ' + c);
  assert.ok(!E.byId('paddle').languages().includes('he'));
  eq(E.offered().map((e) => e.id), ['paddle', 'tesseract']);
  assert.equal(E.chosen(), 'auto');
  assert.equal(E.label('auto'), 'ocrengine.auto');
  assert.equal(E.label('tesseract'), 'Tesseract');
  assert.equal(E.engineOf('tesseract-swe').id, 'tesseract');
  assert.equal(E.engineOf('ppocr-v5-korean').id, 'paddle');
});

test('Auto: PaddleOCR for the scripts it has a model for, Tesseract for the languages it lacks', () => {
  const w = site(), E = w.SlopOcrEngines, O = w.SlopOcrModels;
  for (const c of ['sv', 'de', 'ru', 'ar', 'hi', 'ko', 'ja', 'zh', 'el', 'th']) assert.equal(E.autoFor(c), 'paddle', c);
  for (const c of ['he', 'vi', 'bn', 'ka', 'hy', 'am', 'my', 'km']) assert.equal(E.autoFor(c), 'tesseract', c);
  assert.equal(E.autoFor('auto'), 'paddle', 'no language yet: the quick model, PaddleOCR\'s bundled one');
  // the dialog's list for a language: the more accurate PaddleOCR model first, Tesseract's after it, the quick model last
  eq(ids(O.rank('sv')), ['ppocr-v6-small', 'tesseract-swe']);
  eq(ids(O.rank('en')), ['ppocr-v6-small', 'tesseract-eng', 'ppocr-v4']);
  eq(ids(O.rank('he')), ['tesseract-heb']);
  eq(ids(O.rank('sr')).sort(), ['ppocr-v5-cyrillic', 'ppocr-v6-small', 'tesseract-srp', 'tesseract-srp-latn'].sort());
  // one engine chosen: only its models; Tesseract's quick model is English
  const T = O.forEngine('tesseract');
  assert.equal(T.QUICK, 'tesseract-eng');
  eq(ids(T.rank('sv')), ['tesseract-swe']);
  eq(ids(T.rank('auto')), ['tesseract-eng']);
  assert.equal(T.modelFor('ko').id, 'tesseract-kor');
  assert.equal(O.forEngine('paddle').byId('tesseract-swe'), null);
  assert.equal(O.forEngine('auto'), O);
});

test('a site that hides Chinese makers: no PaddleOCR anywhere, Tesseract reads every language, the saved choice falls back', () => {
  const storage = memory({ 'slop.ocr.engine': 'paddle' });
  const w = site({ ai: { hideOrigins: ['CN'] }, storage }), E = w.SlopOcrEngines, O = w.SlopOcrModels, R = w.SlopAIModels;
  eq(E.offered().map((e) => e.id), ['tesseract']);
  assert.equal(E.allowed('paddle'), false);
  assert.equal(E.chosen(), 'auto', 'the saved PaddleOCR is not used');
  assert.equal(E.choose('paddle'), false, 'and cannot be chosen');
  assert.ok(O.MODELS.length > 90 && O.MODELS.every((m) => m.engine === 'tesseract'));
  assert.ok(O.ALL.some((m) => m.engine === 'paddle'), 'ALL still lists every model');
  assert.equal(O.QUICK, 'tesseract-eng');
  assert.equal(E.quick(), 'tesseract-eng', 'the Serial counter and receipts read with it');
  for (const c of ['sv', 'ja', 'ko', 'ar', 'he']) assert.equal(E.autoFor(c), 'tesseract', c);
  assert.equal(O.modelFor('ja').id, 'tesseract-jpn');
  // the model index: no PaddleOCR model at all, and the OCR tool's gate asks for Tesseract's English model
  assert.equal(R.byId('ppocr-v4'), null);
  assert.ok(!R.MODELS.some((m) => /^ppocr/.test(m.id)));
  eq(R.TOOLS.find((t) => t.id === 'ocr').models, ['tesseract-eng']);
  eq(R.problems(), []);
  // running a hidden engine's model is refused
  return assert.rejects(E.load('ppocr-v4'), /ocrengine.hidden/);
});

test('the saved choice: kept and read back, a hidden one reads as the profile\'s default, the profile can restrict', async () => {
  const storage = memory();
  let w = site({ storage });
  assert.equal(w.SlopOcrEngines.choose('tesseract'), true);
  assert.equal(storage.getItem('slop.ocr.engine'), 'tesseract');
  assert.equal(w.SlopOcrEngines.chosen(), 'tesseract');
  eq(w.SlopAIModels.TOOLS.find((t) => t.id === 'ocr').models, ['tesseract-eng'], 'the gate asks for the chosen engine\'s quick model');
  assert.equal(w.SlopOcrEngines.choose('nope'), false);
  // a profile with Tesseract by default: a person who chose PaddleOCR keeps it, one who chose nothing starts with Tesseract
  w = site({ ocr: { default: 'tesseract' }, storage: memory({ 'slop.ocr.engine': 'paddle' }) });
  assert.equal(w.SlopOcrEngines.chosen(), 'paddle');
  w = site({ ocr: { default: 'tesseract' } });
  assert.equal(w.SlopOcrEngines.chosen(), 'tesseract');
  assert.equal(w.SlopOcrEngines.quick(), 'tesseract-eng');
  // a profile that offers Tesseract only: a saved PaddleOCR falls back to Auto (which is Tesseract)
  w = site({ ocr: { engines: ['tesseract'] }, storage: memory({ 'slop.ocr.engine': 'paddle' }) });
  assert.equal(w.SlopOcrEngines.chosen(), 'auto');
  eq(w.SlopOcrEngines.offered().map((e) => e.id), ['tesseract']);
  assert.equal(w.SlopOcrModels.QUICK, 'tesseract-eng');
  // configure() replaces the rules for a preview, configure() with nothing goes back to the profile's
  eq(w.SlopOcrEngines.configure({}), {});
  assert.equal(w.SlopOcrEngines.allowed('paddle'), true);
  eq(w.SlopOcrEngines.configure(), { engines: ['tesseract'] });
});

test('the suggestion after a read with Tesseract offers Tesseract\'s model for the browser language\'s script', () => {
  const O = site().SlopOcrModels.forEngine('tesseract');
  const line = (text) => ({ text, score: 0.95, box: { x: 0, y: 0, w: 400, h: 40 } });
  eq(suggestModel([line('Привет мир, как дела')], { model: 'tesseract-eng', catalog: O, locale: 'uk' }), { language: 'uk', model: 'tesseract-ukr', script: 'cyrillic', reason: 'script' });
  assert.equal(suggestModel([line('Привет мир, как дела')], { model: 'tesseract-eng', catalog: O }).model, 'tesseract-rus');
  assert.equal(suggestModel([line('An English line of text')], { model: 'tesseract-eng', catalog: O, locale: 'en' }), null);
});

test('the Tesseract models: one file each on the cdn at the release tag, checked like every model, named in the page\'s language', () => {
  const w = site(), O = w.SlopOcrModels, R = w.SlopAIModels, C = w.SlopCdn, D = w.SlopOcrTesseract;
  const tess = O.MODELS.filter((m) => m.engine === 'tesseract');
  assert.equal(tess.length, D.ROWS.length);
  assert.equal(new Set(tess.map((m) => m.id)).size, tess.length);
  for (const m of tess) {
    assert.equal(R.byId(m.id), m, m.id + ' is in the model index');
    assert.equal(m.files.length, 1);
    assert.equal(C.pathOf(m.files[0].url), D.DIR + m.tess + '.traineddata.gz');
    assert.ok(R.allowedUrl(m.files[0].url));
    assert.equal(m.licence, 'Apache-2.0');
    assert.ok(m.languages.length && m.languages.every((c) => /^[a-z]{2,3}(-Hant)?$/.test(c)), m.id);
  }
  eq(R.problems(), []);
  eq(O.byId('tesseract-nor').languages, ['no', 'nn']);
  eq(O.byId('tesseract-eng').scripts, ['latin']);
  eq(O.byId('tesseract-ukr').scripts, ['cyrillic']);
  assert.equal(O.byId('tesseract-swe').maker, 'Tesseract (open source)');
  // the words: the Swedish and English tables of shared/ocr/i18n, with the language's name from Intl
  const words = {};
  const I = { add: (code, d) => { words[code] = d; } };
  for (const c of ['en', 'sv']) vm.runInNewContext(read(`shared/ocr/i18n/${c}/engines.js`), { window: { SlopI18n: I } });
  eq(Object.keys(words.sv).sort(), Object.keys(words.en).sort());
  const tr = (d) => (k, v) => (d[k] || k).replace(/\{(\w+)\}/g, (m, x) => (v && x in v ? v[x] : m));
  w.SlopI18n = { get: () => 'sv', t: tr(words.sv) };
  assert.equal(O.byId('tesseract-swe').name, 'Tesseract: svenska');
  w.SlopI18n = { get: () => 'en', t: tr(words.en) };
  assert.equal(O.byId('tesseract-deu').name, 'Tesseract: German');
  assert.equal(O.byId('tesseract-srp-latn').name, 'Tesseract: Serbian (ui.models.script.latin)');
  // every language with a folder is shipped (English and Swedish at least); the index lists exactly the folders
  const langs = /langs: \[([^\]]*)\]/.exec(read('shared/ocr/i18n/index.js'))[1].match(/[\w-]+/g);
  for (const c of ['en', 'sv']) assert.ok(langs.includes(c), c);
  for (const c of langs) assert.ok(read(`shared/ocr/i18n/${c}/engines.js`).includes(`add('${c}'`), c);
});

test('tesseract.js lines: text, a 0..1 score and a box per line, empty lines counted as skipped', () => {
  const blocks = [{ paragraphs: [{ lines: [
    { text: 'Smörgåsbord på Öland\n', confidence: 91.5, bbox: { x0: 10, y0: 20, x1: 210, y1: 48 } },
    { text: '   \n', confidence: 10, bbox: { x0: 0, y0: 50, x1: 5, y1: 60 } },
  ] }, { lines: [{ text: '42 äpplen', confidence: 120, bbox: { x0: 12, y0: 70, x1: 100, y1: 90 } }] }] }];
  const lines = linesOf(blocks);
  eq(lines.map((l) => l.text), ['Smörgåsbord på Öland', '42 äpplen']);
  eq(lines[0].box, { x: 10, y: 20, w: 200, h: 28 });
  assert.equal(lines[0].score, 0.915);
  assert.equal(lines[1].score, 1);
  assert.equal(lines.skipped, 1);
  eq(linesOf(null), []);
});
