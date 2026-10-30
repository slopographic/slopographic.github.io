/* Slop Time "My time": my working pattern (home zone, hours, days) and "My time in…", which shows the time in a chosen
 * city and when my working hours fall there. Classic script (after state.js, ui.js, work.js). Exposes window.SlopTime.my. */
(function (g) {
  'use strict';
  const ns = (g.SlopTime = g.SlopTime || {});
  const Z = ns.zones, S = ns.state, W = ns.work, UI = ns.ui, $ = UI.$;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  function readPrefs() {
    const days = [...document.querySelectorAll('input[name="st-day"]:checked')].map((i) => Number(i.value));
    return { zone: $('st-home').value.trim(), days, start: Number($('st-start').value), end: Number($('st-end').value) };
  }
  function showPrefs(p) {
    $('st-home').value = p.zone;
    $('st-start').value = String(p.start);
    $('st-end').value = String(p.end);
    document.querySelectorAll('input[name="st-day"]').forEach((i) => { i.checked = p.days.includes(Number(i.value)); });
  }
  function savePrefs() {
    const raw = readPrefs();
    if (!Z.isZone(raw.zone)) { $('st-prefs-err').textContent = t('time.my.bad_home'); return; }
    S.setPrefs(raw);
    $('st-prefs-err').textContent = '';
    ns.world.render();
    render();
  }

  function render() {
    const p = S.prefs();
    const zone = $('st-my-zone').value.trim();
    const out = $('st-my-out');
    out.replaceChildren();
    if (!Z.isZone(zone)) { $('st-my-msg').textContent = t(zone ? 'time.my.bad_zone' : 'time.my.pick_city'); return; }
    const now = S.nowMs();
    const day = $('st-my-date').value || UI.todayIn(p.zone);
    const target = W.normalize({ zone, days: p.days, start: p.start, end: p.end }, zone);
    const mine = W.dayWindows([p], p.zone, day);
    const both = W.dayWindows([p, target], p.zone, day);
    const lines = [
      t('time.my.it_is', { time: UI.hm(zone, now), day: UI.dayLabel(zone, now), city: Z.cityOf(zone), gmt: Z.gmtLabel(Z.offsetMinutes(zone, now)) }),
      t(W.isWorkingAt(target, now) ? 'time.my.inside' : 'time.my.outside'),
    ];
    $('st-my-msg').textContent = lines.join(' ');
    addSection(out, t('time.my.yours'), mine, p.zone, zone, t('time.my.none', { day }));
    addSection(out, t('time.my.both'), both, p.zone, zone, t('time.my.no_overlap', { day }));
  }

  function addSection(host, title, windows, homeZone, zone, emptyText) {
    const h = document.createElement('h3');
    h.textContent = title;
    host.append(h);
    if (!windows.length) { const q = document.createElement('p'); q.className = 'st-note'; q.textContent = emptyText; host.append(q); return; }
    const ul = document.createElement('ul');
    ul.className = 'st-windows';
    for (const w of windows) {
      const li = document.createElement('li');
      li.textContent = t('time.my.window', { mine: UI.windowLabel(homeZone, w.start, w.end), theirs: UI.windowLabel(zone, w.start, w.end) });
      ul.append(li);
    }
    host.append(ul);
  }

  function init() {
    const prefs = S.prefs();
    showPrefs(prefs);
    $('st-my-date').value = UI.todayIn(prefs.zone);
    for (const id of ['st-home', 'st-start', 'st-end']) $(id).addEventListener('change', savePrefs);
    document.querySelectorAll('input[name="st-day"]').forEach((i) => i.addEventListener('change', savePrefs));
    for (const id of ['st-my-zone', 'st-my-date']) $(id).addEventListener('input', render);
    render();
  }

  ns.my = Object.freeze({ init, render, savePrefs });
})(typeof window !== 'undefined' ? window : globalThis);
