/* Slop Sheets: the charts of an .xlsx worksheet, and what else a package holds that the reader leaves out.
 *   readCharts(files, sheetPath) → [{ type, title, legend, series: [{ name, nameText, cat, val }], from, to }]
 *     files: the readZip Map; sheetPath: 'xl/worksheets/sheet1.xml'. type: 'column' | 'bar' | 'line' | 'pie', or null for
 *     a kind of chart a reader cannot map (scatter, radar, …; `kind` names it). name, cat and val are the series' cell
 *     references as written ("Sheet1!$B$1"), nameText a literal series name. from and to: { r, c, dx, dy } (cell and offset
 *     in pixels) of the two-cell anchor.
 *   skippedParts(files, chartSheets) → ['pictures', 'macros', …]: the parts a cells-only reader does not import.
 * Node-safe like xlsx.js (the XML helpers only). */
import { readText } from '../office/zip.js';
import { parseXml, kids, kid, all, attr, textOf, NS } from '../office/xml.js';
/** A word from the shared tables (shared/i18n/ui/<code>/sheets.js), the key without SlopI18n (node tests). */
const tr = (key, vars) => (globalThis.SlopI18n ? globalThis.SlopI18n.t(key, vars) : key);

const XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const EMU_PX = 9525;

/** Resolves a relationship target against the folder of the part that names it. */
export function resolvePart(from, target) {
  if (target.startsWith('/')) return target.slice(1);
  const out = from.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') out.pop();
    else if (seg && seg !== '.') out.push(seg);
  }
  return out.join('/');
}
const relsPath = (part) => { const i = part.lastIndexOf('/'); return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`; };

/** Relationship id → part path, for the part's own .rels file. */
function rels(files, part) {
  const out = new Map(), xml = readText(files, relsPath(part));
  if (xml) for (const r of all(parseXml(xml).documentElement, '*', 'Relationship')) {
    if (attr(r, null, 'TargetMode') === 'External') continue;
    out.set(attr(r, null, 'Id'), resolvePart(part, attr(r, null, 'Target') || ''));
  }
  return out;
}

function marker(el) {
  if (!el) return null;
  const n = (name) => Number(textOf(kid(el, XDR, name)) || 0);
  return { r: n('row'), c: n('col'), dx: Math.round(n('colOff') / EMU_PX), dy: Math.round(n('rowOff') / EMU_PX) };
}

const formulaOf = (el) => { const f = el ? all(el, NS.c, 'f')[0] : null; return f ? textOf(f).trim() : null; };
const KINDS = { barChart: 'bar', bar3DChart: 'bar', lineChart: 'line', line3DChart: 'line', pieChart: 'pie', pie3DChart: 'pie', doughnutChart: 'pie' };

/** One chart part → the chart, or null when it has no plot. */
function readChart(xml) {
  const root = parseXml(xml).documentElement, chart = kid(root, NS.c, 'chart');
  const plot = chart && kid(chart, NS.c, 'plotArea');
  if (!plot) return null;
  const group = kids(plot, NS.c).find((k) => /Chart$/.test(k.localName));
  if (!group) return null;
  let type = KINDS[group.localName] || null;
  if (type === 'bar') type = attr(kid(group, NS.c, 'barDir'), null, 'val') === 'bar' ? 'bar' : 'column';
  const titleEl = kid(chart, NS.c, 'title');
  const title = titleEl ? all(titleEl, NS.a, 't').map(textOf).join('') : '';
  const series = kids(group, NS.c, 'ser').map((ser) => {
    const tx = kid(ser, NS.c, 'tx'), v = tx ? kid(tx, NS.c, 'v') : null;
    return { name: formulaOf(tx), nameText: v ? textOf(v) : null, cat: formulaOf(kid(ser, NS.c, 'cat')), val: formulaOf(kid(ser, NS.c, 'val')) };
  });
  return { type, kind: group.localName, title, legend: !!kid(chart, NS.c, 'legend'), series };
}

export function readCharts(files, sheetPath) {
  const out = [];
  try {
    const sheetRels = rels(files, sheetPath), xml = readText(files, sheetPath);
    if (!xml) return out;
    for (const d of all(parseXml(xml).documentElement, NS.s, 'drawing')) {
      const drawingPath = sheetRels.get(attr(d, NS.r, 'id'));
      const dxml = drawingPath && readText(files, drawingPath);
      if (!dxml) continue;
      const drawRels = rels(files, drawingPath);
      for (const anchor of kids(parseXml(dxml).documentElement, XDR)) {
        const ref = all(anchor, NS.c, 'chart')[0];
        const chartPath = ref && drawRels.get(attr(ref, NS.r, 'id'));
        const cxml = chartPath && readText(files, chartPath);
        if (!cxml) continue;
        const chart = readChart(cxml);
        if (!chart) continue;
        chart.from = marker(kid(anchor, XDR, 'from'));
        chart.to = marker(kid(anchor, XDR, 'to'));
        out.push(chart);
      }
    }
  } catch (e) { /* a damaged drawing loses its charts, never the cells */ }
  return out;
}

/** What the package holds that a reader of cells does not import, as plain words for a notice (in the chosen language). */
export function skippedParts(files, chartSheets = false) {
  const names = [...files.keys()], out = [];
  const has = (re) => names.some((n) => re.test(n));
  if (has(/^xl\/media\//)) out.push(tr('ui.sheets.part_pictures'));
  if (chartSheets) out.push(tr('ui.sheets.part_chart_sheets'));
  if (has(/^xl\/pivotTables\//)) out.push(tr('ui.sheets.part_pivots'));
  if (has(/^xl\/(comments|threadedComments)/)) out.push(tr('ui.sheets.part_comments'));
  if (has(/^xl\/vbaProject\.bin$/)) out.push(tr('ui.sheets.part_macros'));
  const sheetXml = names.filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).map((n) => readText(files, n) || '');
  if (sheetXml.some((x) => x.includes('<conditionalFormatting'))) out.push(tr('ui.sheets.part_cond'));
  if (sheetXml.some((x) => x.includes('<dataValidations'))) out.push(tr('ui.sheets.part_validation'));
  if (sheetXml.some((x) => x.includes('<autoFilter'))) out.push(tr('ui.sheets.part_filters'));
  return out;
}
