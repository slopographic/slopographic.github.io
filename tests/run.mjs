#!/usr/bin/env node
// Slopographic test runner.
//   node tests/run.mjs            run every tests/**/*.test.html in headless Chromium
//   node tests/run.mjs paint      only pages whose path contains "paint"
//   --jobs=4                      run 4 pages at a time, each in its own browser context (default 1; SLOPTEST_JOBS too).
//                                 A page that fails then runs once more on its own: if it passes alone it counts as
//                                 passed and is listed as load-sensitive (its timing depends on the machine being idle)
//   --shard=2/8                   only the 2nd of 8 slices of the pages, balanced by tests/timings.json (CI runs the slices
//                                 as parallel jobs; see tests/shard.mjs)
//   --pages-file=list.txt         only the pages listed in the file (repo paths, space or line separated; CI's changed-pages
//                                 run on work branches, from tools/ci/plan.mjs)
//   --skip-node                   no Node tests (CI runs them in their own job)
//   --needs-net                   only print yes when a page of the slice is in tests/net-urls.txt (CI then restores the
//                                 download cache), else no
//   --record-timings              write each page's seconds into tests/timings.json, for the shard balance
//   --results=out.json            write every page's seconds, test times and network tally as JSON (a CI artifact per
//                                 slice; tests/results.mjs turns those into tests/timings.json and tests/net-urls.txt)
// Requests to the model hosts and CDNs go through a disk cache, tests/.cache/net (see tests/netcache.mjs).
//   --touch                       only pages marked <meta name="slop-test-touch">, on a touch tablet (tests/touch.mjs):
//   --browser=webkit|chromium       WebKit (Safari's engine) as an iPad, or Chromium as an Android tablet (default chromium)
//   --device="iPhone 15"            another Playwright device instead (an iPhone, a Pixel...)
// Serves the repo root on a local port (no dependencies), opens each page, waits for
// window.__SLOPTEST__ (see tests/harness.js) and prints a report. Exit code 1 on failure.
// What CI runs where (the full suite on testing, only the pages a change needs on work branches): tools/ci/plan.mjs.
// Also runs Node-only tests (tests/node/*.test.mjs and tests/seo/*.test.mjs) with `node --test`.
// A page that needs a feature a brand profile can leave out (<meta name="slop-test-needs">, tests/needs.mjs) runs only in a
// build whose brand facts (tests/brand-facts.js) have it; the pages left out are named.
import http from 'node:http';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseShard, shardPages, pool, mergeTimings, longestFirst } from './shard.mjs';
import { attachNet, NET_DIR } from './netcache.mjs';
import { parseNetUrls, NET_URLS } from './results.mjs';
import { touchDevice, touchPage, isTouchPage, TOUCH_ARGS } from './touch.mjs';
import { needsOf, unmet, loadFacts, englishFirst } from './needs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), flag = (name) => argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const value = (name) => { const f = flag(name); return f && f.includes('=') ? f.slice(f.indexOf('=') + 1) : null; };
const filter = argv.find((a) => !a.startsWith('--')) || '';
const JOBS = Math.max(1, Number(value('jobs') || process.env.SLOPTEST_JOBS || 1) || 1);
const SHARD = value('shard') ? parseShard(value('shard')) : null;
const TIMINGS = path.join(ROOT, 'tests', 'timings.json');
const TOUCH = !!flag('touch'), ENGINE = value('browser') || 'chromium';
// Ad and analytics hosts do not resolve in the test browser: the tests check that the app adds those scripts (their tags and
// URLs), and the real ones would make results depend on third-party servers (AdSense throws on a test page) and send ad
// requests. Done in DNS, not with request routing, which made pages that fetch many files at once fail.
const NO_THIRD_PARTY = '--host-resolver-rules=' + ['googlesyndication.com', 'googletagmanager.com', 'google-analytics.com', 'doubleclick.net']
  .flatMap((h) => [`MAP ${h} ~NOTFOUND`, `MAP *.${h} ~NOTFOUND`]).join(', ');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.pdf': 'application/pdf', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.webm': 'video/webm', '.mp4': 'video/mp4' };

async function findTests(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'node') await findTests(p, out); }
    else if (e.name.endsWith('.test.html')) out.push(path.relative(ROOT, p));
  }
  return out;
}
function serve() {
  const server = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let f = path.join(ROOT, p);
      if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      if ((await stat(f).catch(() => null))?.isDirectory()) f = path.join(f, 'index.html');
      const body = await readFile(f);
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch (e) { res.writeHead(404).end('not found'); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}
async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { /* fall through */ }
  for (const p of ['/opt/node22/lib/node_modules/playwright', path.join(process.env.npm_config_prefix || '', 'lib/node_modules/playwright')]) {
    try { return createRequire(import.meta.url)(p); } catch (e) { /* try next */ }
  }
  throw new Error('Playwright not found. Run: npm i -D playwright && npx playwright install chromium');
}

const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m` };
let failed = 0, passed = 0;

const nodeDirs = [path.join(ROOT, 'tests', 'node'), path.join(ROOT, 'tests', 'seo')];
const nodeTests = (await Promise.all(nodeDirs.map(async (d) => (await readdir(d).catch(() => [])).filter((f) => f.endsWith('.test.mjs') && f.includes(filter)).map((f) => path.join(d, f))))).flat();
if (nodeTests.length && !flag('skip-node')) {
  console.log(c.b('\nNode tests'));
  const r = spawnSync(process.execPath, ['--test', ...nodeTests], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}

let pages = (await findTests(path.join(ROOT, 'tests'))).filter((p) => p.includes(filter)).sort();
if (value('pages-file')) { const only = new Set((await readFile(value('pages-file'), 'utf8')).split(/\s+/).filter(Boolean)); pages = pages.filter((p) => only.has(p)); }
// A page about a feature this build leaves out (<meta name="slop-test-needs">, tests/needs.mjs) is not run; it is named.
const FACTS = loadFacts();
{ const out = [];
  pages = (await Promise.all(pages.map(async (p) => { const u = unmet(needsOf(await readFile(p, 'utf8')), FACTS); if (u.length) out.push(`${p} (${u.map((c) => `${c.key}=${c.values.join('|')}`).join('; ')})`); return u.length ? null : p; }))).filter(Boolean);
  if (out.length && !flag('needs-net')) console.log(c.d(`\nNot for this build (its brand facts, tests/brand-facts.js): ${out.sort().join(', ')}`)); }
if (TOUCH) { pages = (await Promise.all(pages.map(async (p) => (isTouchPage(await readFile(p, 'utf8')) ? p : null)))).filter(Boolean); console.log(c.b(`\nTouch: ${pages.length} pages in ${ENGINE} as ${touchDevice(ENGINE, value('device')).name}`)); }
const timings = JSON.parse(await readFile(TIMINGS, 'utf8').catch(() => '{}'));
if (SHARD) {
  pages = shardPages(pages, SHARD.count, timings)[SHARD.index - 1];
  if (!flag('needs-net')) console.log(c.b(`\nShard ${SHARD.index}/${SHARD.count}: ${pages.length} pages, ${JOBS} at a time`));
}
if (flag('needs-net')) {
  const { pages: net } = parseNetUrls(await readFile(NET_URLS, 'utf8').catch(() => ''));
  console.log(pages.some((p) => net.has(p)) ? 'yes' : 'no');
  process.exit(0);
}
const took = {}, results = {};
// The pages that download through the cache (tests/net-urls.txt): only these get its route (see tests/netcache.mjs).
const NET_PAGES = parseNetUrls(await readFile(NET_URLS, 'utf8').catch(() => '')).pages;
/** Opens one test page in its own context and returns its report as printed lines (a page prints all at once, so pages
 *  that run side by side never mix their output). */
async function runPage(browser, base, p, scale) {
  const ctx = TOUCH ? await browser.newContext({ ...touchDevice(ENGINE, value('device')).options, acceptDownloads: true })
    : await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const net = await attachNet(ctx, { dir: NET_DIR, route: NET_PAGES.has(p.split(path.sep).join('/')) });
  const page = await ctx.newPage();
  if (TOUCH) await touchPage(page, ENGINE, touchDevice(ENGINE, value('device')).name); // real touches for the test page (tests/touch.mjs)
  // real key presses for a page that needs the browser's own handling (Ctrl+A selecting a field's text): __slopKey('Control+A')
  await page.exposeFunction('__slopKey', (key) => page.keyboard.press(key));
  if (scale > 1) await page.addInitScript((n) => { window.__SLOPTEST_SCALE__ = n; }, scale); // harness timeouts (tests/harness.js)
  // A script error before the harness starts (a syntax error in the test page) would leave the page waiting for the full
  // timeout; the page notes the first error so the wait below can end early.
  await page.addInitScript(() => { addEventListener('error', () => { window.__SLOPTEST_ERR__ = window.__SLOPTEST_ERR__ || performance.now(); }); });
  // A build that starts in another language: English is the choice before anything loads, so an app frame placed above
  // harness.js does not boot in the start language and switch halfway (tests/english.js, tests/needs.mjs englishFirst).
  if (englishFirst(await readFile(p, 'utf8'), FACTS)) { await page.addInitScript(() => { window.__SLOPTEST_ENGLISH__ = true; }); await page.addInitScript({ path: path.join(ROOT, 'tests', 'english.js') }); }
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const t0 = Date.now();
  let report = null;
  try {
    await page.goto(base + p.split(path.sep).join('/'));
    // Done, or dead: an error happened and the harness had still not started 30 s (times the load scale) after it; or stuck:
    // a test is still running 30 s past its own time limit (each test, with its hooks, has one: tests/harness.js), or the
    // tests never started within START_MS. A page with many slow tests is not stuck: only the overall cap (CAP_MS, or the
    // page's <meta name="slop-test-limit" content="<seconds>">) ends it.
    await page.waitForFunction(([grace, startMs]) => window.__SLOPTEST__
      || (window.__SLOPTEST_ERR__ && !window.__SLOPTEST_STARTED__ && performance.now() - window.__SLOPTEST_ERR__ > grace)
      || (window.__SLOPTEST_DEADLINE__ && performance.now() > window.__SLOPTEST_DEADLINE__ + 30000)
      || (!window.__SLOPTEST_STARTED__ && performance.now() > startMs),
    [30000 * Math.max(1, scale), START_MS * Math.max(1, scale)], { timeout: await pageLimit(p), polling: 250 });
    if (!(await page.evaluate(() => !!window.__SLOPTEST__))) throw new Error('Timeout: stuck');
    report = await page.evaluate(() => window.__SLOPTEST__);
    if (!report) throw new Error(`the page stopped before its tests started: ${consoleErrors[0] || 'a script error'}`);
  } catch (e) {
    // A page that never finished: what it had done, and the test it was in, so the hang can be found; it is not run again.
    const where = await page.evaluate(() => ({ now: window.__SLOPTEST_NOW__ || '', done: window.__SLOPTEST_DONE__ || [] })).catch(() => ({ now: '', done: [] }));
    const msg = /Timeout/.test(e.message) ? `stuck${where.now ? ` past its time limit in: ${where.now}` : ' before its tests started'}` : e.message;
    report = { name: p, passed: where.done.filter((r) => r.status === 'pass').length, failed: 1, hung: /Timeout/.test(e.message), results: [...where.done, { suite: 'runner', test: 'page loaded and finished', status: 'fail', message: msg }], errors: [] };
  }
  const secs = (Date.now() - t0) / 1000;
  took[p] = secs;
  const errs = consoleErrors.filter((m) => !/favicon|net::ERR_|Failed to load resource|Content Security Policy|Fetch API cannot load|ResizeObserver loop/.test(m));
  const out = [`\n${c.b(report.name || p)} ${c.d(p + ' · ' + secs.toFixed(1) + 's')}`];
  for (const r of report.results) {
    out.push(`  ${r.status === 'pass' ? c.g('✓') : c.r('✗')} ${r.suite} › ${r.test} ${c.d(r.ms != null ? r.ms + 'ms' : '')}`);
    if (r.message) out.push(c.r('      ' + r.message.split('\n').join('\n      ')));
  }
  const outside = Object.entries(net.outside).map(([h, n]) => `${h}×${n}`).join(' ');
  if (outside) out.push(c.d(`  net: ${net.hits} from the cache, ${net.misses} fetched (${(net.bytes / 1e6).toFixed(1)} MB in ${(net.ms / 1000).toFixed(1)} s) · ${outside}`));
  results[p] = { secs: Math.round(secs * 10) / 10, net: { ...net, urls: [...net.urls] }, tests: report.results.map((r) => ({ name: `${r.suite} › ${r.test}`, ms: r.ms, status: r.status })) };
  if (errs.length) { out.push(c.r(`  ✗ console errors (${errs.length}):`)); for (const m of errs.slice(0, 5)) out.push(c.r('      ' + m)); report.failed++; }
  await ctx.close();
  return { out, passed: report.passed, failed: report.failed, hung: !!report.hung };
}
/** How long a page may take in all, as a last resort (a stuck test is caught sooner, see runPage): CAP_MS, or its own
 *  <meta name="slop-test-limit" content="<seconds>">. START_MS: how long a page may take to start its tests. */
const CAP_MS = 900000, START_MS = 60000;
async function pageLimit(p) {
  const html = await readFile(p, 'utf8').catch(() => '');
  const m = /<meta name="slop-test-limit" content="(\d+)">/.exec(html);
  return m ? Number(m[1]) * 1000 : CAP_MS;
}
if (pages.length) {
  const pw = await loadPlaywright(), engine = pw[ENGINE];
  if (!engine) throw new Error(`--browser=${ENGINE}: not a Playwright browser`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = ENGINE !== 'chromium' ? await engine.launch(TOUCH_ARGS[ENGINE] || {}) : await engine.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', NO_THIRD_PARTY] });
  const again = [], alone = [];
  await pool(longestFirst(pages, timings), JOBS, async (p) => {
    const r = await runPage(browser, base, p, Math.min(JOBS, 4));
    if (r.failed && !r.hung && JOBS > 1) { again.push(p); console.log(r.out.join('\n') + c.d('\n  (runs again on its own after the others)')); return; }
    console.log(r.out.join('\n'));
    passed += r.passed; failed += r.failed;
  });
  for (const p of again.sort()) {
    const r = await runPage(browser, base, p, 1);
    console.log(c.b('\nAgain, on its own:') + r.out.join('\n'));
    passed += r.passed; failed += r.failed;
    if (!r.failed) alone.push(p);
  }
  if (alone.length) console.log(c.d(`\nLoad-sensitive (failed beside other pages, passed alone): ${alone.join(', ')}`));
  await browser.close();
  server.close();
  if (value('results')) await writeFile(value('results'), JSON.stringify({ shard: value('shard'), jobs: JOBS, pages: results }) + '\n');
  if (flag('record-timings') && !TOUCH) await writeFile(TIMINGS, JSON.stringify(mergeTimings(timings, took), null, 1) + '\n');
}
console.log(`\n${failed ? c.r(`${failed} failed`) : c.g('all green')} · ${passed} passed across ${pages.length} page${pages.length === 1 ? '' : 's'}${nodeTests.length && !flag('skip-node') ? ` + ${nodeTests.length} node file${nodeTests.length === 1 ? '' : 's'}` : ''}`);
process.exit(failed ? 1 : 0);
