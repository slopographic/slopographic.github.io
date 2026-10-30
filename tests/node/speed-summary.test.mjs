// The speed check's markdown summary (tools/speed/summary.mjs): problems first, the goal counts, slowest pages first with
// the distance to the goal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summary, worst, distance, goalCounts, problemLine, spreadTable } from '../../tools/speed/summary.mjs';

const m = (lcp, extra = {}) => ({ score: 90, fcp: 300, lcp, cls: 0.01, tbt: 0, si: 400, bytes: 204800, requests: 10, ...extra });
const results = {
  '': { desktop: m(900), mobile: m(3000) },
  'pdf/': { desktop: m(2500), mobile: m(9000, { cls: 0.2 }) },
  'qr/': { desktop: m(400), mobile: m(1200) },
  'broken/': { desktop: { error: 'NO_LCP' } },
};

test('distance to the goal is signed, in ms or s', () => {
  assert.equal(distance(380, 500), '-120 ms');
  assert.equal(distance(1700, 500), '+1.20 s');
  assert.equal(distance(null, 500), 'n/a');
});

test('the slowest pages come first, failed runs left out', () => {
  assert.deepEqual(worst(results, 'desktop').map((r) => r.page), ['pdf/', '', 'qr/']);
  assert.deepEqual(worst(results, 'desktop', 1).map((r) => r.page), ['pdf/']);
});

test('goal counts: LCP within 500 ms on desktop and 2.5 s on mobile, CLS within 0.1', () => {
  assert.deepEqual(goalCounts(results, 'desktop'), { pages: 3, lcp: 1, cls: 3 });
  assert.deepEqual(goalCounts(results, 'mobile'), { pages: 3, lcp: 1, cls: 2 });
});

test('problems read as one line each', () => {
  assert.match(problemLine({ page: 'new/', preset: 'desktop', kind: 'missing' }), /^\/new\/ \(desktop\): new page, no budget yet \(not a failure\)/);
  assert.equal(problemLine({ page: 'pdf/', preset: 'mobile', kind: 'worse', metric: 'lcp', value: 3100, budget: 2400, limit: 2760 }), '/pdf/ (mobile): lcp 3.10 s, budget 2.40 s (fails past 2.76 s)');
  assert.equal(problemLine({ page: 'pdf/', preset: 'mobile', kind: 'worse', metric: 'bytes', value: 409600, budget: 204800, limit: 225280 }), '/pdf/ (mobile): bytes 400 KB, budget 200 KB (fails past 220 KB)');
});

test('the summary: problems, then each preset with its goal and a table, worst first', () => {
  const text = summary(results, [{ page: 'pdf/', preset: 'mobile', kind: 'worse', metric: 'lcp', value: 9000, budget: 8000, limit: 9200 }], { title: 'Page speed, slice 1 of 2' });
  assert.match(text, /^## Page speed, slice 1 of 2\n/);
  assert.match(text, /\*\*1 problem\*\* on 4 pages/);
  assert.match(text, /### Desktop: LCP goal 500 ms, CLS goal 0\.1/);
  assert.match(text, /1 of 3 pages meet the LCP goal, 3 of 3 the CLS goal/);
  assert.match(text, /### Mobile: LCP goal 2\.50 s/);
  const desktop = text.split('### Desktop')[1].split('### Mobile')[0];
  assert.ok(desktop.indexOf('| /pdf/ | 2.50 s | +2.00 s |') < desktop.indexOf('| / | 900 ms | +400 ms |'));
  assert.match(desktop, /\| \/qr\/ \| 400 ms \| -100 ms \| 300 ms \| 0\.010 \| 0 ms \| 400 ms \| 90 \| 200 KB \| 10 \|/);
  assert.match(summary({ 'a/': { desktop: m(1) } }, []), /All 1 pages are within their budgets/);
});

test('a recording run says so instead of judging, and the noise table lists each metric against its tolerance', () => {
  assert.match(summary(results, [], { recording: true }), /Recording budgets: 4 pages measured, none checked\. Merge the speed-results artifact with node tools\/speed\/run\.mjs --update --from=/);
  const t = spreadTable({ lcp: { runs: 9, abs: 700, rel: 0.24, past: 1 } }, { lcp: { abs: 200, rel: 0.15 } });
  assert.match(t, /\| lcp \| 9 \| 700 ms \| 24% \| 200 ms or 15% \| 1 \|/);
});
