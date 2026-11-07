// Recurrence: the occurrences of an event in a time range. Repeats are daily, weekly, monthly or yearly, with an
// optional end day (until, inclusive). Dates step on the wall clock of the event's own zone, so a 09:00 weekly event
// stays at 09:00 across daylight saving changes. A monthly or yearly repeat skips a date that does not exist (the 31st
// of a short month, 29 February in a common year), as RFC 5545 does. Exposes window.SlopRecur. Needs tz.js first.
(function (g) {
  'use strict';
  const T = g.SlopTime;
  const NS = (g.SlopRecur = g.SlopRecur || {});
  const FREQS = ['daily', 'weekly', 'monthly', 'yearly'];
  const CAP = 5000; // occurrences examined per call, a guard against runaway repeats
  /** A word from the shared tables (shared/i18n/ui/<code>/calendar.js), the key without SlopI18n. */
  const tr = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);

  const daysIn = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

  /**
   * The day of the i-th occurrence counting from base (a YYYY-MM-DD day), or null when that date does not exist.
   * i = 0 is the base day itself.
   */
  function stepDate(base, freq, i) {
    const p = T.parseDay(base);
    if (!p) return null;
    if (freq === 'daily') return T.addDays(base, i);
    if (freq === 'weekly') return T.addDays(base, 7 * i);
    if (freq === 'monthly') {
      const m0 = p.mo - 1 + i, y = p.y + Math.floor(m0 / 12), mo = (m0 % 12) + 1;
      return p.d > daysIn(y, mo) ? null : T.ymd(y, mo, p.d);
    }
    if (freq === 'yearly') {
      const y = p.y + i;
      return p.d > daysIn(y, p.mo) ? null : T.ymd(y, p.mo, p.d);
    }
    return i === 0 ? base : null;
  }

  /** The first day after `day` that the repeat lands on (used when a repeating task is completed). */
  function advance(day, freq) {
    for (let i = 1; i < 60; i++) {
      const d = stepDate(day, freq, i);
      if (d) return d;
    }
    return null;
  }

  /** Rough index of the occurrence on or just before a day, so a far-off range does not walk from the start. */
  function indexNear(base, freq, day) {
    const b = T.parseDay(base), f = T.parseDay(day);
    if (freq === 'daily') return T.dayDiff(base, day);
    if (freq === 'weekly') return Math.floor(T.dayDiff(base, day) / 7);
    if (freq === 'monthly') return (f.y - b.y) * 12 + (f.mo - b.mo);
    return f.y - b.y;
  }

  /**
   * Occurrences of an event between two instants (fromMs inclusive, toMs exclusive), as the viewer sees them.
   * Timed events: { start, end, startDay, seq, key } in ms, startDay in the event's zone.
   * All-day events: { allDay: true, startDay, endDay, seq, key }, with days that overlap [fromMs, toMs) in viewerTz.
   */
  function occurrences(ev, fromMs, toMs, viewerTz) {
    const out = [];
    const freq = FREQS.includes(ev.freq) ? ev.freq : null;
    if (ev.allDay) {
      const base = ev.startDay, span = T.dayDiff(ev.startDay, ev.endDay || ev.startDay);
      const fromDay = T.parts(fromMs, viewerTz).day, toDay = T.parts(toMs - 1, viewerTz).day;
      const i0 = freq ? Math.max(0, indexNear(base, freq, fromDay) - 1) : 0;
      for (let i = i0; i < i0 + CAP; i++) {
        const d = freq ? stepDate(base, freq, i) : (i === 0 ? base : null);
        if (d === null && freq) continue;
        if (!d || (ev.until && d > ev.until) || d > toDay) break;
        const endDay = T.addDays(d, span);
        if (endDay >= fromDay) out.push({ allDay: true, startDay: d, endDay, seq: i, key: `${ev.id}:${d}` });
        if (!freq) break;
      }
      return out;
    }
    const dur = ev.end - ev.start;
    const p = T.parts(ev.start, ev.tz);
    const fromDay = T.parts(fromMs, ev.tz).day;
    const i0 = freq ? Math.max(0, indexNear(p.day, freq, fromDay) - 1) : 0;
    for (let i = i0; i < i0 + CAP; i++) {
      const d = freq ? stepDate(p.day, freq, i) : (i === 0 ? p.day : null);
      if (d === null && freq) continue;
      if (!d || (ev.until && d > ev.until)) break;
      const dp = T.parseDay(d);
      const start = T.wallToUtc(dp.y, dp.mo, dp.d, p.h, p.mi, ev.tz, p.s);
      if (start >= toMs) break;
      if (start + dur > fromMs) out.push({ allDay: false, start, end: start + dur, startDay: d, seq: i, key: `${ev.id}:${start}` });
      if (!freq) break;
    }
    return out;
  }

  /** Short text for a repeat in the chosen language, such as "Every week" or "Every day until 31 Jan 2027" (the end day
   *  in the language's date format). */
  function describe(ev) {
    if (!FREQS.includes(ev.freq)) return tr('ui.recur.none');
    const p = ev.until ? T.parseDay(ev.until) : null;
    if (!p) return tr('ui.recur.' + ev.freq);
    const day = g.SlopI18n ? g.SlopI18n.date(new Date(p.y, p.mo - 1, p.d), { dateStyle: 'medium' }) : ev.until;
    return tr('ui.recur.' + ev.freq + '_until', { date: day });
  }

  NS.FREQS = FREQS;
  NS.stepDate = stepDate;
  NS.advance = advance;
  NS.occurrences = occurrences;
  NS.describe = describe;
})(typeof window !== 'undefined' ? window : globalThis);
