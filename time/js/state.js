/* Slop Time shared state: the city list, my working pattern and the manual clock offset, all kept per viewer.
 * Classic script (after keep.js, zones.js, work.js, sync.js). Exposes window.SlopTime.state:
 *   device()           → this device's time zone
 *   cities() / setCities(zones)   the world-clock list, as zone names; stored as { v:1, data:[{ zone }] }
 *   prefs() / setPrefs(p)         my working pattern { zone, days, start, end }
 *   offset() / setOffset(o) / clearOffset()   the manual offset { offsetMs, setAt, reference } (not a network sync)
 *   nowMs()            → the device time moved by the manual offset when one is set */
(function (g) {
  'use strict';
  const ns = (g.SlopTime = g.SlopTime || {});
  const KEEP = g.SlopTimeKeep, Z = ns.zones, W = ns.work, SY = ns.sync;
  const KEY = { cities: 'slop.time.cities', prefs: 'slop.time.prefs', offset: 'slop.time.offset' };
  const DEFAULT_CITIES = ['Europe/London', 'America/New_York', 'Asia/Tokyo'];

  function device() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; }
  }
  function cities() {
    const data = KEEP.get(KEY.cities, null);
    const zones = Array.isArray(data) ? data.map((c) => c && c.zone) : DEFAULT_CITIES;
    return [...new Set(zones.filter((z) => Z.isZone(z)))];
  }
  function setCities(zones) {
    const clean = [...new Set(zones)].filter((z) => Z.isZone(z));
    KEEP.put(KEY.cities, clean.map((zone) => ({ zone })));
  }
  function prefs() { return W.normalize(KEEP.get(KEY.prefs, null) || {}, device()); }
  function setPrefs(p) { KEEP.put(KEY.prefs, W.normalize(p, device())); }
  function offset() {
    const d = KEEP.get(KEY.offset, null);
    return d && Number.isFinite(d.offsetMs) ? d : null;
  }
  function setOffset(o) { KEEP.put(KEY.offset, o); }
  function clearOffset() { KEEP.put(KEY.offset, null); }
  function nowMs() {
    const o = offset();
    return o ? SY.correctedNow(o.offsetMs, Date.now()) : Date.now();
  }

  ns.state = Object.freeze({ device, cities, setCities, prefs, setPrefs, offset, setOffset, clearOffset, nowMs });
})(typeof window !== 'undefined' ? window : globalThis);
