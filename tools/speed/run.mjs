#!/usr/bin/env node
// The page speed check: Lighthouse on every page of the site (tools/speed/pages.mjs), served from this checkout with gzip
// as GitHub Pages serves it, on the mobile and desktop presets; the median of --runs runs per page is checked against
// tools/speed/budgets.json (the ratchet in tools/speed/budget.mjs). Run by .github/workflows/speed.yml in parallel shards.
//   node tools/speed/run.mjs                      every page, check against the budgets, exit 1 on a problem
//   node tools/speed/run.mjs --update             measure, then lower the budgets (never raise) and add new pages
//   node tools/speed/run.mjs --update --reset=pdf/  re-record pdf/'s budget as measured (a deliberate cost; say why)
//   --pages=a/,b/  only these pages ("" or / for the homepage)    --shard=i/n  one of n slices of the pages
//   --runs=3       runs per page and preset (the median counts)   --jobs=k     k Chromes at once (default 1; CPU noise
//                                                                              grows with more, keep k <= cores / 4)
//   --presets=mobile,desktop                                       --out=f.json write the results (numbers and runs)
//   --record            measure (or read --from) and report only, no budgets checked: CI's recording run (the first one,
//                       or a workflow_dispatch with record), whose results --update --from then merges into the budgets
//   --from=a.json,dir/  no measuring: check (or --update from) results written by --out, e.g. CI's artifacts
//   --summary=f.md      append the markdown summary there (default: $GITHUB_STEP_SUMMARY when set)
// Chrome: CHROME_PATH, or Playwright's Chromium.
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, discoverPages } from './pages.mjs';
import { PRESETS } from './measure.mjs';
import { openWorker } from './worker.mjs';
import { serve } from './serve.mjs';
import { medianRun, compare, ratchet, parseBudgets, formatBudgets, spread, TOLERANCE } from './budget.mjs';
import { summary, problemLine, spreadTable } from './summary.mjs';
import { parseShard, shardPages, pool } from '../../tests/shard.mjs';

export const BUDGETS = path.join(ROOT, 'tools/speed/budgets.json');

/** The command line as options. */
export function parseArgs(argv) {
  const o = { runs: 3, jobs: 1, presets: PRESETS, update: false, record: false, reset: [], pages: null, shard: null, out: null, from: null, summary: process.env.GITHUB_STEP_SUMMARY || null };
  const list = (v) => v.split(',').map((s) => s.trim()).map((s) => (s === '/' ? '' : s.replace(/^\//, '')));
  for (const a of argv) {
    const [k, v = ''] = a.replace(/^--/, '').split(/=(.*)/s);
    if (k === 'update' || k === 'record') o[k] = true;
    else if (k === 'runs' || k === 'jobs') { o[k] = Number(v); if (!(o[k] >= 1)) throw new Error(`--${k} needs a number >= 1`); }
    else if (k === 'presets') { o.presets = v.split(','); if (o.presets.some((p) => !PRESETS.includes(p))) throw new Error(`--presets: ${PRESETS.join(', ')}`); }
    else if (k === 'reset' || k === 'pages') o[k] = list(v);
    else if (k === 'from') o.from = v.split(',').filter(Boolean);
    else if (k === 'shard') o.shard = parseShard(v);
    else if (k === 'out' || k === 'summary') o[k] = v;
    else throw new Error(`unknown option ${a}`);
  }
  if (o.reset.length && !o.update) throw new Error('--reset goes with --update');
  if (o.record && o.update) throw new Error('--record checks nothing and writes no budgets; merge its results with --update --from');
  return o;
}

/** The pages this run measures: the site's pages, narrowed by --pages and --shard. */
export function pickPages(all, { pages = null, shard = null } = {}) {
  let out = pages ? all.filter((p) => pages.includes(p)) : all;
  if (pages) for (const p of pages) if (!all.includes(p)) throw new Error(`--pages: ${p || '/'} is not a page of the site`);
  if (shard) out = shardPages(out, shard.count)[shard.index - 1];
  return out;
}

/** Results files merged: { results: { page: { preset } }, runs: { page: { preset: [...] } } }. Paths may be directories. */
export function readResults(paths) {
  const files = paths.flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p, { recursive: true }).filter((f) => f.endsWith('.json')).map((f) => path.join(p, f)) : [p]));
  const merged = { results: {}, runs: {} };
  for (const f of files) {
    const j = JSON.parse(readFileSync(f, 'utf8'));
    if (!j.results) continue;
    for (const key of ['results', 'runs']) for (const [page, presets] of Object.entries(j[key] || {})) Object.assign((merged[key][page] ||= {}), presets);
  }
  return merged;
}

async function measure(pages, o) {
  const site = await serve(ROOT, 0);
  const items = pages.flatMap((page) => o.presets.map((preset) => ({ page, preset })));
  const results = {}, runs = {};
  const workers = [], idle = [];
  let done = 0;
  const t0 = Date.now();
  try {
    // A worker from the idle ones, or a new one; a worker that died (a timeout, a crash) is left out.
    const take = () => { const w = idle.pop(); if (w) return w; const n = openWorker(); workers.push(n); return n; };
    const once = async (url, preset) => {
      const lh = take();
      try { return await lh.run(url, preset); } finally { if (lh.alive()) idle.push(lh); }
    };
    await pool(items, o.jobs, async ({ page, preset }) => {
      const got = [];
      let error = null;
      for (let r = 0; r < o.runs; r++) {
        try { got.push(await once(site.url + page, preset)); } catch {
          try { got.push(await once(site.url + page, preset)); } catch (e) { error = e.message; }
        }
      }
      (runs[page] ||= {})[preset] = got;
      (results[page] ||= {})[preset] = got.length ? medianRun(got) : { error };
      const m = results[page][preset];
      console.log(`[${++done}/${items.length}] /${page} ${preset}: ${m.error ? 'error ' + m.error : `LCP ${m.lcp} ms, FCP ${m.fcp}, CLS ${m.cls}, TBT ${m.tbt}, score ${m.score}`}`);
    });
  } finally {
    await Promise.all(workers.filter((w) => w.alive()).map((w) => w.close()));
    await site.close();
  }
  console.log(`measured ${items.length} page presets x ${o.runs} runs in ${Math.round((Date.now() - t0) / 1000)} s`);
  return { results, runs };
}

async function main(argv) {
  const o = parseArgs(argv);
  const all = discoverPages();
  const budgetsJson = existsSync(BUDGETS) ? JSON.parse(readFileSync(BUDGETS, 'utf8')) : { pages: {} };
  const budgets = parseBudgets(budgetsJson);
  let data;
  if (o.from) data = readResults(o.from);
  else data = await measure(pickPages(all, o), o);
  if (o.out) {
    mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
    const { version } = JSON.parse(readFileSync(path.join(ROOT, 'node_modules/lighthouse/package.json'), 'utf8'));
    writeFileSync(o.out, JSON.stringify({ meta: { lighthouse: version, runs: o.runs, date: new Date().toISOString() }, ...data }, null, 1));
  }
  if (o.update) {
    // A run over every page (here, or every slice of CI's) also drops the budgets of pages that are gone.
    const whole = o.from ? all.every((p) => data.results[p]) : !o.pages && !o.shard;
    const next = ratchet(budgets, data.results, { reset: o.reset, pages: whole ? all : null });
    const { version } = JSON.parse(readFileSync(path.join(ROOT, 'node_modules/lighthouse/package.json'), 'utf8'));
    writeFileSync(BUDGETS, formatBudgets({ lighthouse: version, runs: o.runs, updated: new Date().toISOString().slice(0, 10) }, next));
    console.log(`budgets: ${Object.keys(next).length} pages written to ${path.relative(process.cwd(), BUDGETS)}`);
    return 0;
  }
  const problems = o.record ? [] : compare(data.results, budgets);
  const title = o.shard ? `Page speed, slice ${o.shard.index} of ${o.shard.count}` : 'Page speed';
  const noise = Object.keys(data.runs || {}).length ? spreadTable(spread(data.runs), TOLERANCE) : '';
  if (o.summary) appendFileSync(o.summary, summary(data.results, problems, { title, recording: o.record }) + '\n' + (o.from ? noise : ''));
  if (o.from && noise) console.log(noise);
  for (const p of problems) console.error(problemLine(p));
  console.log(`speed: ${Object.keys(data.results).length} pages, ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
  // A page with no budget yet (a new page) is reported, not failed: its numbers become its budget at the next --update.
  return problems.some((p) => p.kind !== 'missing') ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(2); });
}
