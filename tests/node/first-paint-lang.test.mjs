// The first frame is in the start language. A build that starts in another language (the profile's defaultLang; here, a
// visitor who chose Swedish) used to paint the homepage in English and switch at DOMContentLoaded, seconds later on a slow
// phone, although its tables are in from the <head>. shared/i18n/i18n.js now fills each marked element as the parser
// adds it. The test holds the HTML back right after the hero (tests/node/trickle.mjs), so the page is still parsing and
// that frame is painted, and checks the header's and the hero's marked text there.
// Covers: shared/i18n/i18n.js, index.html
// Run with: node --test tests/node/first-paint-lang.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTS } from '../brand-facts.mjs';
import { trickle } from './trickle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LANG = FACTS.defaultLang !== 'en' ? FACTS.defaultLang : 'sv';

test(`the homepage's header and hero are in ${LANG} in the first frame, before the page has finished parsing`, { timeout: 120000 }, async (t) => {
  const { chromium } = await import('playwright');
  const server = await trickle(ROOT, 20, 6000);
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await server.close(); });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  if (LANG !== FACTS.defaultLang) await p.addInitScript((code) => {
    if (!localStorage.getItem('slop-profile')) localStorage.setItem('slop-profile', JSON.stringify({ v: 1, data: { lang: { mode: code } } }));
  }, LANG);
  await p.goto(server.url, { waitUntil: 'commit', timeout: 60000 });
  await server.held;
  await p.waitForFunction(() => document.getElementById('hero') && document.getElementById('hero').nextElementSibling === null && document.querySelector('#hero [data-i18n]'), null, { timeout: 4000 });
  await p.waitForTimeout(500);   // a frame of it
  const seen = await p.evaluate(() => {
    const I = window.SlopI18n, en = I.at('en');
    const els = [...document.querySelectorAll('header.nav [data-i18n], #hero [data-i18n]')];
    return { state: document.readyState, lang: document.documentElement.lang, rows: els.map((el) => {
      const key = el.getAttribute('data-i18n'), vars = JSON.parse(el.getAttribute('data-i18n-vars') || '{}');
      return { key, text: el.textContent, want: I.t(key, vars), english: en.t(key, vars) };
    }) };
  });
  assert.equal(seen.state, 'loading', 'the HTML is still arriving, so this is the frame a slow phone paints first');
  assert.equal(seen.lang, LANG, '<html lang> is the start language');
  assert.ok(seen.rows.some((r) => r.key.startsWith('nav.')) && seen.rows.some((r) => r.key.startsWith('hero.') || r.key.startsWith('plain.hero.')), 'the header and the hero are marked');
  const wrong = seen.rows.filter((r) => r.text !== r.want).map((r) => `  ${r.key}: "${r.text}" (want "${r.want}")`);
  assert.deepEqual(wrong, [], `marked text not yet in ${LANG}:\n${wrong.join('\n')}`);
  assert.ok(seen.rows.filter((r) => r.want !== r.english).length >= 3, `the ${LANG} tables are in (some text differs from English)`);
});
