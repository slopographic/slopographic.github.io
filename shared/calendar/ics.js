// iCalendar (.ics) subset, RFC 5545: VEVENT with UID, DTSTAMP, DTSTART, DTEND, SUMMARY, LOCATION, DESCRIPTION, RRULE
// (FREQ daily, weekly, monthly, yearly with UNTIL), and VALARM (a DISPLAY alarm, as minutes before). Timed events use
// TZID (the zone name Intl understands) and no VTIMEZONE block; all-day events use VALUE=DATE. X-SLOP-COLOR and
// X-SLOP-KIND keep the colour and kind. Import never writes anything: it returns the records and warnings for a preview.
// Exposes window.SlopIcs. Needs tz.js and rrule.js first.
(function (g) {
  'use strict';
  const T = g.SlopTime;
  const NS = (g.SlopIcs = g.SlopIcs || {});
  const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
  const enc = new TextEncoder();
  /** A word from the shared tables (shared/i18n/ui/<code>/calendar.js), the key without SlopI18n. */
  const tr = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);

  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const unesc = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

  /** Folds one content line at 75 octets, continuing with a space (RFC 5545 section 3.1). */
  function fold(line) {
    if (enc.encode(line).length <= 75) return line;
    const out = [];
    let cur = '', n = 0;
    for (const ch of line) {
      const len = enc.encode(ch).length;
      const limit = out.length ? 74 : 75;
      if (n + len > limit) { out.push(cur); cur = ''; n = 0; }
      cur += ch; n += len;
    }
    out.push(cur);
    return out.join('\r\n ');
  }

  const compact = (day) => day.replace(/-/g, '');
  const utcStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const wallStamp = (ms, tz) => {
    const p = T.parts(ms, tz);
    const pad = (n) => String(n).padStart(2, '0');
    return `${compact(p.day)}T${pad(p.h)}${pad(p.mi)}${pad(p.s)}`;
  };

  /** One event record as a VEVENT block (array of lines). */
  function vevent(ev, stamp) {
    const L = [`UID:${ev.uid || `${ev.id}@slop-calendar`}`, `DTSTAMP:${utcStamp(stamp)}`];
    if (ev.allDay) {
      L.push(`DTSTART;VALUE=DATE:${compact(ev.startDay)}`, `DTEND;VALUE=DATE:${compact(T.addDays(ev.endDay || ev.startDay, 1))}`);
    } else {
      L.push(`DTSTART;TZID=${ev.tz}:${wallStamp(ev.start, ev.tz)}`, `DTEND;TZID=${ev.tz}:${wallStamp(ev.end, ev.tz)}`);
    }
    L.push(`SUMMARY:${esc(ev.title)}`);
    if (ev.location) L.push(`LOCATION:${esc(ev.location)}`);
    if (ev.notes) L.push(`DESCRIPTION:${esc(ev.notes)}`);
    if (ev.freq && ev.freq !== 'none') {
      let r = `RRULE:FREQ=${ev.freq.toUpperCase()}`;
      if (ev.until) {
        const d = T.parseDay(ev.until);
        r += `;UNTIL=${ev.allDay ? compact(ev.until) : utcStamp(T.wallToUtc(d.y, d.mo, d.d, 23, 59, ev.tz, 59))}`;
      }
      L.push(r);
    }
    L.push(`X-SLOP-COLOR:${ev.color || 'blue'}`, `X-SLOP-KIND:${ev.kind || 'event'}`);
    if (ev.remind !== undefined && ev.remind !== null) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-PT${ev.remind}M`, `DESCRIPTION:${esc(ev.title)}`, 'END:VALARM');
    }
    return L;
  }

  /** Builds the calendar file text. events are records from the store (with tz, start and so on). */
  function build(events, { now = Date.now(), name = 'Slop Calendar' } = {}) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Slopographic//Slop Calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(name)}`];
    for (const ev of events) lines.push('BEGIN:VEVENT', ...vevent(ev, now), 'END:VEVENT');
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  /** Splits text into logical lines: CRLF or LF, and continuation lines (starting with a space or tab) are joined. */
  function unfold(text) {
    const out = [];
    for (const raw of String(text).split(/\r?\n/)) {
      if (/^[ \t]/.test(raw) && out.length) out[out.length - 1] += raw.slice(1);
      else if (raw !== '') out.push(raw);
    }
    return out;
  }

  /** Name, parameters and value of one content line. */
  function prop(line) {
    const i = line.indexOf(':');
    if (i < 0) return null;
    const head = line.slice(0, i).split(';');
    const params = {};
    for (const p of head.slice(1)) { const [k, v = ''] = p.split('='); params[k.toUpperCase()] = v; }
    return { name: head[0].toUpperCase(), params, value: line.slice(i + 1) };
  }

  /** Reads a DTSTART or DTEND value into { allDay, day, ms, tz } (ms for timed values). */
  function when(p, fallbackZone) {
    const v = p.value.trim();
    if (p.params.VALUE === 'DATE' || /^\d{8}$/.test(v)) return { allDay: true, day: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` };
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
    if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m;
    if (z) return { allDay: false, ms: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), tz: fallbackZone };
    const tz = p.params.TZID && T.isZone(p.params.TZID) ? p.params.TZID : fallbackZone;
    return { allDay: false, ms: T.wallToUtc(+y, +mo, +d, +h, +mi, tz, +s), tz };
  }

  /** The repeat in an RRULE value, or a warning when it has parts this app does not keep. */
  function rule(value, tz) {
    const parts = Object.fromEntries(value.split(';').map((x) => x.split('=')).map(([k, v = '']) => [k.toUpperCase(), v]));
    const warn = [];
    const freq = FREQS.includes(parts.FREQ) ? parts.FREQ.toLowerCase() : null;
    if (!freq) return { freq: 'none', warn: [tr('ui.ics.rule_once', { rule: value })] };
    const every = tr('ui.recur.' + freq).toLocaleLowerCase();   // "every week"
    for (const k of Object.keys(parts)) if (!['FREQ', 'UNTIL', 'WKST'].includes(k) && !(k === 'INTERVAL' && parts[k] === '1')) warn.push(tr('ui.ics.part_dropped', { part: k, repeat: every }));
    let until;
    if (parts.UNTIL) {
      const m = /^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(parts.UNTIL);
      if (m) {
        until = `${m[1]}-${m[2]}-${m[3]}`;
        if (m[8] === 'Z') until = T.parts(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[5], +m[6], +m[7]), tz).day;
      }
    }
    return { freq, until, warn };
  }

  /** Minutes before the start from a VALARM TRIGGER such as -PT15M, -PT1H or -P1D, or null. */
  function trigger(v) {
    const m = /^-P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(v || '');
    if (!m) return null;
    return (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0);
  }

  /**
   * Reads a calendar file. Returns { events, warnings, total }: events are records without id (the app adds one),
   * warnings are { uid, title, message } for anything that was simplified or left out.
   */
  function parse(text, { fallbackZone = T.deviceZone() } = {}) {
    const events = [], warnings = [];
    let cur = null, total = 0, inAlarm = false, alarmMin = null;
    for (const line of unfold(text)) {
      const p = prop(line);
      if (!p) continue;
      if (p.name === 'BEGIN' && p.value === 'VEVENT') { cur = { props: {} }; total++; alarmMin = null; continue; }
      if (p.name === 'BEGIN' && p.value === 'VALARM' && cur) { inAlarm = true; continue; }
      if (p.name === 'END' && p.value === 'VALARM') { inAlarm = false; if (cur && alarmMin !== null) cur.props.REMIND = alarmMin; continue; }
      if (p.name === 'END' && p.value === 'VEVENT') { if (cur) events.push(finish(cur, fallbackZone, warnings)); cur = null; continue; }
      if (!cur) continue;
      if (inAlarm) { if (p.name === 'TRIGGER') alarmMin = trigger(p.value); continue; }
      cur.props[p.name] = { ...p, value: p.value };
    }
    return { events: events.filter(Boolean), warnings, total };
  }

  /** Turns the collected properties of one VEVENT into an event record (or null when it has no usable start). */
  function finish(cur, zone, warnings) {
    const P = cur.props;
    const uid = P.UID ? unesc(P.UID.value) : '';
    const title = P.SUMMARY ? unesc(P.SUMMARY.value) : tr('ui.untitled');   // in the language of the import
    const warn = (message) => warnings.push({ uid, title, message });
    const s = P.DTSTART && when(P.DTSTART, zone);
    if (!s) { warn(tr('ui.ics.no_start')); return null; }
    const rec = { title, uid, color: 'blue', kind: 'event', freq: 'none', tz: zone };
    if (P['X-SLOP-COLOR'] && /^[a-z]+$/.test(P['X-SLOP-COLOR'].value)) rec.color = P['X-SLOP-COLOR'].value;
    if (P['X-SLOP-KIND'] && ['event', 'call', 'meeting'].includes(P['X-SLOP-KIND'].value)) rec.kind = P['X-SLOP-KIND'].value;
    if (P.LOCATION) rec.location = unesc(P.LOCATION.value);
    if (P.DESCRIPTION) rec.notes = unesc(P.DESCRIPTION.value);
    if (P.REMIND !== undefined) rec.remind = P.REMIND;
    if (s.allDay) {
      rec.allDay = true;
      rec.startDay = s.day;
      const e = P.DTEND && when(P.DTEND, zone);
      rec.endDay = e && e.allDay ? T.addDays(e.day, -1) : s.day;
      if (rec.endDay < rec.startDay) rec.endDay = rec.startDay;
      rec.tz = zone;
    } else {
      rec.allDay = false;
      rec.tz = s.tz;
      rec.start = s.ms;
      const e = P.DTEND && when(P.DTEND, zone);
      rec.end = e && !e.allDay && e.ms >= s.ms ? e.ms : s.ms + 3600000;
      if (!(e && !e.allDay && e.ms >= s.ms)) warn(tr('ui.ics.no_end'));
    }
    if (P.RRULE) {
      const r = rule(P.RRULE.value, rec.tz);
      rec.freq = r.freq;
      if (r.until) rec.until = r.until;
      for (const m of r.warn || []) warn(m);
    }
    return rec;
  }

  NS.build = build;
  NS.parse = parse;
  NS.fold = fold;
  NS.unfold = unfold;
  NS.esc = esc;
  NS.unesc = unesc;
})(typeof window !== 'undefined' ? window : globalThis);
