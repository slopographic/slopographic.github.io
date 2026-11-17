/* Slop Time: time zones from the browser's own Intl data (no downloads, no network). Pure, classic script.
 * Exposes window.SlopTime.zones:
 *   list()                       → every IANA zone the browser knows (fallback: a short list)
 *   isZone(name)                 → true when Intl accepts the zone
 *   search(list, query, limit)   → zones whose name matches every word of query, best matches first
 *   cityOf(zone)                 → 'New York' for 'America/New_York'
 *   localParts(zone, ms)         → { y, mo, d, h, mi, s, wd } wall-clock time in the zone (wd: 0 = Sunday)
 *   offsetMinutes(zone, ms)      → minutes east of UTC at that instant (DST-aware)
 *   gmtLabel(minutes)            → 'GMT', 'GMT+9', 'GMT-3:30'
 *   zonedToUtc(zone, y, mo, d, h, mi, s) → the instant (ms) of a wall-clock time in the zone. A time in a spring-forward
 *                                  gap moves forward by the gap; an ambiguous one (fall back) takes the earlier instant.
 *   dateIso(zone, ms)            → 'YYYY-MM-DD' of the zone's calendar day
 *   startOfDay(zone, iso)        → instant of 00:00 on that calendar day in the zone
 *   WEEKDAYS, MONTHS             → short English names */
(function (g) {
  'use strict';
  const ns = (g.SlopTime = g.SlopTime || {});
  const WEEKDAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);   // i18n-ignore: English names that Intl's en-US parts are matched against (data); the page shows dayText()
  const MONTHS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);   // i18n-ignore: English names that Intl's en-US parts are matched against (data); the page shows dayText()
  /** 'Wed 1 Jul' for local parts { y, mo, d, wd }: these English names, or the chosen language's (Intl) on a translated page. */
  function dayText(p) {
    const I = g.SlopI18n, lang = I && I.get ? I.get() : 'en';
    if (lang === 'en') return `${WEEKDAYS[p.wd]} ${p.d} ${MONTHS[p.mo - 1]}`;
    try { return new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(p.y, p.mo - 1, p.d))); } catch (e) { return `${WEEKDAYS[p.wd]} ${p.d} ${MONTHS[p.mo - 1]}`; }
  }
  const FALLBACK = ['UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago',
    'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata',
    'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];
  let all = null;
  const formatters = new Map();

  function list() {
    if (!all) {
      let zones = [];
      try { zones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : []; } catch (e) { zones = []; }
      all = (zones.length ? zones : FALLBACK).slice();
      if (!all.includes('UTC')) all.push('UTC');
    }
    return all;
  }

  function formatter(zone) {
    let f = formatters.get(zone);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' });
      formatters.set(zone, f);
    }
    return f;
  }

  function isZone(name) {
    if (!name) return false;
    try { formatter(String(name)); return true; } catch (e) { formatters.delete(String(name)); return false; }
  }

  function localParts(zone, ms) {
    const p = {};
    for (const part of formatter(zone).formatToParts(new Date(ms))) p[part.type] = part.value;
    return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, wd: WEEKDAYS.indexOf(p.weekday) };
  }

  function offsetMinutes(zone, ms) {
    const p = localParts(zone, ms);
    const wall = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    const whole = Math.floor(ms / 1000) * 1000;
    return Math.round((wall - whole) / 60000);
  }

  function gmtLabel(minutes) {
    if (!minutes) return 'GMT';
    const sign = minutes < 0 ? '-' : '+';
    const a = Math.abs(minutes), h = Math.floor(a / 60), m = a % 60;
    return `GMT${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
  }

  function zonedToUtc(zone, y, mo, d, h, mi, s = 0) {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    const o1 = offsetMinutes(zone, guess);
    const t1 = guess - o1 * 60000;
    const o2 = offsetMinutes(zone, t1);
    if (o2 === o1) return t1;
    const t2 = guess - o2 * 60000;
    if (offsetMinutes(zone, t2) === o2) return t2;
    return t1; // inside a spring-forward gap: the time moves forward by the gap
  }

  const pad = (n) => String(n).padStart(2, '0');
  function dateIso(zone, ms) {
    const p = localParts(zone, ms);
    return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
  }
  function startOfDay(zone, iso) {
    const [y, mo, d] = iso.split('-').map(Number);
    return zonedToUtc(zone, y, mo, d, 0, 0, 0);
  }

  function cityOf(zone) {
    const last = String(zone || '').split('/').pop() || zone;
    return last.replace(/_/g, ' ');
  }

  /** Every word of the query must appear in the zone name. Matches at the start of a word rank first. */
  function search(zones, query, limit = 50) {
    const words = String(query || '').toLowerCase().replace(/_/g, ' ').split(/\s+/).filter(Boolean);
    if (!words.length) return zones.slice(0, limit);
    const hits = [];
    for (const z of zones) {
      const hay = z.toLowerCase().replace(/_/g, ' ');
      if (!words.every((w) => hay.includes(w))) continue;
      const starts = words.every((w) => hay.split(/[\s/-]/).some((part) => part.startsWith(w)));
      hits.push({ z, rank: starts ? 0 : 1 });
    }
    hits.sort((a, b) => a.rank - b.rank || a.z.localeCompare(b.z));
    return hits.slice(0, limit).map((h) => h.z);
  }

  ns.zones = Object.freeze({ list, isZone, search, cityOf, localParts, offsetMinutes, gmtLabel, zonedToUtc, dateIso, startOfDay, dayText, WEEKDAYS, MONTHS });
})(typeof window !== 'undefined' ? window : globalThis);
