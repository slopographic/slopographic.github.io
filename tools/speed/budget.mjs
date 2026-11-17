// The speed rule's numbers and the ratchet. Pure functions, used by tools/speed/run.mjs and unit-tested in
// tests/node/speed-budget.test.mjs.
//
// The goal: every page shows its largest content within 500 ms on Lighthouse's desktop preset, within 2.5 s on the mobile
// preset (slow 4G, Google's "good"), and moves less than 0.1 (CLS) on both. Few pages meet 500 ms yet, so CI holds a
// ratchet instead: tools/speed/budgets.json has each page's measured numbers, and a page fails when it gets worse than its
// budget by more than the noise tolerance below. `node tools/speed/run.mjs --update` lowers budgets after an improvement and
// never raises one; --reset=<page> re-records a page on purpose (say why in the commit).

export const GOALS = { desktop: { lcp: 500, cls: 0.1 }, mobile: { lcp: 2500, cls: 0.1 } };

/** How much worse than its budget a number may get before CI fails: the larger of abs and rel x budget. Calibrated on
 * repeated runs of every page (README, Rules for every change): each allows well past the run-to-run spread seen.
 * score is reported, never enforced (it is made of the other numbers). */
export const TOLERANCE = {
  fcp: { abs: 150, rel: 0.15 },
  lcp: { abs: 200, rel: 0.15 },
  si: { abs: 300, rel: 0.2 },
  tbt: { abs: 250, rel: 0.6 },
  cls: { abs: 0.03, rel: 0.25 },
  bytes: { abs: 30000, rel: 0.1 },
  requests: { abs: 4, rel: 0.1 },
};
export const ENFORCED = Object.keys(TOLERANCE);

/** The median of the numbers in a list (nulls and non-numbers left out), or null for none. */
export function median(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** The per-metric median of several runs' numbers: [{ lcp, ... }, ...] -> { lcp, ... }, rounded like a run. */
export function medianRun(runs) {
  const keys = [...new Set(runs.flatMap((r) => Object.keys(r || {})))];
  return Object.fromEntries(keys.map((k) => {
    const m = median(runs.map((r) => r && r[k]));
    return [k, m == null ? null : k === 'cls' ? Math.round(m * 1000) / 1000 : Math.round(m)];
  }));
}

/** The most a number may be before it fails: its budget plus the tolerance. */
export function limitOf(metric, budget) {
  const t = TOLERANCE[metric];
  return budget + Math.max(t.abs, Math.abs(budget) * t.rel);
}

/** Whether a number meets its preset's goal (only lcp and cls have one). */
export const meetsGoal = (preset, metric, value) => GOALS[preset]?.[metric] != null && value != null && value <= GOALS[preset][metric];

/** The problems of a run against the budgets. results: { page: { preset: numbers } }; budgets: { page: { preset: numbers } }.
 * A page or preset with no budget is listed as 'missing' (a new page: reported, not failed; --update adds it); a number past its limit is a problem, unless it still
 * meets the goal; so is a number the run could not get when the budget has one. Returns [{ page, preset, metric, value,
 * budget, limit, kind: 'missing' | 'worse' | 'unmeasured' }] in page order. */
export function compare(results, budgets) {
  const out = [];
  for (const page of Object.keys(results).sort()) {
    for (const preset of Object.keys(results[page]).sort()) {
      const got = results[page][preset], want = budgets[page]?.[preset];
      if (!want) { out.push({ page, preset, kind: 'missing' }); continue; }
      if (got && got.error) { out.push({ page, preset, kind: 'unmeasured', metric: 'all', message: got.error }); continue; }
      for (const metric of ENFORCED) {
        const value = got?.[metric], budget = want[metric];
        if (budget == null) continue;
        if (value == null) { out.push({ page, preset, metric, budget, kind: 'unmeasured' }); continue; }
        const limit = limitOf(metric, budget);
        if (value > limit && !meetsGoal(preset, metric, value)) out.push({ page, preset, metric, value, budget, limit, kind: 'worse' });
      }
    }
  }
  return out;
}

/** The lower of a budget and a measured number for one metric (higher for score), never raising the budget. */
function lower(metric, old, now) {
  if (old == null) return now ?? null;
  if (now == null) return old;
  return metric === 'score' ? Math.max(old, now) : Math.min(old, now);
}

/** The budgets after a run: a page or preset with no budget gets the measured numbers, every other number goes down to
 * the measured one when that is lower and never up; pages named in reset take the measured numbers as they are; with
 * pages (the full page list), budgets of pages no longer on the site are dropped. Runs that failed change nothing. */
export function ratchet(budgets, results, { reset = [], pages = null } = {}) {
  const out = {};
  const keep = pages ? new Set(pages) : null;
  for (const page of Object.keys(budgets)) if (!keep || keep.has(page)) out[page] = structuredClone(budgets[page]);
  for (const [page, presets] of Object.entries(results)) {
    if (keep && !keep.has(page)) continue;
    for (const [preset, got] of Object.entries(presets)) {
      if (!got || got.error) continue;
      out[page] ||= {};
      const old = reset.includes(page) ? null : out[page][preset];
      if (!old) { out[page][preset] = { ...got }; continue; }
      const keys = [...new Set([...Object.keys(old), ...Object.keys(got)])];
      out[page][preset] = Object.fromEntries(keys.map((k) => [k, lower(k, old[k], got[k])]));
    }
  }
  return sortPages(out);
}

/** The pages in name order, each preset's numbers in METRICS order. */
export function sortPages(pages, metrics = ['score', 'fcp', 'lcp', 'cls', 'tbt', 'si', 'bytes', 'requests']) {
  const order = (o) => Object.fromEntries([...metrics.filter((k) => k in o), ...Object.keys(o).filter((k) => !metrics.includes(k)).sort()].map((k) => [k, o[k]]));
  return Object.fromEntries(Object.keys(pages).sort().map((p) => [p, Object.fromEntries(Object.keys(pages[p]).sort().map((s) => [s, order(pages[p][s])]))]));
}

/** budgets.json's text: one line per page and preset, so a diff shows which page changed. */
export function formatBudgets(meta, pages) {
  const lines = Object.entries(pages).flatMap(([p, presets]) => Object.entries(presets).map(([s, m]) => `    ${JSON.stringify(p + '|' + s)}: ${JSON.stringify(m)}`));
  return `{\n  "meta": ${JSON.stringify(meta)},\n  "pages": {\n${lines.join(',\n')}\n  }\n}\n`;
}

/** The pages of a budgets.json: { meta, pages: { "page|preset": numbers } } -> { page: { preset: numbers } }. */
export function parseBudgets(json) {
  const out = {};
  for (const [key, m] of Object.entries(json.pages || {})) {
    const i = key.lastIndexOf('|');
    (out[key.slice(0, i)] ||= {})[key.slice(i + 1)] = m;
  }
  return out;
}

/** The run-to-run noise in a set of results, to check the tolerance against (CI's results have every run). For each
 * enforced metric: how many runs there were, how far the worst run was above its page's median (abs, and rel to the
 * median), and how many single runs would have failed a budget set at that median. runs: { page: { preset: [numbers] } }. */
export function spread(runs) {
  const out = {};
  for (const metric of ENFORCED) {
    let n = 0, abs = 0, rel = 0, past = 0;
    for (const presets of Object.values(runs)) for (const [preset, list] of Object.entries(presets)) {
      const med = median(list.map((r) => r && r[metric]));
      if (med == null) continue;
      for (const r of list) {
        const v = r && r[metric];
        if (v == null) continue;
        n++;
        abs = Math.max(abs, v - med);
        if (med > 0) rel = Math.max(rel, (v - med) / med);
        if (v > limitOf(metric, med) && !meetsGoal(preset, metric, v)) past++;
      }
    }
    out[metric] = { runs: n, abs: metric === 'cls' ? Math.round(abs * 1000) / 1000 : Math.round(abs), rel: Math.round(rel * 100) / 100, past };
  }
  return out;
}
