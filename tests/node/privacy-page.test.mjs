// The privacy policy page (privacy/): the analytics and ads paragraph only where the site has them, the contact links
// (the site's own address, social links but never a payment link), the words in English and Swedish with the brand's
// name as {brand}, and the links to it from the homepage footer and Settings. The page in a browser:
// tests/privacy/page.test.html. Also: Settings hides its analytics and ads switches where the site has neither.
// Covers: settings/settings.js, privacy/privacy.js, privacy/i18n/index.js, privacy/i18n/en/page.js, privacy/i18n/sv/page.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const P = createRequire(import.meta.url)('../../privacy/privacy.js');
function table(code) {
  const out = {};
  vm.runInNewContext(read(`privacy/i18n/${code}/page.js`), { window: { SlopI18n: { add: (c, d) => { if (c === code) Object.assign(out, d); } } } });
  return out;
}

test('analytics and ads only where the site has them', () => {
  assert.equal(P.hasThirdParty({ thirdParty: true, ga4MeasurementId: 'G-ABCDEF', adsensePublisherId: '' }), true);
  assert.equal(P.hasThirdParty({ thirdParty: true, ga4MeasurementId: '', adsensePublisherId: 'ca-pub-123456' }), true);
  assert.equal(P.hasThirdParty({ thirdParty: false, ga4MeasurementId: '', adsensePublisherId: '' }), false);
  assert.equal(P.hasThirdParty({ thirdParty: true, ga4MeasurementId: '', adsensePublisherId: '' }), false);
  assert.equal(P.hasThirdParty(undefined), false);
  const html = read('privacy/index.html');
  assert.match(html, /<section aria-labelledby="pv-third" data-privacy-third hidden>/);
  assert.match(html, /<section aria-labelledby="pv-none" data-privacy-none>/);
});

test('contact: the site address and social links, never a payment link', () => {
  assert.deepEqual(P.siteOf('https://www.example.com/privacy/'), { href: 'https://www.example.com/', host: 'example.com' });
  assert.equal(P.siteOf('capacitor://localhost/privacy/'), null);
  assert.equal(P.siteOf('nonsense'), null);
  const links = P.socialLinks({ x: 'https://x.com/a', reddit: '', tiktok: 'javascript:alert(1)', patreon: 'https://patreon.com/a', gumroad: 'https://a.gumroad.com', support: 'https://pay.example' });
  assert.deepEqual(links.map((l) => l.key), ['x']);
  assert.deepEqual(P.socialLinks(null), []);
});

test('English and Swedish hold the same keys; the name is {brand}; other languages read English', () => {
  const en = table('en'), sv = table('sv');
  assert.deepEqual(Object.keys(sv).sort(), Object.keys(en).sort());
  for (const k of ['privacy.lede', 'privacy.device.body', 'privacy.account.body', 'privacy.none.body', 'privacy.ai.body', 'privacy.downloads.body']) {
    assert.match(en[k], /\{brand\}/, k);
    assert.match(sv[k], /\{brand\}/, k);
  }
  assert.doesNotMatch(Object.values(en).join(' '), /Slopographic/);
  assert.match(read('privacy/i18n/index.js'), /langs: \['en', 'sv'\]/);
  const keys = [...read('privacy/index.html').matchAll(/data-i18n="(privacy\.[\w.]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 20);
  for (const k of keys) assert.ok(en[k], k);
});

test('linked from the homepage footer and from Settings', () => {
  assert.match(read('index.html'), /<p class="fine legal"><a href="privacy\/" data-i18n="privacy\.link">Privacy policy<\/a><\/p>/);
  assert.match(read('index.html'), /<script src="privacy\/i18n\/index\.js"/);
  const s = read('settings/index.html');
  assert.match(s, /<a class="btn" href="\.\.\/privacy\/" data-i18n="privacy\.link">/);
  assert.match(s, /<p class="fine legal"><a href="\.\.\/privacy\/" data-i18n="privacy\.link">/);
});

test('Settings hides the analytics and ads switches on a site that has none', () => {
  assert.match(read('settings/index.html'), /<section id="choices" aria-labelledby="choices-title">/);
  assert.match(read('settings/settings.js'), /if \(box && \(cfg\.thirdParty === false \|\| \(!cfg\.ga4MeasurementId && !cfg\.adsensePublisherId\)\)\) box\.hidden = true;/);
});
