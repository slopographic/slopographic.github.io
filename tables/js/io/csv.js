/* CSV: export shows each cell as displayed (number formats applied), like Excel's "CSV" save.
   Import reads RFC 4180 text and types each field the way typing it would. */
import { format } from '../engine/index.js';

const quote = (s) => (/[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);

/** Sheet → CSV text, from A1 to the last used row and column. */
export function toCsv(sh) {
  const used = sh.usedRange(false);
  if (!used) return '';
  const lines = [];
  for (let r = 0; r <= used.r2; r++) {
    const cells = [];
    for (let c = 0; c <= used.c2; c++) {
      const v = sh.value(r, c), cell = sh.get(r, c);
      const nf = (cell && ((sh.wb.style(cell.s).nf) || cell.fh)) || undefined;
      cells.push(quote(v === null || v === undefined ? '' : format(v, nf).text));
    }
    lines.push(cells.join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/** CSV or TSV text → rows of strings. */
export function parseCsv(text, delim = ',') {
  const rows = [];
  let row = [], field = '', i = 0, q = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { q = true; i++; continue; }
    if (ch === delim) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1; continue;
    }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
