#!/usr/bin/env node
// Source to mirror: the one command a release runs for a profile. It checks that the rename map comes back over the whole
// tree (roundtrip.mjs), builds the site into the mirror's checkout (build.mjs; its .git folder is kept, everything else
// is replaced) and fails when the leak scan finds anything or the rename doubled a word (repeats.mjs: "Files files"). Committing and pushing are the caller's (a publish script
// outside this repository, which holds the real profiles and the token).
//   node tools/whitelabel/export.mjs <profile id> <mirror checkout> [--profiles=<dir>] [--release=<text>] [--no-images] [--cdn-ref=<tag>]
// Node only. Tests: tests/node/whitelabel-build.test.mjs.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';
import { checkTree } from './roundtrip.mjs';

/** Returns { ok, lines }: ok when the round trip and the scan are both clean. */
export function exportProfile(id, out, opts = {}) {
  const lines = [];
  const rt = checkTree(id, opts);
  lines.push(`round trip: ${rt.files} files, ${rt.bad.length} do not come back`, ...rt.bad.slice(0, 20).map((b) => '  ' + b));
  if (rt.bad.length) return { ok: false, lines };
  const r = build(id, out, opts);
  const reps = r.repeats || [];
  lines.push(`build: ${r.files} files, ${r.found.length} leftover match(es), ${(r.allowed || []).length} allowed, ${reps.length} doubled word(s)`);
  return { ok: r.found.length === 0 && reps.length === 0, lines };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), pos = args.filter((a) => !a.startsWith('--'));
  const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
  if (pos.length !== 2) { console.error('usage: export.mjs <profile id> <mirror checkout> [--profiles=<dir>] [--release=<text>] [--no-images] [--cdn-ref=<tag>]'); process.exit(2); }
  try {
    const r = exportProfile(pos[0], pos[1], { profiles: opt('profiles') && path.resolve(opt('profiles')), release: opt('release'), cdnRef: opt('cdn-ref'), noImages: args.includes('--no-images') });
    console.log(r.lines.join('\n'));
    process.exit(r.ok ? 0 : 1);
  } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
