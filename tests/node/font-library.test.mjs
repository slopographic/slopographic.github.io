// Font library: the pack manifest rules, the SHA-256 and size check, and the bundled fonts on disk
// (WOFF2 files, one LICENSE per family, OFL text, index matching the picker's family list, size budget).
// Run: node tests/run.mjs font-library   (or node --test tests/node/font-library.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const M = require(path.join(ROOT, 'shared/library/manifest.js'));
const C = require(path.join(ROOT, 'shared/cdn/assets.js'));
const packs = JSON.parse(readFileSync(path.join(ROOT, 'shared/library/packs.json'), 'utf8'));
const index = JSON.parse(readFileSync(path.join(ROOT, 'shared/fonts/library/index.json'), 'utf8'));
const HOSTS = ['raw.githubusercontent.com', 'cdn.jsdelivr.net'];
const URL_OK = 'https://raw.githubusercontent.com/example/fonts/main/ofl/demo/Demo-Regular.woff2';
const BYTES = Buffer.from('wOF2-demo-font-bytes');

async function sample(over = {}) {
  const sha = await M.sha256Hex(BYTES.buffer.slice(BYTES.byteOffset, BYTES.byteOffset + BYTES.byteLength));
  const file = { name: 'Demo-Regular.woff2', url: URL_OK, size: BYTES.length, sha256: sha, family: 'Demo Sans', weight: '400', style: 'normal' };
  const pack = { id: 'demo-sans', name: 'Demo Sans', licence: 'OFL-1.1', size: BYTES.length, files: [file], ...over };
  return { hosts: HOSTS, packs: [pack] };
}
const arrayBuf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

test('the shipped pack list is valid (and empty until the owner adds packs)', () => {
  const r = M.validate(packs);
  assert.deepEqual(r.errors, []);
  assert.equal(r.packs.length, packs.packs.length);
  // every file is a cdn path, and comes back with the URL shared/cdn/assets.js gives it (no URL written into packs.json)
  for (const p of r.packs) for (const f of p.files) assert.equal(f.url, C.url(f.cdn), f.cdn);
  assert.doesNotMatch(readFileSync(path.join(ROOT, 'shared/library/packs.json'), 'utf8'), /githubusercontent\.com\/slopographic|jsdelivr\.net\/gh\/slopographic/);
  assert.ok(Array.isArray(packs.hosts) && packs.hosts.length > 0, 'hosts allowlist is set');
});

test('a well-formed pack validates and comes back normalised', async () => {
  const r = M.validate(await sample());
  assert.deepEqual(r.errors, []);
  assert.equal(r.packs.length, 1);
  assert.equal(r.packs[0].size, BYTES.length);
  assert.equal(r.packs[0].files[0].style, 'normal');
});

test('a pack with a licence outside the open list is dropped with a message', async () => {
  const r = M.validate(await sample({ licence: 'Proprietary' }));
  assert.equal(r.packs.length, 0);
  assert.match(r.errors[0], /licence "Proprietary"/);
});

test('files must come from an https URL on an allowed host (exact host match)', async () => {
  const bad = ['http://raw.githubusercontent.com/a/Demo-Regular.woff2', 'https://evil.example.com/Demo-Regular.woff2', 'https://raw.githubusercontent.com.evil.example/Demo-Regular.woff2', 'not a url'];
  for (const url of bad) {
    const m = await sample();
    m.packs[0].files[0].url = url;
    assert.equal(M.validate(m).packs.length, 0, url);
  }
  assert.equal(M.allowedUrl(URL_OK, HOSTS), true);
  assert.equal(M.allowedUrl(URL_OK, ['cdn.jsdelivr.net']), false);
});

test('a cdn path must be a plain path in the repository', async () => {
  for (const cdn of ['../evil/Demo-Regular.woff2', '/packs/Demo-Regular.woff2', 'packs/a/../../x/Demo-Regular.woff2', 'packs/x?y=1', 'https://evil.example/Demo-Regular.woff2']) {
    const m = await sample();
    delete m.packs[0].files[0].url;
    m.packs[0].files[0].cdn = cdn;
    assert.equal(M.validate(m).packs.length, 0, cdn);
  }
  const ok = await sample();
  delete ok.packs[0].files[0].url;
  ok.packs[0].files[0].cdn = 'packs/demo/v1/Demo-Regular.woff2';
  const f = M.validate(ok).packs[0].files[0];
  assert.equal(f.url, 'https://cdn.jsdelivr.net/gh/slopographic/cdn@' + C.TAG + '/packs/demo/v1/Demo-Regular.woff2');
});

test('only font files are accepted, and the declared pack size must add up', async () => {
  const m = await sample();
  m.packs[0].files[0].name = 'Demo-Regular.html';
  assert.equal(M.validate(m).packs.length, 0);
  const n = await sample({ size: BYTES.length + 1 });
  const r = M.validate(n);
  assert.equal(r.packs.length, 0);
  assert.match(r.errors[0], /does not match the files/);
});

test('ids, SHA-256 format and duplicate ids are checked', async () => {
  const badId = await sample({ id: 'Demo Sans' });
  assert.equal(M.validate(badId).packs.length, 0);
  const badSha = await sample();
  badSha.packs[0].files[0].sha256 = 'ABC';
  assert.equal(M.validate(badSha).packs.length, 0);
  const dup = await sample();
  dup.packs.push(JSON.parse(JSON.stringify(dup.packs[0])));
  const r = M.validate(dup);
  assert.equal(r.packs.length, 1);
  assert.match(r.errors[0], /duplicate pack id/);
});

test('metricFor is kept on a file when it is a short list of names, and refused otherwise', async () => {
  const ok = await sample();
  ok.packs[0].files[0].metricFor = [' Calibri '];
  assert.deepEqual(M.validate(ok).packs[0].files[0].metricFor, ['Calibri']);
  const none = await sample();
  assert.equal('metricFor' in M.validate(none).packs[0].files[0], false);
  for (const bad of ['Calibri', [], ['a', 'b', 'c', 'd', 'e'], [''], [7]]) {
    const m = await sample();
    m.packs[0].files[0].metricFor = bad;
    const r = M.validate(m);
    assert.equal(r.packs.length, 0, JSON.stringify(bad));
    assert.match(r.errors[0], /metricFor/);
  }
});

test('the metric-compatible pack: four static faces per family, each naming the Office font it matches', () => {
  const p = packs.packs.find((x) => x.id === 'metric-compatible');
  assert.ok(p, 'listed in packs.json');
  const want = { Carlito: 'Calibri', Caladea: 'Cambria', Arimo: 'Arial', Tinos: 'Times New Roman', Cousine: 'Courier New' };
  assert.deepEqual([...new Set(p.files.map((f) => f.family))].sort(), Object.keys(want).sort());
  for (const [fam, office] of Object.entries(want)) {
    const fs = p.files.filter((f) => f.family === fam);
    assert.deepEqual(fs.map((f) => `${f.weight} ${f.style}`).sort(), ['400 italic', '400 normal', '700 italic', '700 normal'], fam);
    for (const f of fs) {
      assert.deepEqual(f.metricFor, [office], f.name);
      assert.match(f.cdn, /^packs\/metric-compatible\/v1\//, 'a path in the cdn repository (its URLs: shared/cdn/assets.js)');
      assert.ok(/\.ttf$/.test(f.name), 'TTF, so a PDF can embed it');
    }
  }
});

test('verifyBytes accepts the exact bytes and refuses changed bytes or a wrong length', async () => {
  const m = await sample();
  const file = m.packs[0].files[0];
  assert.equal((await M.verifyBytes(arrayBuf(BYTES), file)).ok, true);
  const changed = Buffer.from(BYTES); changed[0] ^= 1;
  const r1 = await M.verifyBytes(arrayBuf(changed), file);
  assert.equal(r1.ok, false);
  assert.match(r1.reason, /SHA-256/);
  const r2 = await M.verifyBytes(arrayBuf(BYTES.subarray(0, 5)), file);
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /expected/);
  assert.equal((await M.verifyBytes(undefined, file)).ok, false);
});

test('sha256Hex matches the known digest of "abc"', async () => {
  const h = await M.sha256Hex(new TextEncoder().encode('abc').buffer);
  assert.equal(h, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('sizes are shown in B, KB or MB', () => {
  assert.equal(M.formatSize(500), '500 B');
  assert.equal(M.formatSize(2048), '2 KB');
  assert.equal(M.formatSize(3.5 * 1024 * 1024), '3.5 MB');
});

test('bundled index: every file exists, is WOFF2, has its family licence, and matches the picker list', () => {
  const dir = path.join(ROOT, 'shared/fonts/library');
  const families = new Set();
  for (const f of index.fonts) {
    families.add(f.family);
    const p = path.join(dir, f.file);
    assert.ok(existsSync(p), f.file);
    assert.equal(readFileSync(p).subarray(0, 4).toString('latin1'), 'wOF2', `${f.file} is WOFF2`);
    assert.equal(f.licence, 'SIL Open Font License 1.1');
    assert.ok(/^https:\/\//.test(f.source), 'source URL');
    const lic = path.join(dir, f.licenceFile);
    assert.ok(existsSync(lic), f.licenceFile);
    assert.match(readFileSync(lic, 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
  }
  // One font list: the picker has no family names of its own; it reads the index (the one list) and nothing else.
  const picker = readFileSync(path.join(ROOT, 'shared/fonts/picker.js'), 'utf8');
  assert.ok(!/BUNDLED|'Inter'|'Roboto'/.test(picker), 'no second list of bundled families in the picker');
  assert.ok(picker.includes("'index.json'"), 'the picker reads library/index.json');
  assert.equal(families.size, 12);
});

test('bundled fonts stay under the 8 MB budget', () => {
  const total = (d) => readdirSync(d).reduce((n, e) => { const p = path.join(d, e); return n + (statSync(p).isDirectory() ? total(p) : statSync(p).size); }, 0);
  assert.ok(total(path.join(ROOT, 'shared/fonts/library')) < 8 * 1024 * 1024);
});
