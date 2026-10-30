/* Slop Tables objects in the .stab file: the charts and pivot tables of each sheet. No DOM.
 *   encodeObjects(sheet) → { charts?, pivots? }   plain copies for the JSON
 *   checkObjects(so, where, damaged)             throws damaged(what) when a sheet's lists are malformed
 *   decodeObjects(sheet, so)                      puts the lists on the sheet
 * Charts and pivot tables are optional in the file, so files written before them still open. */
import { TYPES } from './chart-data.js';
import { FNS } from './pivot.js';
import { MAX_ROWS, MAX_COLS } from '../engine/refs.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v, max = 512) => typeof v === 'string' && v.length <= max;
const isNum = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v < hi;
const CHART_TYPES = TYPES.map(([t]) => t), FN_IDS = FNS.map(([f]) => f);
export const MAX_OBJECTS = 200;

const chartCopy = (c) => ({ id: c.id, type: c.type, range: c.range, by: c.by === 'rows' ? 'rows' : 'cols', title: c.title || '', legend: c.legend !== false,
  x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h),
  ...(typeof c.header === 'boolean' ? { header: c.header } : {}), ...(typeof c.catCol === 'boolean' ? { catCol: c.catCol } : {}) });
const pivotCopy = (p) => ({ id: p.id, source: { sheet: p.source.sheet || null, ref: p.source.ref }, rows: [...p.rows], cols: [...p.cols],
  values: p.values.map((v) => ({ field: v.field, fn: v.fn })), at: { r: p.at.r, c: p.at.c }, extent: p.extent ? { rows: p.extent.rows, cols: p.extent.cols } : null });

export function encodeObjects(sh) {
  const out = {};
  if (sh.charts && sh.charts.length) out.charts = sh.charts.map(chartCopy);
  if (sh.pivots && sh.pivots.length) out.pivots = sh.pivots.map(pivotCopy);
  return out;
}

function checkChart(c) {
  return isObj(c) && isStr(c.id, 64) && CHART_TYPES.includes(c.type) && isStr(c.range) && (c.by === undefined || c.by === 'cols' || c.by === 'rows') &&
    (c.title === undefined || isStr(c.title)) && [c.legend, c.header, c.catCol].every((b) => b === undefined || typeof b === 'boolean') &&
    isNum(c.x, 0, 1e8) && isNum(c.y, 0, 1e9) && isNum(c.w, 40, 1e5) && isNum(c.h, 40, 1e5);
}
const fieldList = (l) => Array.isArray(l) && l.length <= 8 && l.every((f) => isStr(f, 256));
function checkPivot(p) {
  return isObj(p) && isStr(p.id, 64) && isObj(p.source) && isStr(p.source.ref) && (p.source.sheet === null || p.source.sheet === undefined || isStr(p.source.sheet, 64)) &&
    fieldList(p.rows) && fieldList(p.cols) && Array.isArray(p.values) && p.values.length <= 8 &&
    p.values.every((v) => isObj(v) && isStr(v.field, 256) && FN_IDS.includes(v.fn)) &&
    isObj(p.at) && isInt(p.at.r, 0, MAX_ROWS) && isInt(p.at.c, 0, MAX_COLS) &&
    (p.extent === null || p.extent === undefined || (isObj(p.extent) && isInt(p.extent.rows, 1, MAX_ROWS) && isInt(p.extent.cols, 1, MAX_COLS)));
}

export function checkObjects(so, where, damaged) {
  if (so.charts !== undefined && (!Array.isArray(so.charts) || so.charts.length > MAX_OBJECTS || !so.charts.every(checkChart))) throw damaged(where + ' charts');
  if (so.pivots !== undefined && (!Array.isArray(so.pivots) || so.pivots.length > MAX_OBJECTS || !so.pivots.every(checkPivot))) throw damaged(where + ' pivot tables');
}

export function decodeObjects(sh, so) {
  sh.charts = (so.charts || []).map(chartCopy);
  sh.pivots = (so.pivots || []).map(pivotCopy);
}

let seq = 0;
/** A new object id, unique in this workbook. */
export function newId(wb, prefix) {
  const used = new Set(wb.sheets.flatMap((s) => [...(s.charts || []), ...(s.pivots || [])].map((o) => o.id)));
  let id;
  do id = prefix + (++seq).toString(36) + Math.random().toString(36).slice(2, 6); while (used.has(id));
  return id;
}
