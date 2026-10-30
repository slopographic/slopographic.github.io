/* Slop Tables: the charts of an imported XLSX file. The shared reader gives each chart's series as cell references
 * (shared/sheets/xlsx-charts.js); a Slop Tables chart reads one block of cells, so a chart is kept when its series are
 * side by side (or one above the other) with their names and categories next to them, as charts made from a selected
 * range are. Others are left out with a note.
 *   importCharts(wb, doc) → notes   (puts the charts on wb.sheets[i].charts) */
import { parseRange, quoteSheet, rangeText } from '../engine/refs.js';
import { newId } from '../objects/store.js';
import { t } from '../i18n.js';

const offset = (sh, r, c) => {
  let x = 0, y = 0;
  for (let j = 0; j < c; j++) x += sh.colW(j);
  for (let i = 0; i < r; i++) y += sh.rowH(i);
  return { x, y };
};
const strip = (f) => (f ? f.replace(/^\(|\)$/g, '').replace(/\$/g, '') : null);
const parse = (f) => (f ? parseRange(strip(f)) : null);

/** Series references → { range, by, header, catCol } or null when they are not one block. */
export function blockOf(series, hostName) {
  const vals = series.map((s) => parse(s.val));
  if (!vals.length || vals.some((v) => !v)) return null;
  const sheet = vals[0].sheet;
  if (vals.some((v) => (v.sheet || '') !== (sheet || ''))) return null;
  const cols = vals.every((v) => v.c1 === v.c2 && v.r1 === vals[0].r1 && v.r2 === vals[0].r2);
  const rows = vals.every((v) => v.r1 === v.r2 && v.c1 === vals[0].c1 && v.c2 === vals[0].c2);
  if (!cols && !rows) return null;
  const by = cols && !(rows && vals.length === 1 && vals[0].c2 > vals[0].c1) ? 'cols' : 'rows';
  const line = (v) => (by === 'cols' ? v.c1 : v.r1), sorted = vals.map(line);
  if (sorted.some((x, i) => i && x !== sorted[i - 1] + 1)) return null;
  const v0 = vals[0], last = vals[vals.length - 1];
  let { r1, c1 } = v0;
  const r2 = by === 'cols' ? v0.r2 : last.r1, c2 = by === 'cols' ? last.c1 : v0.c2;
  const names = series.map((s) => parse(s.name));
  const header = names.every((n, i) => n && (n.sheet || '') === (sheet || '') &&
    (by === 'cols' ? n.r1 === v0.r1 - 1 && n.c1 === vals[i].c1 : n.c1 === v0.c1 - 1 && n.r1 === vals[i].r1));
  const cat = parse(series[0].cat);
  const catCol = !!cat && (cat.sheet || '') === (sheet || '') &&
    (by === 'cols' ? cat.c1 === cat.c2 && cat.c1 === v0.c1 - 1 && cat.r1 === v0.r1 && cat.r2 === v0.r2
      : cat.r1 === cat.r2 && cat.r1 === v0.r1 - 1 && cat.c1 === v0.c1 && cat.c2 === v0.c2);
  if (series[0].cat && !catCol) return null;
  if (header) { if (by === 'cols') r1--; else c1--; }
  if (catCol) { if (by === 'cols') c1--; else r1--; }
  if (r1 < 0 || c1 < 0) return null;
  const prefix = sheet && sheet !== hostName ? quoteSheet(sheet) + '!' : '';
  return { range: prefix + rangeText(r1, c1, r2, c2), by, header, catCol };
}

export function importCharts(wb, doc) {
  const notes = [], other = new Map();
  let shapeless = 0;
  doc.sheets.forEach((s, i) => {
    const sh = wb.sheets[i];
    if (!sh) return;
    for (const ch of s.charts || []) {
      if (!ch.type) { const kind = String(ch.kind || 'chart').replace(/Chart$/, '').replace(/3D/, ' 3-D').toLowerCase(); other.set(kind, (other.get(kind) || 0) + 1); continue; }
      const b = blockOf(ch.series, sh.name);
      if (!b) { shapeless++; continue; }
      const from = ch.from || { r: 0, c: 0, dx: 0, dy: 0 }, to = ch.to || { r: from.r + 15, c: from.c + 6, dx: 0, dy: 0 };
      const a = offset(sh, from.r, from.c), z = offset(sh, to.r, to.c);
      const x = a.x + from.dx, y = a.y + from.dy;
      sh.charts.push({ id: newId(wb, 'c'), type: ch.type, range: b.range, by: b.by, header: b.header, catCol: b.catCol,
        title: ch.title || '', legend: ch.legend !== false, x, y, w: Math.max(120, z.x + to.dx - x), h: Math.max(90, z.y + to.dy - y) });
    }
  });
  for (const [kind, n] of other) notes.push(t('tables.import.chart_kind', { n, kind }));
  if (shapeless) notes.push(t('tables.import.chart_shape', { n: shapeless }));
  return notes;
}
