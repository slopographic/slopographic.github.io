/* Slop Sheets: CSV and TSV. RFC 4180 quoting (doubled quotes, quoted line breaks), a UTF-8 BOM, CRLF, LF or CR
 * line ends, and text that is not UTF-8 read as Latin-1 (windows-1252, the browser's "latin1").
 *   decodeText(bytes) → string          parseDelimited(text, ',' | '\t') → string[][]
 *   sheetFromGrid(name, grid) → sheet    csvBlob(sheet, rowOrder?, delim, { bom }) → Blob (UTF-8, BOM by default)
 * A sheet is { name, rows, text, width, height, fmt, bold }: rows hold typed values (number, string, boolean, Date
 * or null), text holds what each cell shows, fmt maps a cell key to its number format and bold is a set of cell keys.
 * Cell key = row * 16384 + column. Values that look like plain numbers become numbers, so columns sort as numbers. */

export const KEY = (r, c) => r * 16384 + c;

export function decodeText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  const body = u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf ? u8.subarray(3) : u8;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(body); } catch (e) { return new TextDecoder('windows-1252').decode(body); }
}

/** RFC 4180 parser. A trailing line break adds no empty row; an empty line in the middle is a row with one empty field. */
export function parseDelimited(text, delim = ',') {
  const rows = [];
  let row = [], field = '', i = 0, quoted = false, started = false;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    started = true;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { quoted = true; i++; continue; }
    if (ch === delim) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      row.push(field); rows.push(row); row = []; field = ''; started = false;
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch; i++;
  }
  if (started) { row.push(field); rows.push(row); }
  return rows;
}

const PLAIN_NUMBER = /^[+-]?(0|[1-9]\d*)?(\.\d+)?([eE][+-]?\d+)?$/;
/** A CSV field as a typed value: plain numbers (not 007, not 16+ digit IDs) become numbers, blanks become null. */
export function typedField(s) {
  if (s === '') return null;
  if (PLAIN_NUMBER.test(s) && /\d/.test(s) && !/^[+-]?0\d/.test(s) && s.replace(/\D/g, '').length <= 15) return Number(s);
  return s;
}

/** Pads every row to the widest one and wraps the grid as a sheet. */
export function sheetFromGrid(name, grid) {
  const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const height = grid.length;
  const text = grid.map((r) => { const o = r.slice(); while (o.length < width) o.push(''); return o; });
  const rows = text.map((r) => r.map(typedField));
  return { name, rows, text, width, height, fmt: new Map(), bold: new Set() };
}

const needsQuotes = (s, delim) => s.includes(delim) || /["\r\n]/.test(s);
const quote = (s, delim) => (needsQuotes(s, delim) ? '"' + s.replace(/"/g, '""') + '"' : s);

/** CSV or TSV text of a sheet, with rows taken in rowOrder (default: every row, in order). Shows the cell text.
 * bom: a UTF-8 byte-order mark, so Excel reads the file as UTF-8. Off for files that other readers take as plain text. */
export function csvBlob(sheet, rowOrder = null, delim = ',', { bom = true } = {}) {
  const order = rowOrder || Array.from({ length: sheet.height }, (_, i) => i);
  const lines = order.map((r) => sheet.text[r].map((s) => quote(String(s ?? ''), delim)).join(delim));
  const body = lines.join('\r\n') + (lines.length ? '\r\n' : '');
  const type = delim === '\t' ? 'text/tab-separated-values' : 'text/csv';
  return new Blob(bom ? ['\uFEFF', body] : [body], { type: type + ';charset=utf-8' });
}
