/* Slop Time: stopwatch and countdown state. Pure, classic script: every function takes the clock as an argument
 * (now, in ms), so tests can use fixed times. Exposes window.SlopTime.timers:
 *   stopwatch: newStopwatch(), swElapsed(sw, now), swStart, swStop, swLap(sw, now), swReset()
 *   countdown: newTimer(ms), tmRemaining(t, now), tmStart(t, now), tmPause(t, now), tmSet(t, ms), tmDone(t, now)
 *   formatClock(ms, tenths)     → 'H:MM:SS' or 'H:MM:SS.t'
 *   parseDuration(text)         → ms for '5' (minutes), '4:30' (m:ss), '1:05:00' (h:mm:ss), or null */
(function (g) {
  'use strict';
  const ns = (g.SlopTime = g.SlopTime || {});

  const newStopwatch = () => ({ running: false, accMs: 0, startedAt: 0, laps: [] });
  const swElapsed = (sw, now) => sw.accMs + (sw.running ? Math.max(0, now - sw.startedAt) : 0);
  const swStart = (sw, now) => (sw.running ? sw : Object.assign({}, sw, { running: true, startedAt: now }));
  const swStop = (sw, now) => (!sw.running ? sw : Object.assign({}, sw, { running: false, accMs: swElapsed(sw, now), startedAt: 0 }));
  function swLap(sw, now) {
    const total = swElapsed(sw, now);
    const prev = sw.laps.length ? sw.laps[sw.laps.length - 1].total : 0;
    return Object.assign({}, sw, { laps: [...sw.laps, { total, split: total - prev }] });
  }
  const swReset = () => newStopwatch();

  const newTimer = (ms) => ({ ms, remainingMs: ms, running: false, endAt: 0 });
  function tmRemaining(t, now) { return t.running ? Math.max(0, t.endAt - now) : t.remainingMs; }
  const tmStart = (t, now) => (t.running || t.remainingMs <= 0 ? t : Object.assign({}, t, { running: true, endAt: now + t.remainingMs }));
  const tmPause = (t, now) => (!t.running ? t : Object.assign({}, t, { running: false, remainingMs: tmRemaining(t, now), endAt: 0 }));
  const tmSet = (t, ms) => newTimer(Math.max(0, ms));
  const tmDone = (t, now) => t.ms > 0 && tmRemaining(t, now) === 0;

  function formatClock(ms, tenths = false) {
    const total = Math.max(0, Math.floor(ms));
    const h = Math.floor(total / 3600000), m = Math.floor((total % 3600000) / 60000), s = Math.floor((total % 60000) / 1000);
    const base = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return tenths ? `${base}.${Math.floor((total % 1000) / 100)}` : base;
  }

  function parseDuration(text) {
    const t = String(text || '').trim();
    if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 60000);
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
    if (!m) return null;
    const hasHours = m[3] !== undefined;
    const h = hasHours ? +m[1] : 0, mi = hasHours ? +m[2] : +m[1], s = hasHours ? +m[3] : +m[2];
    if (mi > 59 || s > 59) return null;
    return ((h * 60 + mi) * 60 + s) * 1000;
  }

  ns.timers = Object.freeze({ newStopwatch, swElapsed, swStart, swStop, swLap, swReset, newTimer, tmRemaining, tmStart, tmPause, tmSet, tmDone, formatClock, parseDuration });
})(typeof window !== 'undefined' ? window : globalThis);
