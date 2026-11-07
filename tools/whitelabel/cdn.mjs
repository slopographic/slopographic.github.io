#!/usr/bin/env node
// A white-label build's own file host: the content of its <github>/cdn repository, made fresh from this site's cdn
// repository at a release tag. Only the files the build's apps fetch (its tools/cdn-assets.mjs, so the names are the
// build's), with the licence texts, source notes and manifests in the same folders, and a README from the profile.
// Content only: git archive reads the tag's files, so no commit, author or history of the source repository comes along.
// The notes are renamed like the site (forward() in transform.mjs); licence texts and binaries are copied byte for byte.
// Every file is scanned for the build's forbidden words. Two kinds of hits are allowed and reported: bytes inside a
// binary (model weights, wasm, fonts) that happen to spell the stem, and the English word in a speech model's tokenizer
// vocabulary (part of the model). Anything else fails.
// The build's jsDelivr and GitHub URLs already name <github>/cdn at the site's tag (shared/cdn/assets.js TAG); a publish
// script commits this folder as one commit by the profile's author and tags it with that tag (or passes --cdn-ref to the
// build when it tags another one), so those URLs answer.
//   node tools/whitelabel/cdn.mjs <profile id> <build dir> <source cdn checkout> <out dir> [--profiles=<dir>] [--ref=<tag>]
// Node only. Tests: tests/node/whitelabel-cdn.test.mjs.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ENV } from './history-git.mjs';   // git without a hook's GIT_DIR
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadProfile, loadMap, forbiddenTerms, profilesDir } from './profile.mjs';
import { context, forward, forwardPath, backPath } from './transform.mjs';
import { scan, report, findTerms } from './scan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Files that travel with a cdn file: those in its folder with these names. */
export const SIDECAR = /^(LICENSE|COPYING|COPYRIGHT|NOTICE|SOURCE)[\w.-]*$|^manifest\.json$/i;
/** Notes written for this site (renamed in the copy); licence texts stay as their authors wrote them. */
export const NOTES = /(^|\/)(SOURCE\.md|manifest\.json)$/;
const VOCAB = /(^|\/)(vocab\.json|tokenizer(_config)?\.json|merges\.txt)$/;
/** A word in a binary that is this site's name, not chance: any run of letters with the brand in it, or the mascot's name
 * standing alone. Shorter matches inside random bytes (model weights spell 'slop' now and then) are chance. */
const NAME = (w) => /slopographic/i.test(w) || /^sloppos?$/i.test(w);

/** The repository paths to copy: every asset and the sidecars in its folders (tree: every path at the ref). */
export function selection(assets, tree) {
  const want = new Set(assets), dirs = new Set(assets.map((a) => a.replace(/[^/]*$/, '')));
  for (const f of tree) { const d = f.replace(/[^/]*$/, ''); if (dirs.has(d) && SIDECAR.test(f.slice(d.length))) want.add(f); }
  return [...want].sort();
}

/** Splits scan hits into real ones and the two allowed kinds (with their reason). */
export function sortHits(found) {
  const out = { found: [], allowed: [] };
  for (const h of found) {
    let why = null;
    const word = h.word || '';
    if (h.line === -1 && (h.term === 'slop' || h.term === 'slurp') && !NAME(word)) why = 'bytes of a binary (model weights, wasm or font data) that happen to spell it; not a name';
    else if (h.line > 0 && h.term === 'slop' && VOCAB.test(h.file) && /^(slop|sloppy)$/i.test(word)) why = "an English word in a speech model's tokenizer vocabulary (part of the model)";
    (why ? out.allowed : out.found).push(why ? Object.assign({ why }, h) : h);
  }
  return out;
}

/** The README of the cdn repository. */
export const readme = (p, tag) => `# ${p.name}: files

The files the ${p.name} apps download when they need them (speech and OCR models, engines, font packs), each folder
with its licence and source notes. The apps load them through jsDelivr at a release tag:
\`https://cdn.jsdelivr.net/gh/${p.github}/cdn@${tag}/<path>\` (files over 20 MB from raw.githubusercontent.com), and
check each file's SHA-256 before they use it.

> **Generated - do not edit.** This repository is written by a release build; changes made here are not kept.

Each file keeps the licence of its authors (see the LICENSE, COPYING and SOURCE files next to it).
`;

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, Object.assign({ encoding: 'utf8', maxBuffer: 1 << 28, env: ENV }, opts));
function listDir(dir, rel = '') {
  const out = [];
  for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (!rel && e.name === '.git') continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listDir(dir, r)); else out.push(r);
  }
  return out;
}

/** The scan reads files up to 64 MB; the larger ones (speech models) are searched here, as bytes. */
export function bigFiles(out, files, terms) {
  const hits = [];
  for (const file of files) {
    const full = path.join(out, file);
    if (statSync(full).size <= 64 * 1024 * 1024) continue;
    const s = readFileSync(full).toString('latin1');
    for (const m of findTerms(s, terms)) hits.push({ file, line: -1, term: m.term, word: m.word, text: `(bytes) ${s.slice(Math.max(0, m.index - 20), m.index + 30).replace(/[^\x20-\x7e]/g, '.')}` });
  }
  return hits;
}

export async function makeCdn(id, buildDir, cdnRepo, out, opts = {}) {
  const dir = opts.profiles || profilesDir(ROOT);
  const p = loadProfile(dir, id), map = loadMap(dir, id), ctx = map && context(ROOT, p, map);
  const ref = opts.ref || createRequire(import.meta.url)(path.join(ROOT, 'shared/cdn/assets.js')).TAG;
  const tag = /const TAG = '([^']+)'/.exec(readFileSync(path.join(buildDir, ctx ? forwardPath('shared/cdn/assets.js', ctx) : 'shared/cdn/assets.js'), 'utf8'))[1];
  const A = await import(pathToFileURL(path.join(buildDir, 'tools/cdn-assets.mjs')).href);
  const assets = await A.allAssets();
  const toSource = (f) => (ctx ? backPath(f, ctx) : f);
  const tree = sh('git', ['-C', cdnRepo, 'ls-tree', '-r', '--name-only', ref]).split('\n').filter(Boolean);
  const bySource = new Map(assets.map((a) => [toSource(a.path), a]));
  const missing = [...bySource.keys()].filter((f) => !tree.includes(f));
  if (missing.length) throw new Error(`not in ${cdnRepo} at ${ref}:\n  ${missing.slice(0, 20).join('\n  ')}`);
  const files = selection([...bySource.keys()], tree);
  // a fresh out (its .git kept), the tag's files extracted into a scratch folder beside it, then placed by build name
  mkdirSync(out, { recursive: true });
  for (const e of readdirSync(out)) if (e !== '.git') rmSync(path.join(out, e), { recursive: true, force: true });
  const tmp = path.join(out, '.extract');
  mkdirSync(tmp);
  const tar = path.join(out, '.extract.tar');
  sh('git', ['-C', cdnRepo, 'archive', '--format=tar', '-o', tar, ref, '--', ...files]);
  sh('tar', ['-xf', tar, '-C', tmp]);
  rmSync(tar);
  const fwdPath = (f) => (ctx ? forwardPath(f, ctx) : f);
  for (const f of files) {
    const dest = fwdPath(f), src = path.join(tmp, f), target = path.join(out, dest);
    mkdirSync(path.dirname(target), { recursive: true });
    const a = bySource.get(f);
    if (a && statSync(src).size !== a.size) throw new Error(`${f}: ${statSync(src).size} bytes at ${ref}, the build expects ${a.size}`);
    if (ctx && NOTES.test(f)) { writeFileSync(target, forward(readFileSync(src, 'utf8'), ctx, dest)); continue; }
    renameSync(src, target);
  }
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(path.join(out, 'README.md'), readme(p, tag));
  const terms = forbiddenTerms(dir, p), hits = scan(out, terms, [], { account: p.github.toLowerCase() }).found;
  hits.push(...bigFiles(out, listDir(out), terms));
  const res = sortHits(hits);
  return { files: listDir(out).length, assets: assets.length, ref, tag, found: res.found, allowed: res.allowed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), pos = args.filter((a) => !a.startsWith('--'));
  const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
  if (pos.length !== 4) { console.error('usage: cdn.mjs <profile id> <build dir> <source cdn checkout> <out dir> [--profiles=<dir>] [--ref=<tag>]'); process.exit(2); }
  try {
    const r = await makeCdn(pos[0], path.resolve(pos[1]), path.resolve(pos[2]), path.resolve(pos[3]), { profiles: opt('profiles') && path.resolve(opt('profiles')), ref: opt('ref') });
    const kinds = {};
    for (const a of r.allowed) kinds[a.why] = (kinds[a.why] || 0) + 1;
    console.log(`cdn: ${r.assets} files the build fetches, ${r.files} files written from ${r.ref}; tag it ${r.tag}`);
    console.log(report({ found: r.found, allowed: [] }));
    for (const [why, n] of Object.entries(kinds)) console.log(`  allowed x${n}: ${why}`);
    process.exit(r.found.length ? 1 : 0);
  } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
