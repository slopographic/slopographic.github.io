// The speed check's markdown summary (CI writes it to the job's step summary): the problems first, then how many pages
// meet each goal, then the slowest pages, worst first, with their distance to the goal. Pure; tested in
// tests/node/speed-summary.test.mjs.
import { GOALS } from './budget.mjs';

const ms = (v) => (v == null ? 'n/a' : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);
const kb = (v) => (v == null ? 'n/a' : `${Math.round(v / 1024)} KB`);
const fmt = (metric, v) => (v == null ? 'n/a' : metric === 'cls' ? v.toFixed(3) : metric === 'bytes' ? kb(v) : metric === 'requests' || metric === 'score' ? String(v) : ms(v));
const name = (page) => '/' + page;

/** One problem as a line of text. */
export function problemLine(p) {
  if (p.kind === 'missing') return `${name(p.page)} (${p.preset}): new page, no budget yet (not a failure). Its numbers become its budget at the next node tools/speed/run.mjs --update.`;
  if (p.kind === 'unmeasured') return `${name(p.page)} (${p.preset}): ${p.metric} not measured${p.message ? ': ' + p.message : ''}`;
  return `${name(p.page)} (${p.preset}): ${p.metric} ${fmt(p.metric, p.value)}, budget ${fmt(p.metric, p.budget)} (fails past ${fmt(p.metric, p.limit)})`;
}

/** Distance to a goal as text: "-120 ms" when under it, "+1.20 s" when over. */
export function distance(value, goal) {
  if (value == null) return 'n/a';
  const d = value - goal;
  return (d > 0 ? '+' : '-') + ms(Math.abs(d));
}

/** The rows of the slowest pages for one preset: [{ page, ...numbers }] by LCP, worst first. */
export function worst(results, preset, n = 15) {
  return Object.entries(results).filter(([, r]) => r[preset] && !r[preset].error).map(([page, r]) => ({ page, ...r[preset] }))
    .sort((a, b) => (b.lcp ?? Infinity) - (a.lcp ?? Infinity) || (a.page < b.page ? -1 : 1)).slice(0, n);
}

/** How many measured pages meet a goal. */
export function goalCounts(results, preset) {
  const rows = Object.values(results).map((r) => r[preset]).filter((m) => m && !m.error);
  const g = GOALS[preset];
  return { pages: rows.length, lcp: rows.filter((m) => m.lcp != null && m.lcp <= g.lcp).length, cls: rows.filter((m) => m.cls != null && m.cls <= g.cls).length };
}

/** The whole summary. results: { page: { preset: numbers } }; problems from compare(); title names the run (a shard). */
export function summary(results, problems, { title = 'Page speed', presets = ['desktop', 'mobile'], n = 15, recording = false } = {}) {
  const out = [`## ${title}`, ''];
  const pages = Object.keys(results).length;
  if (recording) out.push(`Recording budgets: ${pages} pages measured, none checked. Merge the speed-results artifact with node tools/speed/run.mjs --update --from=<the unzipped artifact> and commit tools/speed/budgets.json.`);
  else if (!problems.length) out.push(`All ${pages} pages are within their budgets.`);
  else {
    out.push(`**${problems.length} problem${problems.length === 1 ? '' : 's'}** on ${pages} pages:`, '');
    for (const p of problems.slice(0, 50)) out.push(`- ${problemLine(p)}`);
    if (problems.length > 50) out.push(`- and ${problems.length - 50} more (see the results artifact)`);
  }
  out.push('');
  for (const preset of presets) {
    const c = goalCounts(results, preset);
    if (!c.pages) continue;
    const g = GOALS[preset];
    out.push(`### ${preset[0].toUpperCase() + preset.slice(1)}: LCP goal ${ms(g.lcp)}, CLS goal ${g.cls}`, '',
      `${c.lcp} of ${c.pages} pages meet the LCP goal, ${c.cls} of ${c.pages} the CLS goal. Slowest first:`, '',
      '| Page | LCP | to goal | FCP | CLS | TBT | SI | Score | Transfer | Requests |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of worst(results, preset, n)) {
      out.push(`| ${name(r.page)} | ${ms(r.lcp)} | ${distance(r.lcp, g.lcp)} | ${ms(r.fcp)} | ${fmt('cls', r.cls)} | ${ms(r.tbt)} | ${ms(r.si)} | ${r.score ?? 'n/a'} | ${kb(r.bytes)} | ${r.requests ?? 'n/a'} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

/** The noise table from spread(): one row per metric, against its tolerance. */
export function spreadTable(s, tolerance) {
  const out = ['### Run-to-run noise (the worst run above its page\'s median)', '',
    '| Metric | Runs | Worst above median | Worst, relative | Tolerance | Single runs past it |', '| --- | --- | --- | --- | --- | --- |'];
  for (const [k, v] of Object.entries(s)) {
    const t = tolerance[k];
    out.push(`| ${k} | ${v.runs} | ${fmt(k, v.abs)} | ${Math.round(v.rel * 100)}% | ${fmt(k, t.abs)} or ${Math.round(t.rel * 100)}% | ${v.past} |`);
  }
  return out.join('\n') + '\n';
}
