// Layout shift (CLS) on a phone: the homepage and an app's landing page, loaded the way Lighthouse's mobile run sees them
// (a 390 x 844 phone, the CPU four times slower, slow 4G), must move less than 0.05 in all. What used to move them:
//   - the browser offering an install: the homepage's Install button came into a full header and wrapped it onto a new row,
//     then shared/ui/hbtn.js folded and unfolded it every frame (CLS 0.8). Chromium in tests never offers one, so the test
//     sends the event itself, as Chrome on Android does after the service worker comes;
//   - the header buttons going into a More menu whose script had not loaded yet (shared/ui/hbtn.js), and the Tours button
//     put after its slot instead of in it (shared/tour/mount.js);
//   - the web fonts arriving: text drawn in the fallback wrapped onto other lines (shared/fonts/fonts.css's fallbacks);
//   - Sloppo's level button following him with left and top (shared/buddy/hud.js);
//   - a frame painted while the HTML was still being parsed: the phone's globe box sat after the copy in the HTML and was
//     moved above it with order, so the copy painted at the top and then jumped down under the box (CLS 0.12 to 0.22,
//     now and then, in builds whose head takes long). The box is first in index.html now; the second test streams the
//     hero a line at a time so such a frame comes every time.
// Every shift counts, those Chrome marks as after input too: emulated touch marks the first ones of a load that way, and
// Lighthouse counts them.
// Covers: shared/ui/hbtn.js, shared/buddy/hud.js, shared/tour/mount.js, shared/pwa.js, shared/fonts/fonts.css, home/home.css
// Covers: shared/landing/landing.css, style/base.css, home/hero.css, index.html
// Run with: node --test tests/node/cls.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve } from '../../tools/speed/serve.mjs';
import { trickle } from './trickle.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIMIT = 0.05;
// a site that is not indexed has no landing pages (tests/brand-facts.js seoIndex): its homepage alone then
const { FACTS } = await import('../brand-facts.mjs');
const PAGES = FACTS.seoIndex ? ['', 'apps/pdf/'] : [''];

/** Records every layout shift of the page, with what moved, from the first paint on. */
function observe() {
  window.__shifts = [];
  const name = (n) => (!n ? '?' : n.nodeType !== 1 ? '#text' : n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).join('.') : ''));
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__shifts.push({ at: Math.round(e.startTime), value: e.value, input: e.hadRecentInput,
        moved: (e.sources || []).map((s) => `${name(s.node)} y ${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)}`) });
    }
  }).observe({ type: 'layout-shift', buffered: true });
}

test('the homepage and a landing page move less than CLS 0.05 on a slow phone', { timeout: 240000 }, async (t) => {
  const { chromium } = await import('playwright');
  const server = await serve(ROOT, 0);
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); server.close(); });
  for (const page of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
    await p.addInitScript(observe);
    await p.goto(server.url.replace(/\/?$/, '/') + page, { waitUntil: 'load', timeout: 120000 });
    // the browser offers an install (pages with an Install button show it now)
    await p.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = async () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(e);
    });
    await p.waitForTimeout(6000);   // the late arrivals: fonts, the finder, the header buttons, Sloppo's fall
    const shifts = await p.evaluate(() => window.__shifts);
    const sum = shifts.reduce((s, e) => s + e.value, 0);
    const list = shifts.filter((e) => e.value >= 0.001).map((e) => `  ${e.at} ms  ${e.value.toFixed(4)}${e.input ? ' (input)' : ''}  ${e.moved.join(', ')}`).join('\n');
    assert.ok(sum < LIMIT, `/${page} moved CLS ${sum.toFixed(3)} (limit ${LIMIT}):\n${list}`);
    await ctx.close();
  }
});

test('the homepage moves less than CLS 0.05 while its HTML is still arriving (a frame of a half-parsed hero)', { timeout: 120000 }, async (t) => {
  const { chromium } = await import('playwright');
  const server = await trickle(ROOT, 250);
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await server.close(); });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript(observe);
  await p.goto(server.url, { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(3000);
  const shifts = await p.evaluate(() => window.__shifts);
  const sum = shifts.reduce((s, e) => s + e.value, 0);
  const list = shifts.filter((e) => e.value >= 0.001).map((e) => `  ${e.at} ms  ${e.value.toFixed(4)}  ${e.moved.join(', ')}`).join('\n');
  assert.ok(sum < LIMIT, `/ streamed moved CLS ${sum.toFixed(3)} (limit ${LIMIT}):\n${list}`);
});
