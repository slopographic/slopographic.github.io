// Covers: tools/content-check/check.mjs, tools/content-check/git.mjs, tools/content-check/words.mjs, tools/content-check/unpack.mjs, tools/content-check/spelled.mjs
// The content check (a mirror's .github/workflows/content.yml): everything in a git repository, searched for a made-up
// word. A clean repository passes; the word in a file's text, a file or folder name, a commit message, an author, a
// branch or tag name, a binary's UTF-16, a zip member or a spelling fails, and so does a PDF it cannot read; a keep word
// and an allowed blob pass; no rules fail. The output never shows the word outside its mask lines, and the masks come
// first. What a file holds besides its text (PDF, PNG, spellings): tests/node/content-check-unpack.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRules, masks, redactor, report, NO_RULES } from '../../tools/content-check/check.mjs';
import { findWords } from '../../tools/content-check/words.mjs';
import { treeNames, objectTexts } from '../../tools/content-check/git.mjs';
import { views } from '../../tools/content-check/unpack.mjs';

const CHECK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tools/content-check/check.mjs');
const RULES = { terms: ['acme'], keep: ['acmeology'] };
const ID = '[0-9a-f]{40}';

// git as in a fresh clone: no hook's GIT_DIR, no user or system config (signing, hooks), a fixed made-up identity
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && k !== 'CONTENT_RULES'));
Object.assign(ENV, { GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' });
const git = (dir, args, env = {}) => execFileSync('git', ['-C', dir, ...args], { env: Object.assign({}, ENV, env), encoding: 'utf8' }).trim();

function put(dir, files) {
  for (const [f, data] of Object.entries(files)) { mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); writeFileSync(path.join(dir, f), data); }
}
/** A repository with one clean commit, and a second one with files ({ path: text or bytes }) when given. */
function repo(files = {}, message = 'Add files') {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'content-check-'));
  git(dir, ['init', '-q', '-b', 'main']);
  put(dir, { 'README.md': 'A clean repository.\n', 'docs/guide.txt': 'Nothing to see here.\n' });
  git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'First commit']);
  if (Object.keys(files).length) { put(dir, files); git(dir, ['add', '-A']); git(dir, ['commit', '-qm', message]); }
  return dir;
}

/** Runs the check (rules: an object, a string as the secret's text, or undefined for none). The log is public: no line
 * but a mask holds the word, and the masks come before anything else. */
function run(dir, rules, script = CHECK) {
  const env = Object.assign({}, ENV);
  if (rules !== undefined) env.CONTENT_RULES = typeof rules === 'string' ? rules : JSON.stringify(rules);
  const r = spawnSync(process.execPath, [script, dir], { env, encoding: 'utf8' });
  const out = r.stdout + r.stderr, lines = out.split('\n');
  const masked = lines.findIndex((l) => !l.startsWith('::add-mask::'));
  assert.ok(lines.slice(masked).every((l) => !l.startsWith('::add-mask::')), 'the masks come first');
  for (const l of lines.slice(masked)) assert.doesNotMatch(l, /acme/i, `the word in the output: ${l}`);
  return { code: r.status, out };
}

/** A zip with one deflated member. */
function zip(name, data) {
  const raw = deflateRawSync(data), n = Buffer.from(name);
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(raw.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(raw.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + n.length, 12); end.writeUInt32LE(30 + n.length + raw.length, 16);
  return Buffer.concat([local, n, raw, central, n, end]);
}

test('the parts: the word rule, the rules, the masks, hidden names, tree names, a commit\'s own text', () => {
  assert.deepEqual(findWords('the AcmeKit, ACME, acmeology and pre-acme', ['acme'], ['acmeology']).map((m) => m.word), ['Acme', 'ACME', 'acme']);
  assert.deepEqual(findWords('preACME and camelAcmeCase', ['acme']).map((m) => m.word), ['ACME', 'Acme']);
  const rules = parseRules('{"terms":[" Acme ",""],"keep":["Acmeology"],"allow":["ABC123"]}');
  assert.deepEqual(rules, { terms: ['acme'], keep: ['acmeology'], allow: ['abc123'] });
  assert.deepEqual(masks(rules), ['acme', 'Acme', 'ACME', 'acmeology', 'Acmeology', 'ACMEOLOGY'].map((v) => `::add-mask::${v}`));
  assert.equal(redactor(rules)('src/ACME/acmeology-notes.txt'), 'src/***/***-notes.txt');
  const id = Buffer.alloc(20, 7);
  const tree = Buffer.concat([Buffer.from('100644 a.txt\0'), id, Buffer.from('40000 Acme kit\0'), id]);
  assert.deepEqual(treeNames(tree, 20), ['a.txt', 'Acme kit']);
  const commit = `tree ${'a'.repeat(40)}\nparent ${'b'.repeat(40)}\nauthor Jo <jo@example.invalid> 1 +0000\ncommitter Jo <jo@example.invalid> 1 +0000\n`
    + 'gpgsig -----BEGIN PGP SIGNATURE-----\n \n iQEzAcmeQUFBQUFB+/=\n =AcMe\n -----END PGP SIGNATURE-----\n\nThe message\n';
  const [text] = objectTexts(Buffer.from(commit));
  assert.doesNotMatch(text, /acme|aaaa|bbbb/i, 'ids and the signature are left out');
  assert.match(text, /author Jo[\s\S]*The message/);
  assert.equal(views(Buffer.from('ab')).length, 3);
  const lines = report({ found: [{ kind: 'blob', id: 'f00', path: 'x.bin', count: 2 }, { kind: 'commit', id: 'ba2', count: 1 }], allowed: ['abc'], objects: 9, refs: 2 });
  assert.deepEqual(lines, ['checked 9 objects and 2 refs', 'allowed: blob abc', 'found: blob f00 x.bin (2)', 'found: commit ba2 (1)', 'failed: 2 object(s) or ref(s) hold a forbidden word']);
});

test('a clean repository passes; the word in a file\'s text fails', () => {
  const clean = run(repo(), RULES);
  assert.equal(clean.code, 0, clean.out);
  assert.match(clean.out, /^checked \d+ objects and 1 refs$/m);
  assert.match(clean.out, /^passed: nothing found$/m);
  const r = run(repo({ 'src/app.js': 'const x = 1;\n// made by Acme\n' }), RULES);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, new RegExp(`^found: blob ${ID} src/app\\.js \\(1\\)$`, 'm'));
  assert.match(r.out, /^failed: 1 object\(s\) or ref\(s\) hold a forbidden word$/m);
});

test('file and folder names: the tree that holds them, its path with the word hidden', () => {
  const file = run(repo({ 'docs/acme-notes.txt': 'Plain text.\n' }), RULES);
  assert.equal(file.code, 1, file.out);
  assert.match(file.out, new RegExp(`^found: tree ${ID} docs \\(1\\)$`, 'm'));
  const folder = run(repo({ 'ACME/readme.txt': 'Made by acme.\n' }), RULES);
  assert.equal(folder.code, 1, folder.out);
  assert.match(folder.out, new RegExp(`^found: tree ${ID} / \\(1\\)$`, 'm'));
  assert.match(folder.out, new RegExp(`^found: blob ${ID} \\*\\*\\*/readme\\.txt \\(1\\)$`, 'm'));
});

test('commit messages, authors, branch names and tag names', () => {
  const message = run(repo({ 'a.txt': 'x\n' }, 'Ship the Acme build'), RULES);
  assert.equal(message.code, 1, message.out);
  assert.match(message.out, new RegExp(`^found: commit ${ID} \\(1\\)$`, 'm'));
  const authored = repo();
  git(authored, ['commit', '-q', '--allow-empty', '-m', 'An empty commit'], { GIT_AUTHOR_NAME: 'Jo Acmeson' });
  const author = run(authored, RULES);
  assert.equal(author.code, 1, author.out);
  assert.match(author.out, new RegExp(`^found: commit ${ID} \\(1\\)$`, 'm'));
  const branched = repo();
  git(branched, ['branch', 'feature/acme-login']);
  const branch = run(branched, RULES);
  assert.equal(branch.code, 1, branch.out);
  assert.match(branch.out, /^found: ref refs\/heads\/feature\/\*\*\*-login \(1\)$/m);
  const tagged = repo();
  git(tagged, ['tag', '-a', 'v1-acme', '-m', 'Release one']);
  const tag = run(tagged, RULES);
  assert.equal(tag.code, 1, tag.out);
  assert.match(tag.out, /^found: ref refs\/tags\/v1-\*\*\* \(1\)$/m);
  assert.match(tag.out, new RegExp(`^found: tag ${ID} \\(1\\)$`, 'm'));   // the tag object names itself
  assert.match(tag.out, /^checked \d+ objects and 2 refs$/m);
});

test('binaries: UTF-16 at either byte alignment, and a zip member', () => {
  for (const pad of [[0], [0, 0]]) {
    const r = run(repo({ 'assets/name.bin': Buffer.concat([Buffer.from(pad), Buffer.from('Made by Acme', 'utf16le')]) }), RULES);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, new RegExp(`^found: blob ${ID} assets/name\\.bin \\(\\d+\\)$`, 'm'));
  }
  const z = zip('notes.txt', Buffer.from(`${'x'.repeat(200)} made by acme ${'y'.repeat(200)}`));
  for (const s of views(z)) assert.doesNotMatch(s, /acme/i, 'the word is only inside the deflated member');
  const r = run(repo({ 'downloads/pack.zip': z }), RULES);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, new RegExp(`^found: blob ${ID} downloads/pack\\.zip \\(\\d+\\)$`, 'm'));
});

test('a word spelled so a plain search misses it, and a PDF that cannot be read: found, and said so', () => {
  const r = run(repo({ 'src/key.js': "const k = ['a', 'c', 'm', 'e'].join('');\n" }), RULES);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, new RegExp(`^found: blob ${ID} src/key\\.js \\(1, 1 spelled\\)$`, 'm'));
  const dir = repo({ 'docs/broken.pdf': '%PDF-1.7\nnot really a PDF\n%%EOF\n' });
  const u = run(dir, RULES);
  assert.equal(u.code, 1, u.out);
  assert.match(u.out, new RegExp(`^found: blob ${ID} docs/broken\\.pdf \\(1, unreadable PDF\\)$`, 'm'));
  const id = git(dir, ['rev-parse', 'HEAD:docs/broken.pdf']);
  assert.equal(run(dir, Object.assign({ allow: [id] }, RULES)).code, 0, 'only its exact bytes, allowed by id, pass');
});

test('a keep word passes; an allowed blob passes and is named', () => {
  const kept = repo({ 'a.txt': 'Acmeology is a made-up word.\n' });
  assert.equal(run(kept, RULES).code, 0);
  assert.equal(run(kept, { terms: ['acme'] }).code, 1);
  const dir = repo({ 'vendor/model.bin': Buffer.concat([Buffer.from([0, 7]), Buffer.from('xxACMExx')]) });
  const id = git(dir, ['rev-parse', 'HEAD:vendor/model.bin']);
  assert.equal(run(dir, RULES).code, 1);
  const r = run(dir, Object.assign({ allow: [id.toUpperCase()] }, RULES));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`^allowed: blob ${id}$`, 'm'));
});

test('no rules, rules that do not parse, or no terms: the check fails', () => {
  const dir = repo();
  for (const rules of [undefined, '', 'not json', '[]', '{}', '{"terms":[]}', '{"terms":["  "],"keep":["acmeology"]}']) {
    const r = run(dir, rules);
    assert.equal(r.code, 1, String(rules));
    assert.ok(r.out.startsWith('no rules: this check cannot pass without its secret'), r.out);
    assert.ok(r.out.startsWith(NO_RULES));
  }
  const missing = run(path.join(dir, 'no-such-folder'), RULES);
  assert.equal(missing.code, 1, 'a check that cannot run fails');
});
