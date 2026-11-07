/* Slop Time: a MANUAL clock offset. This is not a network sync: the app makes no network calls. The person types the
 * time from a source they trust, and the app records how far this device's clock was from it at that moment.
 * Pure, classic script (after zones.js). Exposes window.SlopTime.sync:
 *   referenceMs(zone, iso, clockText) → the instant typed (clockText is HH:MM or HH:MM:SS), or null
 *   offsetFor(referenceMs, deviceMs)  → reference − device, in ms (positive: the device clock is behind)
 *   correctedNow(offsetMs, deviceMs)  → the device time moved by the offset
 *   describe(offsetMs)                → 'The device clock was 2.4 s behind the reference you entered.' */
(function (g) {
  'use strict';
  const ns = (g.SlopTime = g.SlopTime || {});
  const Z = ns.zones, C = ns.convert;

  function referenceMs(zone, iso, clockText) {
    const day = C.parseIsoDate(iso), clock = C.parseClock(clockText);
    if (!day || !clock || !Z.isZone(zone)) return null;
    const [y, mo, d] = day.split('-').map(Number);
    return Z.zonedToUtc(zone, y, mo, d, clock.h, clock.mi, clock.s || 0);
  }
  const offsetFor = (referenceMs, deviceMs) => referenceMs - deviceMs;
  const correctedNow = (offsetMs, deviceMs = Date.now()) => deviceMs + (Number(offsetMs) || 0);

  function describe(offsetMs) {
    const abs = Math.abs(offsetMs) / 1000;
    const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
    if (abs < 0.05) return tr('time.sync.matched');
    let amount;
    if (abs < 60) amount = tr('time.sync.s', { s: g.SlopI18n && g.SlopI18n.num ? g.SlopI18n.num(Number(abs.toFixed(1)), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : abs.toFixed(1) });
    else {
      const total = Math.round(abs), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
      amount = h ? tr('time.sync.h_min', { h: String(h), m: String(m) }) : tr('time.sync.min_s', { m: String(m), s: String(s) });
    }
    return tr(offsetMs > 0 ? 'time.sync.behind' : 'time.sync.ahead', { amount });
  }

  ns.sync = Object.freeze({ referenceMs, offsetFor, correctedNow, describe });
})(typeof window !== 'undefined' ? window : globalThis);
