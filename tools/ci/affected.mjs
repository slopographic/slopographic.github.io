#!/usr/bin/env node
// The browser test pages a change needs (CI runs only these on wip/* and other work branches; tools/ci/plan.mjs):
//   - every test page the change touched, and every page that names a changed file (it loads it, opens an app page that
//     loads it, or names it in a "Covers:" line; see tools/ci/deps.mjs): shared/foo.js changed means every app that loads
//     it, and so each of their test pages
//   - always a few smoke pages (SMOKE: the homepage, Slop PDF, PhotoSlop, Workflows, Convert)
// The runner and CI files (INFRA) select nothing by themselves: their full proof is the full suite on testing.
//   node tools/ci/affected.mjs --base=origin/testing     the pages for the changes since the merge base with that ref
//   node tools/ci/affected.mjs --files a.js b.css        the pages for those files
// Prints { "pages": [...], "count": <slices> } as JSON.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGraph } from './deps.mjs';

export const SMOKE = ['tests/home/sections.test.html', 'tests/pdf/look.test.html', 'tests/photoslop/look.test.html',
  'tests/workflows/run.test.html', 'tests/convert/hub.test.html'];
export const INFRA = /^(?:\.github\/|tools\/ci\/|tests\/(?:harness\.js|run\.mjs|shard\.mjs|netcache\.mjs|results\.mjs|touch\.mjs|timings\.json|net-urls\.txt)$)/;
/** Pages per slice for a changed-pages run, and the most slices it may use (the full suite's 16 are for testing). */
export const PER_SLICE = 12, MAX_SLICES = 4;
export const isTestPage = (f) => /^tests\/.*\.test\.html$/.test(f);

/** The test pages for a list of changed files. pages: every test page; closure(page): the Set of files it depends on. */
export function affectedPages(changed, pages, closure, smoke = SMOKE) {
  const all = new Set(pages);
  const hits = changed.filter((f) => !INFRA.test(f));
  const out = new Set(smoke.filter((p) => all.has(p)));
  for (const f of hits) if (all.has(f)) out.add(f);
  if (hits.length) for (const p of pages) { if (out.has(p)) continue; const c = closure(p); if (hits.some((f) => c.has(f))) out.add(p); }
  return [...out].sort();
}
/** How many slices a run of n pages uses: one per PER_SLICE pages, at least one, at most MAX_SLICES. */
export const sliceCount = (n) => Math.max(1, Math.min(MAX_SLICES, Math.ceil(n / PER_SLICE)));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter(Boolean);
/** The files changed since the merge base of HEAD and a ref (deleted ones too: a page that named them must run). */
export function changedSince(ref) { const base = git('merge-base', 'HEAD', ref)[0]; return git('diff', '--name-only', `${base}..HEAD`); }
/** The pages for changed files, from the working tree. */
export function pagesFor(changed) {
  const tracked = git('ls-files');
  const files = new Set([...tracked, ...changed]);
  const read = (f) => { try { return existsSync(path.join(ROOT, f)) ? readFileSync(path.join(ROOT, f), 'utf8') : null; } catch (e) { return null; } };
  const graph = makeGraph(files, read);
  const pages = tracked.filter(isTestPage);
  return affectedPages(changed, pages, graph.closure);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), base = (argv.find((a) => a.startsWith('--base=')) || '').slice(7);
  const changed = argv[0] === '--files' ? argv.slice(1) : changedSince(base || 'origin/testing');
  const pages = pagesFor(changed);
  console.log(JSON.stringify({ changed: changed.length, pages, count: sliceCount(pages.length) }, null, 1));
}
