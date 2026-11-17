/* Slop Tables number formats: render a value with a format code → { text, color, align }.
   Locale: { decimal, group, lang } (month/day names come from Intl in that language). */
import { compile, pick } from './parse.js';
import { parts } from '../engine/datetime.js';
import { FErr, numToText } from '../engine/values.js';

const EN = { decimal: '.', group: ',', lang: 'en-US' };
const nameCache = new Map();
function names(lang) {
  let n = nameCache.get(lang);
  if (n) return n;
  const mk = (opt, list) => list.map((d) => { try { return new Intl.DateTimeFormat(lang, { ...opt, timeZone: 'UTC' }).format(d); } catch (e) { return new Intl.DateTimeFormat('en-US', { ...opt, timeZone: 'UTC' }).format(d); } });
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2021, i, 1)));
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2021, 0, 3 + i))); // 3 Jan 2021 = Sunday
  n = { mmm: mk({ month: 'short' }, months).map((s) => s.replace('.', '')), mmmm: mk({ month: 'long' }, months), ddd: mk({ weekday: 'short' }, days).map((s) => s.replace('.', '')), dddd: mk({ weekday: 'long' }, days) };
  nameCache.set(lang, n);
  return n;
}

/** Excel "General": up to 11 characters, scientific for very large/small numbers. */
export function general(v, loc = EN) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  let s;
  if (a >= 1e11 || a < 1e-9) {
    let [m, e] = v.toExponential(5).split('e');
    m = m.replace(/\.?0+$/, '');
    s = m + 'E' + (e[0] === '-' ? '-' : '+') + e.replace(/^[+-]/, '').padStart(2, '0');
  } else {
    const intLen = Math.floor(Math.log10(a)) + 1;
    const decs = Math.max(0, 10 - Math.max(intLen, 1));
    s = (+v.toFixed(Math.min(decs, 20))).toString();
    if (/e/.test(s)) s = numToText(v);
    if (s.replace('-', '').length > 11) s = (+v.toPrecision(10)).toString();
  }
  return loc.decimal !== '.' ? s.replace('.', loc.decimal) : s;
}

export function format(v, code, loc = EN) {
  if (v === null || v === undefined) return { text: '' };
  if (v instanceof FErr) return { text: v.code, err: true };
  if (typeof v === 'boolean') return { text: v ? 'TRUE' : 'FALSE', align: 'center' };
  const c = compile(code);
  if (typeof v === 'string') {
    const p = pick(c, v);
    if (!p) return { text: v };
    return { text: p.sec.toks.map((t) => (t.k === 'text' ? v : t.k === 'lit' ? t.v : '')).join(''), color: p.sec.color };
  }
  if (typeof v !== 'number' || !isFinite(v)) return { text: '#NUM!', err: true };
  const p = pick(c, v);
  const sec = p.sec;
  if (sec.gen && !sec.hasDigits) {
    const g = general(p.abs ? Math.abs(v) : v, loc);
    return { text: sec.toks.map((t) => (t.k === 'gen' ? g : t.k === 'lit' ? t.v : t.k === 'text' ? g : '')).join(''), color: sec.color };
  }
  if (sec.kind === 'date') {
    if (v < 0 || v > 2958465.99999) return { text: '#'.repeat(10), err: true, hash: true };
    return { text: renderDate(v, sec, loc), color: sec.color };
  }
  return { text: renderNum(p.abs ? Math.abs(v) : v, sec, loc, p.abs), color: sec.color };
}

function renderDate(v, sec, loc) {
  const n = names(loc.lang || 'en-US');
  const fdig = Math.max(0, ...sec.toks.filter((t) => t.k === 'date' && t.v === 'f').map((t) => t.n));
  const rv = fdig ? v : Math.round(v * 86400) / 86400; // round to the second unless fractions shown
  const P = parts(rv);
  const pad = (x, w) => String(x).padStart(w, '0');
  const totalSec = rv * 86400;
  let out = '';
  for (const t of sec.toks) {
    if (t.k === 'lit') { out += t.v; continue; }
    if (t.k !== 'date') { if (t.k === 'dot') out += loc.decimal; else if (t.k === 'digit') out += '0'; else if (t.k === 'comma') out += ','; else if (t.k === 'pct') out += '%'; continue; }
    switch (t.v) {
      case 'y': out += t.n <= 2 ? pad(P.y % 100, 2) : String(P.y); break;
      case 'm': out += t.n === 1 ? P.m : t.n === 2 ? pad(P.m, 2) : t.n === 3 ? n.mmm[P.m - 1] : t.n === 5 ? n.mmmm[P.m - 1][0] : n.mmmm[P.m - 1]; break;
      case 'd': out += t.n === 1 ? P.d : t.n === 2 ? pad(P.d, 2) : t.n === 3 ? n.ddd[P.wd] : n.dddd[P.wd]; break;
      case 'h': { let h = P.h; if (sec.ampm) { h = h % 12; if (h === 0) h = 12; } out += t.n >= 2 ? pad(h, 2) : h; break; }
      case 'min': out += t.n >= 2 ? pad(P.mi, 2) : P.mi; break;
      case 's': out += t.n >= 2 ? pad(P.s, 2) : P.s; break;
      case 'f': out += loc.decimal + String(Math.floor((P.ms / 1000) * Math.pow(10, t.n) + 1e-6)).padStart(t.n, '0'); break;
      case 'ampm': out += P.h < 12 ? (t.up ? 'AM' : 'am') : (t.up ? 'PM' : 'pm'); break;
      case 'ap': out += P.h < 12 ? (t.up ? 'A' : 'a') : (t.up ? 'P' : 'p'); break;
      case 'H': out += pad(Math.floor(totalSec / 3600 + 1e-9), t.n); break;
      case 'Mel': out += pad(Math.floor(totalSec / 60 + 1e-9), t.n); break;
      case 'S': out += pad(Math.round(totalSec), t.n); break;
    }
  }
  return out;
}

function renderNum(v, sec, loc, absMode) {
  const neg = v < 0 && !absMode;
  let a = Math.abs(v) * Math.pow(100, sec.pct) / Math.pow(1000, sec.scale);
  const T = sec.toks;
  if (sec.frac) return (neg ? '-' : '') + renderFraction(a, sec, loc);
  let expTxt = '';
  let intT = [], fracT = [], expT = [];
  let mode = 'int';
  for (const t of T) {
    if (t.k === 'dot') mode = 'frac';
    else if (t.k === 'exp') mode = 'exp';
    if (t.k === 'digit') (mode === 'int' ? intT : mode === 'frac' ? fracT : expT).push(t);
  }
  if (sec.exp) {
    let e = 0;
    if (a !== 0) {
      e = Math.floor(Math.log10(a));
      const step = intT.length > 1 && intT.some((t) => t.v === '#') ? intT.length : 1;
      e = step > 1 ? Math.floor(e / step) * step : e - Math.max(0, intT.filter((t) => t.v === '0').length - 1);
      a = a / Math.pow(10, e);
      if (+a.toFixed(fracT.length) >= Math.pow(10, Math.max(1, intT.length))) { a /= 10; e += 1; }
    }
    const es = String(Math.abs(e)).padStart(Math.max(1, expT.filter((t) => t.v === '0').length), '0');
    expTxt = (e < 0 ? '-' : sec.exp.sign ? '+' : '') + es;
  }
  let fixed = a.toFixed(Math.min(fracT.length, 20));
  if (/e/.test(fixed)) fixed = BigInt(Math.round(a)).toString();
  let [ip, fp = ''] = fixed.split('.');
  if (ip === '0') ip = '';
  // decimals: trim optional trailing places
  let fd = fp.split('');
  for (let i = fracT.length - 1; i >= 0; i--) { if (fd[i] === '0' && fracT[i].v !== '0') fd[i] = fracT[i].v === '?' ? ' ' : ''; else break; }
  // integer digits into placeholders
  const P = intT.length;
  const minZeros = intT.filter((t) => t.v === '0').length;
  let intOut;
  if (sec.group) {
    let d = ip.padStart(Math.max(minZeros, 0), '0');
    d = d.replace(/\B(?=(\d{3})+(?!\d))/g, loc.group);
    if (d === '' && intT.some((t) => t.v === '?')) d = ' ';
    intOut = [d];
  } else {
    intOut = [];
    const extra = ip.length - P;
    for (let i = 0; i < P; i++) {
      const di = ip.length - P + i;
      let s = di >= 0 ? ip[di] : intT[i].v === '0' ? '0' : intT[i].v === '?' ? ' ' : '';
      if (i === 0 && extra > 0) s = ip.slice(0, extra + 1);
      intOut.push(s);
    }
  }
  let out = '', ii = 0, fi = 0, ei = 0, m = 'int';
  const anyDigits = intOut.join('') + fd.join('') !== '';
  for (const t of T) {
    if (t.k === 'lit') out += t.v;
    else if (t.k === 'pct') out += '%';
    else if (t.k === 'dot') { m = 'frac'; out += loc.decimal; }
    else if (t.k === 'exp') { m = 'exp'; out += 'E' + expTxt; }
    else if (t.k === 'digit') {
      if (m === 'int') { if (sec.group) { if (ii++ === 0) out += intOut[0]; } else out += intOut[ii++]; }
      else if (m === 'frac') out += fd[fi++] || '';
    } else if (t.k === 'text') out += '';
    else if (t.k === 'gen') out += general(a, loc);
  }
  if (!sec.hasDigits && !sec.gen && P === 0) { /* pure literal section, e.g. "-" for zero */ }
  const showNeg = neg && (anyDigits && /[1-9]/.test(intOut.join('') + fd.join('')) || sec.exp && a !== 0);
  return (showNeg ? '-' : '') + out;
}

function renderFraction(a, sec, loc) {
  const T = sec.toks;
  const si = T.findIndex((t) => t.k === 'slash');
  const before = T.slice(0, si), after = T.slice(si + 1);
  // split "before" into integer part and numerator: numerator = last digit run before slash
  let k = before.length - 1; while (k >= 0 && before[k].k !== 'digit') k--;
  let j = k; while (j >= 0 && before[j].k === 'digit') j--;
  const numT = before.slice(j + 1, k + 1), intPart = before.slice(0, j + 1);
  const hasInt = intPart.some((t) => t.k === 'digit');
  const denT = after.filter((t) => t.k === 'digit');
  const fixedDen = /^\d+$/.test(after.filter((t) => t.k === 'lit' || t.k === 'digit').map((t) => (t.k === 'lit' ? t.v : '')).join('').trim()) ? +after.map((t) => (t.k === 'lit' ? t.v : '')).join('').trim() : 0;
  let whole = hasInt ? Math.floor(a) : 0, f = a - whole, nn, dd;
  if (fixedDen) { dd = fixedDen; nn = Math.round(f * dd); }
  else {
    const maxD = Math.pow(10, Math.max(1, denT.length)) - 1;
    let best = [0, 1, f];
    for (let d = 1; d <= maxD; d++) { const n = Math.round(f * d), e = Math.abs(f - n / d); if (e < best[2] - 1e-12) best = [n, d, e]; if (e === 0) break; }
    [nn, dd] = best;
  }
  if (nn === dd && hasInt) { whole++; nn = 0; }
  const pad = (s, toks) => { const w = toks.length; const q = toks.some((t) => t.v === '?'); return q ? s.padStart(w, ' ') : s; };
  const intStr = hasInt ? (whole ? String(whole) : intPart.some((t) => t.v === '0') ? '0' : '') : '';
  if (nn === 0 && hasInt) return (intStr || '0') + ' '.repeat(numT.length + 1 + denT.length + 1);
  let out = '';
  for (const t of intPart) if (t.k === 'lit') out += t.v; else if (t.k === 'digit' && !out.includes(intStr)) out += intStr;
  out += pad(String(nn), numT) + '/' + (fixedDen ? String(dd) : String(dd).padEnd(denT.length, ' '));
  return out.replace(/^\s+(?=\d)/, (m) => (intStr ? m : m));
}
export { compile };
