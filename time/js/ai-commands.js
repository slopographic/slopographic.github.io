/* Slop Time for the assistant: SlopCmd commands with arguments, loaded on demand by SlopCmd.prepare() (commands.js).
 * Through the page's own parts (SlopTime.state, zones, convert, world): add_city and remove_city (destructive) on the world
 * clock, convert_time (a time in one zone shown in others), create_meeting (a meeting in Slop Calendar through the shared
 * store, as the planner's Add to Calendar), set_countdown, and export_clocks (the cities with their time now as CSV, to
 * Slop Drive and/or a download). Cities are zone names (Europe/Lisbon) or city words (Lisbon). */
(function () {
  'use strict';
  const C = window.SlopCmd, T = () => window.SlopTime;
  if (!C || C.get('time.ai.add-city')) return;
  const add = C.aiAdder('time');   // shared/commands/commands.js
  /** A zone from a zone name or a city word. */
  function zone(q) {
    const Z = T().zones, s = String(q || '').trim();
    if (Z.isZone(s)) return s;
    const hit = Z.search(Z.list(), s, 1)[0];
    if (!hit) throw new Error(`No time zone matches “${q}”. Try a city name such as Lisbon or Sydney.`);
    return hit;
  }
  const CITY = (d) => ({ name: 'city', type: 'string', required: true, maxLength: 80, description: d || 'a city or a zone name such as Asia/Tokyo' });   // i18n-ignore: the assistant's tools and replies (English: API)
  const render = () => { T().world.render(); if (T().meet) T().meet.render(); };
  const TO = { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' };
  C.register([
    add('add_city', 'Add a city to the world clock', [CITY()], (a) => {   // i18n-ignore: the assistant's tools and replies (English: API)
      const z = zone(a.city), S = T().state;
      if (!S.cities().includes(z)) S.setCities([...S.cities(), z]);
      render();
      return `Added ${T().zones.cityOf(z)} (${z}); the world clock shows ${S.cities().length} cities.`;   // i18n-ignore: the assistant's tools and replies (English: API)
    }),
    add('remove_city', 'Remove a city', [CITY()], (a) => {   // i18n-ignore: the assistant's tools and replies (English: API)
      const z = zone(a.city), S = T().state;
      if (!S.cities().includes(z)) throw new Error(`${z} is not on the world clock`);
      S.setCities(S.cities().filter((x) => x !== z));
      render();
      return `Removed ${T().zones.cityOf(z)}.`;   // i18n-ignore: the assistant's tools and replies (English: API)
    }, { destructive: true }),
    add('convert_time', 'Convert a time between zones', [{ name: 'time', type: 'string', required: true, maxLength: 20, description: 'like 09:30 or 9:30 pm' },   // i18n-ignore: the assistant's tools and replies (English: API)
      { name: 'date', type: 'string', maxLength: 10, description: 'YYYY-MM-DD; today when empty' }, { name: 'from', type: 'string', maxLength: 80, description: 'city or zone; this device when empty' },
      { name: 'to', type: 'array', items: { type: 'string' }, maxItems: 30, description: 'cities or zones; the world clock when empty' }], (a) => {
      const V = T().convert, from = a.from ? zone(a.from) : T().state.device(), clock = V.parseClock(a.time);
      if (!clock) throw new Error(`“${a.time}” is not a time`);
      const iso = a.date ? V.parseIsoDate(a.date) : T().ui.todayIn(from);
      if (!iso) throw new Error(`“${a.date}” is not a date (YYYY-MM-DD)`);
      const to = (a.to && a.to.length ? a.to.map(zone) : T().state.cities());
      return { from, date: iso, time: a.time, rows: V.convertTime(from, iso, clock, to).rows };
    }, { macro: false }),
    add('create_meeting', 'Add a meeting to Slop Calendar', [{ name: 'title', type: 'string', maxLength: 200, default: 'Meeting' }, { name: 'date', type: 'string', required: true, maxLength: 10, description: 'YYYY-MM-DD' },   // i18n-ignore: the assistant's tools and replies (English: API)
      { name: 'start', type: 'string', required: true, maxLength: 5, description: 'HH:MM' }, { name: 'end', type: 'string', required: true, maxLength: 5, description: 'HH:MM' },
      { name: 'zone', type: 'string', maxLength: 80, description: 'city or zone of those times; my working zone when empty' }, { name: 'notes', type: 'string', maxLength: 2000 }], async (a) => {
      if (!window.SlopEvents || !window.SlopData) throw new Error('Calendar is not available in this browser');
      const tz = a.zone ? zone(a.zone) : T().state.prefs().zone;
      const made = window.SlopEvents.fromForm({ title: a.title, kind: 'meeting', allDay: false, date: a.date, endDate: a.date, startTime: a.start, endTime: a.end, tz, notes: a.notes || '' });
      if (!made.ok) throw new Error(made.error);
      const r = await window.SlopEvents.save(made.value);
      if (!r.ok) throw new Error(r.message || 'The meeting was not added');   // i18n-ignore: the assistant's tools and replies (English: API)
      return `Added “${a.title}” on ${a.date}, ${a.start}–${a.end} (${tz}) to Slop Calendar.`;   // i18n-ignore: the assistant's tools and replies (English: API)
    }),
    add('set_countdown', 'Set the countdown', [{ name: 'duration', type: 'string', required: true, maxLength: 20, description: 'like 5 (minutes), 4:30 or 1:05:00' }, { name: 'start', type: 'boolean', default: false }], (a) => {   // i18n-ignore: the assistant's tools and replies (English: API)
      const ms = T().timers.parseDuration(a.duration);
      if (!ms) throw new Error(`“${a.duration}” is not a duration`);
      window.SlopTimeApp.show('timers');
      T().clocks.setTimer(a.duration);
      if (a.start) T().clocks.toggleTimer();
      return `Countdown set to ${T().timers.formatClock(ms)}${a.start ? ' and started' : ''}.`;   // i18n-ignore: the assistant's tools and replies (English: API)
    }),
    add('export_clocks', 'Export the world clock', [TO], async (a) => {   // i18n-ignore: the assistant's tools and replies (English: API)
      const now = T().state.nowMs(), Z = T().zones;
      const rows = T().state.cities().map((z) => { const p = Z.localParts(z, now); return [Z.cityOf(z), z, `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`, T().ui.hm(z, now), Z.gmtLabel(Z.offsetMinutes(z, now))]; });
      const text = ['City,Zone,Date,Time,Offset', ...rows.map((r) => r.join(','))].join('\n') + '\n', name = 'world-clock.csv', blob = new Blob([text], { type: 'text/csv' }), out = [];
      if (a.to !== 'download') out.push(`Saved ${name} to Slop Drive (id ${await window.SlopHub.put(blob, { name, from: 'time' })})`);   // i18n-ignore: the assistant's tools and replies (English: API)
      if (a.to !== 'drive') { window.SlopUI.download(blob, name); out.push(`downloaded ${name}`); }
      return out.join(' and ') + '.';
    }),
  ]);
  C.provide({ state: () => ({ app: 'Slop Time', device: T().state.device(), cities: T().state.cities(), working: T().state.prefs() }),   // i18n-ignore: the assistant's tools and replies (English: API)
    checkpoint: () => { const c = T().state.cities(); return () => { T().state.setCities(c); render(); return true; }; } });
})();
