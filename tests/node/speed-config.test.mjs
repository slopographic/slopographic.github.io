// Covers: tools/speed/deps.mjs
// The page speed workflow (.github/workflows/speed.yml) and the repo agree: it runs on pushes to main (milestones and hotfixes) and on demand, not on
// pull requests, in the Playwright image the browser tests use, every slice of its matrix is asked for, Lighthouse is
// pinned to one exact version. A new page needs no budget before a push: CI measures it and reports it as new.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { discoverPages } from '../../tools/speed/pages.mjs';
import { parseBudgets } from '../../tools/speed/budget.mjs';
import { PRESETS } from '../../tools/speed/measure.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const wf = read('.github/workflows/speed.yml');
const rules = read('.github/workflows/rules.yml');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

test('the speed workflow runs on pushes to main and on demand (a full run outlasts the gap between pushes to testing)', () => {
  assert.match(wf, /push:\s*\n\s*branches: \[main\]/);
  assert.match(wf, /\n  workflow_dispatch:/);
  assert.doesNotMatch(wf, /\n  pull_request:/);
});

test('the speed jobs run in the same Playwright image as the browser tests', () => {
  const image = (s) => (s.match(/mcr\.microsoft\.com\/playwright:v([\d.]+)-noble/) || [])[1];
  assert.ok(image(wf));
  assert.equal(image(wf), image(rules));
});

test('the matrix lists every slice from 1 to n, and the run asks for slices of n with the median of 3 runs', () => {
  const list = (wf.match(/shard: \[([\d, ]+)\]/) || [])[1].split(',').map(Number);
  const n = Number((wf.match(/--shard=\$\{\{ matrix\.shard \}\}\/(\d+)/) || [])[1]);
  assert.deepEqual(list, Array.from({ length: n }, (_, i) => i + 1));
  assert.match(wf, /--runs=3\b/);
  assert.match(wf, /npm ci/);
});

test('the workflow records instead of checking when budgets.json is missing or record is asked for', () => {
  assert.match(wf, /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*record:/);
  const modes = wf.match(/inputs\.record \}\}" = "true" \] \|\| \[ ! -f tools\/speed\/budgets\.json \]; then MODE=--record/g) || [];
  assert.equal(modes.length, 2, 'both the slices and the summary');
  assert.match(wf, /--from=speed-results \$MODE/);
});

test('Lighthouse and chrome-launcher are pinned exactly in tools/speed/deps.mjs, installed only by the speed workflow', async () => {
  const { DEPS, installArgs } = await import(pathToFileURL(path.join(ROOT, 'tools/speed/deps.mjs')).href);
  for (const name of ['lighthouse', 'chrome-launcher']) {
    assert.match(DEPS[name] || '', /^\d+\.\d+\.\d+$/, `${name} pinned exactly`);
    assert.equal(pkg.devDependencies?.[name], undefined, `${name} stays out of package.json (the test jobs never install it)`);
  }
  assert.deepEqual(installArgs(), Object.entries(DEPS).map(([n, v]) => `${n}@${v}`));
  assert.match(read('.github/workflows/speed.yml'), /npm install --no-save --no-audit --no-fund \$\(node tools\/speed\/deps\.mjs\)/);
});

// A page with no budget (a new page) is reported by the speed run, not failed, so agents never measure pages locally
// before a push: CI measures every page, and --update --from=<CI results> adds the new budgets.

