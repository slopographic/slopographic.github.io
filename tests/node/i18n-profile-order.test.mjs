// Every page that loads shared/i18n/i18n.js loads shared/profile/profile.js before it, in its <head>: i18n.js reads the
// chosen language from SlopProfile when it runs, and without it the page starts in the default language (the bug fixed
// in the AI tools hub and tools, and in HTML to PDF). Pages under tests/ and vendor/ are not checked.
// Run: node --test tests/node/i18n-profile-order.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** What is wrong with one page's order, or null: 'no profile.js', 'profile.js after i18n.js', 'profile.js not in <head>'. */
export function orderProblem(html) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const head = clean.split(/<\/head>/i)[0];
  const srcs = (s) => [...s.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)].map((m) => m[1].split(/[?#]/)[0]);
  const all = srcs(clean), heads = srcs(head);
  const i18n = all.findIndex((s) => /(^|\/)shared\/i18n\/i18n\.js$/.test(s));
  if (i18n < 0) return null;
  const prof = all.findIndex((s) => /(^|\/)shared\/profile\/profile\.js$/.test(s));
  if (prof < 0) return 'no profile.js';
  if (prof > i18n) return 'profile.js after i18n.js';
  if (!heads.some((s) => /(^|\/)shared\/profile\/profile\.js$/.test(s))) return 'profile.js not in <head>';
  return null;
}

test('the order check: profile.js in the head before i18n.js passes; missing, after, or in the body fails', () => {
  const P = '<script src="../shared/profile/profile.js"></script>', I = '<script src="../shared/i18n/i18n.js" data-src="shared/i18n/i18n.js"></script>';
  assert.equal(orderProblem(`<head>${P}${I}</head><body></body>`), null);
  assert.equal(orderProblem('<head><script src="x.js"></script></head>'), null, 'a page without i18n.js');
  assert.equal(orderProblem(`<head>${I}</head>`), 'no profile.js');
  assert.equal(orderProblem(`<head><!-- ${P} -->${I}</head>`), 'no profile.js', 'a commented-out tag does not count');
  assert.equal(orderProblem(`<head>${I}${P}</head>`), 'profile.js after i18n.js');
  assert.equal(orderProblem(`<head></head><body>${P}${I}</body>`), 'profile.js not in <head>');
});

test('every page that loads i18n.js loads profile.js before it in its <head>', () => {
  const pages = execFileSync('git', ['ls-files', '*.html'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
    .filter((f) => f && !/^(tests|vendor)\//.test(f) && !/(^|\/)node_modules\//.test(f));
  let seen = 0;
  const bad = [];
  for (const f of pages) {
    const html = readFileSync(path.join(ROOT, f), 'utf8');
    if (!/shared\/i18n\/i18n\.js/.test(html)) continue;
    seen++;
    const p = orderProblem(html);
    if (p) bad.push(`${f}: ${p}`);
  }
  assert.ok(seen > 100, `pages with i18n.js: ${seen}`);
  assert.deepEqual(bad, []);
});
