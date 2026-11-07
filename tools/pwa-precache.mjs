#!/usr/bin/env node
// Rebuilds the PRECACHE list in sw-precache.js from the boot files of every app page.
// service-worker.js loads that file with importScripts('/sw-precache.js'); this tool checks the import is there.
//   node tools/pwa-precache.mjs            rewrite the PRECACHE list in sw-precache.js
//   node tools/pwa-precache.mjs --dry-run  print the count only, write nothing
// Walks each page's static <script src>, stylesheet <link href>, ES module imports (not dynamic
// import()) and CSS url()/@import, so the list follows what a page needs to boot offline.
// shell/shell.js loads its parts at run time (brand, registry, SlopUI, shell/*.js, CSS), so its
// quoted .js/.css paths are followed too.
//   node tools/pwa-precache.mjs --check    write nothing; exit 1 when the list or VERSION is out of date
// Entries that do not exist on disk are reported and left out. VERSION in service-worker.js is set here too: a hash of
// every precached file and of the worker's own code. It changes exactly when one of them does, so a release that changes
// a cached file gets a new cache (the old one is deleted on activate) and the browser installs the new worker. The
// pre-commit hook (.githooks/pre-commit) runs this and stages the result, so nobody bumps VERSION by hand.
import { readFile, writeFile, stat, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW = path.join(ROOT, 'service-worker.js');
const SW_IMPORT = "importScripts('/sw-precache.js');";
const exists = (p) => stat(path.join(ROOT, p)).then((s) => s, () => null);
const resolveRef = (from, ref) => path.posix.normalize(path.posix.join(path.posix.dirname(from), ref));
const EXTRA = ['offline.html', 'manifest.webmanifest', 'favicon.svg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'shared/pwa.js',
  'shell/shell.js', 'brand/brand.js', 'brand/brand.json', 'brand/logo-128.webp',
  'style/tone.css',   // the plain tone's look: shared/theme/theme.js loads it from script, in a plain-tone build only
  'shared/parent/i18n/index.js', 'shared/parent/i18n/en/parent.js',   // a single-app site's words (shared/parent/parent.js loads them)
  'shared/promo/i18n/index.js', 'shared/promo/i18n/en/promo.js', 'shared/promo/i18n/sv/promo.js',   // the promo line's words (shared/promo/promo.js loads them when the profile has one)
  // the homepage's Authenticator view: home/view.js loads these the first time #detector opens
  'detector/rules.js', 'detector/samples.js', 'detector/detector.js', 'detector/detector.css',
  'vendor/lamejs/lame.min.js', 'vendor/lamejs/LICENSE',
  // the video engine's JavaScript (the ffmpeg core itself comes from the cdn on first use, shared/cdn/assets.js)
  'vendor/ffmpeg/index.js', 'vendor/ffmpeg/classes.js', 'vendor/ffmpeg/const.js', 'vendor/ffmpeg/errors.js', 'vendor/ffmpeg/types.js', 'vendor/ffmpeg/utils.js', 'vendor/ffmpeg/worker.js', 'vendor/ffmpeg/LICENSE']; // the MP3 encoder and the video engine, loaded on demand
const CHECK = process.argv.includes('--check');
const DRY = process.argv.includes('--dry-run') || CHECK;

// shell/shell.js loads its parts with addScript()/addCss(), so static refs miss them. Its paths are
// relative to the site root. Follow every quoted .js/.css path, and expand 'shell/' + m + '.js' over its loop list.
function shellLoads(txt) {
  const out = [];
  for (const m of txt.matchAll(/'([^'\s]+\.(?:m?js|css))'/g)) out.push(m[1]);
  for (const [, v, list] of txt.matchAll(/for \(const (\w+) of \[([^\]]*)\]\)/g)) {
    const names = [...list.matchAll(/'([^']+)'/g)].map((x) => x[1]);
    for (const t of txt.matchAll(new RegExp(`'([^']*)'\\s*\\+\\s*${v}\\s*\\+\\s*'([^']*)'`, 'g'))) for (const n of names) out.push(t[1] + n + t[2]);
  }
  return out;
}

async function pageRoots() {
  const apps = await readFile(path.join(ROOT, 'shared/apps.js'), 'utf8');
  const roots = ['index.html', 'drive/index.html'];
  for (const m of apps.matchAll(/A\('([^']+)', 'app', '[^']*', '([^']+)'/g)) roots.push(m[2] + 'index.html');
  return [...new Set(roots)];
}

function refsOf(p, txt) {
  if (p === 'shell/shell.js') return shellLoads(txt).concat('shared/i18n/i18n.js');
  // i18n.js fetches its tables at run time: English is cached up front, the chosen language when it is first used;
  // early.js (the first frame in another language) up front too
  if (p === 'shared/i18n/i18n.js') return ['shared/i18n/strings.js', 'shared/i18n/ui/en.js', 'shared/i18n/early.js'];
  if (/\/i18n\/index\.js$/.test(p)) {
    const parts = (/parts: \[([^\]]*)\]/.exec(txt) || [, ''])[1].match(/[\w-]+/g) || [];
    return parts.map((x) => path.posix.join(path.posix.dirname(p), 'en', x + '.js'));
  }
  const out = [];
  if (p.endsWith('.html')) {
    // a page with a base (a single-app site's root, tools/seo/mainapp.mjs): its addresses resolve from the base's folder
    const base = /<base\s+href="([^"]+)"/i.exec(txt), from = base ? path.posix.join(path.posix.dirname(p), base[1], 'index.html') : p;
    for (const m of txt.matchAll(/<(script|link)\b[^>]*?>/gi)) {
      const tag = m[0];
      const attr = tag.match(/\b(?:src|href)=["']([^"'#?]+)/i);
      if (!attr || /^(https?:|\/\/|data:)/.test(attr[1])) continue;
      if (/^<link/i.test(tag) && !/rel=["']?(stylesheet|modulepreload)/i.test(tag)) continue;
      out.push(attr[1].startsWith('/') ? attr[1].slice(1) : resolveRef(from, attr[1]));
    }
  } else if (/\.m?js$/.test(p)) {
    for (const m of txt.matchAll(/(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)) {
      const s = m[1] || m[2];
      if (s.startsWith('.')) out.push(resolveRef(p, s));
    }
  } else if (p.endsWith('.css')) {
    for (const m of txt.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']|url\(\s*["']?([^"')]+?)["']?\s*\)/g)) {
      const s = (m[1] || m[2] || '').split(/[#?]/)[0];
      if (!s || /^(data:|https?:|\/\/)/.test(s) || s.includes('%')) continue;
      out.push(resolveRef(p, s));
    }
  }
  return out;
}

const seen = new Set();
const missing = new Set();
const files = new Set();
async function visit(p) {
  if (seen.has(p)) return;
  seen.add(p);
  const st = await exists(p);
  if (!st) { missing.add(p); return; }
  if (st.isDirectory()) return;            // "./" and folder links are not files
  files.add(p);
  if (!/\.(html|m?js|css)$/.test(p)) return;
  for (const r of refsOf(p, await readFile(path.join(ROOT, p), 'utf8'))) await visit(r);
}

// The offline font library and font packs: the picker and the font catalogue load these at run time (not by a static src),
// so they are listed here. Every WOFF2 named in shared/fonts/library/index.json is included, and each embeddable copy ("pdf").
const LIBRARY = ['shared/fonts/picker.js', 'shared/fonts/catalog.js', 'shared/fonts/missing.js', 'shared/fonts/panel.js', 'shared/fonts/library/index.json',
  'shared/library/manifest.js', 'shared/library/store.js', 'shared/library/get-more.js', 'shared/library/packs.json',
  'shared/library/install.js', 'shared/cdn/assets.js',   // the installer, and the cdn hosts it loads at run time
  'vendor/fontkit/fontkit.min.js', 'vendor/fontkit/LICENSE'];
const libraryFiles = JSON.parse(await readFile(path.join(ROOT, 'shared/fonts/library/index.json'), 'utf8')).fonts
  .flatMap((f) => [`shared/fonts/library/${f.file}`, `shared/fonts/library/${f.licenceFile}`, ...(f.pdf ? [`shared/fonts/library/${f.pdf}`] : [])]);
// The sample files of "Try it with a sample" (SlopSamples.asset fetches them at run time), so a sample works offline too.
const samples = (await readdir(path.join(ROOT, 'assets/samples')).catch(() => [])).map((f) => `assets/samples/${f}`);
// The Slop AI panel's kit (shared/ai/panel.js loads it at run time, so no page names it): every script and stylesheet
// under shared/ai/ and the shared parts it loads, so the panel opens at once on a second visit and offline.
async function aiKit(dir = 'shared/ai') {
  const out = [];
  for (const e of await readdir(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...(await aiKit(p)));
    else if (/\.(js|css)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}
const AI_KIT_SHARED = ['shared/commands/args.js', 'shared/ui/sheet.js', 'shared/ui/resize-panel.js', 'shared/ui/menubutton.js', 'shared/firstrun/notice.js'];
const roots = [...(await pageRoots()), ...EXTRA, ...LIBRARY, ...new Set(libraryFiles), ...samples, ...(await aiKit()), ...AI_KIT_SHARED];
for (const r of roots) await visit(r);
const list = [...files].sort();
for (const m of missing) console.warn('not on disk, left out:', m);

// Pack about four entries per line, and cut the list into parts of at most PART_LINES lines, so every file stays under 300
// lines. Part 1 is sw-precache.js (it declares PRECACHE); parts 2.. are sw-precache-N.js and push onto it.
const PART_LINES = 200;
const lines = [];
let line = '  ';
for (const f of list) {
  const item = `'/${f}', `;
  if (line.length + item.length > 160) { lines.push(line.trimEnd()); line = '  '; }
  line += item;
}
if (line.trim()) lines.push(line.trimEnd());
const parts = [];
for (let i = 0; i < lines.length; i += PART_LINES) parts.push(lines.slice(i, i + PART_LINES));
const partFile = (n) => (n === 1 ? 'sw-precache.js' : `sw-precache-${n}.js`);
const partSrc = (n, body) => (n === 1
  ? `// Precache list for service-worker.js. Loaded there with importScripts(); the classic worker shares this scope.\n// Generated by: node tools/pwa-precache.mjs (do not edit by hand). Parts: ${parts.length}.\n// BEGIN PRECACHE\nconst PRECACHE = [];\nPRECACHE.push(\n${body}\n);\n// END PRECACHE\n`
  : `// Precache list, part ${n} of ${parts.length}. Generated by: node tools/pwa-precache.mjs (do not edit by hand).\n// BEGIN PRECACHE\nPRECACHE.push(\n${body}\n);\n// END PRECACHE\n`);

const swSrc = await readFile(SW, 'utf8');
if (!/importScripts\([^)]*sw-precache/.test(swSrc)) throw new Error('service-worker.js must load the list with importScripts(\'/sw-precache.js\')');
const importLine = `importScripts(${parts.map((_, i) => `'/${partFile(i + 1)}'`).join(', ')});`;
const VERSION_LINE = /^const VERSION = '[^']*';$/m;
if (!VERSION_LINE.test(swSrc)) throw new Error('service-worker.js must declare const VERSION = \'...\';');
// The version: the worker's code (with the version line blanked) and every precached file, path and bytes.
const hash = createHash('sha256').update(swSrc.replace(/importScripts\([^)]*sw-precache[^)]*\);/, importLine).replace(VERSION_LINE, ''));
for (const f of list) hash.update('\0' + f + '\0').update(await readFile(path.join(ROOT, f)));
const version = 'v-' + hash.digest('hex').slice(0, 12);
const nextSw = swSrc.replace(/importScripts\([^)]*sw-precache[^)]*\);/, importLine).replace(VERSION_LINE, `const VERSION = '${version}';`);
if (!DRY) await writeFile(SW, nextSw);
for (let i = 0; i < parts.length; i++) {
  const f = path.join(ROOT, partFile(i + 1));
  if (!DRY) await writeFile(f, partSrc(i + 1, parts[i].join('\n')));
}
const written = parts.map((_, i) => partFile(i + 1));
if (!DRY) for (const f of ['sw-precache.js', 'sw-precache-2.js', 'sw-precache-3.js', 'sw-precache-4.js'].filter((x) => !written.includes(x))) await rm(path.join(ROOT, f), { force: true });
console.log(`PRECACHE: ${list.length} files, ${roots.length} roots, ${missing.size} missing, VERSION ${version}${DRY ? ' (dry run, nothing written)' : ''}`);
if (CHECK) {
  const stale = [nextSw !== swSrc ? 'service-worker.js' : null];
  for (let i = 0; i < parts.length; i++) stale.push((await readFile(path.join(ROOT, partFile(i + 1)), 'utf8').catch(() => '')) === partSrc(i + 1, parts[i].join('\n')) ? null : partFile(i + 1));
  const out = stale.filter(Boolean);
  if (out.length) { console.error(`out of date: ${out.join(', ')}. Run: node tools/pwa-precache.mjs`); process.exit(1); }
}
