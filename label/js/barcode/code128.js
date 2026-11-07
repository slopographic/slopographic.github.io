/* SlopLabel — barcode/code128: native Code 128 / GS1-128 encoder (auto subset) and data validation. */
'use strict';

/* ---------------- Code 128 ---------------- */
const C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
  '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
  '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
  '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
  '114131 311141 411131 211412 211214 211232 2331112').split(' ');
const C128_FNC1 = 102, C128_START = { A: 103, B: 104, C: 105 }, C128_TO = { A: 101, B: 100, C: 99 }, C128_SHIFT = 98;
/** Encode text to Code 128 symbol values (start … check stop) with automatic A/B/C subset switching.
 *  `\x1d` in gs1 mode (and a leading FNC1 flag) emits FNC1. */
function code128Encode(text, { gs1 = false } = {}) {
  const s = String(text);
  for (const ch of s) { const c = ch.charCodeAt(0); if (c > 127) throw new Error(`Character "${ch}" cannot be encoded in Code 128 (ASCII only)`); }
  if (!s.length && !gs1) throw new Error('Code 128 data is empty');
  const isFn = (i) => gs1 && s[i] === '\x1d';
  const digitRun = (i) => { let n = 0; while (i + n < s.length && s.charCodeAt(i + n) >= 48 && s.charCodeAt(i + n) <= 57) n++; return n; };
  const inA = (c) => c < 96, inB = (c) => c >= 32 && c < 128;
  const valA = (c) => (c < 32 ? c + 64 : c - 32), valB = (c) => c - 32;
  // which of A/B suits the upcoming chars best (first char that is exclusive decides)
  const preferAB = (i) => { for (let k = i; k < s.length; k++) { const c = s.charCodeAt(k); if (isFn(k)) continue; if (c < 32) return 'A'; if (c >= 96) return 'B'; } return 'B'; };
  const out = [];
  let set;
  const r0 = digitRun(0);
  if (gs1 || r0 >= 4 || (r0 === s.length && r0 >= 2 && r0 % 2 === 0)) set = r0 >= 2 || gs1 && r0 >= 2 ? 'C' : preferAB(0);
  else set = preferAB(0);
  if (gs1 && r0 < 2) set = preferAB(0);
  out.push(C128_START[set]);
  if (gs1) out.push(C128_FNC1);
  let i = 0;
  while (i < s.length) {
    if (isFn(i)) { out.push(C128_FNC1); i++; continue; }
    const run = digitRun(i);
    if (set === 'C') {
      if (run >= 2) { out.push(+s.substr(i, 2)); i += 2; continue; }
      set = preferAB(i); out.push(C128_TO[set]); continue;
    }
    // in A or B: switch to C for long digit runs (≥4 at the end, ≥6 in the middle, or ≥4 when even)
    const atEnd = i + run === s.length || isFn(i + run);
    if (run >= 4 && (atEnd || run >= 6 || run % 2 === 0)) {
      if (run % 2) { const c = s.charCodeAt(i); out.push(set === 'A' ? valA(c) : valB(c)); i++; }
      set = 'C'; out.push(C128_TO.C); continue;
    }
    const c = s.charCodeAt(i);
    if (set === 'A' && !inA(c)) {
      // a single B char → shift, otherwise switch
      const nx = i + 1 < s.length ? s.charCodeAt(i + 1) : -1;
      if (nx >= 0 && nx < 32) { out.push(C128_SHIFT, valB(c)); i++; continue; }
      set = 'B'; out.push(C128_TO.B); continue;
    }
    if (set === 'B' && !inB(c)) {
      const nx = i + 1 < s.length ? s.charCodeAt(i + 1) : -1;
      if (nx >= 96) { out.push(C128_SHIFT, valA(c)); i++; continue; }
      set = 'A'; out.push(C128_TO.A); continue;
    }
    out.push(set === 'A' ? valA(c) : valB(c)); i++;
  }
  let sum = out[0];
  for (let k = 1; k < out.length; k++) sum += out[k] * k;
  out.push(sum % 103, 106);
  return out;
}
/** Symbol values → bar/space widths in modules (starts with a bar). */
function code128Widths(values) { const w = []; for (const v of values) for (const ch of C128[v]) w.push(+ch); return w; }

/* ---------------- validation & normalisation ----------------
 * Returns { data (what gets encoded, check digits added), text (human readable), gs1? } or throws. */
function normalizeBarcode(sym, raw, o = {}) {
  let d = String(raw == null ? '' : raw);
  const auto = o.check !== 'none';
  const digits = (n, what) => {
    d = d.replace(/[\s-]/g, '');
    if (!isDigits(d)) throw new Error(`${what} takes digits only`);
    if (d.length === n - 1) { if (!auto) throw new Error(`${what} needs ${n} digits (check digit is off)`); d += gs1Check(d); }
    else if (d.length !== n) throw new Error(`${what} needs ${n - 1} digits (+ check digit), got ${d.length}`);
    const c = gs1Check(d.slice(0, -1));
    if (c !== d.slice(-1)) throw new Error(`${what} check digit should be ${c}, not ${d.slice(-1)}`);
    return d;
  };
  switch (sym) {
    case 'code128': if (!d.length) throw new Error('Code 128 data is empty'); code128Encode(d); return { data: d, text: d };
    case 'gs1-128': case 'gs1qrcode': case 'gs1datamatrix': { const els = parseGS1(d, auto); return { data: gs1Text(els), text: gs1Text(els), gs1: els }; }
    case 'ean13': d = digits(13, 'EAN-13'); return { data: d, text: d };
    case 'ean8': d = digits(8, 'EAN-8'); return { data: d, text: d };
    case 'upca': d = digits(12, 'UPC-A'); return { data: d, text: d };
    case 'itf14': d = digits(14, 'ITF-14'); return { data: d, text: d.replace(/^(\d)(\d{2})(\d{5})(\d{5})(\d)$/, '$1 $2 $3 $4 $5') };
    case 'upce': {
      d = d.replace(/\s/g, '');
      if (!isDigits(d)) throw new Error('UPC-E takes digits only');
      if (d.length === 6) d = '0' + d;
      if (d[0] !== '0' && d[0] !== '1') throw new Error('UPC-E number system must be 0 or 1');
      if (d.length === 7) { if (!auto) throw new Error('UPC-E needs 8 digits (check digit is off)'); d += upceCheck(d); }
      if (d.length !== 8) throw new Error(`UPC-E needs 7 digits (+ check digit), got ${d.length}`);
      const c = upceCheck(d.slice(0, 7));
      if (c !== d[7]) throw new Error(`UPC-E check digit should be ${c}, not ${d[7]}`);
      return { data: d, text: d };
    }
    case 'code39': case 'code93': {
      d = d.toUpperCase();
      if (!d.length) throw new Error('Data is empty');
      for (const c of d) if (C39.indexOf(c) < 0 || c === '*') throw new Error(`"${c}" is not allowed in ${sym === 'code39' ? 'Code 39' : 'Code 93'}`);
      return { data: d, text: d, check39: sym === 'code39' && o.check === 'mod43' };
    }
    case 'i2of5': {
      d = d.replace(/\s/g, '');
      if (!isDigits(d)) throw new Error('Interleaved 2 of 5 takes digits only');
      if (o.check === 'mod10') d += gs1Check(d);
      if (d.length % 2) throw new Error('Interleaved 2 of 5 needs an even number of digits');
      return { data: d, text: d };
    }
    case 'codabar': {
      d = d.toUpperCase();
      if (!/^[ABCD]/.test(d)) d = 'A' + d;
      if (!/[ABCD]$/.test(d.slice(1)) ) d = d + 'A';
      if (!/^[ABCD][0-9\-$:/.+]+[ABCD]$/.test(d)) throw new Error('Codabar takes digits and - $ : / . + between A–D start/stop characters');
      return { data: d, text: o.hrStartStop ? d : d.slice(1, -1) };
    }
    default:
      if (!d.length) throw new Error('Data is empty');
      return { data: d, text: d };
  }
}
