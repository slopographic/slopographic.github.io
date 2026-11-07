/* Slop Tables number formats: compile an Excel format code into sections of tokens.
   Token kinds: lit, digit(0/#/?), dot, comma(group), pct, exp, slash, text(@), date(y/m/d/h/s/ampm/elapsed),
   fill(*x), gen(General). */
const COLORS = { black: '#000000', blue: '#0000FF', cyan: '#00FFFF', green: '#00FF00', magenta: '#FF00FF', red: '#FF0000', white: '#FFFFFF', yellow: '#FFFF00' };
const PALETTE = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#C0C0C0', '#808080'];
const cache = new Map();

export function compile(code) {
  if (code === undefined || code === null || code === '') code = 'General';
  let c = cache.get(code);
  if (!c) { c = build(String(code)); if (cache.size > 2000) cache.clear(); cache.set(code, c); }
  return c;
}
function splitSections(code) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') q = !q;
    if (!q && ch === '\\') { cur += ch + (code[i + 1] || ''); i++; continue; }
    if (!q && ch === ';') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
function build(code) {
  const secs = splitSections(code).map(section);
  return { code, secs };
}
function section(src) {
  const s = { toks: [], cond: null, color: null, kind: 'num', pct: 0, scale: 0, group: false, dec: 0, exp: null, frac: null, elapsed: false, ampm: false, hasDigits: false, text: false, gen: false, src };
  const T = s.toks;
  const lit = (v) => { const last = T[T.length - 1]; if (last && last.k === 'lit') last.v += v; else T.push({ k: 'lit', v }); };
  let i = 0, afterDot = false, seenDigitAfterDot = false;
  const low = src.toLowerCase();
  while (i < src.length) {
    const ch = src[i], lc = low[i];
    if (ch === '"') { let j = i + 1, v = ''; while (j < src.length && src[j] !== '"') v += src[j++]; lit(v); i = j + 1; continue; }
    if (ch === '\\') { lit(src[i + 1] || ''); i += 2; continue; }
    if (ch === '_') { lit(' '); i += 2; continue; }
    if (ch === '*') { T.push({ k: 'fill', v: src[i + 1] || ' ' }); i += 2; continue; }
    if (ch === '[') {
      const j = src.indexOf(']', i); const inner = j < 0 ? '' : src.slice(i + 1, j); const li = inner.toLowerCase();
      i = j < 0 ? src.length : j + 1;
      let m;
      if (COLORS[li]) s.color = COLORS[li];
      else if ((m = /^color\s*(\d+)$/.exec(li))) s.color = PALETTE[(+m[1] - 1) % 16] || null;
      else if ((m = /^(<=|>=|<>|<|>|=)\s*(-?[\d.]+(?:e[+-]?\d+)?)$/.exec(li))) s.cond = { op: m[1], v: +m[2] };
      else if (/^(h+|m+|s+)$/.test(li)) { T.push({ k: 'date', v: li[0] === 'h' ? 'H' : li[0] === 'm' ? 'M' : 'S', n: li.length }); s.kind = 'date'; s.elapsed = true; }
      else if (li[0] === '$') { const sym = inner.slice(1).split('-')[0]; if (sym) lit(sym); }
      continue;
    }
    if (low.startsWith('general', i)) { T.push({ k: 'gen' }); s.gen = true; i += 7; continue; }
    if (low.startsWith('am/pm', i)) { T.push({ k: 'date', v: 'ampm', up: src[i] === 'A' }); s.ampm = true; s.kind = 'date'; i += 5; continue; }
    if (low.startsWith('a/p', i)) { T.push({ k: 'date', v: 'ap', up: src[i] === 'A' }); s.ampm = true; s.kind = 'date'; i += 3; continue; }
    if ('ymdhse'.includes(lc) && !(lc === 'e' && /[+-]/.test(src[i + 1] || ''))) {
      if (lc === 'e' && !/^e+$/.test(low.slice(i, i + 1))) { lit(ch); i++; continue; }
      let j = i; while (low[j] === lc) j++;
      const n = j - i;
      T.push({ k: 'date', v: lc === 'e' ? 'y' : lc, n: lc === 'e' ? 4 : n }); s.kind = 'date'; i = j;
      continue;
    }
    if (ch === '0' || ch === '#' || ch === '?') {
      T.push({ k: 'digit', v: ch, frac: afterDot }); s.hasDigits = true;
      if (afterDot) { s.dec++; seenDigitAfterDot = true; }
      i++; continue;
    }
    if (ch === '.') {
      // ".0" after seconds = fractional seconds
      const prev = T[T.length - 1];
      if (s.kind === 'date' && prev && prev.k === 'date' && prev.v === 's' && src[i + 1] === '0') { let j = i + 1; while (src[j] === '0') j++; T.push({ k: 'date', v: 'f', n: j - i - 1 }); i = j; continue; }
      if (!afterDot && !s.exp) { T.push({ k: 'dot' }); afterDot = true; i++; continue; }
      lit(ch); i++; continue;
    }
    if (ch === ',') { T.push({ k: 'comma' }); i++; continue; }
    if (ch === '%') { T.push({ k: 'pct' }); s.pct++; i++; continue; }
    if ((ch === 'E' || ch === 'e') && /[+-]/.test(src[i + 1] || '')) { s.exp = { sign: src[i + 1] === '+', at: T.length }; T.push({ k: 'exp', plus: src[i + 1] === '+' }); i += 2; afterDot = false; continue; }
    if (ch === '/' && s.hasDigits && s.kind !== 'date') { T.push({ k: 'slash' }); s.frac = true; i++; continue; }
    if (ch === '@') { T.push({ k: 'text' }); s.text = true; i++; continue; }
    lit(ch); i++;
  }
  if (s.kind === 'date') fixMinutes(T);
  else analyzeCommas(s);
  return s;
}
/** "m" means minutes when right after an hour token or right before a seconds token. */
function fixMinutes(T) {
  const d = T.map((t, i) => [t, i]).filter(([t]) => t.k === 'date');
  d.forEach(([t], j) => {
    if (t.v !== 'm' || t.n > 2) return;
    const prev = d[j - 1] && d[j - 1][0], next = d[j + 1] && d[j + 1][0];
    if ((prev && (prev.v === 'h' || prev.v === 'H')) || (next && (next.v === 's' || next.v === 'S'))) t.v = 'min';
  });
  for (const t of T) if (t.k === 'date' && t.v === 'M') t.v = 'Mel';
}
/** Commas between digit placeholders mean grouping; commas right after the last digit scale by 1000. */
function analyzeCommas(s) {
  const T = s.toks;
  let lastDigit = -1, firstDigit = -1;
  T.forEach((t, i) => { if (t.k === 'digit') { if (firstDigit < 0) firstDigit = i; lastDigit = i; } });
  for (let i = 0; i < T.length; i++) {
    if (T[i].k !== 'comma') continue;
    let j = i + 1; while (j < T.length && T[j].k === 'comma') j++;
    const nextIsDigit = j < T.length && (T[j].k === 'digit');
    if (i > firstDigit && firstDigit >= 0 && nextIsDigit && !T.slice(firstDigit, i).some((t) => t.k === 'dot')) { s.group = true; T[i] = { k: 'nop' }; }
    else if (i > lastDigit && lastDigit >= 0 && !nextIsDigit) { const n = j - i; s.scale += n; for (let q = i; q < j; q++) T[q] = { k: 'nop' }; i = j - 1; }
    else T[i] = { k: 'lit', v: ',' };
  }
}
/** Pick the section for a value. Returns {sec, abs} where abs = render the absolute value. */
export function pick(c, v) {
  const S = c.secs;
  if (typeof v === 'string') { const t = S[3] || S.find((x) => x.text && !x.hasDigits); return t ? { sec: t, abs: false } : null; }
  if (S.some((x) => x.cond)) {
    const test = (x) => { const k = x.cond; return k.op === '<' ? v < k.v : k.op === '>' ? v > k.v : k.op === '<=' ? v <= k.v : k.op === '>=' ? v >= k.v : k.op === '=' ? v === k.v : v !== k.v; };
    const nums = S.filter((x) => !x.text || x.hasDigits);
    for (const x of nums) if (x.cond && test(x)) return { sec: x, abs: nums.indexOf(x) > 0 && v < 0 && x.cond.v <= 0 };
    const rest = nums.filter((x) => !x.cond);
    if (rest.length) return { sec: rest[0], abs: false };
    return { sec: nums[0], abs: false };
  }
  const nums = S.filter((x, i) => i < 3);
  if (v > 0 || nums.length === 1) return { sec: nums[0], abs: false };
  if (v < 0) return { sec: nums[1] || nums[0], abs: !!nums[1] };
  return { sec: nums[2] || nums[0], abs: false };
}
export { COLORS };
