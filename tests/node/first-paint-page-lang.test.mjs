// A page in a language's folder (/sv/, tools/seo copies.mjs) paints in that language from its first frame, with nothing
// stored: shared/i18n/i18n.js reads <html data-lang-page>, and shared/i18n/early.js fills each marked element as the
// parser adds it. The test holds the HTML back right after the hero (tests/node/trickle.mjs), so the page is still
// parsing when the frame is read.
// Covers: shared/i18n/i18n.js, shared/i18n/early.js, tools/seo/copies.mjs
// Run with: node --test tests/node/first-paint-page-lang.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trickle } from './trickle.mjs';
import { published, prefixOf, ROOT_LANG } from '../../tools/seo/lang.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LANG = published().find((c) => c !== ROOT_LANG);

test(`the ${LANG || 'other language'} homepage copy is in its language in the first frame, with nothing stored`, { timeout: 120000, skip: !LANG && 'one language only' }, async (t) => {
  const { chromium } = await import('playwright');
  const server = await trickle(ROOT, 20, 6000, prefixOf(LANG).slice(1) + '/');
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await server.close(); });
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await p.goto(server.url, { waitUntil: 'commit', timeout: 60000 });
  await server.held;
  await p.waitForFunction(() => document.getElementById('hero') && document.getElementById('hero').nextElementSibling === null && document.querySelector('#hero [data-i18n]'), null, { timeout: 4000 });
  await p.waitForTimeout(500);   // a frame of it
  const seen = await p.evaluate(() => {
    const I = window.SlopI18n, en = I.at('en');
    const els = [...document.querySelectorAll('header.nav [data-i18n], #hero [data-i18n]')];
    return { state: document.readyState, lang: document.documentElement.lang, code: I.get(), rows: els.map((el) => {
      const key = el.getAttribute('data-i18n'), vars = JSON.parse(el.getAttribute('data-i18n-vars') || '{}');
      return { key, text: el.textContent, want: I.t(key, vars), english: en.t(key, vars) };
    }) };
  });
  assert.equal(seen.state, 'loading', 'the HTML is still arriving');
  assert.deepEqual([seen.lang, seen.code], [LANG, LANG], 'the page language, with nothing stored');
  const wrong = seen.rows.filter((r) => r.text !== r.want).map((r) => `  ${r.key}: "${r.text}" (want "${r.want}")`);
  assert.deepEqual(wrong, [], `marked text not yet in ${LANG}:\n${wrong.join('\n')}`);
  if (LANG !== 'en') assert.ok(seen.rows.filter((r) => r.want !== r.english).length >= 3, `the ${LANG} tables are in`);
});
