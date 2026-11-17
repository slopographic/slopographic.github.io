/* Slop Time meeting planner: pick zones, a day and a slot length, and see the hours when everyone is inside their
 * working hours. The day is the 24 hours from local midnight in my zone. Classic script (after state.js, ui.js, work.js).
 * Exposes window.SlopTime.meet. The zone list is kept for this visit only (use "My cities" to reset it). */
(function (g) {
  'use strict';
  const ns = (g.SlopTime = g.SlopTime || {});
  const T = g.SlopTime, Z = ns.zones, S = ns.state, W = ns.work, UI = ns.ui, $ = UI.$;
  let zones = [];
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  function renderChips() {
    const list = $('st-meet-zones');
    list.replaceChildren(...zones.map((z) => {
      const li = document.createElement('li');
      li.className = 'st-chip';
      const name = document.createElement('span');
      name.textContent = Z.cityOf(z);
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'st-btn st-small';
      x.textContent = '×';
      x.setAttribute('aria-label', t('time.meet.remove', { city: Z.cityOf(z) }));
      x.addEventListener('click', () => { zones = zones.filter((k) => k !== z); render(); });
      li.append(name, x);
      return li;
    }));
  }

  function render() {
    const p = S.prefs();
    const day = $('st-meet-date').value || UI.todayIn(p.zone);
    const step = Number($('st-meet-step').value) || 30;
    const people = zones.map((z) => W.normalize({ zone: z, days: p.days, start: p.start, end: p.end }, z));
    const home = p.zone;
    renderChips();
    const out = $('st-meet-out');
    out.replaceChildren();
    if (!zones.length) { $('st-meet-none').textContent = t('time.meet.add_one'); $('st-meet-none').hidden = false; return; }
    const wins = W.dayWindows([{ zone: home, days: p.days, start: p.start, end: p.end }, ...people], home, day, step);
    $('st-meet-none').hidden = wins.length > 0;
    $('st-meet-none').textContent = t('time.meet.none', { day, city: Z.cityOf(home) });
    for (const w of wins) {
      const li = document.createElement('li');
      const head = document.createElement('p');
      head.className = 'st-win-head';
      head.textContent = t('time.meet.your_time', { window: UI.windowLabel(home, w.start, w.end) });
      const each = document.createElement('p');
      each.className = 'st-win-each';
      each.textContent = zones.map((z) => `${Z.cityOf(z)} ${UI.hm(z, w.start)}–${UI.hm(z, w.end)}`).join(' · ');
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'st-btn st-small';
      add.textContent = t('time.meet.add_cal');
      add.setAttribute('aria-label', t('time.meet.add_cal_aria', { window: UI.windowLabel(home, w.start, w.end) }));
      add.addEventListener('click', () => addToCalendar(w, home));
      li.append(head, each, add);
      out.append(li);
    }
  }

  /** Saves one planned window to the shared Calendar as a meeting in the home zone (the Calendar reads it from the same store). */
  async function addToCalendar(w, home) {
    const msg = $('st-meet-msg');
    msg.textContent = '';
    if (!g.SlopEvents || !g.SlopData) { msg.textContent = t('time.meet.no_cal'); return; }
    const a = T.parts(w.start, home), b = T.parts(w.end, home);
    const hm = (q) => `${UI.pad(q.h)}:${UI.pad(q.mi)}`;
    const people = zones.map((z) => Z.cityOf(z));
    const made = g.SlopEvents.fromForm({ title: people.length ? `Meeting with ${people.join(', ')}` : 'Meeting', kind: 'meeting',   // i18n-ignore: the event's own text, saved in the user's calendar
      allDay: false, date: a.day, endDate: b.day, startTime: hm(a), endTime: hm(b), tz: home,
      notes: `Planned in Slop Time, ${zones.map((z) => `${Z.cityOf(z)} ${UI.hm(z, w.start)}–${UI.hm(z, w.end)}`).join(', ')}.` });   // i18n-ignore: the event's own text, saved in the user's calendar
    if (!made.ok) { msg.textContent = made.error; return; }
    const r = await g.SlopEvents.save(made.value);
    msg.textContent = r.ok ? t('time.meet.added', { window: UI.windowLabel(home, w.start, w.end) }) : (r.message || t('time.meet.not_added'));
  }

  function addZone() {
    const z = $('st-meet-add').value.trim();
    if (!Z.isZone(z)) { $('st-meet-err').textContent = t('time.meet.bad_zone'); return; }
    $('st-meet-err').textContent = '';
    if (!zones.includes(z)) zones = [...zones, z];
    $('st-meet-add').value = '';
    render();
  }

  function init() {
    const p = S.prefs();
    zones = S.cities().filter((z) => z !== p.zone).slice(0, 4);
    $('st-meet-date').value = UI.todayIn(p.zone);
    $('st-meet-add-btn').addEventListener('click', addZone);
    $('st-meet-add').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addZone(); } });
    $('st-meet-cities').addEventListener('click', () => { zones = S.cities().filter((z) => z !== S.prefs().zone); render(); });
    for (const id of ['st-meet-date', 'st-meet-step']) $(id).addEventListener('input', render);
    render();
  }

  ns.meet = Object.freeze({ init, render });
})(typeof window !== 'undefined' ? window : globalThis);
