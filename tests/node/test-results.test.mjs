// The runner's own helpers: the CI results turned into tests/timings.json and tests/net-urls.txt (tests/results.mjs), the
// download cache's rules (tests/netcache.mjs) and the start order of a slice's pages (tests/shard.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mergeResults, newTimings, netLines, parseNetUrls } from '../results.mjs';
import { cacheable, keptHeaders, keyOf, load, store, cachedUrls } from '../netcache.mjs';
import { longestFirst } from '../shard.mjs';

test('results of several slices merge, and become timings and net-urls lines', () => {
  const a = { pages: { 'tests/a.test.html': { secs: 4.04, net: { urls: ['https://x/2', 'https://x/1'] } } } };
  const b = { pages: { 'tests/b.test.html': { secs: 1, net: { urls: [] } }, 'tests/a.test.html': { secs: 2, net: { urls: [] } } } };
  const pages = mergeResults([a, b]);
  assert.equal(pages['tests/a.test.html'].secs, 4.04);
  assert.deepEqual(newTimings({ 'tests/gone.test.html': 9, 'tests/c.test.html': 3 }, pages, (p) => p !== 'tests/gone.test.html'),
    { 'tests/a.test.html': 4, 'tests/b.test.html': 1, 'tests/c.test.html': 3 });
  const lines = netLines(pages);
  assert.deepEqual(lines, ['tests/a.test.html https://x/1', 'tests/a.test.html https://x/2']);
  const back = parseNetUrls(lines.join('\n') + '\n\nnonsense\n');
  assert.deepEqual([...back.pages], ['tests/a.test.html']);
  assert.deepEqual(back.urls, ['https://x/1', 'https://x/2']);
});

test('only whole-file GETs on the pinned model hosts and CDNs are cached; transfer headers are not replayed', () => {
  assert.ok(cacheable('GET', 'https://huggingface.co/a/resolve/abc/model.onnx'));
  assert.ok(cacheable('GET', 'https://cas-bridge.xethub.hf.co/x'));
  assert.ok(cacheable('GET', 'https://cdn.jsdelivr.net/npm/x@1.0.0/a.wasm'));
  assert.ok(!cacheable('POST', 'https://huggingface.co/a'));
  assert.ok(!cacheable('GET', 'https://huggingface.co/a', { range: 'bytes=0-9' }));
  assert.ok(!cacheable('GET', 'http://huggingface.co/a'));
  assert.ok(!cacheable('GET', 'https://huggingface.co.evil.com/a'));
  assert.ok(!cacheable('GET', 'https://www.googleapis.com/drive/v3/files'));
  assert.deepEqual(keptHeaders({ 'Content-Encoding': 'gzip', 'content-length': '9', 'content-type': 'x', 'access-control-allow-origin': '*' }),
    { 'content-type': 'x', 'access-control-allow-origin': '*' });
});

test('a stored file comes back whole, and a cut-short one is a miss', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'netcache-'));
  const url = 'https://cdn.jsdelivr.net/npm/x@1/a.bin';
  assert.equal(await load(dir, url), null);
  await store(dir, url, { headers: { 'content-type': 'application/octet-stream', 'content-encoding': 'br' }, body: Buffer.from('hello') });
  const hit = await load(dir, url);
  assert.equal(hit.body.toString(), 'hello');
  assert.deepEqual(hit.meta.headers, { 'content-type': 'application/octet-stream' });
  assert.deepEqual(await cachedUrls(dir), [url]);
  await writeFile(path.join(dir, keyOf(url) + '.bin'), 'hel');
  assert.equal(await load(dir, url), null);
});

test('a slice starts its longest pages first', () => {
  assert.deepEqual(longestFirst(['a', 'b', 'c', 'd'], { a: 1, b: 9, c: 5 }), ['b', 'c', 'd', 'a']);
});
