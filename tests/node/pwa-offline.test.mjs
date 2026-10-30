// Offline check for the PWA: loads the site with the service worker, waits for the precache to
// fill, stops the server, then opens the homepage and Slop Drive from the cache.
// Run with: node tests/run.mjs pwa   (or: node --test tests/node/pwa-offline.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { /* fall through */ }
  for (const p of ['/opt/node22/lib/node_modules/playwright', path.join(process.env.npm_config_prefix || '', 'lib/node_modules/playwright')]) {
    try { return createRequire(import.meta.url)(p); } catch (e) { /* try next */ }
  }
  throw new Error('Playwright not found. Run: npm i -D playwright && npx playwright install chromium');
}

function serve() {
  const server = http.createServer(async (req, res) => {
    try {
      let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      if ((await stat(f).catch(() => null))?.isDirectory()) f = path.join(f, 'index.html');
      const body = await readFile(f);
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    } catch (e) { res.writeHead(404).end('not found'); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

test('the homepage and Slop Drive open offline after the service worker has precached', async (t) => {
  // The PRECACHE list: every sw-precache*.js part that service-worker.js imports, in order.
  const swMain = await readFile(path.join(ROOT, 'service-worker.js'), 'utf8');
  const sw = (await Promise.all([...swMain.matchAll(/'\/(sw-precache[^']*\.js)'/g)].map((m) => readFile(path.join(ROOT, m[1]), 'utf8')))).join('\n');
  const expected = [...sw.matchAll(/'\/[^']+'/g)].length;
  assert.ok(expected > 100, 'precache list was not read');

  const { chromium } = await loadPlaywright();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); server.close(); server.closeAllConnections?.(); });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  await page.goto(base + '/');
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 60000 });
  // Wait until every precache entry is stored (the install step fetches them in parallel).
  await page.waitForFunction(async (min) => {
    let n = 0;
    for (const k of await caches.keys()) if (k.startsWith('slopographic-')) n += (await (await caches.open(k)).keys()).length;
    return n >= min;
  }, expected, { timeout: 120000, polling: 500 });

  // Stop the server: from here on every request to the site is answered from the service worker.
  await new Promise((r) => { server.close(r); server.closeAllConnections?.(); });

  await page.goto(base + '/');
  await page.waitForSelector('.app-card', { timeout: 20000 });
  assert.equal(await page.title(), 'Slopographic: office and creative software in your browser');

  await page.goto(base + '/drive/');
  await page.waitForSelector('body.ready', { timeout: 30000 });
  assert.ok(await page.$('#pane'), 'Slop Drive pane is missing offline');

  await page.goto(base + '/no-such-page/');
  assert.match(await page.textContent('h1'), /offline/i);
});
