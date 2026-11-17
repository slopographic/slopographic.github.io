// The speech models (aitools/speech-models.js): every file on the slopographic/cdn repository at its release tag, big
// files in parts under 95 MB that add up, and the ranking the Language and model dialog and the upgrade offer use.
// The download of a file in parts (aitools/download.js): each part checked, joined, the whole checked; any mismatch,
// a host outside the list or a cancel keeps nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SM = require('../../aitools/speech-models.js');
const R = require('../../aitools/model-registry.js');
const { fetchFile } = require('../../aitools/download.js');
const C = require('../../shared/cdn/assets.js');
const ids = (lang) => SM.rank(lang).map((r) => r.model.id);

test('every speech model is in the model index, with a licence, every file on the cdn at the release tag', () => {
  assert.deepEqual(R.problems(), []);
  for (const m of SM.MODELS) {
    assert.ok(R.byId(m.id), m.id);
    assert.ok(['MIT', 'Apache-2.0'].includes(m.licence));
    const names = m.files.map((f) => f.name);
    for (const n of ['encoder_model_quantized.onnx', 'decoder_model_merged_quantized.onnx', 'vocab.json', 'added_tokens.json', 'config.json', 'generation_config.json']) assert.ok(names.includes(n), `${m.id} ${n}`);
    for (const f of m.files) for (const u of R.urlsOf(f)) {
      const p = C.pathOf(u);
      assert.ok(p && p.startsWith(SM.CDN + m.id + '/'), u);
      assert.equal(u, C.url(p), 'the first place shared/cdn/assets.js gives');
    }
    for (const f of m.files) if (f.size > 95e6) assert.ok(f.parts && f.parts.length >= 2, `${m.id} ${f.name} must be in parts`);
  }
});

test('Swedish: KB-Whisper small, then base, then the multilingual models; tiny last as the fast option', () => {
  assert.deepEqual(ids('sv'), ['kb-whisper-small', 'kb-whisper-base', 'whisper-small', 'whisper-base', 'whisper-tiny']);
  assert.deepEqual(SM.rank('sv')[0].badges, ['recommended', 'made-for']);
  assert.deepEqual(SM.rank('sv').at(-1).badges, ['fastest']);
  assert.equal(SM.recommended('sv').id, 'kb-whisper-small');
});

test('English: the English-only models first; Norwegian: NB-Whisper; other languages and Detect: the multilingual ones', () => {
  assert.deepEqual(ids('en').slice(0, 2), ['whisper-small-en', 'whisper-base-en']);
  assert.deepEqual(SM.rank('en')[0].badges, ['recommended', 'only']);
  assert.deepEqual(ids('no').slice(0, 2), ['nb-whisper-small', 'nb-whisper-base']);
  assert.deepEqual(ids('nn').slice(0, 2), ['nb-whisper-small', 'nb-whisper-base']);
  assert.deepEqual(ids('de'), ['whisper-small', 'whisper-base', 'whisper-tiny']);
  assert.deepEqual(ids('auto'), ['whisper-small', 'whisper-base', 'whisper-tiny']);
  assert.equal(SM.recommended('de').id, 'whisper-small');
  for (const lang of ['sv', 'en', 'de', 'auto', 'haw']) assert.ok(ids(lang).includes('whisper-tiny'), `${lang} lists tiny`);
});

const sha = async (b) => createHash('sha256').update(Buffer.from(b.buffer || b, b.byteOffset || 0, b.byteLength)).digest('hex');
const bytes = (n, seed) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255);
/** A fake network: url -> bytes; records the order of requests. */
function net(files, { redirect = {} } = {}) {
  const asked = [];
  const fetch = async (url, o) => {
    asked.push(url);
    if (o && o.signal && o.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    const b = files[url];
    if (!b) return { ok: false, status: 404 };
    return { ok: true, status: 200, url: redirect[url] || url, arrayBuffer: async () => b.slice().buffer };
  };
  return { fetch, asked };
}
const allowedUrl = (u) => u.startsWith('https://raw.githubusercontent.com/slopographic/cdn/');
const U = (n) => 'https://raw.githubusercontent.com/slopographic/cdn/c/' + n;

test('a file in parts: downloaded in order, each part checked, joined and the whole checked', async () => {
  const whole = bytes(250, 3), a = whole.slice(0, 100), b = whole.slice(100, 200), c = whole.slice(200);
  const f = { name: 'dec.onnx', size: 250, sha256: await sha(whole), parts: [
    { url: U('p1'), size: 100, sha256: await sha(a) }, { url: U('p2'), size: 100, sha256: await sha(b) }, { url: U('p3'), size: 50, sha256: await sha(c) }] };
  const n = net({ [U('p1')]: a, [U('p2')]: b, [U('p3')]: c }), seen = [];
  const out = new Uint8Array(await fetchFile(f, { fetch: n.fetch, sha256Hex: sha, allowedUrl, onBytes: (x) => seen.push(x) }));
  assert.deepEqual([...out], [...whole]);
  assert.deepEqual(n.asked, [U('p1'), U('p2'), U('p3')]);
  assert.equal(seen.at(-1), 250, 'progress counts over the whole file');
  // a bad part, a joined file that does not match, a redirect away, a cancel: all reject
  const badPart = { ...f, parts: [f.parts[0], { ...f.parts[1], sha256: await sha(c) }, f.parts[2]] };
  await assert.rejects(fetchFile(badPart, { fetch: n.fetch, sha256Hex: sha, allowedUrl }), /part 2 of 3: SHA-256/);
  await assert.rejects(fetchFile({ ...f, sha256: await sha(a) }, { fetch: n.fetch, sha256Hex: sha, allowedUrl }), /joined parts does not match/);
  const away = net({ [U('p1')]: a, [U('p2')]: b, [U('p3')]: c }, { redirect: { [U('p2')]: 'https://evil.example/p2' } });
  await assert.rejects(fetchFile(f, { fetch: away.fetch, sha256Hex: sha, allowedUrl }), /not allowed/);
  const ctrl = new AbortController(); ctrl.abort();
  await assert.rejects(fetchFile(f, { fetch: n.fetch, sha256Hex: sha, allowedUrl, signal: ctrl.signal }), (e) => e.name === 'AbortError');
});

test('a file in one piece: its length and SHA-256 are checked', async () => {
  const b = bytes(40, 9), f = { name: 'vocab.json', size: 40, sha256: await sha(b), url: U('v') };
  const n = net({ [U('v')]: b });
  assert.equal((await fetchFile(f, { fetch: n.fetch, sha256Hex: sha, allowedUrl })).byteLength, 40);
  await assert.rejects(fetchFile({ ...f, size: 41 }, { fetch: n.fetch, sha256Hex: sha, allowedUrl }), /40 bytes, expected 41/);
  await assert.rejects(fetchFile({ ...f, url: U('missing') }, { fetch: n.fetch, sha256Hex: sha, allowedUrl }), /HTTP 404/);
});

test('the shared catalog ranks any family the same way (an OCR family as the next one would register)', () => {
  const Cat = require('../../shared/models/catalog.js');
  const m = (id, languages, accuracy, speed, extra = {}) => ({ id, name: id, languages, accuracy, speed, files: [{ name: 'a', size: 10, sha256: 'x' }], ...extra });
  const ocr = Cat.create({ family: 'ocr', quick: 'latin-fast', models: [
    m('latin-fast', '*', 1, 5), m('cyrillic', ['ru', 'uk', 'bg'], 4, 3), m('japanese', ['ja'], 4, 2, { only: true }), m('multi-best', '*', 3, 2)] });
  assert.equal(ocr.family, 'ocr');
  assert.deepEqual(ocr.rank('uk').map((r) => [r.model.id, r.badges]), [['cyrillic', ['recommended', 'made-for']], ['multi-best', []], ['latin-fast', ['fastest']]]);
  assert.deepEqual(ocr.rank('ja')[0].badges, ['recommended', 'only']);
  assert.deepEqual(ocr.rank('auto').map((r) => r.model.id), ['multi-best', 'latin-fast']);
  assert.equal(ocr.recommended('fr').id, 'multi-best');
  assert.equal(ocr.bytesOf(ocr.byId('japanese')), 10);
});
