// Slop Tables: charts and pivot tables as plain logic (no browser): series from a range, the SVG picture, the pivot
// summary with sum, count, average, min and max, writing and refreshing it in a sheet, and the .stab round trip.
// Run: node --test tests/node/tables-objects.test.mjs
// Covers: tables/js/objects/region.js, tables/js/objects/chart-data.js, tables/js/objects/chart-svg.js,
// tables/js/objects/pivot.js, tables/js/objects/pivot-write.js, tables/js/objects/store.js, tables/js/io/native.js
import './tables-i18n-en.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Workbook } from '../../tables/js/engine/index.js';
import { seriesFrom, chartData } from '../../tables/js/objects/chart-data.js';
import { chartSvg, niceScale, shortNum, DARK } from '../../tables/js/objects/chart-svg.js';
import { pivotGrid, fieldNames } from '../../tables/js/objects/pivot.js';
import { writePivot, readSource, overlaps, pivotAt } from '../../tables/js/objects/pivot-write.js';
import { currentRegion, resolveRange } from '../../tables/js/objects/region.js';
import { toNative, fromNative, checkNative } from '../../tables/js/io/native.js';

const cellsOf = (rows) => rows.map((row) => row.map((v) => ({ v, t: v === null ? '' : String(v) })));
function book(rows, name = 'Data') {
  const wb = new Workbook({ sheets: 0 }), sh = wb.addSheet(name);
  rows.forEach((row, r) => row.forEach((v, c) => { if (v !== null) wb.input(sh, r, c, String(v)); }));
  return { wb, sh };
}
const SALES = [
  ['Region', 'Quarter', 'Rep', 'Sales'],
  ['North', 'Q1', 'Ann', 100], ['North', 'Q2', 'Ann', 150], ['South', 'Q1', 'Bo', 80],
  ['South', 'Q2', 'Bo', 120], ['North', 'Q1', 'Cy', 50], ['East', 'Q2', 'Di', ''],
];

test('series from columns: header row and category column are found', () => {
  const d = seriesFrom(cellsOf([[null, 'Sales', 'Cost'], ['Jan', 10, 4], ['Feb', 12, 5]]));
  assert.equal(d.header, true); assert.equal(d.catCol, true);
  assert.deepEqual(d.cats, ['Jan', 'Feb']);
  assert.deepEqual(d.series.map((s) => [s.name, s.values]), [['Sales', [10, 12]], ['Cost', [4, 5]]]);
});
test('series without labels are numbered; text in a value cell is a gap', () => {
  const d = seriesFrom(cellsOf([[1, 2], [3, 'x']]));
  assert.equal(d.header, false); assert.equal(d.catCol, false);
  assert.deepEqual(d.cats, ['1', '2']);
  assert.deepEqual(d.series[1].values, [2, null]);
  assert.equal(d.series[0].name, 'Series 1');
});
test('chartData reads live values, by columns and by rows', () => {
  const { wb, sh } = book([['', 'A', 'B'], ['x', 1, 2], ['y', 3, '=B2*10']]);
  const chart = { range: 'A1:C3', by: 'cols' };
  let d = chartData(wb, sh, chart);
  assert.deepEqual(d.series.map((s) => s.values), [[1, 3], [2, 10]]);
  assert.deepEqual(d.refs.cats, { r1: 1, c1: 0, r2: 2, c2: 0 });
  assert.deepEqual(d.refs.series[1].name, { r: 0, c: 2 });
  wb.input(sh, 1, 1, '5');
  d = chartData(wb, sh, chart);
  assert.deepEqual(d.series.map((s) => s.values), [[5, 3], [2, 50]], 'the formula result follows the edit');
  d = chartData(wb, sh, { range: 'A1:C3', by: 'rows' });
  assert.deepEqual(d.cats, ['A', 'B']);
  assert.deepEqual(d.series.map((s) => s.name), ['x', 'y']);
  assert.deepEqual(d.refs.series[0].vals, { r1: 1, c1: 1, r2: 1, c2: 2 });
  assert.match(chartData(wb, sh, { range: 'Nope!A1:B2' }).error, /no sheet/);
  assert.match(chartData(wb, sh, { range: 'A1:A3' }).error, /no numbers/);
});
test('the SVG has a mark per value with a hover title, a legend for two series, and the title', () => {
  const data = { cats: ['Jan', 'Feb'], series: [{ name: 'Sales', values: [10, 12] }, { name: 'Cost', values: [4, -5] }] };
  for (const type of ['column', 'bar', 'line']) {
    const svg = chartSvg(data, { type, title: 'Q & A', w: 400, h: 260 });
    assert.match(svg, /^<svg[^>]+viewBox="0 0 400 260"/);
    assert.equal((svg.match(/class="mark"/g) || []).length, 4, type);
    assert.match(svg, /<title>Feb · Cost: -5<\/title>/);
    assert.match(svg, /Q &amp; A/);
    assert.match(svg, /class="legend"/);
  }
  const pie = chartSvg({ cats: ['a', 'b', 'c'], series: [{ name: 'S', values: [1, 1, 2] }] }, { type: 'pie', theme: DARK });
  assert.equal((pie.match(/class="mark"/g) || []).length, 3);
  assert.match(pie, /c 50%/);
  assert.match(pie, new RegExp(DARK.palette[0]));
  assert.match(chartSvg({ error: 'There are no numbers' }, {}), /There are no numbers/);
  assert.doesNotMatch(chartSvg({ cats: ['a'], series: [{ name: 'S', values: [3] }] }, { type: 'column' }), /class="legend"/, 'one series needs no legend');
});
test('axis scale and short numbers', () => {
  assert.deepEqual(niceScale(0, 93, 5), { lo: 0, hi: 100, step: 20 });
  assert.deepEqual(niceScale(-7, 12, 4), { lo: -10, hi: 15, step: 5 });
  assert.equal(shortNum(25000), '25k'); assert.equal(shortNum(1500000), '1.5M'); assert.equal(shortNum(0.125), '0.13');
});

test('pivot: rows by Region, columns by Quarter, Sum of Sales, with totals', () => {
  const [head, ...recs] = SALES;
  const g = pivotGrid(fieldNames(head), recs.map((r) => r.map((v) => (v === '' ? null : v))), { rows: ['Region'], cols: ['Quarter'], values: [{ field: 'Sales', fn: 'sum' }] });
  const v = g.cells.map((row) => row.map((c) => c.v));
  assert.deepEqual(v, [
    ['Region', 'Q1', 'Q2', 'Total'],
    ['East', null, null, null],
    ['North', 150, 150, 300],
    ['South', 80, 120, 200],
    ['Grand total', 230, 270, 500],
  ]);
  assert.equal(g.cells[0][0].b, true);
});
// The pivot's own labels (Sum of, Total, Grand total, (blank)) were English in every language; they follow the language
// the pivot is built in, as a spreadsheet's do.
test('pivot: in Swedish the labels it writes are Swedish', () => {
  const sv = {}, win = { SlopI18n: { add: (code, d) => Object.assign(sv, d) } };
  new Function('window', readFileSync(new URL('../../tables/i18n/sv/objects.js', import.meta.url), 'utf8'))(win);
  const was = globalThis.SlopI18n.t;
  globalThis.SlopI18n.t = (key, vars) => (sv[key] ? sv[key].replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m)) : was(key, vars));
  try {
    const [head, ...recs] = SALES;
    const g = pivotGrid(fieldNames(head), recs.map((r) => r.map((v) => (v === '' ? null : v))), { rows: ['Rep'], cols: [], values: [{ field: 'Sales', fn: 'sum' }, { field: 'Sales', fn: 'count' }] });
    const v = g.cells.map((row) => row.map((c) => c.v));
    assert.deepEqual(v[0], ['Rep', 'Summa av Sales', 'Antal av Sales']);
    assert.equal(v[v.length - 1][0], 'Totalsumma');
    const blank = pivotGrid(['A', 'B'], [[null, 1]], { rows: ['A'], cols: [], values: [{ field: 'B', fn: 'sum' }] });
    assert.equal(blank.cells[1][0].v, '(tom)');
  } finally { globalThis.SlopI18n.t = was; }
});
test('pivot: count, average, min and max, no column fields, two row fields', () => {
  const [head, ...recs] = SALES;
  const h = fieldNames(head), data = recs.map((r) => r.map((v) => (v === '' ? null : v)));
  const g = pivotGrid(h, data, { rows: ['Region'], cols: [], values: ['count', 'average', 'min', 'max'].map((fn) => ({ field: 'Sales', fn })) });
  const v = g.cells.map((row) => row.map((c) => c.v));
  assert.deepEqual(v[0], ['Region', 'Count of Sales', 'Average of Sales', 'Min of Sales', 'Max of Sales']);
  assert.deepEqual(v[2], ['North', 3, 100, 50, 150]);
  assert.deepEqual(v[4], ['Grand total', 5, 100, 50, 150]);
  const two = pivotGrid(h, data, { rows: ['Region', 'Rep'], cols: [], values: [{ field: 'Sales', fn: 'sum' }] });
  assert.deepEqual(two.cells[2].map((c) => c.v), ['North', 'Ann', 250]);
  assert.equal(two.keyCols, 2);
  const none = pivotGrid(h, data, { rows: [], cols: ['Quarter'], values: [{ field: 'Rep', fn: 'count' }] });
  assert.deepEqual(none.cells.map((row) => row.map((c) => c.v)), [['', 'Q1', 'Q2', 'Total'], ['Total', 3, 3, 6]]);
  assert.throws(() => pivotGrid(h, data, { rows: ['Nope'], values: [] }), /no column named/);
  assert.deepEqual(fieldNames(['A', 'a', null]), ['A', 'a (2)', 'Column 3']);
});
test('pivot in a sheet: write, refresh after an edit, overlap check, and the .stab round trip', () => {
  const { wb, sh } = book(SALES);
  sh.cells.get(1 * 16384 + 3).s = wb.styleId({ nf: '"$"#,##0.00' });
  const out = wb.addSheet('Pivot');
  const pv = { id: 'p1', source: { sheet: 'Data', ref: 'A1:D7' }, rows: ['Region'], cols: [], values: [{ field: 'Sales', fn: 'sum' }], at: { r: 0, c: 0 }, extent: null };
  out.pivots.push(pv);
  writePivot(wb, out, pv);
  assert.deepEqual(pv.extent, { rows: 5, cols: 2 });
  assert.equal(out.value(2, 1), 300);
  assert.equal(wb.style(out.get(2, 1).s).nf, '"$"#,##0.00', 'the source number format');
  assert.equal(wb.style(out.get(0, 0).s).b, true);
  assert.equal(pivotAt(out, 4, 1), pv);
  wb.input(sh, 7, 0, 'West'); wb.input(sh, 7, 3, '9');
  pv.source.ref = 'A1:D8';
  writePivot(wb, out, pv);
  assert.equal(out.value(4, 0), 'West');
  assert.equal(out.value(5, 1), 509);
  assert.equal(overlaps(out, pv, { r: 0, c: 0 }, { rows: 6, cols: 2 }), false, 'its own cells do not count');
  wb.input(out, 0, 5, 'x');
  assert.equal(overlaps(out, pv, { r: 0, c: 4 }, { rows: 3, cols: 3 }), true);
  out.charts.push({ id: 'c1', type: 'pie', range: 'A1:B5', by: 'cols', title: 'Share', legend: true, x: 300, y: 20, w: 400, h: 260 });
  const back = fromNative(JSON.parse(JSON.stringify(toNative(wb))));
  const o2 = back.sheetByName('Pivot');
  assert.deepEqual(o2.pivots[0].rows, ['Region']);
  assert.equal(o2.charts[0].title, 'Share');
  assert.equal(chartData(back, o2, o2.charts[0]).series[0].values[1], 300);
  assert.throws(() => checkNative({ ...toNative(wb), sheets: [{ name: 'x', charts: [{ id: 'c', type: 'radar' }] }] }), /charts/);
  assert.throws(() => checkNative({ ...toNative(wb), sheets: [{ name: 'x', pivots: [{ id: 'p' }] }] }), /pivot/);
  assert.throws(() => readSource(wb, out, { sheet: 'Gone', ref: 'A1:B2' }), /no sheet/);
});
test('current region and range resolution', () => {
  const { wb, sh } = book([['a', 'b', null, 'z'], [1, 2, null, null], [null, 3, null, null]]);
  assert.deepEqual(currentRegion(sh, 1, 0), { r1: 0, c1: 0, r2: 2, c2: 1 });
  assert.deepEqual(currentRegion(sh, 0, 3), { r1: 0, c1: 3, r2: 0, c2: 3 });
  const r = resolveRange(wb, sh, 'A:B');
  assert.deepEqual([r.r1, r.c1, r.r2, r.c2], [0, 0, 2, 1]);
  assert.match(resolveRange(wb, sh, 'hello').error, /not a range/);
});
