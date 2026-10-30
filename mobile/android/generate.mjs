#!/usr/bin/env node
// Generates the Android app: a Trusted Web Activity (the site in the phone's own Chrome, every web feature, no URL bar
// once /.well-known/assetlinks.json names the signing key), made with Bubblewrap (@bubblewrap/core) from the site's web
// manifest. The Gradle project is generated, never committed: mobile/android/build/project (mobile/.gitignore).
// It reads the manifest and icons from this checkout (not the live site), so the build matches the commit.
//   cd mobile/android && npm install && node generate.mjs [--version-code=N] [--version-name=1.0.N] [--out=<dir>]
// Then: cd build/project && ./gradlew bundleRelease assembleRelease (the workflow, .github/workflows/mobile.yml, signs).
// Node only. Tests: tests/node/mobile-android.test.mjs (the TWA settings; the generation itself runs in the workflow).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig, manifestProblems } from '../config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TYPES = { png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp', json: 'application/json', webmanifest: 'application/manifest+json' };

/** The settings Bubblewrap's defaults (from the web manifest) are overridden with. opts: { versionCode, versionName }. */
export function overrides(cfg, opts = {}) {
  const code = Number(opts.versionCode) || 1;
  if (!Number.isInteger(code) || code < 1 || code > 2100000000) throw new Error(`version code: a whole number from 1 (${opts.versionCode})`);
  return {
    packageId: cfg.appId,
    host: cfg.host,
    name: cfg.name,
    launcherName: cfg.shortName,
    startUrl: cfg.startUrl,
    themeColor: cfg.themeColor,
    navigationColor: cfg.themeColor,
    navigationColorDark: cfg.themeColor,
    backgroundColor: cfg.backgroundColor,
    iconUrl: cfg.iconUrl,
    maskableIconUrl: cfg.maskableIconUrl,
    webManifestUrl: `${cfg.origin}/manifest.webmanifest`,
    appVersionCode: code,
    appVersion: opts.versionName || `1.0.${code}`,
    signingKey: { path: './upload.jks', alias: 'upload' },   // the workflow signs with jarsigner/apksigner itself
    fallbackType: 'customtabs',                               // a phone without a TWA-capable browser gets a Custom Tab
    enableNotifications: false,
    minSdkVersion: 24,                                        // Android 7: what androidbrowserhelper needs
    enableSiteSettingsShortcut: true,
    generatorApp: 'bubblewrap-core',
    fingerprints: cfg.fingerprints.map((value) => ({ name: 'signing key', value })),
  };
}

/** A fetch that answers the site's own URLs from the checkout (Bubblewrap downloads the manifest and icons). */
export function localFetch(root, origin) {
  return async (input) => {
    const u = new URL(String(input));
    if (u.origin !== origin) throw new Error(`refusing to fetch ${u.href}: only the site's own files are read, from the checkout`);
    const file = path.join(root, decodeURIComponent(u.pathname));
    if (!file.startsWith(root + path.sep) || !existsSync(file)) return new Response('not found', { status: 404 });
    const ext = path.extname(file).slice(1).toLowerCase();
    return new Response(readFileSync(file), { status: 200, headers: { 'content-type': TYPES[ext] || 'application/octet-stream' } });
  };
}

async function main(args) {
  const opt = (k) => (args.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];
  const cfg = readConfig(ROOT);
  const bad = manifestProblems(cfg.manifest);
  if (bad.length) throw new Error(`manifest.webmanifest is not complete for a store app:\n  ${bad.join('\n  ')}`);
  const out = path.resolve(opt('out') || path.join(HERE, 'build', 'project'));
  const bw = createRequire(path.join(HERE, 'package.json'))('@bubblewrap/core');
  bw.fetchUtils.fetch = localFetch(ROOT, cfg.origin);
  const base = bw.TwaManifest.fromWebManifestJson(new URL(`${cfg.origin}/manifest.webmanifest`), cfg.manifest);
  const twa = new bw.TwaManifest(Object.assign(base.toJson(), overrides(cfg, { versionCode: opt('version-code'), versionName: opt('version-name') })));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  await new bw.TwaGenerator().createTwaProject(out, twa, new bw.ConsoleLog('generate'));
  writeFileSync(path.join(out, 'twa-manifest.json'), JSON.stringify(twa.toJson(), null, 2) + '\n');
  console.log(`${cfg.appId} ${twa.appVersionName || twa.appVersion} (${twa.appVersionCode}) -> ${path.relative(process.cwd(), out)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message || e); process.exit(1); });
}
