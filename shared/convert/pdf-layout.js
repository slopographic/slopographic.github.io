/* Text layout for the PDF to Word and PDF to Excel converters. A page's text items (one per show operation, pdf-text-items.js;
 * getTextContent as a fallback) become lines
 * (same baseline), each line becomes cells (a gap wider than a fifth of the text height starts a new cell), and runs of
 * lines with the same cell starts become tables. Text only: a page with no text layer (a scan) has no lines.
 * gridOf(lines) → [[string]] one row per line, one column per cell start of the page.
 * readPages(bytes, spec, { textContent }) → [{ pageNo, w, h, lines: [{ y, cells: [{ x, text }] }] }]   browser only (pdf.js via convert/)
 * blocksOf(lines) → [{ type: 'para', text } | { type: 'table', rows: [[string]] }] in reading order. Classic ES module. */
import { openPdf, pdfjs } from '../../convert/js/core/pdf-raster.js';
import { parseRange } from '../../convert/js/core/range.js';
import { opItems } from './pdf-text-items.js';

const SAME_LINE = 0.5;   // baselines closer than half a text height are one line
const CELL_GAP = 0.2;    // a horizontal gap of a fifth of the text height ends a cell
const SAME_COL = 4;      // cell starts within 4 pt count as one column
const PARA_GAP = 1.6;    // a vertical gap over 1.6 text heights starts a new paragraph

/** Text items of one page → lines of cells, top of the page first. Items with no visible text are skipped. */
export function linesOf(items) {
  const bits = items.filter((it) => typeof it.str === 'string' && it.str.length && it.transform)
    .map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.height) || Math.abs(it.transform[3]) || 10, s: it.str }));
  bits.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const b of bits) {
    const cur = lines[lines.length - 1];
    if (cur && Math.abs(cur.y - b.y) < SAME_LINE * Math.max(cur.h, b.h)) cur.items.push(b);
    else lines.push({ y: b.y, h: b.h, items: [b] });
  }
  return lines.map((ln) => {
    ln.items.sort((a, b) => a.x - b.x);
    const cells = [];
    let cell = null, prev = null;
    for (const it of ln.items) {
      const gap = prev ? it.x - (prev.x + prev.w) : 0;
      if (!cell || gap > CELL_GAP * ln.h) { cell = { x: it.x, text: '' }; cells.push(cell); }
      else if (gap > 0.05 * ln.h && !cell.text.endsWith(' ') && !it.s.startsWith(' ')) cell.text += ' ';
      cell.text += it.s;
      prev = it;
    }
    cells.forEach((c) => { c.text = c.text.replace(/\s+/g, ' ').trim(); });
    return { y: ln.y, h: ln.h, cells: cells.filter((c) => c.text) };
  }).filter((ln) => ln.cells.length);
}

/** Lines → blocks. Consecutive lines with two or more cells and the same column starts form a table; other lines are
 * paragraphs, joined while the vertical gap stays small. */
export function blocksOf(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const first = lines[i];
    if (first.cells.length >= 2) {
      let j = i + 1;
      while (j < lines.length && lines[j].cells.length >= 2 && sameColumns(first.cells, lines[j].cells)) j++;
      if (j - i >= 2) {
        const cols = first.cells.length;
        out.push({ type: 'table', rows: lines.slice(i, j).map((ln) => Array.from({ length: cols }, (_, k) => (ln.cells[k] ? ln.cells[k].text : ''))) });
        i = j;
        continue;
      }
    }
    // a paragraph: a line of one cell, then the single-cell lines that follow it closely
    let j = i + 1, para = paraText(first.cells), prev = first;
    if (first.cells.length === 1) {
      while (j < lines.length && lines[j].cells.length === 1 && prev.y - lines[j].y <= PARA_GAP * Math.max(prev.h, lines[j].h)) {
        para += ' ' + lines[j].cells[0].text;
        prev = lines[j]; j++;
      }
    }
    out.push({ type: 'para', text: para });
    i = j;
  }
  return out;
}

/** Cells of one line as text: a single cell as is, several cells two spaces apart. */
export function paraText(cells) { return cells.map((c) => c.text).join(cells.length > 1 ? '  ' : ' '); }

function sameColumns(a, b) {
  if (a.length !== b.length) return false;
  return a.every((c, k) => Math.abs(c.x - b[k].x) <= SAME_COL);
}

/** Lines → rows of a grid: each cell goes to the column its start falls in (columns are the cell starts of the page,
 * clustered within 4 pt). A row is an array of strings, as wide as the page's columns. */
export function gridOf(lines) {
  const xs = lines.flatMap((ln) => ln.cells.map((c) => c.x)).sort((a, b) => a - b);
  const starts = [];
  for (const x of xs) if (!starts.length || x - starts[starts.length - 1] > SAME_COL) starts.push(x);
  return lines.map((ln) => {
    const row = Array.from({ length: starts.length }, () => '');
    for (const c of ln.cells) {
      const k = starts.findIndex((s, i) => c.x >= s - SAME_COL && (i === starts.length - 1 || c.x < starts[i + 1] - SAME_COL));
      row[k < 0 ? 0 : k] = row[k < 0 ? 0 : k] ? row[k < 0 ? 0 : k] + ' ' + c.text : c.text;
    }
    return row;
  });
}

/** Reads the requested pages (1-based spec, blank for all) into lines. w and h are the page size in points. Items come from
 * the page's operator list (pdf-text-items.js), so cells drawn as separate show operations stay apart. If the operator list
 * is unavailable, or textContent is set, pdf.js getTextContent is used instead, which joins text on one baseline. */
export async function readPages(bytes, spec = '', { textContent = false } = {}) {
  const pdf = await openPdf(bytes);
  const OPS = textContent ? null : (await pdfjs()).OPS;
  try {
    const out = [];
    for (const n of parseRange(spec, pdf.numPages)) {
      const page = await pdf.getPage(n), vp = page.getViewport({ scale: 1 });
      let items = null;
      if (OPS) { try { items = await opItems(page, OPS); } catch (e) { items = null; } }
      if (!items) items = (await page.getTextContent()).items;
      out.push({ pageNo: n, w: vp.width, h: vp.height, lines: linesOf(items) });
    }
    return out;
  } finally {
    await pdf.destroy();
  }
}
