// SlopTour data: every shared/tour/tours/<app>.js is a valid tour (checked with the engine's own validator),
// (its words are checked in tests/node/tour-words.test.mjs),
// its app id matches the file and the app folder, each step target matches an element in that app's index.html
// (checked in headless Chromium with the scripts and styles stripped), and each app page loads the tour mount.
// Run: node tests/run.mjs tour
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOURS = path.join(ROOT, 'shared', 'tour', 'tours');
const MIN_STEPS = 4, MAX_STEPS = 8;

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { /* fall through */ }
  for (const p of ['/opt/node22/lib/node_modules/playwright', path.join(process.env.npm_config_prefix || '', 'lib/node_modules/playwright')]) {
    try { return createRequire(import.meta.url)(p); } catch (e) { /* try next */ }
  }
  throw new Error('Playwright not found. Run: npm i -D playwright && npx playwright install chromium');
}

/** Evaluate a classic script in a fresh sandbox and return the sandbox. */
function runScript(src, sandbox) {
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'tour.js' });
  return sandbox;
}

const files = (await readdir(TOURS)).filter((f) => f.endsWith('.js')).sort();
const coreBox = { console };
coreBox.window = coreBox;
runScript(await readFile(path.join(ROOT, 'shared', 'tour', 'core.js'), 'utf8'), coreBox);
const logic = coreBox.SlopTour.logic;

const tours = [];
for (const f of files) {
  const captured = [];
  const sandbox = { console, SlopTour: { define: (t) => captured.push(t) } };
  runScript(await readFile(path.join(TOURS, f), 'utf8'), sandbox);
  tours.push({ file: f, app: f.replace(/\.js$/, ''), tours: captured });
}

test('there is one tour file per app page and each defines exactly one tour', () => {
  assert.equal(files.length, 29);
  for (const t of tours) assert.equal(t.tours.length, 1, t.file + ' must call SlopTour.define once');
});

test('every tour file is valid: 4 to 8 steps with the required fields and allowed actions and checks', () => {
  for (const { file, app, tours: [tour] } of tours) {
    const problems = [...logic.problems(tour)];
    assert.equal(problems.length, 0, file + ' has problems: ' + problems.join('; '));
    assert.equal(tour.app, app, file + ': app must match the file name');
    assert.ok(tour.steps.length >= MIN_STEPS && tour.steps.length <= MAX_STEPS, file + ' has ' + tour.steps.length + ' steps');
    for (const s of tour.steps) assert.ok(s.target, file + ' step "' + s.id + '" should point at a control');
  }
});

test('every app page loads the tour mount with its own app id, and mount.js lists the app (its Tour button)', async () => {
  const mount = await readFile(path.join(ROOT, 'shared', 'tour', 'mount.js'), 'utf8');
  for (const { app } of tours) {
    assert.ok(mount.includes("['" + app + "', '"), 'shared/tour/mount.js TOURS lacks ' + app + ' (no Tour button)');
    const html = await readFile(path.join(ROOT, app, 'index.html'), 'utf8');
    assert.match(html, new RegExp('<script src="\\.\\./shared/tour/mount\\.js" data-app="' + app + '"[^>]*></script>'), app + '/index.html');
  }
  const home = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(home, /shared\/tour\/mount\.js" data-home="1"/, 'homepage Tours menu');
});

test('every step target exists in that app\'s index.html', async () => {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const failures = [];
    for (const { file, app, tours: [tour] } of tours) {
      const raw = await readFile(path.join(ROOT, app, 'index.html'), 'utf8');
      // Keep the static markup only: no scripts or stylesheets, so nothing runs and nothing loads.
      const markup = raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
      await page.setContent(markup);
      for (const s of tour.steps) {
        const found = await page.evaluate((sel) => { try { return document.querySelector(sel) !== null; } catch (e) { return 'bad'; } }, s.target);
        if (found !== true) failures.push(app + ' › ' + s.id + ' › ' + s.target + (found === 'bad' ? ' (invalid selector)' : ''));
      }
    }
    assert.deepEqual(failures, [], 'targets missing from index.html:\n  ' + failures.join('\n  '));
  } finally {
    await browser.close();
  }
});
