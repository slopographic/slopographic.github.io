// The Android app's settings (mobile/android/generate.mjs): Bubblewrap's defaults overridden with the site's app id,
// names, colours and icons, a version code that only goes up, and a fetch that reads the site's own files from the
// checkout (so the app matches the commit, and nothing else is downloaded). The Gradle build runs in the workflow
// (.github/workflows/mobile.yml).
// Covers: mobile/android/generate.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { overrides, localFetch } from '../../mobile/android/generate.mjs';
import { readConfig } from '../../mobile/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cfg = readConfig(ROOT);

test("the TWA takes the site's id, names, colours and icons", () => {
  const o = overrides(cfg, { versionCode: 7 });
  assert.equal(o.packageId, cfg.appId);
  assert.equal(o.host, cfg.host);
  assert.equal(o.name, cfg.name);
  assert.equal(o.launcherName, cfg.shortName);
  assert.equal(o.startUrl, cfg.startUrl);
  assert.equal(o.themeColor, cfg.themeColor);
  assert.equal(o.backgroundColor, cfg.backgroundColor);
  assert.equal(o.iconUrl, cfg.iconUrl);
  assert.equal(o.maskableIconUrl, cfg.maskableIconUrl);
  assert.equal(o.webManifestUrl, `${cfg.origin}/manifest.webmanifest`);
  assert.equal(o.appVersionCode, 7);
  assert.equal(o.appVersion, '1.0.7');
  assert.equal(o.fallbackType, 'customtabs');
  assert.equal(o.enableNotifications, false);
  assert.equal(o.minSdkVersion, 24, 'androidbrowserhelper needs Android 7');
  assert.ok(!/\.jks$/.test(o.signingKey.path) || o.signingKey.path.startsWith('./'), 'the keystore is never a committed path');
});

test('the version code is a whole number from 1; the name can be given', () => {
  assert.equal(overrides(cfg, {}).appVersionCode, 1);
  assert.equal(overrides(cfg, { versionCode: '12', versionName: '2.0' }).appVersion, '2.0');
  assert.throws(() => overrides(cfg, { versionCode: '1.5' }), /whole number/);
  assert.throws(() => overrides(cfg, { versionCode: 3e9 }), /whole number/);
});

test("the generator's fetch answers the site's own URLs from the checkout and refuses others", async () => {
  const f = localFetch(ROOT, cfg.origin);
  const m = await f(`${cfg.origin}/manifest.webmanifest`);
  assert.equal(m.status, 200);
  assert.equal(JSON.parse(await m.text()).name, cfg.name);
  const icon = await f(cfg.maskableIconUrl);
  assert.equal(icon.headers.get('content-type'), 'image/png');
  assert.equal((await f(`${cfg.origin}/no-such-file.png`)).status, 404);
  assert.equal((await f(`${cfg.origin}/..%2fpackage.json`)).status, 404);
  await assert.rejects(f('https://example.org/icon.png'), /only the site's own files/);
});
