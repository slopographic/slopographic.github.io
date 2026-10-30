// File convert: routes of several conversions (route finding over the catalog, the alternatives for a middle step, Then…)
// and the route runner (each step's outputs feed the next; fan-out over pages, fan-in to one file), with fake converters.
// Run: node --test tests/node/convert-chain.test.mjs
// Covers: convert/js/core/chain.js, convert/js/core/chain-run.js, convert/js/core/chain-flags.js, convert/js/core/catalog.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routesFrom, moreRoutes, routeTo, middleChoices, thenChoices, dropLast, kindsOf, validRoute, routeLabel, stepLabel, stepsOf, isRoute } from '../../convert/js/core/chain.js';
import { runChain } from '../../convert/js/core/chain-run.js';

// A small graph: a → b → c → d, a → x (lossy) → c, b → d with an engine, a → a (same kind), base64 from anything.
const fake = (id, from, ext, more = {}) => ({ id, label: id, group: 'Data', from, ext, mode: 'each', options: [], run: async () => [], ...more });
const G = [
  fake('a-b', ['a'], 'b'), fake('b-c', ['b'], 'c'), fake('c-d', ['c'], 'd'), fake('d-e', ['d'], 'e'),
  fake('a-x', ['a'], 'x', { lossy: true }), fake('x-c', ['x'], 'c'),
  fake('b-d', ['b'], 'd', { engine: 'ffmpeg' }), fake('a-a', ['a'], 'a'),
  fake('b64', ['*'], 'txt', { group: 'Encoding' }), fake('zip', ['b'], 'zip', { group: 'Archives' }),
  fake('first', ['c'], 'f', { chain: 'first' }), fake('never', ['b'], 'g', { chain: false }),
  fake('p-img', ['p'], 'png', { options: [{ key: 'format', type: 'select', value: 'png', options: [['png', 'PNG'], ['jpg', 'JPG']] }] }),
  fake('to-webp', ['png', 'jpg'], 'webp'), fake('to-png', ['jpg'], 'png'),
];
const opts = { convs: G };
const best = (src, kind) => moreRoutes(src, opts).find((r) => r.kinds.at(-1) === kind)?.key;

test('the shortest route wins, and a route never has more than three steps', () => {
  assert.equal(best('a', 'c'), 'a-b>b-c');
  assert.equal(routeTo('a', 'e', opts), 'a-b>b-d>d-e');   // within three steps only with the engine
  assert.ok(routesFrom('a', opts).every((r) => r.kinds.length <= 4));
  assert.equal(routeTo('a', 'e', { ...opts, max: 4 }), 'a-b>b-c>c-d>d-e');
});

test('as short: a lossless route beats a lossy one; an engine download is avoided unless it is the only way', () => {
  assert.equal(best('a', 'c'), 'a-b>b-c');   // not a-x>x-c
  assert.equal(best('a', 'd'), 'a-b>b-c>c-d');   // three steps, rather than a-b>b-d with the video engine
  assert.equal(routeTo('b', 'd', opts), 'b-d');   // a direct conversion is a direct conversion
  const noLossless = G.filter((c) => c.id !== 'b-c');
  assert.equal(moreRoutes('a', { convs: noLossless }).find((r) => r.kinds.at(-1) === 'c').key, 'a-x>x-c');
});

test('encoding, archive, same-kind, any-file and never-chained conversions are not used; first-only ones only first', () => {
  const keys = routesFrom('a', opts).map((r) => r.key);
  assert.ok(!keys.some((k) => /b64|zip|a-a|never/.test(k)));
  assert.ok(!keys.some((k) => k.includes('first')));   // 'first' takes c, which is never a's first step
  assert.equal(routeTo('c', 'f', opts), 'first');
  assert.ok(!routesFrom('a', opts).some((r) => new Set(r.kinds).size !== r.kinds.length));   // no kind twice
});

test('a Format option is one edge per format, written as @kind when it is not the default', () => {
  assert.equal(routeTo('p', 'webp', opts), 'p-img>to-webp');
  assert.deepEqual(kindsOf('p', 'p-img@jpg>to-webp', G), ['p', 'jpg', 'webp']);
  assert.deepEqual(kindsOf('p', 'p-img', G, { format: 'jpg' }), ['p', 'jpg']);
  assert.equal(validRoute('p', 'p-img@gif>to-webp', G), false);
  assert.equal(validRoute('a', 'b-c', G), false);
  assert.deepEqual(stepsOf('p-img@jpg>to-webp', G).map((s) => [s.id, s.fmt]), [['p-img', 'jpg'], ['to-webp', '']]);
  assert.ok(isRoute('a>b') && !isRoute('a-b'));
});

test('the alternatives for a middle step keep both ends, the current one first', () => {
  const alt = middleChoices('a', 'a-b>b-c', 0, opts);
  assert.deepEqual(alt.map((x) => [x.kind, x.key, x.current]), [['b', 'a-b>b-c', true], ['x', 'a-x>x-c', false]]);
  assert.deepEqual(middleChoices('p', 'p-img>to-webp', 0, opts).map((x) => x.key), ['p-img>to-webp', 'p-img@jpg>to-webp']);
  assert.deepEqual(middleChoices('a', 'a-b>b-c', 1, opts), []);
});

test('Then… lists what the end can become; removing the last step gives back its format', () => {
  assert.deepEqual(thenChoices('a', 'a-b>b-c', opts).map((x) => x.key), ['a-b>b-c>c-d']);
  assert.deepEqual(thenChoices('p', 'p-img', { ...opts, finalOpts: { format: 'jpg' } }).map((x) => x.key), ['p-img@jpg>to-webp', 'p-img@jpg>to-png']);
  assert.deepEqual(dropLast('p-img@jpg>to-webp'), { key: 'p-img', fmt: 'jpg' });
  assert.deepEqual(dropLast('a-b>b-c>c-d'), { key: 'a-b>b-c', fmt: '' });
});

test('the real catalog: SIE to JSON goes through CSV, HEIC to PDF through PNG, PDF to WebP through page pictures', () => {
  assert.equal(routeTo('sie', 'json'), 'sie-to-csv>csv-to-json');
  assert.equal(routeTo('sie', 'csv-to-json'), 'sie-to-csv>csv-to-json');
  assert.equal(routeTo('sie', 'yaml'), 'sie-to-csv>csv-to-json>json-to-yaml');
  assert.equal(routeTo('xlsx', 'yaml'), 'xlsx-to-json>json-to-yaml');
  assert.equal(routeTo('pdf', 'webp'), 'pdf-to-images>to-webp');
  assert.equal(routeTo('heic', 'pdf'), 'heic-to-png>images-to-pdf');
  assert.equal(routeTo('csv', 'json'), 'csv-to-json');
  assert.equal(routeLabel('sie', 'sie-to-csv>csv-to-json>json-to-yaml'), 'YAML · via CSV, JSON');
  assert.equal(stepLabel(['sie', 'csv', 'json'], 1), 'Step 2 · CSV → JSON');
  assert.deepEqual(middleChoices('sie', 'sie-to-csv>csv-to-json', 0).map((x) => x.kind), ['csv', 'xlsx']);
  assert.deepEqual(thenChoices('sie', 'sie-to-csv>csv-to-json>json-to-yaml').map((x) => x.key), []);   // not back to JSON
  assert.ok(thenChoices('sie', 'sie-to-csv').every((x) => !/base64|url-|line-endings/.test(x.key)));
  const more = moreRoutes('png').map((r) => r.key);
  assert.ok(!more.some((k) => /pdf-to-(text|docx|xlsx|html)|base64|zip/.test(k)));   // no text from a picture
});

// Fake converters for the runner: text in, text out, with the steps visible in the names.
const text = async (f) => (typeof f.file.text === 'function' ? f.file.text() : String(f.file));
const conv = (id, ext, fn, mode = 'each') => ({ id, ext, mode, options: [], run: async (files, o) => fn(files, o) });
const blob = (s, type = 'text/plain') => new Blob([s], { type });
const ITEM = (id, name, body, kind = 'a') => ({ id, name, kind, file: new Blob([body]) });

test('steps run in order, each feeding the next, with each file\'s own options', async () => {
  const up = conv('up', 'b', async ([f], o) => [{ name: f.name.replace(/\.\w+$/, '.b'), blob: blob((await text(f)).toUpperCase() + (o.mark || '')) }]);
  const rev = conv('rev', 'c', async ([f]) => [{ name: f.name.replace(/\.\w+$/, '.c'), blob: blob([...(await text(f))].reverse().join('')) }]);
  const seen = [];
  const res = await runChain([{ conv: up, to: 'b' }, { conv: rev, to: 'c' }], [ITEM(1, 'one.a', 'ab'), ITEM(2, 'two.a', 'cd')],
    { optsFor: (c, it) => (c.id === 'up' && it.id === 2 ? { mark: '!' } : {}), progress: (p) => seen.push(`${p.step}/${p.steps} ${p.from}>${p.to} ${p.done}/${p.total}`) });
  assert.deepEqual(await Promise.all(res.outputs.map(async (o) => [o.name, await o.blob.text()])), [['one.c', 'BA'], ['two.c', '!DC']]);
  assert.deepEqual(seen, ['1/2 a>b 0/2', '1/2 a>b 1/2', '2/2 b>c 0/2', '2/2 b>c 1/2']);
  assert.deepEqual(res.middles, []);
});

test('fan-out: a step that makes several files maps the next step over each; fan-in: a combine step takes them all', async () => {
  const pages = conv('pages', 'png', async ([f], o) => [1, 2, 3].map((n) => ({ name: `doc-page-${n}.${o.format || 'png'}`, blob: blob(`p${n}`) })));
  const webp = conv('webp', 'webp', async ([f]) => [{ name: f.name.replace(/\.\w+$/, '.webp'), blob: blob(await text(f)) }]);
  const pdf = conv('pdf', 'pdf', async (files) => [{ name: 'all.pdf', blob: blob((await Promise.all(files.map(text))).join('+')) }], 'combine');
  const calls = [];
  const spy = { ...webp, run: async (files, o) => { calls.push(files.length); return webp.run(files, o); } };
  const res = await runChain([{ conv: pages, fmt: 'jpg', to: 'jpg' }, { conv: spy, to: 'webp' }, { conv: pdf, to: 'pdf' }], [ITEM(7, 'doc.p', '', 'p')], { keep: () => true });
  assert.deepEqual(calls, [1, 1, 1]);
  assert.equal(res.outputs.length, 1);
  assert.equal(await res.outputs[0].blob.text(), 'p1+p2+p3');
  assert.deepEqual(res.outputs[0].src, [7]);
  assert.deepEqual(res.middles.map((m) => [m.name, m.step]), [['doc-page-1.jpg', 1], ['doc-page-2.jpg', 1], ['doc-page-3.jpg', 1],
    ['doc-page-1.webp', 2], ['doc-page-2.webp', 2], ['doc-page-3.webp', 2]]);
});

test('an error names its step, stops only the files it came from, and the rest go on', async () => {
  const ok = conv('ok', 'b', async ([f]) => [{ name: f.name + '.b', blob: blob('x') }]);
  const bad = conv('bad', 'c', async ([f]) => { if (f.name.startsWith('two')) throw new Error('No table here.'); return [{ name: f.name + '.c', blob: blob('y') }]; });
  const res = await runChain([{ conv: ok, to: 'csv' }, { conv: bad, to: 'json' }], [ITEM(1, 'one', ''), ITEM(2, 'two', '', 'sie')]);
  assert.deepEqual(res.outputs.map((o) => o.name), ['one.b.c']);
  assert.equal(res.errors.length, 1);
  assert.deepEqual(res.errors[0].ids, [2]);
  assert.equal(res.errors[0].step, 2);
  assert.equal(res.errors[0].message, 'Step 2 of 2 (CSV → JSON) failed: No table here.');
});
