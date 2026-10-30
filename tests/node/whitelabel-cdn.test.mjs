// Covers: tools/whitelabel/cdn.mjs, tools/whitelabel/scan.mjs
// A build's own file host: only the files the build fetches and the notes beside them, read from the source cdn
// repository at the tag (content only), the notes renamed, a README from the profile, and the scan with its two allowed
// kinds of chance matches. Runs on a made-up cdn repository and a stub build in a temp folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { selection, sortHits, readme, makeCdn, SIDECAR } from '../../tools/whitelabel/cdn.mjs';
import { findTerms } from '../../tools/whitelabel/scan.mjs';
import { ENV } from '../../tools/whitelabel/history-git.mjs';   // without a git hook's GIT_DIR

test('the selection: the assets and the licence, source notes and manifest in their folders', () => {
  const tree = ['models/a/x.onnx', 'models/a/LICENSE-MIT.txt', 'models/a/SOURCE.md', 'models/a/manifest.json', 'models/a/notes.txt',
    'models/b/y.onnx', 'models/b/COPYING', 'README.md', 'packs/c/z.woff2'];
  assert.deepEqual(selection(['models/a/x.onnx', 'packs/c/z.woff2'], tree),
    ['models/a/LICENSE-MIT.txt', 'models/a/SOURCE.md', 'models/a/manifest.json', 'models/a/x.onnx', 'packs/c/z.woff2']);
  assert.ok(SIDECAR.test('COPYRIGHT-LibRaw.txt') && !SIDECAR.test('vocab.json'));
});

test('hits: chance bytes and tokenizer words are allowed; names never', () => {
  const r = sortHits([
    { file: 'm/w.onnx', line: -1, term: 'slop', word: 'qxslopv', text: '(bytes) qxslopv' },
    { file: 'm/w.onnx', line: -1, term: 'slurp', word: 'vslurp', text: '(bytes) vslurp' },
    { file: 'm/w.onnx', line: -1, term: 'slop', word: 'xxslopographicyy', text: '(bytes) slopographic' },
    { file: 'm/w.onnx', line: -1, term: 'slop', word: 'Sloppo', text: '(bytes) Sloppo' },
    { file: 'm/vocab.json', line: 1, term: 'slop', word: 'slop', text: '"Ġslop":1' },
    { file: 'm/SOURCE.md', line: 3, term: 'slop', word: 'Slopographic', text: 'Used by Slopographic' },
  ]);
  assert.deepEqual(r.allowed.map((h) => h.word), ['qxslopv', 'vslurp', 'slop']);
  assert.deepEqual(r.found.map((h) => h.word), ['xxslopographicyy', 'Sloppo', 'Slopographic']);
  assert.ok(r.allowed.every((h) => h.why));
});

test('the scan finds the word where it is, after characters that lower-case to two', () => {
  const s = '"İstanbul":1,"Ġslop":2';
  const [m] = findTerms(s, ['slop']);
  assert.equal(m.word, 'slop');
  assert.equal(s.slice(m.index, m.index + 4), 'slop');
});

test('a cdn for the sample: fresh content at the tag, renamed notes, README, scan', async () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'wl-cdn-'));
  try {
    const repo = path.join(tmp, 'cdn'), build = path.join(tmp, 'build'), out = path.join(tmp, 'out');
    const put = (root, f, data) => { mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); writeFileSync(path.join(root, f), data); };
    const bin = Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from('qqslopzz'), Buffer.from([0, 9])]);
    put(repo, 'models/a/x.bin', bin);
    put(repo, 'models/a/SOURCE.md', '- Used by: Slopographic (PhotoSlop), https://github.com/slopographic/cdn\n');
    put(repo, 'models/a/LICENSE.txt', 'MIT\n');
    const vocab = '{"Ġslop":1,"Ġslope":2}\n';
    put(repo, 'models/a/vocab.json', vocab);
    put(repo, 'models/a/notes.txt', 'not a sidecar\n');
    put(repo, 'other/y.bin', 'never asked for\n');
    const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { stdio: 'ignore', env: ENV });
    git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'source history that must not travel'); git('tag', 'v2026.1.2');
    put(repo, 'models/a/x.bin', 'changed after the tag');                               // the tag's bytes are what count
    put(build, 'shared/cdn/assets.js', "const TAG = 'v2026.1.2';\n");
    put(build, 'tools/cdn-assets.mjs', `export async function allAssets() { return [{ path: 'models/a/x.bin', size: ${bin.length} }, { path: 'models/a/vocab.json', size: ${Buffer.byteLength(vocab)} }]; }\n`);
    const r = await makeCdn('sample', build, repo, out, { ref: 'v2026.1.2' });
    assert.equal(r.tag, 'v2026.1.2');
    assert.deepEqual(r.found, []);
    assert.deepEqual(r.allowed.map((h) => h.file).sort(), ['models/a/vocab.json', 'models/a/x.bin']);
    assert.deepEqual(readFileSync(path.join(out, 'models/a/x.bin')), bin);
    assert.equal(readFileSync(path.join(out, 'models/a/SOURCE.md'), 'utf8'), '- Used by: Acme Tools (Image Editor), https://github.com/acme-example/cdn\n');
    assert.ok(existsSync(path.join(out, 'models/a/LICENSE.txt')));
    assert.ok(!existsSync(path.join(out, 'models/a/notes.txt')) && !existsSync(path.join(out, 'other')) && !existsSync(path.join(out, '.git')));
    assert.match(readFileSync(path.join(out, 'README.md'), 'utf8'), /cdn\.jsdelivr\.net\/gh\/acme-example\/cdn@v2026\.1\.2/);
    assert.equal(readme({ name: 'X', github: 'x' }, 'v1').includes('Generated - do not edit'), true);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
