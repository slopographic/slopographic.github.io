#!/usr/bin/env node
// The plan's test pages (tools/ci/plan.mjs, source paths) as a build of a profile names them, for CI's white-label browser
// jobs on a work branch: the build renames folders and files through the profile's map.
//   echo "tests/photoslop/look.test.html ..." | node tools/whitelabel/pages.mjs <profile id> [--profiles=<dir>]
// prints one renamed path per line (the pages a build leaves out, tests/repo-only.json, are dropped).
// Node only. Tests: tests/node/whitelabel-build.test.mjs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProfile, loadMap, profilesDir } from './profile.mjs';
import { renamePath, tokenRules } from './rename.mjs';
import { repoOnly } from './build.mjs';

/** The pages (source paths) as the build of a profile with this map names them. */
export function buildPages(pages, map) {
  const rules = map ? tokenRules(map) : null;
  return pages.filter((p) => p && !repoOnly(p)).map((p) => (rules ? renamePath(p, rules) : p));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), id = args.find((a) => !a.startsWith('--'));
  const pa = args.find((a) => a.startsWith('--profiles='));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const dir = pa ? path.resolve(pa.slice(11)) : profilesDir(root);
  loadProfile(dir, id);
  const pages = readFileSync(0, 'utf8').split(/\s+/);
  process.stdout.write(buildPages(pages, loadMap(dir, id)).join('\n') + '\n');
}
