/* Slop Tables functions: text. */
import { def, alias } from './registry.js';
import { num, int, str, bool, opt, check, ERR, bail, flat, isErr, matrix, toText, textNum, wildRe, Ref } from './helpers.js';
import { format } from '../fmt/format.js';
const T = { cat: 'Text' };
const o = (min, max, help) => ({ min, max, sc: true, help, ...T });

def('LEN', (c, s) => [...str(s)].length, o(1, 1, 'text|Number of characters'));
def('LOWER', (c, s) => str(s).toLowerCase(), o(1, 1, 'text|Lower case'));
def('UPPER', (c, s) => str(s).toUpperCase(), o(1, 1, 'text|Upper case'));
def('PROPER', (c, s) => str(s).toLowerCase().replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()), o(1, 1, 'text|Capitalise Each Word'));
def('TRIM', (c, s) => str(s).replace(/ +/g, ' ').trim(), o(1, 1, 'text|Remove extra spaces'));
def('CLEAN', (c, s) => str(s).replace(/[\x00-\x1f]/g, ''), o(1, 1));
def('LEFT', (c, s, n) => { n = int(opt(n, 1)); check(n >= 0, ERR.VALUE); return [...str(s)].slice(0, n).join(''); }, o(1, 2, 'text, [count]|First characters'));
def('RIGHT', (c, s, n) => { n = int(opt(n, 1)); check(n >= 0, ERR.VALUE); const a = [...str(s)]; return n ? a.slice(-n).join('') : ''; }, o(1, 2, 'text, [count]|Last characters'));
def('MID', (c, s, st, n) => { st = int(st); n = int(n); check(st >= 1 && n >= 0, ERR.VALUE); return [...str(s)].slice(st - 1, st - 1 + n).join(''); }, o(3, 3, 'text, start, count|Characters from the middle'));
alias('LEFT', 'LEFTB'); alias('RIGHT', 'RIGHTB'); alias('MID', 'MIDB'); alias('LEN', 'LENB');
def('REPT', (c, s, n) => { n = int(n); check(n >= 0, ERR.VALUE); s = str(s); check(s.length * n <= 32767, ERR.VALUE); return s.repeat(n); }, o(2, 2, 'text, times|Repeat text'));
def('EXACT', (c, a, b) => str(a) === str(b), o(2, 2));
def('FIND', (c, f, s, st) => { f = str(f); s = str(s); st = int(opt(st, 1)); check(st >= 1 && st <= s.length + 1, ERR.VALUE); const i = s.indexOf(f, st - 1); if (i < 0) bail(ERR.VALUE); return i + 1; }, o(2, 3, 'find, within, [start]|Position (case-sensitive)'));
def('SEARCH', (c, f, s, st) => {
  f = str(f); s = str(s); st = int(opt(st, 1)); check(st >= 1 && st <= s.length + 1, ERR.VALUE);
  const re = new RegExp(wildRe(f).source.slice(1, -1), 'i');
  const m = re.exec(s.slice(st - 1)); if (!m) bail(ERR.VALUE); return m.index + st;
}, o(2, 3, 'find, within, [start]|Position (wildcards, any case)'));
alias('FIND', 'FINDB'); alias('SEARCH', 'SEARCHB');
def('REPLACE', (c, s, st, n, nw) => { s = str(s); st = int(st); n = int(n); check(st >= 1 && n >= 0, ERR.VALUE); return s.slice(0, st - 1) + str(nw) + s.slice(st - 1 + n); }, o(4, 4, 'text, start, count, new|Replace by position'));
alias('REPLACE', 'REPLACEB');
def('SUBSTITUTE', (c, s, a, b, n) => {
  s = str(s); a = str(a); b = str(b);
  if (!a) return s;
  if (n === undefined || n === null) return s.split(a).join(b);
  n = int(n); check(n >= 1, ERR.VALUE);
  let i = -1; for (let k = 0; k < n; k++) { i = s.indexOf(a, i + 1); if (i < 0) return s; }
  return s.slice(0, i) + b + s.slice(i + a.length);
}, o(3, 4, 'text, old, new, [instance]|Replace text'));
def('CHAR', (c, n) => { n = int(n); check(n >= 1 && n <= 255, ERR.VALUE); return n < 128 ? String.fromCharCode(n) : new TextDecoder('windows-1252').decode(new Uint8Array([n])); }, o(1, 1));
def('CODE', (c, s) => { s = str(s); check(s.length, ERR.VALUE); const ch = s.codePointAt(0); return ch < 128 ? ch : (WIN1252.get(ch) ?? 63); }, o(1, 1));
const WIN1252 = new Map(); { const d = new TextDecoder('windows-1252'); for (let i = 128; i < 256; i++) WIN1252.set(d.decode(new Uint8Array([i])).codePointAt(0), i); }
def('UNICHAR', (c, n) => { n = int(n); check(n >= 1 && n <= 0x10ffff, ERR.VALUE); return String.fromCodePoint(n); }, o(1, 1));
def('UNICODE', (c, s) => { s = str(s); check(s.length, ERR.VALUE); return s.codePointAt(0); }, o(1, 1));
def('T', (c, v) => { v = c.scalar(v); if (isErr(v)) return v; return typeof v === 'string' ? v : ''; }, { min: 1, max: 1, ...T });
def('VALUE', (c, s) => { if (typeof s === 'number') return s; if (s === null) return 0; s = str(s); const n = textNum(s.trim()); if (n === null) bail(ERR.VALUE); return n; }, o(1, 1, 'text|Text to number'));
def('NUMBERVALUE', (c, s, d, g) => {
  s = str(s).replace(/\s/g, ''); d = str(opt(d, '.'))[0] || '.'; g = str(opt(g, ','))[0] || ',';
  let pct = 0; while (s.endsWith('%')) { pct++; s = s.slice(0, -1); }
  s = s.split(g).join(''); if (d !== '.') s = s.replace(d, '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) bail(ERR.VALUE);
  return parseFloat(s) / Math.pow(100, pct);
}, o(1, 3));
def('TEXT', (c, v, f) => { const fm = str(f); if (typeof v === 'string') { const n = textNum(v); if (n !== null) v = n; } if (isErr(v)) return v; return format(v, fm, c.wb.locale).text; }, o(2, 2, 'value, format|Format a number as text'));
def('FIXED', (c, v, d, nc) => { d = int(opt(d, 2)); const code = (bool(opt(nc, false)) ? '0' : '#,##0') + (d > 0 ? '.' + '0'.repeat(d) : ''); const x = num(v); return format(d < 0 ? Math.round(x / 10 ** -d) * 10 ** -d : x, code, c.wb.locale).text; }, o(1, 3));
def('DOLLAR', (c, v, d) => { d = int(opt(d, 2)); const p = '"$"#,##0' + (d > 0 ? '.' + '0'.repeat(d) : ''); return format(num(v), p + ';(' + p + ')', c.wb.locale).text; }, o(1, 2));
const joinAll = (c, args) => { let s = ''; for (const a of args) for (const v of flat(c, a)) { if (isErr(v)) bail(v); s += toText(v); } return s; };
def('CONCAT', (c, ...a) => joinAll(c, a), { min: 1, help: 'text1, …|Join text', ...T });
def('CONCATENATE', (c, ...a) => a.map((x) => str(x)).join(''), { min: 1, sc: true, help: 'text1, …|Join text', ...T });
def('TEXTJOIN', (c, d, ign, ...a) => {
  const ds = flat(c, d).map(toText); ign = bool(ign);
  const parts = []; for (const x of a) for (const v of flat(c, x)) { if (isErr(v)) bail(v); if (ign && (v === null || v === '')) continue; parts.push(toText(v)); }
  let s = ''; parts.forEach((p, i) => { s += (i ? ds[(i - 1) % ds.length] : '') + p; });
  check(s.length <= 32767, ERR.CALC); return s;
}, { min: 3, help: 'delimiter, ignore_empty, text1, …|Join with a delimiter', ...T });
def('JOIN', (c, d, ...a) => { d = str(d); const p = []; for (const x of a) for (const v of flat(c, x)) { if (isErr(v)) bail(v); p.push(toText(v)); } return p.join(d); }, { min: 2, ...T });
function splitBy(s, delims, caseIns) { if (!delims.length) return [s]; const re = new RegExp(delims.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), caseIns ? 'gi' : 'g'); return s.split(re); }
def('SPLIT', (c, s, d, each, rmEmpty) => {
  s = str(s); d = str(d); each = bool(opt(each, true)); rmEmpty = bool(opt(rmEmpty, true));
  let parts = each ? splitBy(s, [...d]) : s.split(d);
  if (rmEmpty) parts = parts.filter((x) => x !== '');
  if (!parts.length) bail(ERR.VALUE);
  return [parts.map((x) => { const n = textNum(x); return n !== null && /^\s*[-+]?[\d.]/.test(x) ? n : x; })];
}, { min: 2, max: 4, sc: [0, 1], help: 'text, delimiter, [split_by_each], [remove_empty]|Split into columns', ...T });
def('TEXTSPLIT', (c, s, cd, rd, ign, mode, pad) => {
  s = str(s); const cds = cd === null || cd === undefined ? [] : flat(c, cd).map(toText).filter(Boolean), rds = rd === null || rd === undefined ? [] : flat(c, rd).map(toText).filter(Boolean);
  ign = bool(opt(ign, false)); const ci = int(opt(mode, 0)) === 1; pad = opt(pad, ERR.NA);
  let rows = rds.length ? splitBy(s, rds, ci) : [s];
  if (ign) rows = rows.filter((x) => x !== '');
  let m = rows.map((r) => { let p = cds.length ? splitBy(r, cds, ci) : [r]; if (ign) p = p.filter((x) => x !== ''); return p; });
  const w = Math.max(...m.map((r) => r.length));
  return m.map((r) => r.concat(new Array(w - r.length).fill(pad)));
}, { min: 2, max: 6, help: 'text, col_delimiter, [row_delimiter]|Split into rows and columns', ...T });
function beforeAfter(after) {
  return (c, s, d, n, mode, mEnd, nf) => {
    s = str(s); const ds = flat(c, d).map(toText); n = int(opt(n, 1)); const ci = int(opt(mode, 0)) === 1;
    if (n === 0) bail(ERR.VALUE);
    const hay = ci ? s.toLowerCase() : s;
    const finds = [];
    for (let i = 0; i <= hay.length; i++) for (const dd of ds) { const q = ci ? dd.toLowerCase() : dd; if (hay.startsWith(q, i)) { finds.push([i, dd.length]); break; } }
    if (bool(opt(mEnd, false))) finds.push([s.length, 0]);
    const hit = n > 0 ? finds[n - 1] : finds[finds.length + n];
    if (!hit) return nf === undefined || nf === null ? ERR.NA : nf;
    return after ? s.slice(hit[0] + hit[1]) : s.slice(0, hit[0]);
  };
}
def('TEXTBEFORE', beforeAfter(false), { min: 2, max: 6, sc: [0], help: 'text, delimiter, [instance]|Text before a delimiter', ...T });
def('TEXTAFTER', beforeAfter(true), { min: 2, max: 6, sc: [0], help: 'text, delimiter, [instance]|Text after a delimiter', ...T });
const rx = (p, flags = '') => { try { return new RegExp(p, flags); } catch (e) { bail(ERR.VALUE); } };
def('REGEXMATCH', (c, s, p) => rx(str(p)).test(str(s)), o(2, 2, 'text, regex|Does the text match?'));
def('REGEXTEST', (c, s, p, ci) => rx(str(p), int(opt(ci, 0)) ? 'i' : '').test(str(s)), o(2, 3));
def('REGEXEXTRACT', (c, s, p, mode, ci) => {
  const re = rx(str(p), (int(opt(ci, 0)) ? 'i' : '') + 'g'); s = str(s); mode = int(opt(mode, 0));
  const all = [...s.matchAll(re)]; if (!all.length) bail(ERR.NA);
  if (mode === 1) return [all.map((m) => m[0])];
  if (mode === 2 || (mode === 0 && all[0].length > 2)) return [all[0].slice(1).map((x) => x ?? '')];
  return all[0].length > 1 ? all[0][1] ?? '' : all[0][0];
}, { min: 2, max: 4, sc: [0, 1], help: 'text, regex|Extract the first match', ...T });
def('REGEXREPLACE', (c, s, p, r, n, ci) => {
  s = str(s); r = str(r).replace(/\\(\d)/g, '$$$1'); n = int(opt(n, 0));
  const re = rx(str(p), (int(opt(ci, 0)) ? 'i' : '') + 'g');
  if (!n) return s.replace(re, r);
  let k = 0; return s.replace(re, (...m) => (++k === n ? m[0].replace(rx(re.source, re.flags.replace('g', '')), r) : m[0]));
}, o(3, 5, 'text, regex, replacement|Replace regex matches'));
def('VALUETOTEXT', (c, v, f) => { v = c.scalar(v); return typeof v === 'string' && int(opt(f, 0)) ? '"' + v + '"' : toText(v); }, { min: 1, max: 2, ...T });
def('ARRAYTOTEXT', (c, a, f) => { const m = matrix(c, a), strict = int(opt(f, 0)); const q = (v) => (strict && typeof v === 'string' ? '"' + v + '"' : toText(v)); return strict ? '{' + m.map((r) => r.map(q).join(',')).join(';') + '}' : m.flat().map(q).join(', '); }, { min: 1, max: 2, ...T });
def('ENCODEURL', (c, s) => encodeURIComponent(str(s)), o(1, 1));
def('ASC', (c, s) => str(s).replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' '), o(1, 1));
def('HYPERLINK', (c, url, label) => (label === undefined || label === null ? str(url) : c.scalar(label)), { min: 1, max: 2, ...T });
export { Ref };
