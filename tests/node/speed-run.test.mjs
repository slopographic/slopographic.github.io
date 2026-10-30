// The speed check's command line (tools/speed/run.mjs), its results files, and the server it measures the checkout on
// (tools/speed/serve.mjs: gzip for text, dir/ as dir/index.html, a redirect for dir, 404.html for a missing file).
// Covers: tools/speed/worker.mjs (one Lighthouse per process; it needs Chrome, so the speed workflow runs it)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs, pickPages, readResults } from '../../tools/speed/run.mjs';
import { serve, compressible } from '../../tools/speed/serve.mjs';
import { openWorker } from '../../tools/speed/worker.mjs';

test('options: defaults are 3 runs, 1 job, both presets, check (not update)', () => {
  const o = parseArgs([]);
  assert.equal(o.runs, 3);
  assert.equal(o.jobs, 1);
  assert.deepEqual(o.presets, ['mobile', 'desktop']);
  assert.equal(o.update, false);
  const u = parseArgs(['--update', '--reset=/,pdf/', '--pages=/pdf/', '--shard=2/20', '--runs=1', '--jobs=4', '--presets=desktop', '--from=a.json,b/', '--out=x.json']);
  assert.deepEqual([u.update, u.reset, u.pages, u.shard, u.runs, u.jobs, u.presets, u.from, u.out], [true, ['', 'pdf/'], ['pdf/'], { index: 2, count: 20 }, 1, 4, ['desktop'], ['a.json', 'b/'], 'x.json']);
  assert.equal(parseArgs(['--record', '--from=x/']).record, true);
  for (const bad of [['--record', '--update'], ['--runs=0'], ['--presets=tablet'], ['--reset=pdf/'], ['--nope'], ['--shard=3/2']]) assert.throws(() => parseArgs(bad), undefined, bad.join(' '));
});

test('pages: --pages picks by name (unknown names refused), --shard picks one slice, every page in exactly one slice', () => {
  const all = ['', 'a/', 'b/', 'c/', 'd/', 'e/', 'f/'];
  assert.deepEqual(pickPages(all, { pages: ['b/', ''] }), ['', 'b/']);
  assert.throws(() => pickPages(all, { pages: ['zz/'] }), /zz\/ is not a page/);
  const slices = [1, 2, 3].map((index) => pickPages(all, { shard: { index, count: 3 } }));
  assert.deepEqual(slices.flat().sort(), all);
});

test('results files merge, from files and from directories (as CI\'s artifacts unzip)', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'speed-'));
  mkdirSync(path.join(dir, 'sub'));
  writeFileSync(path.join(dir, 'slice-1.json'), JSON.stringify({ results: { 'a/': { desktop: { lcp: 1 } } }, runs: { 'a/': { desktop: [{ lcp: 1 }] } } }));
  writeFileSync(path.join(dir, 'sub/slice-2.json'), JSON.stringify({ results: { 'a/': { mobile: { lcp: 2 } }, 'b/': { desktop: { lcp: 3 } } } }));
  writeFileSync(path.join(dir, 'other.json'), JSON.stringify({ nothing: true }));
  const r = readResults([dir]);
  assert.deepEqual(r.results, { 'a/': { desktop: { lcp: 1 }, mobile: { lcp: 2 } }, 'b/': { desktop: { lcp: 3 } } });
  assert.deepEqual(r.runs['a/'].desktop, [{ lcp: 1 }]);
});

test('the server compresses text as Pages does, serves dir/ as its index, redirects dir and answers 404.html', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'speed-site-'));
  mkdirSync(path.join(root, 'app'));
  writeFileSync(path.join(root, 'index.html'), '<h1>home</h1>'.repeat(50));
  writeFileSync(path.join(root, 'app/index.html'), '<h1>app</h1>');
  writeFileSync(path.join(root, 'app/pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(path.join(root, '404.html'), 'missing');
  const s = await serve(root, 0);
  try {
    const home = await fetch(s.url, { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(home.headers.get('content-encoding'), 'gzip');
    assert.equal(home.headers.get('cache-control'), 'max-age=600');
    assert.match(await home.text(), /<h1>home<\/h1>/);
    const raw = await fetch(s.url + 'app/', { headers: { 'accept-encoding': 'identity' } });
    assert.equal(raw.headers.get('content-encoding'), null);
    assert.equal(await raw.text(), '<h1>app</h1>');
    const png = await fetch(s.url + 'app/pic.png', { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(png.headers.get('content-encoding'), null);
    assert.equal(png.headers.get('content-type'), 'image/png');
    const redirect = await fetch(s.url + 'app', { redirect: 'manual' });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get('location'), '/app/');
    const missing = await fetch(s.url + 'nope/');
    assert.equal(missing.status, 404);
    assert.equal(await missing.text(), 'missing');
    assert.equal((await fetch(s.url + '..%2f..%2fetc/passwd')).status !== 200, true);
  } finally { await s.close(); }
  assert.ok(compressible('application/javascript; charset=utf-8') && compressible('image/svg+xml') && !compressible('image/png'));
  assert.ok(zlib.gunzipSync(zlib.gzipSync('x')).toString() === 'x');
});

test('a worker answers with the same interface as one Lighthouse, and reports it has ended', async () => {
  const w = openWorker({ timeout: 60000 });
  assert.equal(typeof w.run, 'function');
  assert.equal(w.alive(), true);
  await w.close();
  assert.equal(w.alive(), false);
  await assert.rejects(w.run('http://127.0.0.1:9/', 'desktop'), /exited/);
});
