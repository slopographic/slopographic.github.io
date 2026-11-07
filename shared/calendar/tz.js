// Time zones and calendar dates with Intl only (no zone data is downloaded). An instant is epoch milliseconds. A "day"
// is a YYYY-MM-DD string. A wall-clock time is the reading a clock in one zone shows. Classic script, no dependencies.
// Exposes window.SlopTime. Used by the calendar, the to-do app, reminders and the CRM follow-up list.
(function (g) {
  'use strict';
  const NS = (g.SlopTime = g.SlopTime || {});
  const DAY = 86400000;
  const fmts = new Map();

  /** The zone the device is set to, or UTC when Intl does not say. */
  function deviceZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; }
  }

  /** True when Intl knows the zone name (IANA, such as Europe/Paris, or UTC). */
  function isZone(tz) {
    if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
  }

  function fmt(tz) {
    if (!fmts.has(tz)) {
      fmts.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
    }
    return fmts.get(tz);
  }

  /** The wall clock in zone tz at instant ms: { y, mo (1-12), d, h, mi, s, day ('YYYY-MM-DD'), dow (0 Sunday) }. */
  function parts(ms, tz) {
    const p = {};
    for (const x of fmt(tz || deviceZone()).formatToParts(new Date(ms))) p[x.type] = x.value;
    const y = +p.year, mo = +p.month, d = +p.day;
    return { y, mo, d, h: (+p.hour) % 24, mi: +p.minute, s: +p.second, day: ymd(y, mo, d), dow: new Date(Date.UTC(y, mo - 1, d)).getUTCDay() };
  }

  /** Zone offset in ms at instant ms (positive east of UTC). */
  function offsetAt(ms, tz) {
    const p = parts(ms, tz);
    const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    return asUtc - Math.floor(ms / 1000) * 1000;
  }

  /** The instant at which the wall clock in tz reads y-mo-d h:mi:s. Times in a DST gap move forward by the gap. */
  function wallToUtc(y, mo, d, h, mi, tz, s = 0) {
    const want = Date.UTC(y, mo - 1, d, h, mi, s);
    const first = want - offsetAt(want, tz);
    return want - offsetAt(first, tz);
  }

  /** Instant of the wall-clock time 'HH:MM' on a day in tz. */
  function dayTimeToUtc(day, hhmm, tz) {
    const [y, mo, d] = day.split('-').map(Number);
    const [h, mi] = hhmm.split(':').map(Number);
    return wallToUtc(y, mo, d, h, mi, tz);
  }

  /** The zone's short name at an instant, such as GMT+2 or EST. Falls back to the zone name. */
  function zoneLabel(ms, tz) {
    try {
      const x = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms)).find((q) => q.type === 'timeZoneName');
      return x ? x.value : tz;
    } catch (e) { return tz; }
  }

  /** Formats an instant's time of day in tz, such as 14:05 (24-hour) or 2:05 PM, with the locale. */
  function timeText(ms, tz, locale, opts = {}) {
    return new Intl.DateTimeFormat(locale || undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: opts.hour12 }).format(new Date(ms));
  }

  /** Formats an instant as a date and time in tz, such as Thu 9 Oct 2026, 14:05. */
  function dateTimeText(ms, tz, locale) {
    return new Intl.DateTimeFormat(locale || undefined, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
  }

  /** Formats a YYYY-MM-DD day with the locale (no zone involved). */
  function dayText(day, locale, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
    const [y, mo, d] = day.split('-').map(Number);
    return new Intl.DateTimeFormat(locale || undefined, Object.assign({ timeZone: 'UTC' }, opts)).format(new Date(Date.UTC(y, mo - 1, d)));
  }

  /** YYYY-MM-DD from numbers (month 1-12). */
  function ymd(y, mo, d) {
    return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  /** Parses YYYY-MM-DD into numbers, or null when it is not a real calendar day. */
  function parseDay(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const [y, mo, d] = day.split('-').map(Number);
    const t = new Date(Date.UTC(y, mo - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? { y, mo, d } : null;
  }

  /** Adds n days to a YYYY-MM-DD day (n may be negative). */
  function addDays(day, n) {
    const p = parseDay(day);
    if (!p) return null;
    const t = new Date(Date.UTC(p.y, p.mo - 1, p.d + n));
    return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }

  /** Whole days from a to b (b minus a), for YYYY-MM-DD days. */
  function dayDiff(a, b) {
    const pa = parseDay(a), pb = parseDay(b);
    return Math.round((Date.UTC(pb.y, pb.mo - 1, pb.d) - Date.UTC(pa.y, pa.mo - 1, pa.d)) / DAY);
  }

  /** Day of the week, 0 Sunday to 6 Saturday. */
  function dowOf(day) { return new Date(`${day}T00:00:00Z`).getUTCDay(); }

  /** The Monday that starts the week of a day (weeks start on Monday). */
  function weekStart(day) { return addDays(day, -((dowOf(day) + 6) % 7)); }

  /** Today's day in tz at instant now (default: the clock). */
  function todayIn(tz, now = Date.now()) { return parts(now, tz).day; }

  /** Start of a day in tz, as an instant. */
  function startOfDay(day, tz) { return wallToUtc(...dayParts(day), 0, 0, tz); }

  function dayParts(day) { const p = parseDay(day); return [p.y, p.mo, p.d]; }

  NS.deviceZone = deviceZone;
  NS.isZone = isZone;
  NS.parts = parts;
  NS.offsetAt = offsetAt;
  NS.wallToUtc = wallToUtc;
  NS.dayTimeToUtc = dayTimeToUtc;
  NS.zoneLabel = zoneLabel;
  NS.timeText = timeText;
  NS.dateTimeText = dateTimeText;
  NS.dayText = dayText;
  NS.ymd = ymd;
  NS.parseDay = parseDay;
  NS.addDays = addDays;
  NS.dayDiff = dayDiff;
  NS.dowOf = dowOf;
  NS.weekStart = weekStart;
  NS.todayIn = todayIn;
  NS.startOfDay = startOfDay;
  NS.DAY = DAY;
})(typeof window !== 'undefined' ? window : globalThis);
