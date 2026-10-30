#!/usr/bin/env node
// Builds the whole site for one brand profile into a folder: the white-label copy that a mirror repository publishes.
//   node tools/whitelabel/build.mjs <profile id> <out dir> [--profiles=<dir>] [--no-images] [--no-seo] [--release=<text>] [--cdn-ref=<tag>]
// --profiles: the folder that holds <id>.json and <id>.map.json (default brand/profiles). Real brands' profiles live
// outside this repository; brand/profiles/sample.json is the made-up one CI builds.
// Steps: copy every file of the working tree (git ls-files) except the source brand's own files (EXCLUDE), rename paths
// and text through the profile's map (rename.mjs), set the profile markers, write the generated files (emit.mjs), run the
// SEO writer and the precache list in the copy, render the icons (images.mjs), then scan for leftovers (scan.mjs) and
// exit 1 when the scan finds any. A profile without a map file (slopographic) is copied as it is.
// The SEO pages of the languages besides the root one are not in git here (tools/seo/langdirs.mjs): the build writes
// them for the profile's seo.langs (write.mjs, then write.mjs --langs from the written root pages; none for 'none') and
// drops the .gitignore block from its copy, so a mirror commits them (it is the published site).
// A profile with its own mascot (mascot.mjs) gets the overlay in brand/mascot/, LICENSE-ART, and icons drawn by it.
// --cdn-ref: the release tag of the profile's own cdn repository (cdn.mjs makes its content), when it differs from this
// site's tag. The out dir's .git folder is kept, so a mirror checkout can be rebuilt in place.
// A profile's type family (font.mjs) replaces this site's: shared/fonts/brand/, its CSS block and its token names.
// It also reports each word the rename doubled ("your Files files", repeats.mjs; a profile's repeatAllow lists pairs it
// means), and export.mjs fails on them like on a leftover name.
// Tests: tests/node/whitelabel-build.test.mjs, tests/node/whitelabel-mascot-slot.test.mjs, tests/node/whitelabel-font.test.mjs.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProfile, loadMap, forbiddenTerms, profilesDir } from './profile.mjs';
import { urls, phrases, tokens, collisions } from './rename.mjs';
import { pinBuild } from './cdnpin.mjs';
import { mediaIds, stripMedia } from './media.mjs';
import { context, profileText, forward, forwardPath } from './transform.mjs';
import { markerValues, applyMarkers, brandJson, markSvg, logoSvg, manifest, homeThemeColor, mit, notice, trademarks, security, readme } from './emit.mjs';
import { mirrorWorkflow } from './workflow.mjs';
import { themeProblems, sourceThemes } from './palette.mjs';
import { isText, scan, report } from './scan.mjs';
import { newRepeats, repeatReport } from './repeats.mjs';
import { DEST, overlayDir, overlayProblems, overlayIcons, filesIn, licenseArt, hasOverlay, artAllow } from './mascot.mjs';
import { emitFont, fontExcluded, fontFolderProblems, fontDir } from './font.mjs';
import { withoutBlock } from '../seo/langdirs.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Third-party files where a match is not a name: reported as allowed, never fixed. */
export const SCAN_ALLOW = [
  { file: 'vendor/models/isnet-general-w8.onnx', term: 'slop', why: 'four bytes of the model weights happen to spell it ("PRSLOPHJM"); not text' },
];

/** Model files carry the name of the tool that wrote them in a string field: the same number of bytes, so the file
 * stays valid. Other binaries are copied as they are (the scan reports any name left in them). */
export function patchBinary(file, buf) {
  if (!/\.onnx$/.test(file) || !buf.includes('slopographic')) return buf;
  return Buffer.from(buf.toString('latin1').split('slopographic').join('modelbuilder'), 'latin1');
}

/** The tests about this repository only (tests/repo-only.json: { files: [{ file, why }] }, a trailing * is a prefix). */
export const REPO_ONLY = JSON.parse(readFileSync(path.join(ROOT, 'tests/repo-only.json'), 'utf8')).files;
export const repoOnly = (file) => REPO_ONLY.some((r) => (r.file.endsWith('*') ? file.startsWith(r.file.slice(0, -1)) : file === r.file));

/** The text files of a build with every SHA-256 (hex) of a patched binary changed to the patched file's: the code that
 * checks a bundled model (vendor/models/upscale/index.json, upscale/js/core/models.js) then accepts the build's copy.
 * hashes: Map old hex -> new hex. Returns how many files changed. */
export function rehash(out, hashes, dir = out) {
  let n = 0;
  if (!hashes.size) return n;
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const f = path.join(dir, name), st = statSync(f);
    if (st.isDirectory()) { n += rehash(out, hashes, f); continue; }
    if (!/\.(js|mjs|json|html|txt|md)$/.test(name) || st.size > 4e6) continue;
    const src = readFileSync(f, 'utf8');
    let next = src;
    for (const [a, b] of hashes) if (next.includes(a)) next = next.split(a).join(b);
    if (next !== src) { writeFileSync(f, next); n++; }
  }
  return n;
}
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/** Files of the source brand that a renamed build leaves out (it writes its own where one is needed). */
export function excluded(file, p) {
  if (/^(brand\/profiles|brand\/copy|tools\/whitelabel)\//.test(file) || file === 'brand/README.md') return true;
  // this repository's own automation: every workflow (deploys, pings, checks that only make sense here; the build writes the
  // mirror's one rules.yml), and the tests that are about this repository only, declared in one place (tests/repo-only.json)
  if (/^\.github\/(workflows\/|dependabot\.yml$)/.test(file) || repoOnly(file)) return true;
  if (fontExcluded(file, p)) return true;                                                    // this site's type family (font.mjs)
  if (/^(TRADEMARKS\.md|NOTICE\.md|LICENSE|LICENSE-ART|README\.md|SECURITY\.md|CNAME|favicon\.svg|favicon\.ico|og-share\.png)$/.test(file)) return true;
  if (/^[^/]+\.png$/.test(file)) return true;                                               // stray root screenshots
  if (/^brand\/logo(-128)?\.(webp|svg)$/.test(file) || /^assets\/icons\//.test(file)) return true;
  if (file === 'ads.txt' && !(p.support && p.support.ads)) return true;
  if (!p.media && /^assets\/(shots|clips|video|promo|guides)\//.test(file)) return true;
  return false;
}

/** True for valid UTF-8 (fixtures in Windows-1252 or CP437 are copied as bytes, never decoded and re-encoded). */
export const isUtf8 = (buf) => { try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return true; } catch (e) { return false; } };
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'inherit'], env: Object.assign({}, process.env, { SEO_LENIENT: '1' }) });
const write = (out, rel, data) => { const f = path.join(out, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, data); };

/** Empties out (keeping .git) or creates it. Refuses the repo itself and its parents. */
function prepareOut(out) {
  const rel = path.relative(out, ROOT);
  if (!rel || !rel.startsWith('..')) throw new Error(`refusing to build into ${out}: it is the repository or holds it`);
  mkdirSync(out, { recursive: true });
  for (const e of readdirSync(out)) if (e !== '.git') rmSync(path.join(out, e), { recursive: true, force: true });
}

export function build(id, out, opts = {}) {
  const dir = opts.profiles || profilesDir(ROOT);
  const p = loadProfile(dir, id);
  const map = loadMap(dir, id);
  const weak = themeProblems(p.themes, sourceThemes(readFileSync(path.join(ROOT, 'shared/theme/theme.js'), 'utf8')));
  if (weak.length) throw new Error(`profile ${id}: its theme colours read worse than this site's:\n  ${weak.join('\n  ')}`);
  const overlay = overlayDir(dir, p), bad = overlayProblems(overlay, p).concat(fontFolderProblems(dir, p));
  if (bad.length) throw new Error(`profile ${id}:\n  ${bad.join('\n  ')}`);
  out = path.resolve(out);
  prepareOut(out);
  const files = sh('git', ['ls-files', '-co', '--exclude-standard', '-z'], ROOT).split('\0').filter((f) => f && existsSync(path.join(ROOT, f)));
  const values = markerValues(p);
  const log = (s) => { if (!opts.quiet) console.log(s); };
  if (!map) {                                   // the source brand itself: a plain copy with its own profile values
    for (const f of files) {
      const buf = readFileSync(path.join(ROOT, f));
      write(out, f, isText(buf) ? applyMarkers(buf.toString('utf8'), values) : buf);
    }
    // the profile's search settings and single-app root (tools/seo/robots.mjs) are the SEO writer's: this site's own
    // profile changes nothing there, another profile of this brand (a single-app site) gets its pages
    if (!opts.noSeo) sh(process.execPath, ['tools/seo/write.mjs'], out);
    publishLangs(out, opts);
    if (!opts.noSeo) sh(process.execPath, ['tools/pwa-precache.mjs'], out);
    log(`${p.id}: copied ${files.length} files to ${out}`);
    return { profile: p, out, files: files.length, found: [] };
  }
  const ctx = context(ROOT, p, map);
  const seen = new Map(), clashes = [], hashes = new Map(), repeats = [];
  let n = 0;
  for (const f of files) {
    if (excluded(f, p)) continue;
    const dest = forwardPath(f, ctx);
    if (seen.has(dest)) throw new Error(`two files map to ${dest}: ${seen.get(dest)} and ${f}`);
    seen.set(dest, f);
    const buf = readFileSync(path.join(ROOT, f));
    if (!isText(buf) || !isUtf8(buf)) {   // other encodings stay byte for byte; a patched model gets its new checksum (rehash)
      const bin = patchBinary(f, buf);
      if (bin !== buf) hashes.set(sha(buf), sha(bin));
      write(out, dest, bin); n++; continue;
    }
    const src = buf.toString('utf8');
    for (const [t, c] of collisions(profileText(src, ctx), map)) clashes.push(`${f}: '${t}' x${c}`);
    const text = forward(src, ctx, dest);
    for (const r of newRepeats(src, text, dest)) repeats.push(r);   // "your Files files": a plain name next to its own word
    write(out, dest, text);
    n++;
  }
  for (const [t] of collisions(files.join('\n'), map)) clashes.push(`(file names): '${t}'`);
  if (clashes.length) throw new Error(`the rename map's targets already occur in the source, so the reverse would be ambiguous:\n  ${clashes.slice(0, 40).join('\n  ')}`);
  rehash(out, hashes);
  emit(out, p, Object.assign({ overlay, font: fontDir(dir, p) }, opts), ctx);
  const videos = p.media ? [] : mediaIds(ROOT);   // without media: none of this site's videos, not even their ids
  if (videos.length) stripMedia(out, videos);
  log(`${p.id}: wrote ${n} files to ${out}`);
  const node = process.execPath;
  sh(node, ['mobile/android/assetlinks.mjs'], out);   // the Android app's asset links: the build's own app id (from its CNAME)
  if (!opts.noImages) sh(node, [path.join(ROOT, 'tools/whitelabel/images.mjs'), out]);   // before the precache list, which hashes them
  // the generated reports name the apps and files, so the build writes its own: the SEO pages, the i18n coverage report
  // (tests/node/i18n-tables.test.mjs checks it is up to date) and the precache list, which hashes the rest
  if (!opts.noSeo) sh(node, ['tools/seo/write.mjs'], out);
  publishLangs(out, opts);
  if (!opts.noSeo) { sh(node, [path.join('tools', 'i18n', 'i18n.mjs'), 'coverage'], out); sh(node, ['tools/pwa-precache.mjs'], out); }
  const res = scan(out, forbiddenTerms(dir, p).concat(videos.map((v) => v.toLowerCase())), SCAN_ALLOW.concat(p.scanAllow || [], artAllow(p)), { account: p.github.toLowerCase() });
  log(report(res));
  const allow = new Set((p.repeatAllow || []).map((x) => String(x).toLowerCase()));
  const made = repeats.filter((r) => !allow.has(r.pair));
  log(repeatReport(made));
  return { profile: p, out, files: n, found: res.found, allowed: res.allowed, repeats: made };
}

/** The copy's .gitignore without the language folders' block, and the SEO pages of its other languages (seo.langs), made
 * from its root language's pages as they are now (written already). */
function publishLangs(out, opts) {
  const ignore = path.join(out, '.gitignore');
  if (existsSync(ignore)) writeFileSync(ignore, withoutBlock(readFileSync(ignore, 'utf8')));
  if (!opts.noSeo) sh(process.execPath, ['tools/seo/write.mjs', '--langs'], out);
}

/** The files written from the profile rather than copied. */
function emit(out, p, opts, ctx) {
  write(out, 'brand/brand.json', JSON.stringify(brandJson(JSON.parse(readFileSync(path.join(out, 'brand/brand.json'), 'utf8')), p), null, 2) + '\n');
  write(out, 'CNAME', p.cname + '\n');
  write(out, 'LICENSE', mit(p));
  write(out, 'NOTICE.md', notice(p));
  write(out, 'TRADEMARKS.md', trademarks(p));
  write(out, 'SECURITY.md', security(p));
  write(out, 'README.md', readme(p, opts.release));
  const icon = opts.overlay && p.mascot.icon !== false ? overlayIcons(opts.overlay) : null;
  write(out, 'brand/mark.svg', icon ? icon.full : markSvg(p));
  write(out, 'brand/logo.svg', logoSvg(p, icon && icon.full));
  write(out, 'favicon.svg', icon ? icon.small : markSvg(p));            // a tab icon: the small drawing
  if (hasOverlay(p)) {
    for (const f of filesIn(opts.overlay)) write(out, `${DEST}/${f}`, readFileSync(path.join(opts.overlay, f)));
    write(out, 'LICENSE-ART', licenseArt(p));
  }
  if (opts.cdnRef) {
    if (!/^v\d{4}\.\d{1,2}\.\d{1,2}$/.test(opts.cdnRef)) throw new Error(`--cdn-ref ${opts.cdnRef}: a release tag (vYYYY.M.D)`);
    const f = path.join(out, forwardPath('shared/cdn/assets.js', ctx)), src = readFileSync(f, 'utf8');
    if (!/const TAG = '[^']*';/.test(src)) throw new Error('shared/cdn/assets.js: no TAG line');
    writeFileSync(f, src.replace(/const TAG = '[^']*';/, `const TAG = '${opts.cdnRef}';`));
  }
  emitFont(out, p, opts.font);
  { const tag = /const TAG = '([^']*)';/.exec(readFileSync(path.join(out, forwardPath('shared/cdn/assets.js', ctx)), 'utf8'));   // raw links: this build's own file host
    if (tag) pinBuild(out, p.github, tag[1]); }
  write(out, 'manifest.webmanifest', manifest(readFileSync(path.join(out, 'manifest.webmanifest'), 'utf8'), p));
  write(out, 'index.html', homeThemeColor(readFileSync(path.join(out, 'index.html'), 'utf8'), p));
  const trial = path.join(out, 'shared/agent/trial-tokens.json');
  if (existsSync(trial)) { const t = JSON.parse(readFileSync(trial, 'utf8')); t.tokens = []; writeFileSync(trial, JSON.stringify(t, null, 2) + '\n'); }
  const wf = readFileSync(path.join(ROOT, '.github/workflows/rules.yml'), 'utf8');
  write(out, '.github/workflows/rules.yml', tokens(phrases(urls(mirrorWorkflow(wf), ctx.urls), ctx.phraseRules), ctx.tokenRules));
  write(out, '.nojekyll', '');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2), pos = args.filter((a) => !a.startsWith('--'));
  const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
  if (pos.length !== 2) { console.error('usage: build.mjs <profile id> <out dir> [--profiles=<dir>] [--no-images] [--no-seo] [--release=<text>] [--cdn-ref=<tag>]'); process.exit(2); }
  try {
    const r = build(pos[0], pos[1], { profiles: opt('profiles') && path.resolve(opt('profiles')), release: opt('release'), cdnRef: opt('cdn-ref'), noImages: args.includes('--no-images'), noSeo: args.includes('--no-seo') });
    process.exit(r.found.length ? 1 : 0);
  } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
