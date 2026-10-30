/* Slop Tables functions: dates and times (1900 date system). */
import { def } from './registry.js';
import { num, int, str, opt, check, ERR, bail, flat, isErr, textNum } from './helpers.js';
import { serial, parts, time, daysInMonth, fromJSDate, parseDateTime } from '../engine/datetime.js';
const D = { cat: 'Date' };
const dn = (v) => { const n = num(v); check(n >= 0 && n < 2958466); return n; };
const P = (v) => parts(Math.floor(dn(v)));
const o = (min, max, help, fmt) => ({ min, max, sc: true, help, fmt, ...D });

def('DATE', (c, y, m, d) => { y = int(y); m = int(m); d = int(d); check(y >= 0 && y < 10000); const s = serial(y, m, d); check(s >= 0 && s < 2958466); return s; }, o(3, 3, 'year, month, day|Build a date', 'm/d/yyyy'));
def('TIME', (c, h, m, s) => { const v = (int(h) * 3600 + int(m) * 60 + int(s)); check(v >= 0); return (v % 86400) / 86400; }, o(3, 3, 'hour, minute, second|Build a time', 'h:mm AM/PM'));
def('TODAY', (c) => Math.floor(fromJSDate(c.wb.now ? c.wb.now() : new Date())), { max: 0, vol: true, fmt: 'm/d/yyyy', help: '|Today’s date', ...D });
def('NOW', (c) => fromJSDate(c.wb.now ? c.wb.now() : new Date()), { max: 0, vol: true, fmt: 'm/d/yyyy h:mm', help: '|Current date and time', ...D });
def('YEAR', (c, d) => P(d).y, o(1, 1, 'date|Year of a date'));
def('MONTH', (c, d) => P(d).m, o(1, 1, 'date|Month 1–12'));
def('DAY', (c, d) => P(d).d, o(1, 1, 'date|Day of month'));
def('HOUR', (c, d) => parts(dn(d)).h, o(1, 1));
def('MINUTE', (c, d) => parts(dn(d)).mi, o(1, 1));
def('SECOND', (c, d) => parts(dn(d)).s, o(1, 1));
def('DATEVALUE', (c, s) => { const r = parseDateTime(str(s), c.wb.locale.dateOrder); if (!r) bail(ERR.VALUE); return Math.floor(r.v); }, o(1, 1, 'text|Text to date', 'm/d/yyyy'));
def('TIMEVALUE', (c, s) => { const r = parseDateTime(str(s), c.wb.locale.dateOrder); if (!r) bail(ERR.VALUE); return r.v - Math.floor(r.v); }, o(1, 1));
def('DAYS', (c, e, s) => Math.floor(dn(e)) - Math.floor(dn(s)), o(2, 2, 'end, start|Days between dates'));
def('EDATE', (c, d, m) => { const p = P(d); m = int(m); const t = p.m + m; const y = p.y + Math.floor((t - 1) / 12), mm = ((t - 1) % 12 + 12) % 12 + 1; return serial(y, mm, Math.min(p.d, daysInMonth(y, mm))); }, o(2, 2, 'start, months|Same day n months later', 'm/d/yyyy'));
def('EOMONTH', (c, d, m) => { const p = P(d); const t = p.m + int(m); const y = p.y + Math.floor((t - 1) / 12), mm = ((t - 1) % 12 + 12) % 12 + 1; return serial(y, mm, daysInMonth(y, mm)); }, o(2, 2, 'start, months|End of month', 'm/d/yyyy'));
def('WEEKDAY', (c, d, t) => {
  const wd = P(d).wd; t = int(opt(t, 1));
  if (t === 1 || t === 17) return wd + 1;
  if (t === 2 || t === 11) return ((wd + 6) % 7) + 1;
  if (t === 3) return (wd + 6) % 7;
  if (t >= 12 && t <= 16) return ((wd - (t - 10) + 7) % 7) + 1;
  bail(ERR.NUM);
}, o(1, 2, 'date, [type]|Day of week (1 = Sunday)'));
def('WEEKNUM', (c, d, t) => {
  const p = P(d); t = int(opt(t, 1));
  if (t === 21) return isoWeek(p);
  const start = t === 1 || t === 17 ? 0 : t === 2 || t === 11 ? 1 : t >= 12 && t <= 16 ? t - 10 : bail(ERR.NUM);
  const jan1 = serial(p.y, 1, 1), wd1 = parts(jan1).wd;
  const off = (wd1 - start + 7) % 7;
  return Math.floor((p.day - jan1 + off) / 7) + 1;
}, o(1, 2));
function isoWeek(p) {
  const wd = (p.wd + 6) % 7; // Monday = 0
  const thu = p.day - wd + 3, ty = parts(thu).y;
  return Math.floor((thu - serial(ty, 1, 1)) / 7) + 1;
}
def('ISOWEEKNUM', (c, d) => isoWeek(P(d)), o(1, 1));
def('DAYS360', (c, s, e, m) => {
  const a = P(s), b = P(e); const eu = !!(m && num(m));
  let d1 = a.d, d2 = b.d;
  if (eu) { if (d1 === 31) d1 = 30; if (d2 === 31) d2 = 30; }
  else {
    const lastFeb = (p) => p.m === 2 && p.d === daysInMonth(p.y, 2);
    if (lastFeb(a)) { if (lastFeb(b)) d2 = 30; d1 = 30; }
    if (d1 === 31) d1 = 30;
    if (d2 === 31 && d1 >= 30) d2 = 30;
  }
  return (b.y - a.y) * 360 + (b.m - a.m) * 30 + d2 - d1;
}, o(2, 3));
def('YEARFRAC', (c, s, e, b) => {
  let x = Math.floor(dn(s)), y = Math.floor(dn(e)); b = int(opt(b, 0)); check(b >= 0 && b <= 4);
  if (x > y) [x, y] = [y, x];
  const a = parts(x), z = parts(y);
  if (b === 0) { let d1 = a.d, d2 = z.d; const lastFeb = (p) => p.m === 2 && p.d === daysInMonth(p.y, 2); if (d1 === 31 && d2 === 31) { d1 = 30; d2 = 30; } else if (d1 === 31) d1 = 30; else if (d1 === 30 && d2 === 31) d2 = 30; else if (lastFeb(a) && lastFeb(z)) { d1 = 30; d2 = 30; } else if (lastFeb(a)) d1 = 30; return ((z.y - a.y) * 360 + (z.m - a.m) * 30 + d2 - d1) / 360; }
  if (b === 2) return (y - x) / 360;
  if (b === 3) return (y - x) / 365;
  if (b === 4) { const d1 = Math.min(a.d, 30), d2 = Math.min(z.d, 30); return ((z.y - a.y) * 360 + (z.m - a.m) * 30 + d2 - d1) / 360; }
  const leap = (yy) => (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0;
  let avg;
  if (a.y === z.y) avg = leap(a.y) ? 366 : 365;
  else if (z.y - a.y === 1 && (z.m < a.m || (z.m === a.m && z.d <= a.d))) avg = (leap(a.y) && (a.m < 3)) || (leap(z.y) && (z.m > 2 || (z.m === 2 && z.d === 29))) ? 366 : 365;
  else { let t = 0; for (let yy = a.y; yy <= z.y; yy++) t += leap(yy) ? 366 : 365; avg = t / (z.y - a.y + 1); }
  return (y - x) / avg;
}, o(2, 3));
def('DATEDIF', (c, s, e, u) => {
  const x = Math.floor(dn(s)), y = Math.floor(dn(e)); check(x <= y); const a = parts(x), b = parts(y); u = str(u).toUpperCase();
  let months = (b.y - a.y) * 12 + b.m - a.m; if (b.d < a.d) months--;
  switch (u) {
    case 'D': return y - x;
    case 'M': return months;
    case 'Y': return Math.floor(months / 12);
    case 'YM': return months % 12;
    case 'MD': { let d = b.d - a.d; if (d < 0) d += daysInMonth(b.m === 1 ? b.y - 1 : b.y, b.m === 1 ? 12 : b.m - 1); return d; }
    case 'YD': { let t = serial(b.y, a.m, a.d); if (t > y) t = serial(b.y - 1, a.m, a.d); return y - t; }
  }
  bail(ERR.NUM);
}, o(3, 3, 'start, end, unit|Difference in "Y", "M", "D", "YM", "MD" or "YD"'));
/* working days */
function weekendMask(w) {
  if (w === undefined || w === null) return [true, false, false, false, false, false, true]; // Sun..Sat
  if (typeof w === 'string') { check(/^[01]{7}$/.test(w), ERR.VALUE); const m = w.split('').map((x) => x === '1'); return [m[6], ...m.slice(0, 6)]; }
  const n = int(w);
  const pairs = { 1: [0, 6], 2: [0, 1], 3: [1, 2], 4: [2, 3], 5: [3, 4], 6: [4, 5], 7: [5, 6] };
  const singles = { 11: 0, 12: 1, 13: 2, 14: 3, 15: 4, 16: 5, 17: 6 };
  const m = new Array(7).fill(false);
  if (pairs[n]) pairs[n].forEach((i) => (m[i] = true)); else if (singles[n] !== undefined) m[singles[n]] = true; else bail(ERR.NUM);
  return m;
}
const holidaySet = (c, h) => new Set(h === undefined || h === null ? [] : flat(c, h).filter((v) => v !== null).map((v) => { if (isErr(v)) bail(v); return Math.floor(num(v)); }));
function netdays(c, s, e, w, h) {
  let x = Math.floor(dn(s)), y = Math.floor(dn(e)); const m = weekendMask(w), H = holidaySet(c, h);
  const sign = x > y ? -1 : 1; if (x > y) [x, y] = [y, x];
  let n = 0; for (let d = x; d <= y; d++) if (!m[parts(d).wd] && !H.has(d)) n++;
  return sign * n;
}
function workday(c, s, k, w, h) {
  let d = Math.floor(dn(s)); k = int(k); const m = weekendMask(w), H = holidaySet(c, h);
  const step = k < 0 ? -1 : 1; let left = Math.abs(k);
  while (left > 0) { d += step; if (!m[parts(d).wd] && !H.has(d)) left--; }
  return d;
}
def('NETWORKDAYS', (c, s, e, h) => netdays(c, s, e, null, h), { min: 2, max: 3, sc: [0, 1], help: 'start, end, [holidays]|Working days between dates', ...D });
def('NETWORKDAYS.INTL', (c, s, e, w, h) => netdays(c, s, e, w, h), { min: 2, max: 4, sc: [0, 1], ...D });
def('WORKDAY', (c, s, k, h) => workday(c, s, k, null, h), { min: 2, max: 3, sc: [0, 1], fmt: 'm/d/yyyy', help: 'start, days, [holidays]|Date after n working days', ...D });
def('WORKDAY.INTL', (c, s, k, w, h) => workday(c, s, k, w, h), { min: 2, max: 4, sc: [0, 1], fmt: 'm/d/yyyy', ...D });
def('EPOCHTODATE', (c, t, u) => { t = num(t); u = int(opt(u, 1)); const ms = u === 1 ? t * 1000 : u === 2 ? t : u === 3 ? t / 1000 : bail(ERR.NUM); return ms / 86400000 + 25569; }, o(1, 2, '', 'm/d/yyyy h:mm:ss'));
export { time, textNum };
