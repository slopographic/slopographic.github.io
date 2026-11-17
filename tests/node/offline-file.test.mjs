// Opens the built offline PDF app (shared offline builder, tools/offline/lib.mjs) from a file:// URL in Chromium,
// with every network request blocked, and checks that it boots, renders and reports no page or console errors.
// Run with: node --test tests/node/offline-file.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildApp } from '../../tools/offline/lib.mjs';

const require = createRequire(import.meta.url);

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { /* fall through */ }
  for (const p of ['/opt/node22/lib/node_modules/playwright', path.join(process.env.npm_config_prefix || '', 'lib/node_modules/playwright')]) {
    try { return require(p); } catch (e) { /* try next */ }
  }
  throw new Error('Playwright not found. Run: npm i -D playwright && npx playwright install chromium');
}

const LOCAL = /^(?:file|data|blob):/;

test('the offline PDF app opens from file:// with the network blocked', { timeout: 180000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'slop-offline-'));
  const file = path.join(dir, 'pdf.html');
  await writeFile(file, await buildApp('pdf'));

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const attempted = [], errors = [];
    // Every request that is not a local one is recorded and aborted.
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (LOCAL.test(url)) return route.continue();
      attempted.push(url);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push('page: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('request', (r) => { if (!LOCAL.test(r.url())) attempted.push(r.url()); });

    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 120000, polling: 250 });
    const state = await page.evaluate(() => ({
      offline: !!(window.SP && SP.offline),
      isOffline: document.documentElement.classList.contains('is-offline'),
      menus: document.querySelectorAll('button, [role="menuitem"], .menubar *').length,
      text: document.body.innerText.trim().length,
    }));
    await page.waitForTimeout(500);

    assert.equal(state.offline, true, 'the offline boot ran');
    assert.equal(state.isOffline, true, 'the page knows it is offline');
    assert.ok(state.menus > 5, 'the editor UI is on the page');
    assert.ok(state.text > 50, 'the page renders text');
    assert.deepEqual(attempted, [], 'no request left the file');
    assert.deepEqual(errors, [], 'no page or console errors');
  } finally {
    await browser.close();
  }
});
