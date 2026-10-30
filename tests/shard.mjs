// Spreading the browser test pages over parallel runs. tests/run.mjs uses these: --shard=i/n picks one of n slices (CI
// runs the slices as parallel jobs) and --jobs=k runs k pages at a time. The slices are balanced by the seconds each page
// took last time (tests/timings.json, written by --record-timings), and every machine computes the same slices from the
// same page list and timings. Pure functions, unit-tested in tests/node/shard.test.mjs.

/** Seconds assumed for a page with no recorded time (a new page). */
export const DEFAULT_SECS = 3;

/** "i/n" (1-based) as { index, count }. Throws for anything else. */
export function parseShard(s) {
  const m = /^(\d+)\/(\d+)$/.exec(String(s || ''));
  const index = m ? Number(m[1]) : 0, count = m ? Number(m[2]) : 0;
  if (!m || count < 1 || index < 1 || index > count) throw new Error(`--shard needs i/n with 1 <= i <= n, got "${s}"`);
  return { index, count };
}

/** The pages split into `count` slices of about equal time: longest page first, each to the slice with the least time so
 * far (the lower slice on a tie). Pages of equal time go in name order, so the split does not depend on the input order.
 * Returns an array of `count` page lists, each sorted by name. */
export function shardPages(pages, count, timings = {}) {
  const secs = (p) => (Number.isFinite(timings[p]) ? timings[p] : DEFAULT_SECS);
  const order = longestFirst(pages, timings);
  const slices = Array.from({ length: count }, () => ({ total: 0, pages: [] }));
  for (const p of order) {
    let best = slices[0];
    for (const s of slices) if (s.total < best.total) best = s;
    best.pages.push(p);
    best.total += secs(p);
  }
  return slices.map((s) => s.pages.sort());
}

/** Calls fn(item) for every item with at most `limit` calls running at once. Resolves the results in item order. */
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/** The timings file's new content: the old times, with this run's times (seconds, one decimal) in place, keys in order. */
export function mergeTimings(old, run) {
  const all = { ...old };
  for (const [p, s] of Object.entries(run)) all[p] = Math.round(s * 10) / 10;
  return Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]]));
}

/** The pages in the order to start them: longest recorded time first (a long page started last would finish last). */
export function longestFirst(pages, timings = {}) {
  const secs = (p) => (Number.isFinite(timings[p]) ? timings[p] : DEFAULT_SECS);
  return [...pages].sort((a, b) => secs(b) - secs(a) || (a < b ? -1 : a > b ? 1 : 0));
}
