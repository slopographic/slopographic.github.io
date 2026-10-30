// Covers: tools/whitelabel/build.mjs, tools/whitelabel/export.mjs, tools/whitelabel/images.mjs, tools/whitelabel/workflow.mjs, tools/whitelabel/pages.mjs
// The build's parts that need no browser: what it leaves out, the model-file patch, the mirror's workflow, the icon file,
// the share card, the repo-only tests. CI's white-label jobs run the whole build, the scan and its whole suite on the samples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { excluded, patchBinary, SCAN_ALLOW, REPO_ONLY, repoOnly, rehash } from '../../tools/whitelabel/build.mjs';
import { exportProfile } from '../../tools/whitelabel/export.mjs';
import { ico, cardHtml } from '../../tools/whitelabel/images.mjs';
import { mirrorWorkflow, DROP_STEPS, DROP_JOBS } from '../../tools/whitelabel/workflow.mjs';
import { buildPages } from '../../tools/whitelabel/pages.mjs';
import { loadMap, profilesDir } from '../../tools/whitelabel/profile.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = { support: { ads: false }, media: false };

test('left out of a renamed build: the source brand’s own files', () => {
  for (const f of ['TRADEMARKS.md', 'LICENSE-ART', '.github/workflows/rules.yml', 'docs-1280-dark.png', 'brand/profiles/sample.json', 'tools/whitelabel/build.mjs',
    'tests/node/whitelabel-build.test.mjs', 'tests/node/attribution.test.mjs', '.github/workflows/commit-authors.yml', '.github/workflows/speed.yml', 'tests/node/speed-config.test.mjs', 'tests/node/indexnow.test.mjs', '.github/workflows/preview.yml', '.github/dependabot.yml', 'ads.txt', 'assets/shots/pdf.jpg', 'brand/logo-128.webp', 'docs-1280-dark.png']) assert.equal(excluded(f, P), true, f);
  for (const f of ['pdf/index.html', '.githooks/pre-commit', 'shared/apps.js', 'tests/node/i18n.test.mjs']) assert.equal(excluded(f, P), false, f);
  assert.equal(excluded('assets/shots/pdf.jpg', { media: true }), false);
});

test('model files: the tool name is patched at the same length', () => {
  const buf = Buffer.concat([Buffer.from([8, 0, 18, 12]), Buffer.from('slopographic'), Buffer.from([0, 1])]);
  const out = patchBinary('vendor/m.onnx', buf);
  assert.equal(out.length, buf.length);
  assert.ok(!out.includes('slopographic') && out.includes('modelbuilder'));
  assert.equal(patchBinary('a.png', buf), buf);
  assert.ok(SCAN_ALLOW.every((a) => a.file && a.why));
  // the code that checks a patched model's SHA-256 gets the patched file's
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wl-rehash-')), A = 'a'.repeat(64), B = 'b'.repeat(64);
  mkdirSync(path.join(dir, 'm'));
  writeFileSync(path.join(dir, 'm/index.json'), `{"sha256":"${A}"}`);
  writeFileSync(path.join(dir, 'm/models.js'), `sha256: '${A}', other: '${'c'.repeat(64)}'`);
  writeFileSync(path.join(dir, 'm/x.onnx'), A);
  assert.equal(rehash(dir, new Map([[A, B]])), 2);
  assert.equal(readFileSync(path.join(dir, 'm/index.json'), 'utf8'), `{"sha256":"${B}"}`);
  assert.match(readFileSync(path.join(dir, 'm/models.js'), 'utf8'), new RegExp(`${B}.*${'c'.repeat(64)}`));
  assert.equal(readFileSync(path.join(dir, 'm/x.onnx'), 'utf8'), A);
  assert.equal(rehash(dir, new Map()), 0);
});

test('the mirror workflow: this repository\'s jobs and the whole suite in its slices, without what only works here', () => {
  const yml = readFileSync(path.join(ROOT, '.github/workflows/rules.yml'), 'utf8');
  const out = mirrorWorkflow(yml);
  for (const d of DROP_STEPS) assert.ok(yml.includes(d) && !out.includes(d), d);
  assert.doesNotMatch(out, /git config user\.name/);
  assert.match(out, /run: node --test tests\/node\/\*\.test\.mjs tests\/seo\/\*\.test\.mjs\n/, 'every Node test, none skipped');
  assert.doesNotMatch(out, /whitelabel|test-skip-pattern|smoke/);
  for (const j of DROP_JOBS) assert.ok(yml.includes(`\n  ${j}:\n`) && !out.includes(`\n  ${j}:\n`), j);
  // the plan, the browser slices and the touch jobs, as here: a mirror runs the full suite on its testing branch
  for (const j of ['check', 'plan', 'browser', 'touch']) assert.ok(out.includes(`\n  ${j}:\n`), j);
  assert.match(out, /shard: \$\{\{ fromJSON\(needs\.plan\.outputs\.shards\) \}\}/);
  assert.match(out, /node tests\/run\.mjs --touch --browser=\$\{\{ matrix\.engine \}\}/);
  assert.match(out, /^# Generated with the site/m);
});

test('the tests about this repository only are declared in one place, each with its reason, and left out of a build', () => {
  assert.ok(REPO_ONLY.length >= 5);
  const files = execFileSync('git', ['ls-files', 'tests'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
  for (const r of REPO_ONLY) {
    assert.ok(r.why && r.why.length > 10, r.file);
    assert.ok(files.some((f) => (r.file.endsWith('*') ? f.startsWith(r.file.slice(0, -1)) : f === r.file)), `${r.file} exists`);
    if (!r.file.endsWith('*')) assert.equal(excluded(r.file, P), true, r.file);
  }
  assert.equal(repoOnly('tests/node/whitelabel-facts.test.mjs'), true);
  // the plan's pages as a build names them, without the ones it leaves out (CI's white-label jobs on a work branch)
  const map = loadMap(profilesDir(ROOT), 'sample');
  assert.deepEqual(buildPages(['tests/photoslop/look.test.html', 'tests/buddy/slot.test.html', 'tests/pdf/look.test.html', ''], map), ['tests/imageeditor/look.test.html', 'tests/pdf/look.test.html']);
  assert.deepEqual(buildPages(['tests/pdf/look.test.html'], null), ['tests/pdf/look.test.html']);
  for (const f of ['tests/node/ci-config.test.mjs', 'tests/seo/seo.test.mjs', 'tests/brand-facts.js', 'tests/node/brand-facts.test.mjs']) assert.equal(excluded(f, P), false, f);
});

test('icons: a PNG-in-ICO header; the share card holds the name', () => {
  const png = Buffer.from([137, 80, 78, 71]);
  const f = ico([{ size: 16, data: png }, { size: 32, data: png }]);
  assert.equal(f.readUInt16LE(2), 1); assert.equal(f.readUInt16LE(4), 2); assert.equal(f.readUInt32LE(6 + 12), 38);
  assert.match(cardHtml({ name: 'Acme Tools', tagline: 'x', colors: { ink: '#000', paper: '#fff', accent: '#00f' } }, '<svg ></svg>'), /Acme Tools/);
  assert.equal(typeof exportProfile, 'function');
});
