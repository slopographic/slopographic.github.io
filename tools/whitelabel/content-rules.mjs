#!/usr/bin/env node
// A mirror's CONTENT_RULES secret, the rules of its content check (tools/content-check/check.mjs; brand/README.md, "The
// content check"), made from a profile and its build: the words the build's leak scan forbids (profile.mjs
// forbiddenTerms, and this site's video ids for a profile without media), the English words the scan allows (scan.mjs
// SCAN_KEEP), and the git blob ids of the files the scan allows in the build (build.mjs SCAN_ALLOW, the profile's
// scanAllow, the mascot art's lines; each only with the exact bytes its entry names). A mirror keeps its old releases, so
// the caller adds new blob ids to the ones its secret already has.
//   node tools/whitelabel/content-rules.mjs <profile id> <build dir> [--profiles=<dir>]   prints the JSON
// Node only. Tests: tests/node/whitelabel-build.test.mjs.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProfile, forbiddenTerms, profilesDir } from './profile.mjs';
import { SCAN_KEEP } from './scan.mjs';
import { SCAN_ALLOW, ROOT, artPins } from './build.mjs';
import { overlayDir } from './mascot.mjs';
import { mediaIds } from './media.mjs';

/** The git blob id (SHA-1) of some bytes, as git hash-object gives it. */
export const blobId = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** { terms, keep, allow } for profile p (dir: its profiles folder) and its build in out. */
export function contentRules(dir, p, out) {
  const terms = forbiddenTerms(dir, p).concat(p.media ? [] : mediaIds(ROOT).map((v) => v.toLowerCase()));
  const allow = new Set();
  for (const a of SCAN_ALLOW.concat(p.scanAllow || [], artPins(p, overlayDir(dir, p)))) {
    const f = path.join(out, a.file), buf = existsSync(f) && readFileSync(f);
    if (buf && a.sha256 && String(a.sha256).toLowerCase() === sha256(buf)) allow.add(blobId(buf));
  }
  return { terms: [...new Set(terms)], keep: SCAN_KEEP, allow: [...allow] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), pos = args.filter((a) => !a.startsWith('--')), opt = args.find((a) => a.startsWith('--profiles='));
  if (pos.length !== 2) { console.error('usage: content-rules.mjs <profile id> <build dir> [--profiles=<dir>]'); process.exit(2); }
  const dir = opt ? path.resolve(opt.slice('--profiles='.length)) : profilesDir(ROOT);
  console.log(JSON.stringify(contentRules(dir, loadProfile(dir, pos[0]), path.resolve(pos[1]))));
}
