#!/usr/bin/env node
// Writes /.well-known/assetlinks.json: the Digital Asset Links file that lets the Android app (a Trusted Web Activity)
// show the site full screen, without Chrome's URL bar. It names the app id (mobile/config.mjs, from CNAME) and the
// SHA-256 fingerprints of the keys that sign it, from mobile/mobile.json android.fingerprints[<app id>] plus any given here.
// With no fingerprint it writes [] (valid, links nothing: the app then shows a URL bar until the file names its key).
//   node mobile/android/assetlinks.mjs                         write the file from mobile/mobile.json
//   node mobile/android/assetlinks.mjs --add=AB:CD:...         also name this fingerprint (CI: the upload key's)
//   node mobile/android/assetlinks.mjs --check                 exit 1 when the committed file is out of date
// GitHub Pages serves the folder because the site has .nojekyll (Jekyll would leave out a dot folder).
// Node only. Tests: tests/node/mobile-config.test.mjs.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig, assetLinks } from '../config.mjs';

export const FILE = '.well-known/assetlinks.json';

/** The file's text for a site checkout, with extra fingerprints. */
export function assetLinksText(root, extra = []) {
  const cfg = readConfig(root);
  return JSON.stringify(assetLinks(cfg.appId, [...cfg.fingerprints, ...extra]), null, 2) + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const args = process.argv.slice(2);
  const extra = args.filter((a) => a.startsWith('--add=')).map((a) => a.slice(6)).filter(Boolean);
  const text = assetLinksText(root, extra), file = path.join(root, FILE);
  if (args.includes('--check')) {
    const now = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (now !== text) { console.error(`${FILE} is out of date: run node mobile/android/assetlinks.mjs`); process.exit(1); }
  } else {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
    console.log(`wrote ${FILE} (${JSON.parse(text).length ? 'with' : 'without'} a signing key)`);
  }
}
