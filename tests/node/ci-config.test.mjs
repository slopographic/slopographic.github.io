// The CI workflow (.github/workflows/rules.yml) and the repo agree: the browser jobs run in the Playwright image of the
// version package-lock.json installs (a newer library in an older image cannot find its browser), and every slice of the
// slices of the plan are asked for. wip/* branches never run the full suite (tools/ci/plan.mjs decides). Every workflow
// declares read-only token permissions at the top (.github/workflows/*.yml).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const wf = readFileSync(path.join(ROOT, '.github/workflows/rules.yml'), 'utf8');
const lock = JSON.parse(readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));

test('the browser jobs run in the Playwright image of the locked Playwright version', () => {
  const locked = lock.packages['node_modules/playwright'].version;
  const image = (wf.match(/mcr\.microsoft\.com\/playwright:v([\d.]+)-/) || [])[1];
  assert.equal(image, locked, `image v${image}, package-lock.json ${locked}`);
});

const job = (name) => (wf.split(/\n  (?=[\w-]+:\n)/).find((b) => b.startsWith(name + ':')) || '');

test('the browser tests run only in the slices the plan job asks for, and tests/run.mjs is run nowhere else', () => {
  const browser = job('browser');
  assert.match(browser, /needs: plan/);
  assert.match(browser, /if: \$\{\{ needs\.plan\.outputs\.count != '0' \}\}/);
  assert.match(browser, /shard: \$\{\{ fromJSON\(needs\.plan\.outputs\.shards\) \}\}/);
  assert.match(browser, /SLICE: --shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ needs\.plan\.outputs\.count \}\}/);
  assert.match(browser, /--pages-file=plan-pages\.txt/);
  assert.doesNotMatch(browser, /^\s+if: .*github\.ref/m, 'the browser job takes the branch rule from the plan only');
  assert.match(job('plan'), /run: node tools\/ci\/plan\.mjs/);
  // every run of this repository's browser suite goes through the plan: no other job calls the runner on its own terms.
  // The white-label jobs (here only; a build drops them) run the whole suite of a sample build, after the plan.
  const runners = wf.split(/\n  (?=[\w-]+:\n)/).filter((b) => /node tests\/run\.mjs/.test(b)).map((b) => b.split(':')[0].trim());
  assert.deepEqual(runners.filter((n) => n !== 'browser' && !/needs: (plan|\[plan, )/.test(job(n))), []);
  for (const n of runners.filter((r) => /^whitelabel/.test(r))) assert.match(job(n), /name: wl-build-\$\{\{ matrix\.profile \}\}/, `${n} runs the build's pages`);
});

test('the plan: wip/* and other branches never get the full suite; main skips it only for a merge of a green commit', async () => {
  const { decide, outputs, FULL_SLICES } = await import('../../tools/ci/plan.mjs');
  const { MAX_SLICES } = await import('../../tools/ci/affected.mjs');
  for (const b of ['wip/x', 'wip/faster-tests', 'feature', 'testing-2', 'mainline', '']) {
    assert.equal(decide(b), 'changed', b);
    assert.equal(decide(b, { mergeOfGreen: true }), 'changed', b);
  }
  assert.equal(decide('testing'), 'full');
  assert.equal(decide('main'), 'full');
  assert.equal(decide('main', { mergeOfGreen: true }), 'none');
  const many = Array.from({ length: 900 }, (_, i) => `tests/p${i}.test.html`);
  assert.ok(outputs('changed', many).count <= MAX_SLICES && MAX_SLICES < FULL_SLICES);
  assert.equal(outputs('changed', many).pages.split(' ').length, 900);
  assert.equal(outputs('full', null).count, FULL_SLICES);
  assert.equal(outputs('full', null).pages, '');
  assert.equal(outputs('none', []).count, 0);
  assert.equal(outputs('none', []).shards, '[]');
  // the skip on main needs the merged parent's tree and its green run
  const src = readFileSync(path.join(ROOT, 'tools/ci/plan.mjs'), 'utf8');
  assert.match(src, /'HEAD\^\{tree\}'\) !== git\('rev-parse', 'HEAD\^2\^\{tree\}'\)/);
  assert.match(src, /w\.name === 'Rules and tests' && w\.conclusion === 'success'/);
});

test('the white-label sample suites: in full on testing and main; on a work branch the plan\'s pages, or in full for a change to the build', async () => {
  const { outputs, wlOutputs, WL_SLICES, WL_FILES } = await import('../../tools/ci/plan.mjs');
  const changed = outputs('changed', ['tests/a.test.html'], false);
  assert.deepEqual(wlOutputs('changed', changed, ['pdf/js/a.js']), { wl_suite: 'changed', wl_count: changed.count, wl_shards: changed.shards });
  for (const f of ['tools/whitelabel/build.mjs', 'brand/brand.json', 'tests/brand-facts.js', 'tests/needs.mjs', 'tests/repo-only.json']) {
    assert.ok(WL_FILES.test(f), f);
    assert.equal(wlOutputs('changed', changed, ['pdf/js/a.js', f]).wl_suite, 'full', f);
  }
  assert.equal(wlOutputs('changed', changed, ['shared/apps.js'], (f) => f === 'shared/apps.js').wl_count, WL_SLICES);   // a profile marker
  assert.equal(wlOutputs('full', outputs('full', null)).wl_count, WL_SLICES);
  assert.deepEqual(wlOutputs('none', outputs('none', [])), { wl_suite: 'none', wl_count: 0, wl_shards: '[]' });
  // the jobs themselves are this repository's (a mirror's workflow has none: tools/whitelabel/workflow.mjs DROP_JOBS)
  if (!/\n  whitelabel:\n/.test(wf)) return;
  const browser = job('whitelabel-browser'), touch = job('whitelabel-touch');
  assert.match(browser, /shard: \$\{\{ fromJSON\(needs\.plan\.outputs\.wl_shards\) \}\}/);
  assert.match(browser, /needs\.plan\.outputs\.wl_suite == 'changed' && ' --pages-file=wl-pages\.txt'/);
  assert.match(touch, /needs\.plan\.outputs\.wl_suite == 'changed' && needs\.plan\.outputs\.touch == 'true'/);
  assert.match(job('whitelabel'), /node tools\/whitelabel\/pages\.mjs \$\{\{ matrix\.profile \}\} > wl-pages\.txt/);
  assert.match(job('whitelabel'), /node --test tests\/node\/\*\.test\.mjs/);   // the build and its Node tests on every push
});

test('the touch jobs run the touch-marked pages in WebKit (iPad) and Chromium (Android)', () => {
  const engines = (wf.match(/engine: \[([a-z, ]+)\]/) || [])[1].split(',').map((s) => s.trim());
  assert.deepEqual(engines.sort(), ['chromium', 'webkit']);
  assert.match(wf, /node tests\/run\.mjs --touch --browser=\$\{\{ matrix\.engine \}\}/);
  const job = wf.slice(wf.indexOf('\n  touch:'));
  assert.match(job, /needs: plan/);
  assert.match(job, /if: \$\{\{ needs\.plan\.outputs\.touch == 'true' \}\}/);
  assert.match(job, /--pages-file=plan-pages\.txt/); // a changed-pages run: only the touch pages among them
});

test('every workflow limits its GITHUB_TOKEN: a top-level permissions block, read-only unless a job asks for more', async () => {
  const { readdirSync } = await import('node:fs');
  const dir = path.join(ROOT, '.github/workflows');
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.includes('rules.yml'));   // this repository's others: tests/node/site-workflows.test.mjs
  for (const f of files) {
    const text = readFileSync(path.join(dir, f), 'utf8');
    const top = /^permissions:\n((?: {2}.*\n)+)/m.exec(text);
    assert.ok(top, `${f} has no top-level permissions block`);
    assert.match(top[1], /^ {2}contents: read$/m, `${f}: contents is read-only at the top`);
    assert.doesNotMatch(top[1], /: write/, `${f}: nothing is writable for every job`);
    assert.doesNotMatch(text, /permissions: write-all|permissions: \{\s*\}/, `${f}: no blanket permissions`);
  }
});
