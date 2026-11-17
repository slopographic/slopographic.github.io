// Store-app mode (shared/native-app.js): which app a page runs in (the iPhone/iPad app through Capacitor or its
// capacitor:// address or the app's native config, the desktop app through app://, a test's SLOP_NATIVE), which pages are
// the website's own, and what the store app hides; the iOS bundle loads it on every page; the install button stays
// hidden in an app (shared/pwa.js); Settings, How it works and the app pages mark their install help as website-only.
// The browser side: tests/native/store-app.test.html.
// Covers: shared/native-app.js, shared/pwa.js, tools/seo/landing.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectNative } from '../../mobile/ios/bundle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const N = createRequire(import.meta.url)('../../shared/native-app.js');
const loc = (protocol) => ({ location: { protocol } });

test('the app a page runs in', () => {
  assert.equal(N.detect(loc('https:')), null);
  assert.equal(N.detect(loc('http:')), null);
  assert.equal(N.detect(loc('capacitor:')), 'ios');
  assert.equal(N.detect({ location: { protocol: 'https:' }, Capacitor: { Plugins: {} } }), 'ios');
  assert.equal(N.detect({ location: { protocol: 'https:' }, NATIVE_CONFIG: { local: {} } }), 'ios');
  assert.equal(N.detect(loc('app:')), 'desktop');
  assert.equal(N.detect({ location: { protocol: 'https:' }, SlopDesktop: { desktop: true } }), 'desktop');
  assert.equal(N.detect({ location: { protocol: 'https:' }, SLOP_NATIVE: 'ios' }), 'ios');
  assert.equal(N.detect({ location: { protocol: 'https:' }, SLOP_NATIVE: 'android' }), null);
});

test("the website's own pages", () => {
  for (const p of ['/best/', '/best/free-pdf-editors/', '/compare/', '/all-tools/', '/apps/pdf/', '/apps/qr/?x=1#a']) assert.equal(N.webOnlyPath(p), true, p);
  for (const p of ['/', '/pdf/', '/qr/', '/settings/', '/privacy/', '/how-it-works/', '/apps/', '/convert/png-to-jpg/']) assert.equal(N.webOnlyPath(p), false, p);
});

test('what the store app hides', () => {
  for (const s of ['[data-web-only]', '.pwa-install', '[data-donate]', '[data-brand-link="patreon"]', '[data-brand-link="gumroad"]', '#desktop-download', '.slop-ad', '.fnav', '[data-stage]']) {
    assert.ok(N.STYLE.includes(`.store-app ${s}`), s);
  }
  assert.match(N.STYLE, /\{display:none!important\}$/);
});

test('the iOS bundle loads it on every page, after the app glue', () => {
  const html = injectNative('<html><head><title>x</title></head></html>');
  assert.ok(html.indexOf('/native/native.js') < html.indexOf('/shared/native-app.js'));
  assert.ok(html.indexOf('/shared/native-app.js') < html.indexOf('<title>'));
});

test('no install button in an app; install help and agent offers marked website-only', () => {
  assert.match(read('shared/pwa.js'), /SlopNative\.isApp\(\)\) \{ resolve\(opts\.install\)\.forEach\(\(b\) => \{ b\.hidden = true; \}\); return false; \}/);
  const how = read('shared/seo/pages/how-it-works.html');
  assert.match(how, /<h3 data-web-only>\{\{plain\.7\}\}<\/h3>\n<p data-web-only>\{\{plain\.8\}\}<\/p>/);
  assert.match(how, /<div data-web-only>\n<h2 id="ai-apps">/);
  assert.match(how, /<tr data-web-only><td>\{\{network\.55\}\}/);
  assert.match(read('tools/seo/landing.mjs'), /<p class="note" data-web-only>\$\{esc\(installIn\(L\.code\)\.how\)\}<\/p>/);
  // a generated app page carries it (a white-label build may rename or leave out the PDF app's page)
  const page = ['apps/pdf/index.html', 'apps/qr/index.html'].find((f) => existsSync(path.join(ROOT, f)));
  if (page) assert.match(read(page), /<p class="note" data-web-only>/);
  // Settings: AI agents (browser extensions, desktop AI apps), Updates (the store updates the app), Local folder
  const set = read('settings/index.html');
  assert.match(set, /<section id="agents" data-web-only /);
  assert.match(set, /<section id="updates" data-web-only /);
  assert.match(set, /<section id="folder" data-web-only /);   // local folders need the File System Access API
});
