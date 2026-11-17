// Covers: tools/whitelabel/workflow.mjs, tools/whitelabel/content-rules.mjs, tools/whitelabel/build.mjs, tools/whitelabel/content-check.yml
// A mirror's content check as a build ships it: the workflow the build writes (.github/workflows/content.yml), the checker
// and everything it imports in the build and left as it is by the rename, the renamed copy running on a repository, and
// the rules a profile's mirror gets (its CONTENT_RULES secret). CI's white-label jobs then run each sample build's own
// checker on that build (.github/workflows/rules.yml).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { excluded, SCAN_ALLOW, artPins } from '../../tools/whitelabel/build.mjs';
import { contentWorkflow } from '../../tools/whitelabel/workflow.mjs';
import { contentRules, blobId } from '../../tools/whitelabel/content-rules.mjs';
import { context, forward, forwardPath } from '../../tools/whitelabel/transform.mjs';
import { loadProfile, loadMap, profilesDir, forbiddenTerms } from '../../tools/whitelabel/profile.mjs';
import { licenseArt, overlayDir } from '../../tools/whitelabel/mascot.mjs';
import { SCAN_KEEP } from '../../tools/whitelabel/scan.mjs';
import { parseRules } from '../../tools/content-check/check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = profilesDir(ROOT), P = { support: { ads: false }, media: false };
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const CHECKER = 'tools/content-check/check.mjs', TEST = 'tests/node/content-check.test.mjs';

/** The checker and every file it imports (relative imports, followed). */
function closure(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const m of read(file).matchAll(/^import [^;]* from '(\.[^']+)';$/gm)) closure(path.posix.join(path.posix.dirname(file), m[1]), seen);
  return seen;
}

// git as in a fresh clone (no hook's GIT_DIR, no user config), a made-up identity
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && k !== 'CONTENT_RULES'));
Object.assign(ENV, { GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' });
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { env: ENV, encoding: 'utf8' });

test('the content workflow: every push and tag, read-only, the whole history, the secret, a job named Content check', () => {
  const wf = contentWorkflow(), rules = read('.github/workflows/rules.yml');
  assert.match(wf, /^name: Content check\n/);
  assert.match(wf, /\njobs:\n {2}content:\n {4}name: Content check\n {4}runs-on: ubuntu-24\.04\n/, 'the job\'s name is the status check main requires');
  assert.match(wf, /\non:\n {2}push:\n {4}branches: \['\*\*'\]\n {4}tags: \['\*\*'\]\n {2}workflow_dispatch:\n/);
  assert.match(wf, /\npermissions:\n {2}contents: read\n\n/);
  assert.doesNotMatch(wf, /^\s*concurrency:|cancel-in-progress/m, 'every push gets its own result');
  assert.doesNotMatch(wf, /: write/);
  assert.match(wf, /fetch-depth: 0/);
  assert.match(wf, /git fetch -q --tags --force origin '\+refs\/heads\/\*:refs\/remotes\/origin\/\*'/);
  assert.match(wf, /CONTENT_RULES: \$\{\{ secrets\.CONTENT_RULES \}\}\n {8}run: node tools\/content-check\/check\.mjs\n$/);
  for (const action of ['actions/checkout', 'actions/setup-node']) {   // the versions the CI workflow uses
    const at = (yml) => [...new Set([...yml.matchAll(new RegExp(`uses: ${action}@(\\S+)`, 'g'))].map((m) => m[1]))];
    assert.deepEqual(at(wf), at(rules), action);
  }
  assert.match(wf, /node-version: 22\n/);
  assert.match(read('tools/whitelabel/build.mjs'), /write\(out, '\.github\/workflows\/content\.yml', mirrorText\(contentWorkflow\(\)\)\)/);
});

test('the checker and all it imports ship in a build, the rename leaves them as they are, and the copy runs', () => {
  // and what it loads at run time: the PDF worker and the pdf.js it reads (with its CMaps and font data)
  const files = [...closure(CHECKER), 'tools/content-check/pdf-worker.mjs', 'vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js'];
  for (const f of ['tools/content-check/words.mjs', 'tools/content-check/unpack.mjs', 'tools/content-check/git.mjs', 'tools/content-check/spelled.mjs', 'tools/content-check/pdf.mjs', 'tools/fonts/woff2.mjs', 'tools/fonts/zip.mjs']) assert.ok(files.includes(f), f);
  for (const f of files.concat(TEST, 'vendor/pdfjs/cmaps/78-H.bcmap', 'vendor/pdfjs/standard_fonts/FoxitSans.pfb')) assert.equal(excluded(f, P), false, f);
  const out = mkdtempSync(path.join(os.tmpdir(), 'wl-content-'));
  for (const id of ['sample', 'sample-sv']) {
    const ctx = context(ROOT, loadProfile(DIR, id), loadMap(DIR, id));
    for (const f of files.concat(TEST)) {
      assert.equal(forwardPath(f, ctx), f, `${id}: ${f} keeps its path`);
      const text = forward(read(f), ctx, f);
      // vendor files are this build's to rename (pdf.js holds a coded string the rename touches); the copy below runs them
      if (!f.startsWith('vendor/')) assert.equal(text, read(f), `${id}: ${f} holds no word the rename changes`);
      mkdirSync(path.dirname(path.join(out, id, f)), { recursive: true });
      writeFileSync(path.join(out, id, f), text);
    }
    // the copy on a repository: a made-up word in a commit fails, the same repository without it passes; a PDF's text is
    // read by the copy's pdf.js (an encrypted file that opens without a password: its bytes do not show its words)
    const repo = mkdtempSync(path.join(os.tmpdir(), 'wl-content-repo-'));
    git(repo, 'init', '-q', '-b', 'main');
    writeFileSync(path.join(repo, 'a.txt'), 'Plain text.\n');
    const pdf = readFileSync(path.join(ROOT, 'tests/pdf-crypto/fixtures/qpdf-rc4-40.pdf'));
    assert.doesNotMatch(pdf.toString('latin1'), /answer/i);
    writeFileSync(path.join(repo, 'doc.pdf'), pdf);
    git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'First');
    const run = (terms) => spawnSync(process.execPath, [path.join(out, id, CHECKER), repo], { env: Object.assign({ CONTENT_RULES: JSON.stringify({ terms }) }, ENV), encoding: 'utf8' });
    const clean = run(['zorblax']);
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    const hit = run(['plain']);
    assert.equal(hit.status, 1, hit.stdout);
    assert.match(hit.stdout, /^found: blob [0-9a-f]{40} a\.txt \(1\)$/m);
    const page = run(['answer']);
    assert.equal(page.status, 1, page.stdout);
    assert.match(page.stdout, /^found: blob [0-9a-f]{40} doc\.pdf \(1\)$/m);
  }
});

test('a profile\'s content rules: the leak scan\'s words, and the blob ids of the files it allows with their exact bytes', () => {
  const p = loadProfile(DIR, 'sample'), out = mkdtempSync(path.join(os.tmpdir(), 'wl-content-out-'));
  assert.equal(blobId(Buffer.from('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');   // as git hash-object
  const model = SCAN_ALLOW[0].file;
  mkdirSync(path.dirname(path.join(out, model)), { recursive: true });
  writeFileSync(path.join(out, model), Buffer.from('another version'));
  const other = contentRules(DIR, p, out);
  assert.deepEqual(other.allow, [], 'a file with other bytes than its entry names is not allowed');
  for (const t of forbiddenTerms(DIR, p)) assert.ok(other.terms.includes(t), t);
  assert.deepEqual(other.keep, SCAN_KEEP);
  const bytes = readFileSync(path.join(ROOT, model));
  writeFileSync(path.join(out, model), bytes);
  const r = contentRules(DIR, p, out);
  assert.deepEqual(r.allow, [blobId(bytes)]);
  assert.deepEqual(parseRules(JSON.stringify(r)), r, 'the checker reads them as they are');
  // a character owned by someone else: its files and notices allowed for the bytes the build writes, no others
  const q = Object.assign({}, p, { mascot: Object.assign({}, p.mascot, { holder: 'Bots Inc' }) });
  const pins = artPins(q, overlayDir(DIR, q));
  assert.equal(pins.find((a) => a.file === 'LICENSE-ART').sha256, sha(licenseArt(q)));
  assert.equal(pins.find((a) => a.file === 'brand/mascot/icon.js').sha256, sha(readFileSync(path.join(overlayDir(DIR, q), 'icon.js'))));
  assert.ok(pins.every((a) => /^[0-9a-f]{64}$/.test(a.sha256) && a.term === 'bots inc'));
});
