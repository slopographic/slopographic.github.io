// Slop Timesheets timer: Start notes the time (kept in this browser, so a reload or another tab keeps it running); Stop
// opens a new entry with the minutes worked (at least one), the description and the customer filled in, to check and save.
// Nothing is stored in the books until that entry is saved.
(function (g) {
  'use strict';
  const NS = (g.SlopTimesheets = g.SlopTimesheets || {});
  const $ = (id) => document.getElementById(id);
  const KEY = 'slop-timesheets.timer';
  let tick = 0;
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);

  function read() { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && Number.isFinite(v.start) ? v : null; } catch (e) { return null; } }
  function write(v) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* storage blocked: the timer lasts this page */ } }
  let mem = null;   // the timer when storage is blocked
  const current = () => read() || mem;

  /** Elapsed time as h:mm:ss. */
  function clock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000)), p = (n) => String(n).padStart(2, '0');
    return `${Math.floor(s / 3600)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
  }

  function paint() {
    const run = current(), on = !!run;
    $('tmGo').textContent = t(on ? 'timesheets.tm.stop' : 'timesheets.tm.start');
    $('tmGo').className = on ? 'btn danger' : 'btn primary';   // i18n-ignore: CSS class names
    $('tmClock').textContent = on ? clock(Date.now() - run.start) : '0:00:00';
    $('tmCard').classList.toggle('is-running', on);
    if (on && document.activeElement !== $('tmDesc')) $('tmDesc').value = run.description || '';
    clearInterval(tick);
    if (on) tick = setInterval(() => { const c = current(); if (c) $('tmClock').textContent = clock(Date.now() - c.start); }, 1000);
  }

  function start() {
    mem = { start: Date.now(), description: $('tmDesc').value.trim(), customerId: $('tCustomer').value };
    write(mem);
    paint();
  }

  /** Stops the timer and opens the new entry with what it measured. */
  function stop() {
    const cur = current();
    if (!cur) return;
    const minutes = Math.min(1440, Math.max(1, Math.ceil((Date.now() - cur.start) / 60000)));
    NS.state.prefill = { minutes, description: $('tmDesc').value.trim() || cur.description || '', customerId: cur.customerId || '' };
    mem = null;
    write(null);
    paint();
    NS.app.go('new');
  }

  function mount() {
    $('tmGo').addEventListener('click', () => (current() ? stop() : start()));
    $('tmDesc').addEventListener('input', () => { const entry = current(); if (entry) { entry.description = $('tmDesc').value; mem = entry; write(entry); } });
    addEventListener('storage', (e) => { if (e.key === KEY) paint(); });
    if (g.SlopI18n) g.SlopI18n.on(paint);   // Start timer / Stop in the new language
    paint();
  }

  NS.timer = { mount, paint, start, stop, running: () => !!current(), clock };
  NS.views = NS.views || {};
  NS.views.timer = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
