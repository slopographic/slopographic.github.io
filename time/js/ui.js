/* Slop Time display helpers shared by the panels. Classic script (after state.js). Exposes window.SlopTime.ui:
 *   $(id)                     getElementById
 *   pad(n)                    two digits
 *   hm(zone, ms)              'HH:MM' on the zone's clock
 *   dayLabel(zone, ms)        'Tue 13 Oct'
 *   windowLabel(zone, a, b)   'Tue 13 Oct 09:00 to 17:00' (the end shows its day when it differs)
 *   todayIn(zone)             'YYYY-MM-DD' of today in the zone */
(function (g) {
  'use strict';
  const ns = (g.SlopTime = g.SlopTime || {});
  const Z = ns.zones;
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  function hm(zone, ms) { const p = Z.localParts(zone, ms); return `${pad(p.h)}:${pad(p.mi)}`; }
  function dayLabel(zone, ms) { const p = Z.localParts(zone, ms); return Z.dayText(p); }
  function windowLabel(zone, a, b) {
    const s = Z.localParts(zone, a), e = Z.localParts(zone, b);
    const sameDay = s.d === e.d && s.mo === e.mo && s.y === e.y;
    return t('time.ui.window', { day: dayLabel(zone, a), from: hm(zone, a), to: sameDay ? hm(zone, b) : `${dayLabel(zone, b)} ${hm(zone, b)}` });
  }
  const todayIn = (zone) => Z.dateIso(zone, ns.state.nowMs());

  ns.ui = Object.freeze({ $, pad, hm, dayLabel, windowLabel, todayIn });
})(typeof window !== 'undefined' ? window : globalThis);
