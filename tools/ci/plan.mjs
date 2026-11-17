#!/usr/bin/env node
// Which browser tests a CI run does (the "plan" job of .github/workflows/rules.yml; the policy is in README.md, "Rules
// for every change"):
//   testing                 the full suite, in FULL_SLICES slices
//   main                    nothing when the pushed commit is a merge whose tree is its second parent's and that parent
//                           already passed "Rules and tests" (a milestone merge of testing); else (a hotfix) the full suite
//   wip/* and every other   only the pages the change needs (tools/ci/affected.mjs), in at most MAX_SLICES slices; never
//   branch, pull requests   the full suite
//   node tools/ci/plan.mjs  reads GITHUB_* from the environment and writes suite, count, shards, pages and touch to
//                           $GITHUB_OUTPUT (and prints them)
import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pagesFor, changedSince, sliceCount, MAX_SLICES } from './affected.mjs';

export const FULL_SLICES = 16;

/** The suite for a branch: 'full', 'changed' or 'none'. mergeOfGreen: on main, the commit is a merge with its second
 *  parent's tree and that parent has a green run. */
export function decide(branch, { mergeOfGreen = false } = {}) {
  if (branch === 'testing') return 'full';
  if (branch === 'main') return mergeOfGreen ? 'none' : 'full';
  return 'changed';
}
/** The job outputs for a suite and its pages (pages: null for the full suite). touch: a page is a touch page. */
export function outputs(suite, pages, touch = false) {
  const count = suite === 'full' ? FULL_SLICES : suite === 'none' ? 0 : Math.min(MAX_SLICES, sliceCount(pages.length));
  return { suite, count, shards: JSON.stringify(Array.from({ length: count }, (_, i) => i + 1)), pages: suite === 'changed' ? pages.join(' ') : '', touch: suite === 'full' || touch };
}

/** The white-label sample builds' browser and touch jobs (rules.yml whitelabel-*): the full sample suites wherever this
 *  repository's suite is full; on a work branch only the plan's pages, unless the change is to the white-label build
 *  itself (WL_FILES, or a file that holds a /*profile:...*\/ marker), which can touch every page of a build. The build and
 *  its Node tests run on every push. */
export const WL_SLICES = 8;
export const WL_FILES = /^(?:tools\/whitelabel\/|brand\/|tests\/(?:brand-facts\.m?js|needs\.mjs|repo-only\.json)$)/;
export function wlOutputs(suite, out, changed = [], hasMarker = () => false) {
  const wl = suite === 'changed' && changed.some((f) => WL_FILES.test(f) || hasMarker(f)) ? 'full' : suite;
  const count = wl === 'full' ? WL_SLICES : wl === 'none' ? 0 : out.count;
  return { wl_suite: wl, wl_count: count, wl_shards: JSON.stringify(Array.from({ length: count }, (_, i) => i + 1)) };
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
/** On main: is HEAD a merge whose tree is its second parent's, and did that parent pass "Rules and tests"? */
async function mergeOfGreen(env) {
  let parent;
  try { if (git('rev-parse', 'HEAD^{tree}') !== git('rev-parse', 'HEAD^2^{tree}')) return false; parent = git('rev-parse', 'HEAD^2'); } catch (e) { return false; }
  const r = await fetch(`${env.GITHUB_API_URL || 'https://api.github.com'}/repos/${env.GITHUB_REPOSITORY}/actions/runs?head_sha=${parent}&status=success&per_page=50`,
    { headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json' } });
  if (!r.ok) { console.log(`runs of ${parent}: HTTP ${r.status}, so the full suite runs`); return false; }
  return ((await r.json()).workflow_runs || []).some((w) => w.name === 'Rules and tests' && w.conclusion === 'success');
}

async function main(env) {
  const branch = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || '';
  const suite = decide(branch, { mergeOfGreen: branch === 'main' && await mergeOfGreen(env) });
  let pages = [], changed = [];
  if (suite === 'changed') pages = pagesFor(changed = changedSince(env.PLAN_BASE || 'origin/testing'));
  const touch = pages.some((p) => /<meta name="slop-test-touch"/.test(readFileSync(path.join(ROOT, p), 'utf8')));
  const marker = (f) => { try { return readFileSync(path.join(ROOT, f), 'utf8').includes('/*profile:'); } catch (e) { return false; } };
  const out = outputs(suite, pages, touch);
  Object.assign(out, wlOutputs(suite, out, changed, marker));
  console.log(`${branch}: ${suite} suite, ${out.count} slice(s); samples: ${out.wl_suite}, ${out.wl_count}${suite === 'changed' ? `, ${pages.length} pages:\n  ${pages.join('\n  ')}` : ''}`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, Object.entries(out).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.env);
