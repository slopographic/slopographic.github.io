#!/usr/bin/env node
// The iPhone and iPad app's own copy of the site (mobile/ios/www, never committed): what Capacitor puts in the app, so it
// works offline and runs no downloaded code (App Review 2.5.2). It holds:
//   - the site's tracked files, minus what only the website or this repository uses (tests, tools, the SEO language pages,
//     screenshots, workflows) and the local-model chat engine (vendor/web-llm, which fetches compiled model code);
//     mobile/mobile.json ios.apps can narrow it to a few apps (a focused app) and ios.leaveOut leave out more;
//   - every engine the apps fetch from the cdn repository (engines/: the video, HEIC, RAW and 3D engines) under cdn/, at the
//     release tag the site pins (shared/cdn/assets.js), answered from there by native/native.js;
//   - native/native.js, native/files.js (the app's folder in Files, files opened from other apps) and native/config.js
//     (with the page each file type opens in: desktop/lib/open-map.js), loaded first by every page, then
//     shared/native-app.js (store-app mode: no
//     install button or help, other platforms, desktop downloads or payment links); no analytics, ads or donation links
//     (the brand's third-party switch is off in this copy).
//   node mobile/ios/bundle.mjs [--out=<dir>] [--no-engines]
// Node only. Tests: tests/node/mobile-ios.test.mjs.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

/** Paths the app never needs: this repository's own files, the website's SEO extras, and code that downloads code. */
export const LEAVE_OUT = [/^\./, /^(tests|tools|mobile|desktop|downloads|node_modules|sv)\//, /^[^/]+\.(png|md|txt|xml)$/, /^(CNAME|package(-lock)?\.json)$/,
  /(^|\/)HANDOFF\.md$/, /^vendor\/web-llm\//, /^vendor\/models\/tools\//, /\.py$/];

/** The top folders of the apps in the registry (shared/apps.js): { id: folder } (a homepage view like #detector has none). */
export function appFolders(registryText) {
  const win = {};
  vm.runInNewContext(registryText, { window: win });
  const out = {};
  for (const a of win.SLOP_APPS || []) { const f = String(a.path || '').split('/')[0]; if (/^[a-z0-9-]+$/.test(f)) out[a.id] = f; }
  return out;
}

/** The files of the bundle from the tracked files. ios: mobile.json's ios part; folders: appFolders(). */
export function bundleFiles(files, ios = {}, folders = {}) {
  const extra = (ios.leaveOut || []).map((p) => String(p).replace(/^\/+/, ''));
  let drop = () => false;
  if (Array.isArray(ios.apps)) {
    const keep = new Set(ios.apps), gone = new Set(), kept = new Set();
    for (const [id, f] of Object.entries(folders)) (keep.has(id) ? kept : gone).add(f);
    for (const [id] of Object.entries(folders)) if (!keep.has(id)) gone.add(`apps/${id}`);
    for (const f of kept) gone.delete(f);   // a folder another kept app shares stays
    drop = (f) => [...gone].some((g) => f.startsWith(g + '/'));
  }
  return files.filter((f) => !LEAVE_OUT.some((re) => re.test(f)) && !extra.some((p) => f.startsWith(p)) && !drop(f));
}

/** A page with the app's glue loaded first (before any other script of the page), then the store-app mode
 * (shared/native-app.js: hides install help, other platforms and payment links). */
export function injectNative(html) {
  const tag = '<script src="/native/config.js"></script><script src="/native/native.js"></script><script src="/native/files.js"></script><script src="/shared/native-app.js"></script>';
  if (html.includes(tag)) return html;
  const m = html.match(/<head\b[^>]*>/i);
  return m ? html.replace(m[0], m[0] + tag) : tag + html;
}

/** brand.json in the app: no ads and no donation links (an App Store app may not point to outside payments). */
export function appBrand(text) {
  const b = JSON.parse(text);
  b.support = Object.assign({}, b.support, { ads: false, donate: false });
  return JSON.stringify(b, null, 2) + '\n';
}
/** The brand's third-party switch, off: no analytics, no ad script, no consent strip (shared/consent/config.js). */
export const thirdPartyOff = (text) => text.replace(/\/\*profile:analytics\*\/true/g, '/*profile:analytics*/false');

/** native/config.js: every cdn URL of the bundled engine files -> the app's copy (C: SlopCdn; paths: engine paths), and
 * open: { ext: route }, the page each file type opens in (desktop/lib/open-map.js openMap). */
export function nativeConfig(C, paths, start = '/', open = {}) {
  const local = {};
  for (const p of paths) for (const u of C.urls(p)) local[u] = '/cdn/' + p;
  return `window.NATIVE_CONFIG = ${JSON.stringify({ tag: C.TAG, start, local, open }, null, 1)};\n`;
}

/** Every file under dir, as paths relative to it. */
function walk(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const f = path.join(dir, e);
    if (statSync(f).isDirectory()) { if (e !== '.git') out.push(...walk(f, base)); } else out.push(path.relative(base, f).split(path.sep).join('/'));
  }
  return out;
}

/** The cdn repository's engines/ at the site's tag, into dest/cdn/engines (a sparse, shallow clone). Returns the paths. */
function fetchEngines(C, dest) {
  const tmp = path.join(HERE, 'build', 'cdn');
  rmSync(tmp, { recursive: true, force: true });
  const git = (...a) => execFileSync('git', a, { stdio: ['ignore', 'inherit', 'inherit'] });
  git('clone', '-q', '--depth=1', '--filter=blob:none', '--sparse', '--branch', C.TAG, `https://github.com/${C.REPO}.git`, tmp);
  git('-C', tmp, 'sparse-checkout', 'set', 'engines');
  cpSync(path.join(tmp, 'engines'), path.join(dest, 'cdn', 'engines'), { recursive: true });
  rmSync(tmp, { recursive: true, force: true });
  return walk(path.join(dest, 'cdn')).filter((p) => p.startsWith('engines/'));
}

function main(args) {
  const out = path.resolve((args.find((a) => a.startsWith('--out=')) || '').slice(6) || path.join(HERE, 'www'));
  const ios = JSON.parse(readFileSync(path.join(ROOT, 'mobile/mobile.json'), 'utf8')).ios || {};
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean);
  const files = bundleFiles(tracked, ios, appFolders(readFileSync(path.join(ROOT, 'shared/apps.js'), 'utf8')));
  rmSync(out, { recursive: true, force: true });
  let bytes = 0;
  for (const f of files) {
    const src = path.join(ROOT, f), dst = path.join(out, f);
    if (!existsSync(src)) continue;
    mkdirSync(path.dirname(dst), { recursive: true });
    if (f.endsWith('.html')) writeFileSync(dst, injectNative(readFileSync(src, 'utf8')));
    else if (f === 'brand/brand.json') writeFileSync(dst, appBrand(readFileSync(src, 'utf8')));
    else if (f === 'shared/consent/config.js') writeFileSync(dst, thirdPartyOff(readFileSync(src, 'utf8')));
    else cpSync(src, dst);
    bytes += statSync(dst).size;
  }
  const C = createRequire(import.meta.url)(path.join(ROOT, 'shared/cdn/assets.js'));
  const engines = args.includes('--no-engines') ? [] : fetchEngines(C, out);
  const engineBytes = engines.reduce((n, p) => n + statSync(path.join(out, 'cdn', p)).size, 0);
  mkdirSync(path.join(out, 'native'), { recursive: true });
  for (const f of ['native.js', 'files.js']) cpSync(path.join(HERE, f), path.join(out, 'native', f));
  const OM = createRequire(import.meta.url)(path.join(ROOT, 'desktop/lib/open-map.js')), reg = OM.loadRegistry(ROOT);
  writeFileSync(path.join(out, 'native', 'config.js'), nativeConfig(C, engines, ios.start || '/', OM.openMap(reg.manifest, reg.apps)));
  const mb = (n) => (n / 1e6).toFixed(1) + ' MB';
  console.log(`${files.length} site files (${mb(bytes)}) and ${engines.length} engine files (${mb(engineBytes)}) -> ${path.relative(process.cwd(), out) || '.'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
