// The store apps' facts (mobile/config.mjs): the app id from CNAME, the web manifest complete for a Trusted Web Activity
// and the store listings (names, colours, a 512 px icon and a maskable one), and the Digital Asset Links file the site
// serves at /.well-known/assetlinks.json, in step with mobile/mobile.json. The PWA icons the manifest lists exist at their
// sizes (tools/pwa-icons.mjs draws them; a white-label build draws its own, tools/whitelabel/images.mjs).
// Covers: mobile/config.mjs, mobile/android/assetlinks.mjs, tools/pwa-icons.mjs, tools/whitelabel/images.mjs, tools/whitelabel/mascot.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appId, manifestProblems, assetLinks, normalizeFingerprint, isFingerprint, pickIcon, readConfig } from '../../mobile/config.mjs';
import { assetLinksText, FILE } from '../../mobile/android/assetlinks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
// the white-label tools are this repository's only (tests/repo-only.json): a white-label build has none, so skips that part
const WL = existsSync(path.join(ROOT, 'tools/whitelabel/images.mjs'));
const FP = 'AB:'.repeat(31) + 'CD';

test('the app id is the domain reversed plus "app", as a valid Java package', () => {
  assert.equal(appId('example.com'), 'com.example.app');
  assert.equal(appId('www.example.com'), 'com.example.app');
  assert.equal(appId('tools.my-shop.example'), 'example.my_shop.tools.app');
  assert.equal(appId('app.example.com'), 'com.example.app');
  assert.equal(appId('2fast.example.com'), 'com.example._2fast.app');
  assert.equal(appId('new.example.com'), 'com.example._new.app');
  assert.throws(() => appId(''), /CNAME/);
  assert.throws(() => appId('localhost'), /CNAME/);
  const cfg = readConfig(ROOT);
  assert.equal(cfg.appId, appId(readFileSync(path.join(ROOT, 'CNAME'), 'utf8')));
  assert.match(cfg.appId, /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)+$/);
  assert.equal(cfg.origin, `https://${cfg.host}`);
});

test("the site's web manifest is complete for the store apps", () => {
  assert.deepEqual(manifestProblems(manifest), []);
  const cfg = readConfig(ROOT);
  assert.equal(cfg.iconUrl, cfg.origin + pickIcon(manifest, 'any', 512).src);
  assert.equal(cfg.maskableIconUrl, cfg.origin + pickIcon(manifest, 'maskable', 512).src);
});

test('a manifest without what a store app needs is refused, each gap named', () => {
  const bad = { name: '', short_name: 'A much too long name', start_url: 'https://x/', display: 'browser', theme_color: 'red', icons: [{ src: 'icon.png', sizes: '192x192', type: 'image/png' }] };
  const errs = manifestProblems(bad).join('\n');
  for (const k of ['name:', 'short_name: at most 12', 'start_url', 'display', 'theme_color', 'background_color', 'purpose "any"', 'maskable', 'site path']) assert.ok(errs.includes(k), `${k} in\n${errs}`);
});

test('every icon the manifest lists exists, a PNG of its stated size (the maskable one too)', async () => {
  for (const icon of manifest.icons) {
    const file = path.join(ROOT, icon.src);
    assert.ok(existsSync(file), icon.src);
    if (icon.type !== 'image/png') continue;
    const png = readFileSync(file);
    assert.equal(png.toString('latin1', 1, 4), 'PNG', icon.src);
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes, icon.src);
  }
  if (!WL) return;
  const { maskableHtml } = await import('../../tools/whitelabel/images.mjs');
  const { ICON_FILES } = await import('../../tools/whitelabel/mascot.mjs');
  assert.ok(ICON_FILES.includes('assets/icons/icon-maskable-512.png'), 'a mascot overlay draws the maskable icon too');
  const html = maskableHtml({ colors: { ink: '#123456' } }, '<svg width="9" height="9" viewBox="0 0 32 32"></svg>');
  assert.match(html, /background:#123456/);
  assert.match(html, /<svg width="368" height="368" viewBox/);   // 72 % of 512, inside the launcher mask's safe zone
});

test('asset links: [] without a key; one statement with the app id and normalised fingerprints', () => {
  assert.deepEqual(assetLinks('com.example.app', []), []);
  const s = assetLinks('com.example.app', [FP.toLowerCase().replace(/:/g, ''), FP]);
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].relation, ['delegate_permission/common.handle_all_urls']);
  assert.deepEqual(s[0].target, { namespace: 'android_app', package_name: 'com.example.app', sha256_cert_fingerprints: [FP] });
  assert.equal(normalizeFingerprint(FP.toLowerCase()), FP);
  assert.ok(isFingerprint(FP));
  assert.throws(() => normalizeFingerprint('AB:CD'), /SHA-256/);
});

test('the served asset links file is in step with mobile/mobile.json (node mobile/android/assetlinks.mjs)', () => {
  const file = path.join(ROOT, FILE);
  assert.ok(existsSync(file), `${FILE} is missing`);
  assert.equal(readFileSync(file, 'utf8'), assetLinksText(ROOT));
  const list = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(list));
  const id = readConfig(ROOT).appId;
  for (const s of list) {
    assert.equal(s.target.package_name, id);
    assert.ok(s.target.sha256_cert_fingerprints.length && s.target.sha256_cert_fingerprints.every(isFingerprint));
  }
  // an added fingerprint (the workflow's upload key) lands in the statement
  assert.deepEqual(JSON.parse(assetLinksText(ROOT, [FP]))[0].target.sha256_cert_fingerprints.slice(-1), [FP]);
  // GitHub Pages serves a dot folder only without Jekyll
  assert.ok(existsSync(path.join(ROOT, '.nojekyll')), '.nojekyll keeps /.well-known/ served');
});

test('mobile/mobile.json: fingerprints per app id, the iOS app list and start page', () => {
  const m = JSON.parse(readFileSync(path.join(ROOT, 'mobile/mobile.json'), 'utf8'));
  assert.equal(typeof m.android.fingerprints, 'object');
  for (const list of Object.values(m.android.fingerprints)) for (const f of list) assert.doesNotThrow(() => normalizeFingerprint(f));
  assert.ok(m.ios.apps === 'all' || (Array.isArray(m.ios.apps) && m.ios.apps.length > 0));
  assert.match(m.ios.start, /^\//);
  assert.ok(Array.isArray(m.ios.leaveOut));
});
