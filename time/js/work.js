/* Slop Time: working hours, "my time in…" overlap and meeting windows. Pure, classic script (after zones.js).
 * A working pattern is { zone, days, start, end }: days are weekday numbers (0 = Sunday), start and end are hours
 * (9 and 17.5 are fine) in that zone's own clock. Exposes window.SlopTime.work:
 *   normalize(p, fallbackZone)    → a valid pattern (defaults: Monday to Friday, 09:00 to 17:00)
 *   isWorkingAt(p, ms)            → true when the zone's clock is inside the working day
 *   commonWindows(people, startMs, endMs, stepMin) → [{ start, end }] instants where every pattern is working
 *   dayWindows(people, refZone, iso, stepMin)     → commonWindows over the 24 hours from local midnight in refZone */
(function (g) {
  'use strict';
  const ns = (g.SlopTime = g.SlopTime || {});
  const Z = ns.zones;
  const DEFAULT_DAYS = [1, 2, 3, 4, 5];

  function normalize(p, fallbackZone) {
    const src = p || {};
    const zone = Z.isZone(src.zone) ? src.zone : fallbackZone;
    const days = Array.isArray(src.days) ? [...new Set(src.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b) : DEFAULT_DAYS;
    let start = Number.isFinite(+src.start) ? +src.start : 9;
    let end = Number.isFinite(+src.end) ? +src.end : 17;
    start = Math.min(23.5, Math.max(0, start));
    end = Math.min(24, Math.max(0.5, end));
    if (end <= start) { start = 9; end = 17; }
    return { zone, days, start, end };
  }

  function isWorkingAt(p, ms) {
    const t = Z.localParts(p.zone, ms);
    const minutes = t.h * 60 + t.mi;
    return p.days.includes(t.wd) && minutes >= p.start * 60 && minutes < p.end * 60;
  }

  /** Instants between startMs and endMs, sampled every stepMin, where everyone is inside their working day. */
  function commonWindows(people, startMs, endMs, stepMin = 15) {
    const step = stepMin * 60000;
    const out = [];
    let cur = null;
    for (let t = startMs; t < endMs; t += step) {
      if (people.length && people.every((p) => isWorkingAt(p, t))) {
        if (cur) cur.end = t + step;
        else cur = { start: t, end: t + step };
      } else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out;
  }

  /** The 24 hours from local midnight of iso in refZone. */
  function dayWindows(people, refZone, iso, stepMin = 15) {
    const start = Z.startOfDay(refZone, iso);
    return commonWindows(people, start, start + 24 * 3600000, stepMin);
  }

  ns.work = Object.freeze({ normalize, isWorkingAt, commonWindows, dayWindows, DEFAULT_DAYS });
})(typeof window !== 'undefined' ? window : globalThis);
