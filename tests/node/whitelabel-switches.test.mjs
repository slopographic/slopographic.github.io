// Covers: shared/consent/config.js, shared/consent/banner.js, shared/theme/theme.js
// The brand profile's switches outside the apps: "analytics": false empties every third-party ID and the consent strip
// never mounts; "themes" recolours the shared themes and hides the ones the profile lists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');

test('analytics off: no IDs, thirdParty false, the strip does not mount', () => {
  const on = {}; vm.runInNewContext(read('shared/consent/config.js'), { window: on });
  assert.equal(on.SLOP_CONSENT_CONFIG.thirdParty, true);
  assert.ok(on.SLOP_CONSENT_CONFIG.ga4MeasurementId);
  const off = {}; vm.runInNewContext(read('shared/consent/config.js').replace('/*profile:analytics*/true', '/*profile:analytics*/false'), { window: off });
  const c = off.SLOP_CONSENT_CONFIG;
  assert.deepEqual([c.thirdParty, c.ga4MeasurementId, c.adsensePublisherId, c.patreonUrl], [false, '', '', '']);
  let appended = 0;
  const document = { readyState: 'complete', body: { getAttribute: () => null, append: () => { appended++; } }, getElementById: () => null };
  const win = { SLOP_CONSENT_CONFIG: c, SlopConsent: { needsChoice: () => true, base: '/' }, SlopConsentState: { needsChoice: () => true, base: '/' } };
  vm.runInNewContext(read('shared/consent/banner.js'), { window: win, document, requestAnimationFrame() {} });
  assert.equal(win.SlopBanner.mount(), false);
  assert.equal(appended, 0);
});

test('themes: the profile recolours light and dark and hides lime', () => {
  const src = read('shared/theme/theme.js').replace('/*profile:themes*/{}', '/*profile:themes*/{"light":{"accent":"#1d4ed8"},"hide":["lime"]}');
  const g = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  vm.runInNewContext(src, { window: g, self: g, globalThis: g, document: undefined }, {});
  const T = g.SlopTheme;
  assert.ok(T, 'SlopTheme');
  const ids = T.THEMES.map((t) => t.id);
  assert.ok(!ids.includes('lime') && ids.includes('dark'));
  assert.equal(T.THEMES.find((t) => t.id === 'light').tokens.accent, '#1d4ed8');
});
