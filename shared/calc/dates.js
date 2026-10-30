/* Slopculator date arithmetic on plain calendar dates (YYYY-MM-DD). Pure, UTC-based, so no time zone or DST
 * can change a result. Classic script. Exposes window.SlopCalc.dates:
 *   parse(iso)            → { y, mo, d } or null when the text is not a real calendar date
 *   iso(y, mo, d)         → 'YYYY-MM-DD'
 *   addDays(iso, n)       → the date n days later (n may be negative)
 *   addMonths(iso, n)     → the date n calendar months later; the day is clamped to the month's last day
 *   diffDays(a, b)        → a − b in whole days (positive when a is later)
 *   weekday(iso)          → 'Mon'…'Sun'
 *   localIso(date)        → the device's calendar date as YYYY-MM-DD (for "today") */
(function (g) {
  'use strict';
  const ns = (g.SlopCalc = g.SlopCalc || {});
  const RX = /^(\d{4})-(\d{2})-(\d{2})$/;
  const DAY = 864e5;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function parse(text) {
    const m = RX.exec(String(text || ''));
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
    return { y, mo, d };
  }
  const iso = (y, mo, d) => `${pad(y, 4)}-${pad(mo)}-${pad(d)}`;
  const utcOf = (p) => Date.UTC(p.y, p.mo - 1, p.d);
  const fromUtc = (t) => { const x = new Date(t); return iso(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()); };
  const daysIn = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

  function addDays(text, n) {
    const p = parse(text);
    if (!p) throw new Error('not a date: ' + text);
    return fromUtc(utcOf(p) + n * DAY);
  }
  function addMonths(text, n) {
    const p = parse(text);
    if (!p) throw new Error('not a date: ' + text);
    const idx = p.y * 12 + (p.mo - 1) + n;
    const y = Math.floor(idx / 12), mo = idx - y * 12 + 1;
    return iso(y, mo, Math.min(p.d, daysIn(y, mo)));
  }
  function diffDays(a, b) {
    const pa = parse(a), pb = parse(b);
    if (!pa || !pb) throw new Error('not a date');
    return Math.round((utcOf(pa) - utcOf(pb)) / DAY);
  }
  function weekday(text) {
    const p = parse(text);
    return p ? WD[new Date(utcOf(p)).getUTCDay()] : '';
  }
  function localIso(date) {
    const d = date || new Date();
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  ns.dates = Object.freeze({ parse, iso, addDays, addMonths, diffDays, weekday, localIso });
})(typeof window !== 'undefined' ? window : globalThis);
