#!/usr/bin/env node
// The round trip of the rename map over the whole source tree: for every file the build copies, the token pass turned
// back (rename.mjs reverseTokens) gives the profile's text exactly, and every path comes back to itself. The profile's own
// steps (links, visible names, marker values, colours) are one way by design and are applied to both sides first.
// This is what lets import.mjs bring a mirror change back without guessing.
//   node tools/whitelabel/roundtrip.mjs <profile id> [--profiles=<dir>]   exit 1 and name the files that do not come back
// Node only. Tests: tests/node/whitelabel-roundtrip.test.mjs (and CI runs it on the sample profile).
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProfile, loadMap, profilesDir } from './profile.mjs';
import { tokens } from './rename.mjs';
import { context, profileText, forwardPath, backPath } from './transform.mjs';
import { excluded } from './build.mjs';
import { isText } from './scan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** One text: [] when it comes back, else the first differing line as [line number, expected, got]. */
export function roundTrip(text, ctx) {
  const x = profileText(text, ctx);
  const back = tokens(tokens(x, ctx.tokenRules), ctx.reverseRules);
  if (back === x) return [];
  const a = x.split('\n'), b = back.split('\n');
  const i = a.findIndex((l, k) => l !== b[k]);
  return [i + 1, a[i], b[i]];
}

export function checkTree(id, opts = {}) {
  const dir = opts.profiles || profilesDir(ROOT);
  const p = loadProfile(dir, id), map = loadMap(dir, id);
  if (!map) return { files: 0, bad: [] };
  const ctx = context(ROOT, p, map);
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter((f) => f && existsSync(path.join(ROOT, f)) && !excluded(f, p));
  const bad = [];
  for (const f of files) {
    if (backPath(forwardPath(f, ctx), ctx) !== f) bad.push(`${f}: the path does not come back (${forwardPath(f, ctx)} -> ${backPath(forwardPath(f, ctx), ctx)})`);
    const buf = readFileSync(path.join(ROOT, f));
    if (!isText(buf)) continue;
    const r = roundTrip(buf.toString('utf8'), ctx);
    if (r.length) bad.push(`${f}:${r[0]}: expected ${JSON.stringify(r[1].slice(0, 120))}, got ${JSON.stringify(r[2].slice(0, 120))}`);
  }
  return { files: files.length, bad };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), id = args.find((a) => !a.startsWith('--'));
  const pa = args.find((a) => a.startsWith('--profiles='));
  if (!id) { console.error('usage: roundtrip.mjs <profile id> [--profiles=<dir>]'); process.exit(2); }
  const r = checkTree(id, { profiles: pa && path.resolve(pa.slice(11)) });
  console.log(`${id}: ${r.files} files, ${r.bad.length} do not come back`);
  for (const b of r.bad.slice(0, 50)) console.log('  ' + b);
  process.exit(r.bad.length ? 1 : 0);
}
