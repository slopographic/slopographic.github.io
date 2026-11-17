/* Slop Sheets: Excel number formats. Turns a serial number and a format code into the text a cell shows, and tells
 * date formats from number formats. Covers General, 0 and 0.00, grouping, percent, scientific, text (@), literal text
 * in quotes, [colour] blocks (dropped) and [$...] currency symbols (kept), date and time codes (y m d h s, AM/PM, [h] [m] [s] totals) and the
 * built-in ids of the OOXML standard. Not covered: fractions (# ?/?), conditions like [>100], other calendars.
 *   BUILTIN_FORMATS[id] → code     isDateCode(code) → boolean     excelDate(serial) → Date (UTC)
 *   serialOf(date) → serial        formatNumber(value, code) → string                                    */

export const BUILTIN_FORMATS = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'm/d/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss',
  22: 'm/d/yyyy h:mm', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
  45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0', 49: '@',
};

const DAY = 86400000;
/** Excel 1900 system: serial 1 is 1900-01-01; serial 60 is the fake 29 February 1900 and is read as 28 February. */
export function excelDate(serial) {
  const days = Math.floor(serial);
  const base = days < 61 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  return new Date(base + days * DAY + Math.round((serial - days) * 86400) * 1000);
}
/** Serial number of a UTC date (the inverse of excelDate, for dates after 28 February 1900). */
export const serialOf = (d) => (d.getTime() - Date.UTC(1899, 11, 30)) / DAY;

/** The code with quoted text, [blocks] and backslash escapes removed: what is left is the bare pattern. */
const bare = (code) => String(code).replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '');
export function isDateCode(code) {
  if (!code || code === '@') return false;
  const c = bare(code);
  return /[ymdhs]/i.test(c) && !/E[+-]/i.test(c);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n, w = 2) => String(n).padStart(w, '0');
const LETTER_TOKEN = /^\[?(y+|m+|d+|h+|s+)\]?$/i;

/** Date and time text for a serial under a date code. Quoted text stays literal. */
function formatDate(serial, code) {
  const days = Math.floor(serial);
  const secs = Math.round((serial - days) * 86400);
  const d = excelDate(days);
  const hours24 = Math.floor(secs / 3600), mins = Math.floor((secs % 3600) / 60), sec = secs % 60;
  const ampm = /AM\/PM|A\/P/i.test(code);
  // Quoted text is marked so its letters are not read as codes; the marker is dropped on output.
  const marked = code.replace(/"([^"]*)"/g, (_, s) => s.split('').map((ch) => '\u0000' + ch).join(''));
  const toks = marked.match(/\[[^\]]*\]|\\.|AM\/PM|A\/P|y+|m+|d+|h+|s+|\.0+|\u0000.|./gi) || [];
  const letterAt = (i, step) => {
    for (let j = i + step; j >= 0 && j < toks.length; j += step) if (LETTER_TOKEN.test(toks[j])) return toks[j];
    return '';
  };
  // m is minutes when it follows an hour code or comes before a seconds code (h:mm, mm:ss), else months.
  const isMinute = (i) => /^\[?h/i.test(letterAt(i, -1)) || /^\[?s/i.test(letterAt(i, 1));
  let out = '';
  toks.forEach((t, i) => {
    const l = t.toLowerCase();
    if (t[0] === '\u0000') { out += t.slice(1); return; }
    if (t[0] === '\\') { out += t.slice(1); return; }
    if (t[0] === '[') {
      if (/^\[h+\]$/i.test(t)) out += Math.floor(serial * 24 + 1e-9);
      else if (/^\[m+\]$/i.test(t)) out += Math.floor(serial * 1440 + 1e-9);
      else if (/^\[s+\]$/i.test(t)) out += Math.floor(serial * 86400 + 1e-9);
      return;
    }
    if (/^AM\/PM$/i.test(t)) { out += hours24 < 12 ? 'AM' : 'PM'; return; }
    if (/^A\/P$/i.test(t)) { out += hours24 < 12 ? 'A' : 'P'; return; }
    if (/^y+$/.test(l)) { out += l.length <= 2 ? pad(d.getUTCFullYear() % 100) : pad(d.getUTCFullYear(), 4); return; }
    if (/^m+$/.test(l)) {
      if (isMinute(i)) { out += l.length === 1 ? mins : pad(mins); return; }
      const m = d.getUTCMonth();
      out += l.length >= 5 ? MONTHS[m][0] : l.length === 4 ? MONTHS[m] : l.length === 3 ? MONTHS[m].slice(0, 3) : l.length === 2 ? pad(m + 1) : String(m + 1);
      return;
    }
    if (/^d+$/.test(l)) {
      const w = DAYS[d.getUTCDay()];
      out += l.length >= 4 ? w : l.length === 3 ? w.slice(0, 3) : l.length === 2 ? pad(d.getUTCDate()) : String(d.getUTCDate());
      return;
    }
    if (/^h+$/.test(l)) {
      const h = ampm ? (hours24 % 12 || 12) : hours24;
      out += l.length === 1 ? h : pad(h);
      return;
    }
    if (/^s+$/.test(l)) { out += l.length === 1 ? sec : pad(sec); return; }
    if (/^\.0+$/.test(t)) return;
    out += t;
  });
  return out;
}

const NUM_TOKEN = /[0#?]/;
/** Number text for one format code. Uses the first section, the second for negatives, the third for zero. */
function formatNumeric(v, code) {
  const sections = code.split(';');
  let section = sections[0], sign = '';
  if (v < 0 && sections.length > 1) section = sections[1];
  else if (v < 0) sign = '-';
  if (v === 0 && sections.length > 2) section = sections[2];
  // Quoted text is swapped for private-use placeholders, so its digits never read as number codes.
  const quoted = [];
  const lit = section
    .replace(/"([^"]*)"/g, (_, s) => String.fromCharCode(0xe000 + quoted.push(s) - 1))
    .replace(/\[\$([^\]-]*)(?:-[^\]]*)?\]/g, '$1').replace(/\[[^\]]*\]/g, '')
    .replace(/\\(.)/g, '$1').replace(/_./g, ' ').replace(/\*./g, '');
  const unmark = (s) => s.replace(/[-]/g, (ch) => quoted[ch.charCodeAt(0) - 0xe000] ?? '');
  const rev = [...lit].reverse().join('');
  const first = lit.search(NUM_TOKEN);
  if (first < 0) return sign + unmark(lit);
  const last = lit.length - rev.search(NUM_TOKEN) - 1;
  const prefix = unmark(lit.slice(0, first)), suffix = unmark(lit.slice(last + 1));
  const pat = lit.slice(first, last + 1);
  let x = Math.abs(v);
  if (lit.includes('%')) x *= 100;
  const dot = pat.indexOf('.');
  const mantissa = pat.split(/E/i)[0];
  const decimals = mantissa.indexOf('.') < 0 ? 0 : (mantissa.slice(mantissa.indexOf('.') + 1).match(/[0#?]/g) || []).length;
  let body;
  if (/E[+-]/i.test(pat)) {
    const exp = x === 0 ? 0 : Math.floor(Math.log10(x));
    body = (x / Math.pow(10, exp)).toFixed(decimals) + 'E' + (exp < 0 ? '-' : '+') + pad(Math.abs(exp));
  } else {
    const [int, frac] = x.toFixed(decimals).split('.');
    const minInt = (pat.slice(0, dot < 0 ? pat.length : dot).match(/0/g) || []).length;
    let grouped = int.padStart(minInt, '0');
    if (pat.includes(',')) grouped = grouped.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    body = frac !== undefined ? grouped + '.' + frac : grouped;
  }
  return sign + prefix + body + suffix;
}

/** Text a cell shows. Booleans show TRUE or FALSE; General shows whole numbers in full and others to 11 digits. */
export function formatNumber(value, code) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return formatDate(serialOf(value), code && code !== 'General' ? code : 'yyyy-mm-dd');
  const c = !code || code === 'General' ? '' : code;
  if (!c) return Number.isInteger(value) ? String(value) : String(parseFloat(value.toPrecision(11)));
  if (c === '@') return String(value);
  if (isDateCode(c)) return formatDate(value, c.split(';')[0]);
  return formatNumeric(value, c);
}
