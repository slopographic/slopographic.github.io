/* Slop Time stopwatch and countdown. State is in memory (it resets on reload, by design). Classic script (after
 * timers.js and ui.js). Exposes window.SlopTime.clocks: init(), tick(), toggleStopwatch(), lap(), resetStopwatch(),
 * toggleTimer(), resetTimer(), setTimer(text). A finished countdown notifies once with a toast and the page title. */
(function (g) {
  'use strict';
  const ns = (g.SlopTime = g.SlopTime || {});
  const T = ns.timers, UI = ns.ui, $ = UI.$;
  let sw = T.newStopwatch();
  let tm = T.newTimer(5 * 60000);
  let notified = false, doneMark = '';
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const baseTitle = () => (doneMark && document.title.startsWith(doneMark + ' ') ? document.title.slice(doneMark.length + 1) : document.title);

  function now() { return Date.now(); }

  function renderStopwatch(again) {
    $('st-sw-time').textContent = T.formatClock(T.swElapsed(sw, now()), true);
    $('st-sw-go').textContent = t(sw.running ? 'time.clock.stop' : 'time.clock.start');
    $('st-sw-go').setAttribute('aria-pressed', String(sw.running));
    $('st-sw-lap').disabled = !sw.running;
    const list = $('st-sw-laps');
    if (list.childElementCount !== sw.laps.length || again === true) {
      list.replaceChildren(...sw.laps.map((l, i) => {
        const li = document.createElement('li');
        li.textContent = t('time.clock.lap', { n: String(i + 1), total: T.formatClock(l.total, true), split: T.formatClock(l.split, true) });
        return li;
      }));
    }
  }

  function renderTimer() {
    const left = T.tmRemaining(tm, now());
    $('st-tm-time').textContent = T.formatClock(left);
    $('st-tm-go').textContent = t(tm.running ? 'time.clock.pause' : 'time.clock.start');
    $('st-tm-go').setAttribute('aria-pressed', String(tm.running));
    if (T.tmDone(tm, now()) && !notified) {
      notified = true;
      tm = Object.assign({}, tm, { running: false, remainingMs: 0, endAt: 0 });
      $('st-tm-time').textContent = T.formatClock(0);
      if (window.SlopUI && SlopUI.toast) SlopUI.toast(t('time.clock.done'));
      const base = baseTitle(); doneMark = t('time.clock.done_title'); document.title = doneMark + ' ' + base;
    }
  }

  function tick(again) { renderStopwatch(again); renderTimer(); }

  function toggleStopwatch() { sw = sw.running ? T.swStop(sw, now()) : T.swStart(sw, now()); tick(); }
  function lap() { if (sw.running) { sw = T.swLap(sw, now()); tick(); } }
  function resetStopwatch() { sw = T.swReset(); tick(); }
  function toggleTimer() {
    if (tm.running) tm = T.tmPause(tm, now());
    else if (T.tmRemaining(tm, now()) > 0) tm = T.tmStart(tm, now());
    else { $('st-tm-err').textContent = t('time.clock.set_first'); return; }
    $('st-tm-err').textContent = '';
    tick();
  }
  function resetTimer() { tm = T.tmSet(tm, tm.ms); notified = false; document.title = baseTitle(); tick(); }
  function setTimer(text) {
    const ms = T.parseDuration(text);
    if (ms === null || ms <= 0) { $('st-tm-err').textContent = t('time.clock.bad'); return; }
    tm = T.tmSet(tm, ms);
    notified = false;
    document.title = baseTitle();
    $('st-tm-err').textContent = '';
    tick();
  }

  function init() {
    $('st-sw-go').addEventListener('click', toggleStopwatch);
    $('st-sw-lap').addEventListener('click', lap);
    $('st-sw-reset').addEventListener('click', resetStopwatch);
    $('st-tm-go').addEventListener('click', toggleTimer);
    $('st-tm-reset').addEventListener('click', resetTimer);
    $('st-tm-set').addEventListener('click', () => setTimer($('st-tm-input').value));
    $('st-tm-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); setTimer($('st-tm-input').value); } });
    document.querySelectorAll('[data-min]').forEach((b) => b.addEventListener('click', () => setTimer(b.dataset.min)));
    tick();
  }

  ns.clocks = Object.freeze({ init, tick, toggleStopwatch, lap, resetStopwatch, toggleTimer, resetTimer, setTimer });
})(typeof window !== 'undefined' ? window : globalThis);
