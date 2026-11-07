// SlopLabel configs (label/js/core/configs.js) and the config store (label/js/io/configs-store.js): validation (a negative or
// zero size is refused), capture from a document, applying a config, styles for new objects, and the saved envelope.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelEnv, plain, memStorage } from './label-env.mjs';

const env = await labelEnv();
const G = (n) => env.get(n);
const starter = () => G('normalizeDoc')(G('newDoc')({ name: 'Product', unit: 'mm', dpi: 203 }));

test('a document can be captured and the capture is valid', () => {
  const body = G('configFromDoc')(starter());
  const v = G('validateConfig')(body);
  assert.equal(v.ok, true, v.errors.join('; '));
  assert.equal(body.label.w, 101.6);
  assert.equal(body.stock.id, 'roll-4x6');
  assert.equal(body.data, null);
  assert.equal(body.style.font, 'sans');
});

test('a negative or zero label size is refused', () => {
  const base = plain(G('configFromDoc')(starter()));
  for (const w of [-5, 0, -0.001]) {
    const v = G('validateConfig')({ ...base, label: { ...base.label, w } });
    assert.equal(v.ok, false, `width ${w} should be refused`);
    assert.match(v.errors[0], /label\.w must be from/);
  }
  const h = G('validateConfig')({ ...base, label: { ...base.label, h: -1 } });
  assert.equal(h.ok, false);
  assert.match(h.errors[0], /label\.h/);
});

test('numbers must be finite numbers within range', () => {
  const base = plain(G('configFromDoc')(starter()));
  assert.equal(G('validateConfig')({ ...base, label: { ...base.label, w: Number.NaN } }).ok, false);
  assert.equal(G('validateConfig')({ ...base, label: { ...base.label, w: '40' } }).ok, false);
  assert.equal(G('validateConfig')({ ...base, label: { ...base.label, w: 5000 } }).ok, false);
  assert.equal(G('validateConfig')({ ...base, label: { ...base.label, gap: -1 } }).ok, false);
  assert.equal(G('validateConfig')({ ...base, printer: { ...base.printer, darkness: 31 } }).ok, false);
  assert.equal(G('validateConfig')(null).ok, false);
  assert.equal(G('validateConfig')([]).ok, false);
});

test('enumerations and the margin list are checked', () => {
  const base = plain(G('configFromDoc')(starter()));
  assert.match(G('validateConfig')({ ...base, unit: 'cm' }).errors[0], /unit must be one of/);
  assert.match(G('validateConfig')({ ...base, dpi: 100 }).errors[0], /dpi must be one of/);
  assert.match(G('validateConfig')({ ...base, style: { ...base.style, font: 'comic' } }).errors[0], /style\.font/);
  assert.match(G('validateConfig')({ ...base, printer: { ...base.printer, media: 'tape' } }).errors[0], /printer\.media/);
  assert.equal(G('validateConfig')({ ...base, margin: [1, 2, 3] }).ok, false);
});

test('a label radius cannot be more than half its smaller side (the round label is the limit)', () => {
  const base = plain(G('configFromDoc')(starter()));
  const round = { ...base, label: { ...base.label, w: 50, h: 50, radius: 25 } };
  assert.equal(G('validateConfig')(round).ok, true);
  const bad = { ...base, label: { ...base.label, w: 50, h: 50, radius: 26 } };
  assert.match(G('validateConfig')(bad).errors.join(' '), /half the smaller side/);
});

test('a sheet grid that does not fit its page is refused, and overlapping labels too', () => {
  const sheet = plain(G('configFromDoc')(G('newDoc')({ stock: G('stockById')('avery-l7160') })));
  assert.equal(G('validateConfig')(sheet).ok, true);
  const tooWide = { ...sheet, stock: { ...sheet.stock, cols: 4 } };
  assert.match(G('validateConfig')(tooWide).errors.join(' '), /do not fit on the 210 mm wide sheet/);
  const tooTall = { ...sheet, stock: { ...sheet.stock, rows: 9 } };
  assert.match(G('validateConfig')(tooTall).errors.join(' '), /do not fit on the 297 mm high sheet/);
  const overlap = { ...sheet, stock: { ...sheet.stock, hpitch: 40 } };
  assert.match(G('validateConfig')(overlap).errors.join(' '), /overlap/);
});

test('data columns are a list of names, and a mapping for an unlisted column is dropped', () => {
  const base = plain(G('configFromDoc')(starter()));
  const ok = G('validateConfig')({ ...base, data: { columns: ['SKU', 'Price'], map: { SKU: 'Code', Nope: 'x' }, qtyCol: 'Price' } });
  assert.equal(ok.ok, true);
  assert.deepEqual(plain(ok.body.data.map), { SKU: 'Code' });
  assert.equal(G('validateConfig')({ ...base, data: { columns: 'SKU' } }).ok, false);
});

test('applying a config sets the label, stock, printer and style, keeps the objects, and reports missing data columns', () => {
  const doc = starter();
  doc.objects.push(G('makeObject')('text', { content: 'keep me' }));
  doc.data = { columns: ['SKU', 'Price'], rows: [['A', '1']], map: { SKU: 'Code', Price: 'Cost' }, qtyCol: '' };
  const body = plain(G('configFromDoc')(G('newDoc')({ stock: G('stockById')('avery-l7651') })));
  body.data = { columns: ['SKU', 'Weight'], map: { SKU: 'Item', Weight: 'Kg' }, qtyCol: 'Weight' };
  const notes = G('applyConfigToDoc')(doc, body);
  assert.equal(doc.label.w, 38.1);
  assert.equal(doc.stock.kind, 'sheet');
  assert.equal(doc.stock.cols, 5);
  assert.equal(doc.objects.length, 1);
  assert.equal(doc.objects[0].content, 'keep me');
  assert.deepEqual(plain(doc.data.map), { SKU: 'Item' });
  assert.equal(doc.data.qtyCol, '');
  assert.match(notes.join(' '), /1 column from the config not in this data: Weight/);
});

test('a config applied to a document and captured again gives the same config', () => {
  const body = plain(G('configFromDoc')(G('newDoc')({ stock: G('stockById')('avery-l7159') })));
  const doc = starter();
  G('applyConfigToDoc')(doc, body);
  assert.deepEqual(plain(G('configFromDoc')(doc)), body);
});

test('a new text or shape takes the style of the document', () => {
  const doc = starter();
  doc.style = { font: 'mono', colour: 'white', fill: 'black', stroke: 1.5 };
  assert.deepEqual(plain(G('styleProps')(doc, 'text')), { font: 'mono', color: 'white' });
  assert.deepEqual(plain(G('styleProps')(doc, 'para')), { font: 'mono', color: 'white' });
  assert.deepEqual(plain(G('styleProps')(doc, 'rect')), { fill: 'black', stroke: 1.5 });
  assert.deepEqual(plain(G('styleProps')(doc, 'line')), { stroke: 1.5 });
  assert.deepEqual(plain(G('styleProps')(doc, 'barcode')), {});
});

test('names are cleaned and made unique without case mismatches', () => {
  assert.equal(G('cleanConfigName')('  4  ×  6   shipping '), '4 × 6 shipping');
  assert.equal(G('cleanConfigName')('   '), '');
  assert.equal(G('uniqueConfigName')(['Box', 'box 2'], 'Box'), 'Box 3');
  assert.equal(G('uniqueConfigName')([], 'New'), 'New');
});

test('the store keeps configs in a versioned envelope and reads them back after a reload', () => {
  const storage = memStorage();
  const s1 = G('makeConfigStore')(storage, 'k1');
  const body = G('configFromDoc')(starter());
  const a = s1.add('Shipping', body);
  assert.equal(a.ok, true);
  assert.equal(s1.add('shipping', body).ok, false, 'a name in use (any case) is refused');
  const env1 = JSON.parse(storage.raw.get('k1'));
  assert.equal(env1.v, 1);
  assert.equal(env1.data.configs.length, 1);
  const s2 = G('makeConfigStore')(storage, 'k1');
  assert.equal(s2.configs.length, 1);
  assert.equal(s2.configs[0].name, 'Shipping');
  assert.deepEqual(plain(s2.configs[0].body), plain(body));
});

test('rename, duplicate, remove and save as a preset', () => {
  const s = G('makeConfigStore')(memStorage(), 'k2');
  const body = G('configFromDoc')(starter());
  const a = s.add('Address', body).record;
  s.add('Address copy', body);
  assert.equal(s.rename(a.id, 'Address copy').ok, false);
  assert.equal(s.rename(a.id, 'Address 62').ok, true);
  const d = s.duplicate(a.id);
  assert.equal(d.record.name, 'Address 62 copy');
  const p = s.saveAsPreset(d.record.id);
  assert.equal(p.ok, true);
  assert.equal(s.presets.length, 1);
  assert.equal(s.remove(d.record.id), true);
  assert.equal(s.configs.some((r) => r.id === d.record.id), false);
  assert.equal(s.presets.length, 1, 'a preset made from a config stays after the config is deleted');
});

test('a corrupt or newer envelope is read as empty and never overwritten', () => {
  const storage = memStorage();
  storage.setItem('k3', 'not json');
  const s = G('makeConfigStore')(storage, 'k3');
  assert.equal(s.configs.length, 0);
  assert.equal(s.add('X', G('configFromDoc')(starter())).ok, true, 'corrupt data is replaced by the next save');
  const future = memStorage();
  future.setItem('k4', JSON.stringify({ v: 2, data: { configs: [{ id: 'z', name: 'Future', body: {} }] } }));
  const f = G('makeConfigStore')(future, 'k4');
  assert.equal(f.readOnly, true);
  assert.equal(f.add('Mine', G('configFromDoc')(starter())).ok, true, 'the list in memory works for this visit');
  assert.equal(future.raw.get('k4').includes('Future'), true, 'the newer file is left as it was');
});

test('records that do not validate are dropped on load', () => {
  const storage = memStorage();
  const good = { id: 'c1', name: 'Good', body: G('configFromDoc')(starter()) };
  const bad = { id: 'c2', name: 'Bad', body: { label: { w: -3, h: 10 } } };
  storage.setItem('k5', JSON.stringify({ v: 1, data: { configs: [good, bad] } }));
  const s = G('makeConfigStore')(storage, 'k5');
  assert.deepEqual(plain(s.configs.map((r) => r.name)), ['Good']);
});

test('blocked storage: the store works for the visit and says it is not persisted', () => {
  const blocked = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  const s = G('makeConfigStore')(blocked, 'k6');
  assert.equal(s.persisted, true, 'an ordinary storage object starts as persisted');
  const r = s.add('Session only', G('configFromDoc')(starter()));
  assert.equal(r.ok, true);
  assert.equal(s.persisted, false);
  assert.equal(s.configs.length, 1);
  const none = G('makeConfigStore')(null, 'k7');
  assert.equal(none.persisted, false);
});

test('export and import: the file is checked, bad entries are reported and clashing names get a number', () => {
  const src = G('makeConfigStore')(memStorage(), 'k8');
  src.add('Shelf', G('configFromDoc')(starter()));
  const text = src.exportText();
  const dst = G('makeConfigStore')(memStorage(), 'k9');
  dst.add('Shelf', G('configFromDoc')(starter()));
  const r = dst.importText(text);
  assert.equal(r.ok, true);
  assert.equal(r.added, 1);
  assert.deepEqual(plain(dst.configs.map((x) => x.name)), ['Shelf', 'Shelf 2']);

  const file = JSON.parse(text);
  file.configs.push({ name: 'Broken', body: { label: { w: -1, h: 1 } } }, { name: '', body: {} });
  const r2 = dst.importText(JSON.stringify(file));
  assert.equal(r2.added, 1);
  assert.deepEqual(plain(r2.rejected.map((x) => x.name)), ['Broken', '(no name)']);
  assert.match(r2.rejected[0].error, /label\.w must be from/);

  assert.equal(dst.importText('{"format":"other","version":1,"configs":[]}').ok, false);
  assert.match(dst.importText('{"format":"sloplabel-configs","version":9,"configs":[]}').error, /version 9/);
  assert.equal(dst.importText('nope').ok, false);
});
