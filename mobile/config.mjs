// The store apps' facts, read from the site itself so a white-label build gets its own: the app id from CNAME (the domain
// reversed, plus ".app": example.com -> com.example.app), the names, colours and icons from manifest.webmanifest, and the
// rest from mobile/mobile.json (signing fingerprints per app id, the iOS bundle's app list). Pure functions plus one reader.
//   appId(cname)                  the Android package id and iOS bundle id
//   manifestProblems(manifest)    what a Trusted Web Activity and a store listing need from the web manifest ([] when complete)
//   assetLinks(id, fingerprints)  the Digital Asset Links statement list (/.well-known/assetlinks.json)
//   readConfig(root)              { appId, host, origin, name, shortName, startUrl, colours, icons, manifest, mobile }
// Node only. Tests: tests/node/mobile-config.test.mjs.
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** A Java package segment from a domain label: lower case, [a-z0-9_], never starting with a digit or a Java keyword. */
const KEYWORDS = new Set(['abstract', 'boolean', 'byte', 'case', 'catch', 'char', 'class', 'const', 'default', 'do', 'double', 'else', 'enum', 'final', 'float', 'for', 'goto', 'if', 'import', 'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'public', 'return', 'short', 'static', 'super', 'switch', 'this', 'throw', 'try', 'void', 'while']);
function segment(label) {
  let s = label.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (/^[0-9]/.test(s) || KEYWORDS.has(s)) s = '_' + s;
  return s;
}

/** The app id for a domain: its labels reversed (www left out), plus "app". example.com -> com.example.app. */
export function appId(cname) {
  const host = String(cname || '').trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) throw new Error(`CNAME: not a domain (${cname || 'empty'})`);
  const labels = host.split('.').filter((l) => l && l !== 'www').reverse();
  if (labels[labels.length - 1] !== 'app') labels.push('app');   // app.example.com -> com.example.app, not ...app.app
  return labels.map(segment).join('.');
}

const HEX = /^#[0-9a-f]{6}$/i;
const sizeOf = (icon) => String(icon.sizes || '').split(/\s+/).map((s) => parseInt(s, 10)).filter(Number.isFinite);
const purposes = (icon) => String(icon.purpose || 'any').split(/\s+/);
/** The best icon for a purpose: a PNG of at least min px (the largest), or null. */
export function pickIcon(manifest, purpose, min = 512) {
  const fit = (manifest.icons || []).filter((i) => purposes(i).includes(purpose) && /png/.test(i.type || i.src) && Math.max(0, ...sizeOf(i)) >= min);
  fit.sort((a, b) => Math.max(...sizeOf(b)) - Math.max(...sizeOf(a)));
  return fit[0] || null;
}

/** What a Trusted Web Activity (Bubblewrap) and the store listings need from the manifest. Empty when complete. */
export function manifestProblems(m) {
  const errs = [];
  const str = (k) => typeof m[k] === 'string' && m[k].trim() !== '';
  if (!str('name')) errs.push('name: the app name');
  if (!str('short_name')) errs.push('short_name: the launcher name');
  else if (m.short_name.length > 12) errs.push('short_name: at most 12 characters (the launcher cuts it)');
  if (!str('start_url') || !m.start_url.startsWith('/')) errs.push('start_url: a path on the site, like "/"');
  if (!['standalone', 'fullscreen', 'minimal-ui'].includes(m.display)) errs.push('display: standalone (or fullscreen)');
  for (const k of ['theme_color', 'background_color']) if (!HEX.test(m[k] || '')) errs.push(`${k}: a #rrggbb colour`);
  if (!pickIcon(m, 'any', 512)) errs.push('icons: a PNG of 512x512 with purpose "any"');
  if (!pickIcon(m, 'any', 192) || !(m.icons || []).some((i) => sizeOf(i).includes(192))) errs.push('icons: a PNG of 192x192');
  if (!pickIcon(m, 'maskable', 512)) errs.push('icons: a PNG of 512x512 with purpose "maskable" (the Android adaptive icon)');
  for (const i of m.icons || []) if (!String(i.src || '').startsWith('/')) errs.push(`icons: ${i.src} should be a site path (starting with /)`);
  return errs;
}

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
/** A SHA-256 certificate fingerprint as keytool and Play Console print it (AB:CD:...), from any case or without colons. */
export function normalizeFingerprint(f) {
  const hex = String(f || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (hex.length !== 64) throw new Error(`not a SHA-256 fingerprint: ${f}`);
  return hex.match(/../g).join(':');
}
export const isFingerprint = (f) => FINGERPRINT.test(f);

/** /.well-known/assetlinks.json: one statement that lets the app open the site full screen (no URL bar), or [] while there
 * is no signing key yet (an empty list is valid and links nothing). */
export function assetLinks(id, fingerprints) {
  const list = [...new Set((fingerprints || []).map(normalizeFingerprint))];
  if (!list.length) return [];
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: id, sha256_cert_fingerprints: list },
  }];
}

/** Everything the store builds read, from a site checkout (or a build of it). */
export function readConfig(root) {
  const read = (f) => readFileSync(path.join(root, f), 'utf8');
  const cname = read('CNAME').trim();
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const mobile = JSON.parse(read('mobile/mobile.json'));
  const id = appId(cname);
  const origin = `https://${cname}`;
  const icon = pickIcon(manifest, 'any', 512), mask = pickIcon(manifest, 'maskable', 512);
  return {
    appId: id, host: cname, origin, manifest, mobile,
    name: manifest.name, shortName: manifest.short_name || manifest.name, startUrl: manifest.start_url || '/',
    themeColor: manifest.theme_color, backgroundColor: manifest.background_color,
    iconUrl: icon && origin + icon.src, maskableIconUrl: mask && origin + mask.src,
    fingerprints: ((mobile.android || {}).fingerprints || {})[id] || [],
  };
}
