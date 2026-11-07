/* Slop Tables engine: Excel 1900 date system (with the Lotus 1-2-3 leap-year bug: serial 60 = 29 Feb 1900). */
const DAY = 86400000;
const EPOCH = Date.UTC(1899, 11, 30);

/** DATE(y, m, d) semantics: months/days overflow; years 0–1899 are offset by 1900. */
export function serial(y, m, d) {
  if (y < 1900) y += 1900;
  const t = Date.UTC(y, m - 1, 1) + (d - 1) * DAY;
  let n = Math.round((t - EPOCH) / DAY);
  if (n < 61) n -= 1; // before 1 Mar 1900 Excel counts from 31 Dec 1899
  if (y === 1900 && m === 2 && d === 29) return 60;
  return n;
}
/** Serial → parts. Fraction = time of day. */
export function parts(n) {
  let day = Math.floor(n);
  let frac = n - day;
  let ms = Math.round(frac * DAY);
  if (ms >= DAY) { day += 1; ms -= DAY; }
  let y, m, d;
  if (day === 60) { y = 1900; m = 2; d = 29; }
  else {
    const dt = new Date(EPOCH + (day < 60 ? day + 1 : day) * DAY);
    y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
  }
  const wd = day < 1 ? 6 : (day + 6) % 7; // 0 = Sunday (Excel: serial 1 was a Sunday)
  const h = Math.floor(ms / 3600000), mi = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return { y, m, d, h, mi, s, ms: ms % 1000, wd, day, frac: ms / DAY };
}
export const time = (h, m, s) => ((h * 3600 + m * 60 + s) % 86400) / 86400;
export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** JS Date (local) → serial. */
export function fromJSDate(dt) {
  const t = Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours(), dt.getMinutes(), dt.getSeconds(), dt.getMilliseconds());
  const n = (t - EPOCH) / DAY;
  return n < 61 ? n - 1 : n;
}
export function toJSDate(n) { const p = parts(n); return new Date(p.y, p.m - 1, p.d, p.h, p.mi, p.s, p.ms); }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthOf = (s) => { const i = MONTHS.indexOf(s.slice(0, 3).toLowerCase()); return i < 0 ? 0 : i + 1; };
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?\s*([ap]\.?m\.?)?$/i;

function parseTime(s) {
  const m = TIME.exec(s.trim());
  if (!m) return null;
  let h = +m[1];
  const mi = +m[2], sec = m[3] ? +m[3] : 0;
  if (m[4]) { const pm = /^p/i.test(m[4]); if (h > 12 || h === 0) return null; h = (h % 12) + (pm ? 12 : 0); }
  if (mi > 59 || sec >= 60) return null;
  return { v: (h * 3600 + mi * 60 + sec) / 86400, fmt: m[4] ? 'h:mm' + (m[3] ? ':ss' : '') + ' AM/PM' : m[3] ? 'h:mm:ss' : 'h:mm', h };
}
/** Parse user-typed date/time text. order: 'mdy' | 'dmy' | 'ymd' (from locale). Returns {v, fmt} or null. */
export function parseDateTime(s, order = 'mdy') {
  s = s.trim();
  if (!s || s.length > 40) return null;
  const tOnly = parseTime(s);
  if (tOnly && tOnly.h < 24) return tOnly;
  let datePart = s, tp = null;
  const sp = /^(.+?)[ T](\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*[ap]\.?m\.?)?)$/i.exec(s);
  if (sp) { datePart = sp[1]; tp = parseTime(sp[2]); if (!tp) return null; }
  let y, m, d, fmt, mm;
  if ((mm = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(datePart))) { y = +mm[1]; m = +mm[2]; d = +mm[3]; fmt = 'yyyy-mm-dd'; }
  else if ((mm = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(datePart))) {
    const a = +mm[1], b = +mm[2]; y = +mm[3];
    if (order === 'dmy') { d = a; m = b; fmt = 'd/m/yyyy'; } else { m = a; d = b; fmt = 'm/d/yyyy'; }
    if (mm[3].length === 2) y += y < 30 ? 2000 : 1900;
  } else if ((mm = /^(\d{1,2})[-/ ]([A-Za-z]{3,})\.?[-/ ,]*(\d{2,4})?$/.exec(datePart)) && monthOf(mm[2])) {
    d = +mm[1]; m = monthOf(mm[2]); y = mm[3] ? +mm[3] : new Date().getFullYear(); fmt = mm[3] ? 'd-mmm-yy' : 'd-mmm';
    if (mm[3] && mm[3].length === 2) y += y < 30 ? 2000 : 1900;
  } else if ((mm = /^([A-Za-z]{3,})\.?[-/ ](\d{1,2})(?:,?[-/ ](\d{2,4}))?$/.exec(datePart)) && monthOf(mm[1])) {
    m = monthOf(mm[1]); d = +mm[2]; y = mm[3] ? +mm[3] : new Date().getFullYear(); fmt = 'mmm d, yyyy';
    if (mm[3] && mm[3].length === 2) y += y < 30 ? 2000 : 1900;
  } else return null;
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 9999 || d > (y === 1900 && m === 2 ? 29 : daysInMonth(y, m))) return null;
  const v = serial(y, m, d) + (tp ? tp.v : 0);
  return { v, fmt: tp ? fmt + ' ' + tp.fmt.replace(' AM/PM', '') : fmt };
}
