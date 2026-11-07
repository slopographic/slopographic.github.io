/* Slop Time: time zone conversion and time difference. Pure, classic script (after zones.js). Exposes window.SlopTime.convert:
 *   parseClock(text)            → { h, mi, s } for 9:30, 09:30 or 09:30:15, else null
 *   parseIsoDate(text)          → 'YYYY-MM-DD' when it is a real date, else null
 *   convertTime(fromZone, iso, clock, zones) → { instant, rows: [{ zone, city, time, day, dayShift, gmt }] }
 *       dayShift is -1, 0 or 1: the zone's calendar day compared with the source day
 *   difference(a, b, ms)        → { minutes, text }: how far zone b is ahead of zone a at that instant (negative = behind)
 *   fmtHours(minutes)           → '5 hours', '5 h 30 min', '1 hour' */
(function (g) {
  'use strict';
  const ns = (g.SlopTime = g.SlopTime || {});
  const Z = ns.zones;
  const pad = (n) => String(n).padStart(2, '0');
  const DAY = 864e5;

  function parseClock(text) {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(text || '').trim());
    if (!m) return null;
    const h = +m[1], mi = +m[2], s = m[3] ? +m[3] : 0;
    if (h > 23 || mi > 59 || s > 59) return null;
    return { h, mi, s };
  }
  function parseIsoDate(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || '').trim());
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  function convertTime(fromZone, iso, clock, zones) {
    const [y, mo, d] = iso.split('-').map(Number);
    const instant = Z.zonedToUtc(fromZone, y, mo, d, clock.h, clock.mi, clock.s || 0);
    const sourceDay = Date.UTC(y, mo - 1, d);
    const rows = zones.map((zone) => {
      const t = Z.localParts(zone, instant);
      return {
        zone, city: Z.cityOf(zone), time: `${pad(t.h)}:${pad(t.mi)}`,
        day: Z.dayText(t),
        dayShift: Math.round((Date.UTC(t.y, t.mo - 1, t.d) - sourceDay) / DAY),
        gmt: Z.gmtLabel(Z.offsetMinutes(zone, instant)),
      };
    });
    return { instant, rows };
  }

  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  function fmtHours(minutes) {
    const a = Math.abs(minutes), h = Math.floor(a / 60), m = a % 60;
    if (!m) return tr('time.conv.hours', { n: h });
    return h ? tr('time.conv.h_min', { h: String(h), m: String(m) }) : tr('time.conv.min', { m: String(m) });
  }

  function difference(a, b, ms) {
    const minutes = Z.offsetMinutes(b, ms) - Z.offsetMinutes(a, ms);
    let text;
    if (!minutes) text = tr('time.conv.same', { a: Z.cityOf(a), b: Z.cityOf(b) });
    else text = tr(minutes > 0 ? 'time.conv.ahead' : 'time.conv.behind', { a: Z.cityOf(a), b: Z.cityOf(b), hours: fmtHours(minutes) });
    return { minutes, text };
  }

  ns.convert = Object.freeze({ parseClock, parseIsoDate, convertTime, difference, fmtHours });
})(typeof window !== 'undefined' ? window : globalThis);
