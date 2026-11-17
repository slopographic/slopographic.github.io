/* Slop Code, Formatted view: CSV and TSV as an aligned text table. RFC 4180 parsing (quotes, doubled quotes, delimiters
 * and line breaks inside quotes, CRLF). Columns are padded to their widest cell (at most 40 characters, a longer cell ends
 * with an ellipsis), cells are separated by ' │ ', a rule of '─' follows the header row, and a short row is padded. */
import { fail } from './fv-util.js';

const MAX_ROWS = 20000;
const MAX_CELL = 40;
const SEP = ' │ ';

/** Parse into rows of cells. Only the first MAX_ROWS rows are kept; `total` counts all of them. An unterminated quote is { err, at }. */
function parse(text, delim) {
  const rows = [], n = text.length;
  let total = 0, row = [], i = 0;
  const endRow = () => {
    if (row.length > 1 || row[0] !== '') { if (total < MAX_ROWS) rows.push(row); total++; }   // a blank line is not a row
    row = [];
  };
  while (i < n) {
    if (text[i] === '"') {
      let cell = '', j = i + 1;
      for (;;) {
        const q = text.indexOf('"', j);
        if (q < 0) return { err: 'open_quote', at: i };
        cell += text.slice(j, q);
        if (text[q + 1] === '"') { cell += '"'; j = q + 2; } else { j = q + 1; break; }
      }
      let k = j;   // text after the closing quote (not valid CSV) is kept
      while (k < n && text[k] !== delim && text[k] !== '\n') k++;
      row.push(cell + text.slice(j, k));
      i = k;
    } else {
      let k = i;
      while (k < n && text[k] !== delim && text[k] !== '\n') k++;
      row.push(text.slice(i, k));
      i = k;
    }
    if (text[i] === delim) { i++; if (i >= n) row.push(''); } else { endRow(); i++; }   // a delimiter at the very end leaves an empty last cell
  }
  if (row.length) endRow();
  return { rows, total };
}

/** A cell as one line: line breaks and tabs become visible marks or spaces, a long cell is cut with an ellipsis. */
function show(cell) {
  const s = cell.replace(/\n/g, '↵').replace(/\t/g, ' ');
  if (s.length <= MAX_CELL) return s;
  const chars = [...s];   // by character, not by UTF-16 unit, so a pair is never cut in half
  return chars.length <= MAX_CELL ? s : chars.slice(0, MAX_CELL - 1).join('') + '…';
}

/** Format CSV (delim ',') or TSV (delim '\t') as a table. */
export function formatCsv(text, delim) {
  const p = parse(text, delim);
  if (p.err) return fail(text, p.at, p.err);
  if (!p.rows.length) return { ok: true, text: '' };
  const cols = p.rows.reduce((m, r) => Math.max(m, r.length), 1);
  const cells = p.rows.map((r) => Array.from({ length: cols }, (_, c) => show(r[c] || '')));
  const widths = Array.from({ length: cols }, (_, c) => cells.reduce((w, r) => Math.max(w, [...r[c]].length), 0));
  const line = (r) => r.map((s, c) => s + ' '.repeat(widths[c] - [...s].length)).join(SEP).trimEnd();
  const out = cells.map(line);
  out.splice(1, 0, '─'.repeat(widths.reduce((a, w) => a + w, 0) + SEP.length * (cols - 1)));
  if (p.total > MAX_ROWS) out.push('… ' + (p.total - MAX_ROWS) + ' more rows');   // i18n-ignore: the format of this line is fixed
  return { ok: true, text: out.join('\n') };
}
