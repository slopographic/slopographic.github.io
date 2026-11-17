/* Slop Time world clock: one card per city (local time, day, working day, working hours), a search to add a city or
 * zone from the browser's own zone list, and remove. Classic script (after state.js, ui.js). Exposes window.SlopTime.world:
 * render() is called on every tick and only updates the text; the cards are rebuilt when the list changes. */
(function (g) {
  'use strict';
  const ns = (g.SlopTime = g.SlopTime || {});
  const Z = ns.zones, S = ns.state, UI = ns.ui, $ = UI.$;
  let signature = null;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const cards = new Map();

  function makeCard(zone) {
    const li = document.createElement('li');
    li.className = 'st-card';
    li.dataset.zone = zone;
    const head = document.createElement('div');
    head.className = 'st-card-head';
    const name = document.createElement('h3');
    name.textContent = Z.cityOf(zone);
    const id = document.createElement('span');
    id.className = 'st-zone';
    id.textContent = zone;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'st-btn st-small';
    remove.textContent = t('time.world.remove');
    remove.setAttribute('aria-label', t('time.world.remove_aria', { city: Z.cityOf(zone) }));
    remove.addEventListener('click', () => { S.setCities(S.cities().filter((z) => z !== zone)); signature = null; render(); });
    head.append(name, remove);
    const time = document.createElement('p');
    time.className = 'st-time';
    time.innerHTML = '<span class="st-hm"></span><span class="st-sec"></span>';
    const day = document.createElement('p');
    day.className = 'st-day';
    const badges = document.createElement('p');
    badges.className = 'st-badges';
    li.append(head, id, time, day, badges);
    cards.set(zone, li);
    return li;
  }

  function updateCard(zone, at, prefs) {
    const li = cards.get(zone);
    const p = Z.localParts(zone, at);
    li.querySelector('.st-hm').textContent = `${UI.pad(p.h)}:${UI.pad(p.mi)}`;
    li.querySelector('.st-sec').textContent = `:${UI.pad(p.s)}`;
    li.querySelector('.st-day').textContent = UI.dayLabel(zone, at) + ' · ' + Z.gmtLabel(Z.offsetMinutes(zone, at));
    const workDay = prefs.days.includes(p.wd);
    const minutes = p.h * 60 + p.mi;
    const inHours = workDay && minutes >= prefs.start * 60 && minutes < prefs.end * 60;
    const badges = li.querySelector('.st-badges');
    badges.replaceChildren();
    const add = (text, cls) => { const s = document.createElement('span'); s.className = 'st-badge ' + cls; s.textContent = text; badges.append(s); };
    add(t(workDay ? 'time.world.work_day' : 'time.world.off_day'), workDay ? 'st-ok' : 'st-off');
    if (inHours) add(t('time.world.in_hours'), 'st-ok');
  }

  function rebuild(zones) {
    cards.clear();
    const list = $('st-cities');
    list.replaceChildren(...zones.map(makeCard));
    $('st-world-empty').hidden = zones.length > 0;
  }

  function render(again) {
    const zones = S.cities();
    const key = zones.join('|');
    if (key !== signature || again === true) { signature = key; rebuild(zones); }
    const now = S.nowMs(), prefs = S.prefs();
    for (const z of zones) updateCard(z, now, prefs);
    const off = S.offset();
    $('st-world-note').textContent = off
      ? t('time.world.note_offset')
      : t('time.world.note', { zone: S.device() });
  }

  function addZone(zone) {
    const zones = S.cities();
    if (!zones.includes(zone)) S.setCities([...zones, zone]);
    signature = null;
    $('st-add').value = '';
    $('st-add-results').replaceChildren();
    render();
  }

  function showResults() {
    const q = $('st-add').value.trim();
    const list = $('st-add-results');
    if (!q) { list.replaceChildren(); return; }
    const now = S.nowMs();
    const hits = Z.search(Z.list(), q, 12);
    list.replaceChildren(...hits.map((zone) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'st-result';
      b.textContent = `${Z.cityOf(zone)} · ${zone} · ${UI.hm(zone, now)} ${Z.gmtLabel(Z.offsetMinutes(zone, now))}`;
      b.addEventListener('click', () => addZone(zone));
      li.append(b);
      return li;
    }));
    if (!hits.length) { const li = document.createElement('li'); li.className = 'st-note'; li.textContent = t('time.world.no_match'); list.append(li); }
  }

  function init() {
    $('st-add').addEventListener('input', showResults);
    $('st-add').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const first = $('st-add-results').querySelector('button');
      if (first) first.click();
    });
    render();
  }

  ns.world = Object.freeze({ init, render, addZone, showResults });
})(typeof window !== 'undefined' ? window : globalThis);
