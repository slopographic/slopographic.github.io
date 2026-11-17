// Calendar model: recurrence expansion, the .ics round trip and time zone conversion, on fixed dates. The classic
// scripts run in one vm context. Run: node tests/run.mjs calendar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withI18n } from './ui-i18n-env.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { TextEncoder };
ctx.window = ctx;
vm.createContext(ctx);
withI18n(ctx, 'en');   // the repeat words and import notes, as a page has them (shared/i18n/ui/en/calendar.js)
for (const f of ['tz.js', 'rrule.js', 'ics.js']) {
  vm.runInContext(await readFile(path.join(ROOT, 'shared', 'calendar', f), 'utf8'), ctx, { filename: f });
}
const T = ctx.SlopTime, R = ctx.SlopRecur, I = ctx.SlopIcs;
const PARIS = 'Europe/Paris', NY = 'America/New_York', TOKYO = 'Asia/Tokyo';
const plain = (v) => JSON.parse(JSON.stringify(v));
// Values made inside the vm context have another Array prototype, so compare as JSON text.
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

/** A timed event in a zone from wall-clock start and end readings. */
function timed(id, title, tz, y, mo, d, h, mi, durMin, extra = {}) {
  const start = T.wallToUtc(y, mo, d, h, mi, tz);
  return { id, title, allDay: false, tz, start, end: start + durMin * 60000, color: 'blue', kind: 'event', freq: 'none', ...extra };
}
const ms = (y, mo, d, h, mi, tz) => T.wallToUtc(y, mo, d, h, mi, tz);
const wallOf = (instant, tz) => { const p = T.parts(instant, tz); return `${p.day} ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`; };

test('weekly event repeats on the same weekday and wall time in its zone', () => {
  const ev = timed('w1', 'Standup', PARIS, 2026, 10, 1, 9, 0, 30, { freq: 'weekly' });
  const occ = R.occurrences(ev, ms(2026, 10, 1, 0, 0, PARIS), ms(2026, 11, 1, 0, 0, PARIS), PARIS);
  same(occ.map((o) => wallOf(o.start, PARIS)), ['2026-10-01 09:00', '2026-10-08 09:00', '2026-10-15 09:00', '2026-10-22 09:00', '2026-10-29 09:00']);
  assert.ok(occ.every((o) => o.end - o.start === 30 * 60000));
});

test('weekly repeat keeps 09:00 Paris across the spring daylight saving change', () => {
  const ev = timed('w2', 'Gym', PARIS, 2026, 3, 22, 9, 0, 60, { freq: 'weekly' });
  const occ = R.occurrences(ev, ms(2026, 3, 20, 0, 0, PARIS), ms(2026, 4, 12, 0, 0, PARIS), PARIS);
  same(occ.map((o) => wallOf(o.start, PARIS).slice(-5)), ['09:00', '09:00', '09:00']);
  // 22 March is winter time (+1), 29 March is summer time (+2): the UTC hour moves, the wall clock does not.
  assert.equal(new Date(occ[0].start).getUTCHours(), 8);
  assert.equal(new Date(occ[1].start).getUTCHours(), 7);
});

test('until is inclusive and ends the repeat', () => {
  const ev = timed('w3', 'Class', NY, 2026, 10, 1, 18, 0, 90, { freq: 'weekly', until: '2026-10-15' });
  const occ = R.occurrences(ev, ms(2026, 9, 1, 0, 0, NY), ms(2027, 1, 1, 0, 0, NY), NY);
  assert.equal(occ.length, 3);
  assert.equal(occ[2].startDay, '2026-10-15');
});

test('monthly repeat skips months without the day, as RFC 5545 does', () => {
  const ev = { id: 'm1', title: 'Rent', allDay: true, startDay: '2026-01-31', endDay: '2026-01-31', tz: PARIS, freq: 'monthly', color: 'blue' };
  const occ = R.occurrences(ev, ms(2026, 1, 1, 0, 0, PARIS), ms(2026, 5, 1, 0, 0, PARIS), PARIS);
  same(occ.map((o) => o.startDay), ['2026-01-31', '2026-03-31']);
});

test('yearly repeat of 29 February skips common years', () => {
  const ev = { id: 'y1', title: 'Leap', allDay: true, startDay: '2028-02-29', endDay: '2028-02-29', tz: PARIS, freq: 'yearly', color: 'blue' };
  const occ = R.occurrences(ev, ms(2028, 1, 1, 0, 0, PARIS), ms(2033, 1, 1, 0, 0, PARIS), PARIS);
  same(occ.map((o) => o.startDay), ['2028-02-29', '2032-02-29']);
});

test('a far-off range is reached without walking every earlier occurrence', () => {
  const ev = timed('d1', 'Daily', TOKYO, 2000, 1, 1, 7, 0, 15, { freq: 'daily' });
  const occ = R.occurrences(ev, ms(2026, 10, 11, 0, 0, TOKYO), ms(2026, 10, 12, 0, 0, TOKYO), TOKYO);
  assert.equal(occ.length, 1);
  assert.equal(wallOf(occ[0].start, TOKYO), '2026-10-11 07:00');
});

test('an all-day event spanning three days overlaps the viewer day range', () => {
  const ev = { id: 'a1', title: 'Fair', allDay: true, startDay: '2026-10-09', endDay: '2026-10-11', tz: PARIS, freq: 'none', color: 'green' };
  const occ = R.occurrences(ev, ms(2026, 10, 11, 0, 0, NY), ms(2026, 10, 12, 0, 0, NY), NY);
  assert.equal(occ.length, 1);
  assert.equal(occ[0].endDay, '2026-10-11');
});

test('time zone conversion: one instant reads correctly in each zone', () => {
  // 1 July 2026, 12:00 in New York (EDT, UTC-4) is 16:00 UTC.
  assert.equal(ms(2026, 7, 1, 12, 0, NY), Date.UTC(2026, 6, 1, 16, 0));
  // 15 January 2026, 09:00 in Tokyo (UTC+9) is midnight UTC.
  assert.equal(ms(2026, 1, 15, 9, 0, TOKYO), Date.UTC(2026, 0, 15, 0, 0));
  // The same instant read in two zones.
  const t = Date.UTC(2026, 6, 1, 16, 0);
  assert.equal(wallOf(t, NY), '2026-07-01 12:00');
  assert.equal(wallOf(t, TOKYO), '2026-07-02 01:00');
  assert.equal(T.parts(t, PARIS).h, 18);
  assert.equal(T.isZone('Europe/Paris'), true);
  assert.equal(T.isZone('Mars/Olympus'), false);
});

test('time zone helpers: offsets, week start and day arithmetic', () => {
  assert.equal(T.offsetAt(Date.UTC(2026, 6, 1), PARIS) / 3600000, 2);
  assert.equal(T.offsetAt(Date.UTC(2026, 0, 1), PARIS) / 3600000, 1);
  assert.equal(T.weekStart('2026-10-11'), '2026-10-05');
  assert.equal(T.addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(T.dayDiff('2026-10-01', '2026-10-11'), 10);
});

test('.ics round trip keeps title, times, zone, repeat, place, notes and reminder', () => {
  const src = [
    timed('e1', 'Call Jane, re: quote; final', PARIS, 2026, 10, 15, 14, 30, 45, { freq: 'weekly', until: '2026-12-01', location: 'Room 4, floor 2', notes: 'Line one\nLine two; with a comma, and a backslash \\ here', remind: 15, kind: 'call', color: 'teal' }),
    timed('e2', 'Trip', NY, 2026, 11, 2, 8, 0, 600),
    { id: 'e3', title: 'Holiday', allDay: true, startDay: '2026-12-24', endDay: '2026-12-26', tz: PARIS, freq: 'none', color: 'amber', kind: 'event' },
  ];
  const text = I.build(src, { now: Date.UTC(2026, 9, 11, 9, 0) });
  assert.ok(text.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(text.includes('DTSTART;TZID=Europe/Paris:20261015T143000'));
  assert.ok(text.includes('DTSTART;VALUE=DATE:20261224'));
  assert.ok(text.includes('DTEND;VALUE=DATE:20261227'));
  const back = I.parse(text, { fallbackZone: PARIS });
  assert.equal(back.total, 3);
  same(back.warnings, []);
  const [a, b, c] = back.events;
  assert.equal(a.title, 'Call Jane, re: quote; final');
  assert.equal(a.start, src[0].start);
  assert.equal(a.end, src[0].end);
  assert.equal(a.tz, PARIS);
  assert.equal(a.freq, 'weekly');
  assert.equal(a.until, '2026-12-01');
  assert.equal(a.location, 'Room 4, floor 2');
  assert.equal(a.notes, src[0].notes);
  assert.equal(a.remind, 15);
  assert.equal(a.kind, 'call');
  assert.equal(a.color, 'teal');
  assert.equal(b.start, src[1].start);
  assert.equal(b.tz, NY);
  assert.equal(c.allDay, true);
  assert.equal(c.startDay, '2026-12-24');
  assert.equal(c.endDay, '2026-12-26');
});

test('.ics lines are folded at 75 octets and unfold to the same text', () => {
  const long = 'x'.repeat(40) + 'é'.repeat(30) + 'end';
  const text = I.build([{ id: 'l1', title: long, allDay: true, startDay: '2026-05-01', endDay: '2026-05-01', tz: PARIS, freq: 'none' }]);
  for (const line of text.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.equal(I.parse(text).events[0].title, long);
});

test('.ics import reports what it simplified and reads floating times in the fallback zone', () => {
  const text = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:x1', 'SUMMARY:Stand-up', 'DTSTART:20261005T090000', 'DTEND:20261005T093000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=2', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:x2', 'SUMMARY:No start', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const r = I.parse(text, { fallbackZone: NY });
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].tz, NY);
  assert.equal(r.events[0].start, ms(2026, 10, 5, 9, 0, NY));
  assert.equal(r.events[0].freq, 'weekly');
  assert.equal(r.warnings.length, 3);
  assert.equal(r.warnings[2].message, 'no usable start time, so it was skipped');
  assert.equal(r.total, 2);
});

test('.ics import reads a UTC DTSTART with an alarm as minutes before', () => {
  const text = 'BEGIN:VEVENT\r\nUID:z\r\nSUMMARY:Ping\r\nDTSTART:20261001T120000Z\r\nDTEND:20261001T130000Z\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT1H\r\nEND:VALARM\r\nEND:VEVENT\r\n';
  const e = I.parse(text, { fallbackZone: PARIS }).events[0];
  assert.equal(e.start, Date.UTC(2026, 9, 1, 12, 0));
  assert.equal(e.remind, 60);
  assert.equal(e.tz, PARIS);
});

test('a plain JSON check: records survive the store shape', () => {
  const ev = timed('s1', 'Shape', PARIS, 2026, 10, 1, 9, 0, 30, { freq: 'weekly' });
  same(plain(ev).freq, 'weekly');
});

test('SlopRecur.describe in English and Swedish: the repeat, and the end day in the language\'s date format', async () => {
  assert.equal(R.describe({ freq: 'weekly' }), 'Every week');
  assert.equal(R.describe({ freq: 'none' }), 'Does not repeat');
  assert.match(R.describe({ freq: 'daily', until: '2027-01-31' }), /^Every day until Jan 31, 2027$/);
  const sv = { TextEncoder };
  sv.window = sv;
  vm.createContext(sv);
  withI18n(sv, 'sv');
  for (const f of ['tz.js', 'rrule.js', 'ics.js', 'store.js']) vm.runInContext(await readFile(path.join(ROOT, 'shared', 'calendar', f), 'utf8'), sv, { filename: f });
  const RS = sv.SlopRecur;
  assert.equal(RS.describe({ freq: 'monthly' }), 'Varje månad');
  assert.equal(RS.describe({ freq: 'none' }), 'Upprepas inte');
  assert.match(RS.describe({ freq: 'weekly', until: '2027-01-31' }), /^Varje vecka till och med 31 jan\.? 2027$/);
  // the event editor's reminder choices and checks (shared/calendar/store.js)
  same(sv.SlopEvents.REMINDERS.map((r) => r.label), ['Ingen påminnelse', 'Vid tidpunkten', '5 minuter före', '15 minuter före', '1 timme före', '1 dag före']);
  same(sv.SlopEvents.fromForm({ title: ' ' }), { ok: false, error: 'Ge händelsen en rubrik.' });
  // an import note in Swedish: an RRULE part the app does not keep
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nSUMMARY:A\r\nDTSTART:20260105T090000Z\r\nDTEND:20260105T100000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
  same(sv.SlopIcs.parse(ics, { fallbackZone: 'UTC' }).warnings.map((w) => w.message), ['BYDAY stöds inte, så den upprepas varje vecka utan det']);
  // an event with no SUMMARY was titled "(untitled)" in every language
  same(sv.SlopIcs.parse(ics.replace('SUMMARY:A\r\n', ''), { fallbackZone: 'UTC' }).events.map((e) => e.title), ['Namnlös']);
});
