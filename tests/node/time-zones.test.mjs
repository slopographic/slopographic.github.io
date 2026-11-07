// Slop Time: time zone offsets and conversion with fixed dates (DST both ways), working-hour overlaps, the
// converter, the manual clock offset, and the stopwatch and countdown. Run with: node tests/run.mjs time
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTime } from './time-env.mjs';

const T = await loadTime();
// Values made inside the vm context have another prototype, so compare plain copies.
const same = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
const { zones: Z, work: W, convert: CV, sync: SY, timers: TM } = { zones: T.zones, work: T.work, convert: T.convert, sync: T.sync, timers: T.timers };
const utc = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);
const LON = 'Europe/London', NY = 'America/New_York', TYO = 'Asia/Tokyo', PAR = 'Europe/Paris';

test('offsets follow DST in both directions', () => {
  assert.equal(Z.offsetMinutes(NY, utc(2026, 3, 7, 12)), -300, 'EST before the March change');
  assert.equal(Z.offsetMinutes(NY, utc(2026, 3, 9, 12)), -240, 'EDT after the March change');
  assert.equal(Z.offsetMinutes(NY, utc(2026, 11, 2, 12)), -300, 'EST after the November change');
  assert.equal(Z.offsetMinutes(LON, utc(2026, 1, 15, 12)), 0);
  assert.equal(Z.offsetMinutes(LON, utc(2026, 7, 1, 12)), 60);
  assert.equal(Z.offsetMinutes(TYO, utc(2026, 7, 1, 12)), 540, 'Tokyo has no DST');
  assert.equal(Z.offsetMinutes('Asia/Kolkata', utc(2026, 7, 1)), 330);
  assert.equal(Z.offsetMinutes('Asia/Kathmandu', utc(2026, 7, 1)), 345);
  assert.equal(Z.offsetMinutes('Australia/Sydney', utc(2026, 1, 15)), 660, 'southern summer');
  assert.equal(Z.offsetMinutes('Australia/Sydney', utc(2026, 7, 1)), 600, 'southern winter');
});

test('wall-clock time to instant, with the DST gap and the fall-back overlap', () => {
  assert.equal(Z.zonedToUtc(LON, 2026, 7, 1, 9, 0), utc(2026, 7, 1, 8));
  assert.equal(Z.zonedToUtc(TYO, 2026, 7, 1, 8, 0), utc(2026, 6, 30, 23));
  assert.equal(Z.zonedToUtc(NY, 2026, 1, 15, 12, 0, 30), utc(2026, 1, 15, 17) + 30000, 'seconds are kept');
  // 1:30 on 1 Nov 2026 happens twice in New York; the earlier (EDT) instant is chosen.
  assert.equal(Z.zonedToUtc(NY, 2026, 11, 1, 1, 30), utc(2026, 11, 1, 5, 30));
  // 2:30 on 8 Mar 2026 does not exist in New York; it moves forward to 3:30 EDT.
  assert.equal(Z.zonedToUtc(NY, 2026, 3, 8, 2, 30), utc(2026, 3, 8, 7, 30));
  assert.equal(Z.localParts(NY, Z.zonedToUtc(NY, 2026, 3, 8, 2, 30)).h, 3);
});

test('local parts, calendar day and day boundaries', () => {
  const p = Z.localParts(TYO, utc(2026, 7, 1, 0, 0));
  same([p.y, p.mo, p.d, p.h, p.mi, p.wd], [2026, 7, 1, 9, 0, 3], 'Wednesday, 9:00 in Tokyo');
  assert.equal(Z.dateIso(NY, utc(2026, 7, 2, 2, 0)), '2026-07-01', 'still the 1st in New York');
  assert.equal(Z.startOfDay(TYO, '2026-07-01'), utc(2026, 6, 30, 15));
  assert.equal(Z.gmtLabel(330), 'GMT+5:30');
  assert.equal(Z.gmtLabel(-210), 'GMT-3:30');
  assert.equal(Z.gmtLabel(0), 'GMT');
  assert.equal(Z.cityOf('America/Port_of_Spain'), 'Port of Spain');
});

test('zone search: every word must match, starts of words rank first', () => {
  const zones = [LON, NY, TYO, 'America/Chicago', 'America/Indiana/Knox', 'Pacific/Auckland'];
  same(Z.search(zones, 'new york'), [NY]);
  same(Z.search(zones, 'tok'), [TYO]);
  same(Z.search(zones, 'america'), ['America/Chicago', 'America/Indiana/Knox', NY]);
  same(Z.search(zones, 'london'), [LON]);
  same(Z.search(zones, 'nowhere'), []);
  assert.equal(Z.search(zones, '', 2).length, 2);
  assert.ok(Z.list().length > 20, 'the browser zone list is used');
  assert.equal(Z.isZone('Not/AZone'), false);
  assert.equal(Z.isZone(LON), true);
});

test('working day and overlap with fixed dates', () => {
  const london = W.normalize({ zone: LON }, LON);
  same([london.days, london.start, london.end], [[1, 2, 3, 4, 5], 9, 17]);
  assert.equal(W.isWorkingAt(london, utc(2026, 7, 6, 8, 30)), true, 'Monday 09:30 BST');
  assert.equal(W.isWorkingAt(london, utc(2026, 7, 6, 7, 30)), false, 'before 09:00');
  assert.equal(W.isWorkingAt(london, utc(2026, 7, 4, 10)), false, 'Saturday');

  const paris = W.normalize({ zone: PAR }, LON);
  const win = W.dayWindows([london, paris], LON, '2026-07-06', 60);
  same(win, [{ start: utc(2026, 7, 6, 8), end: utc(2026, 7, 6, 15) }], 'London 09-17 BST and Paris 09-17 CEST overlap 08:00 to 15:00 UTC');
  same(W.dayWindows([london, paris], LON, '2026-07-04', 60), [], 'a Saturday has no overlap');
});

test('no common hours across London, New York and Tokyo on a Monday', () => {
  const people = [LON, NY, TYO].map((z) => W.normalize({ zone: z }, LON));
  same(W.dayWindows(people, LON, '2026-07-06'), []);
  const two = W.dayWindows([people[0], people[1]], LON, '2026-07-06', 60);
  same(two, [{ start: utc(2026, 7, 6, 13), end: utc(2026, 7, 6, 16) }]);
});

test('normalize fixes bad patterns', () => {
  const p = W.normalize({ zone: 'Nope/Nope', days: [1, 1, 9, 3, 'x'], start: 10, end: 8 }, TYO);
  assert.equal(p.zone, TYO);
  same(p.days, [1, 3]);
  same([p.start, p.end], [9, 17], 'an end before the start falls back to 09:00 to 17:00');
});

test('convert a time between zones, with the day shift', () => {
  const r = CV.convertTime(LON, '2026-07-01', { h: 9, mi: 0, s: 0 }, [TYO, NY, LON]);
  same(r.rows.map((x) => [x.city, x.time, x.day, x.dayShift, x.gmt]), [
    ['Tokyo', '17:00', 'Wed 1 Jul', 0, 'GMT+9'],
    ['New York', '04:00', 'Wed 1 Jul', 0, 'GMT-4'],
    ['London', '09:00', 'Wed 1 Jul', 0, 'GMT+1'],
  ]);
  const back = CV.convertTime(TYO, '2026-07-01', { h: 7, mi: 0, s: 0 }, [LON, NY]);
  assert.equal(back.rows[0].time, '23:00');
  assert.equal(back.rows[0].dayShift, -1, 'London is still the 30th');
  assert.equal(back.rows[1].dayShift, -1, 'New York is still the 30th');
  const late = CV.convertTime(NY, '2026-07-01', { h: 22, mi: 0, s: 0 }, [TYO]);
  assert.equal(late.rows[0].time, '11:00');
  assert.equal(late.rows[0].dayShift, 1);
});

test('time difference between two zones, at a fixed instant', () => {
  assert.equal(CV.difference(LON, TYO, utc(2026, 7, 1, 12)).text, 'Tokyo is 8 hours ahead of London');
  assert.equal(CV.difference(LON, TYO, utc(2026, 7, 1, 12)).minutes, 480);
  assert.equal(CV.difference(NY, LON, utc(2026, 7, 1, 12)).text, 'London is 5 hours ahead of New York');
  // 20 March 2026: New York has changed to EDT, London has not yet changed to BST.
  assert.equal(CV.difference(NY, LON, utc(2026, 3, 20, 12)).text, 'London is 4 hours ahead of New York');
  assert.equal(CV.difference(LON, 'Asia/Kolkata', utc(2026, 7, 1, 12)).text, 'Kolkata is 4 h 30 min ahead of London');
  assert.equal(CV.difference(NY, 'America/Chicago', utc(2026, 7, 1, 12)).text, 'Chicago is 1 hour behind New York');
  assert.equal(CV.difference(LON, 'Europe/Lisbon', utc(2026, 7, 1, 12)).text, 'Lisbon and London are on the same clock time');
  assert.equal(CV.fmtHours(60), '1 hour');
  assert.equal(CV.fmtHours(0), '0 hours');
});

test('the converter parses typed times and dates strictly', () => {
  same(CV.parseClock('9:30'), { h: 9, mi: 30, s: 0 });
  same(CV.parseClock('09:30:15'), { h: 9, mi: 30, s: 15 });
  assert.equal(CV.parseClock('24:00'), null);
  assert.equal(CV.parseClock('12:61'), null);
  assert.equal(CV.parseClock('noon'), null);
  assert.equal(CV.parseIsoDate('2026-02-29'), null, '2026 is not a leap year');
  assert.equal(CV.parseIsoDate('2028-02-29'), '2028-02-29');
  assert.equal(CV.parseIsoDate('11/10/2026'), null);
});

test('manual clock offset: reference time, offset and wording (not a network sync)', () => {
  assert.equal(SY.referenceMs('UTC', '2026-10-11', '12:00:05'), utc(2026, 10, 11, 12) + 5000);
  assert.equal(SY.referenceMs('Bad/Zone', '2026-10-11', '12:00'), null);
  assert.equal(SY.referenceMs('UTC', '2026-02-30', '12:00'), null);
  const dev = utc(2026, 10, 11, 12);
  assert.equal(SY.offsetFor(dev + 2400, dev), 2400);
  assert.equal(SY.correctedNow(2400, dev), dev + 2400);
  assert.equal(SY.correctedNow(0, dev), dev);
  assert.equal(SY.describe(2400), 'The device clock was 2.4 s behind the reference you entered.');
  assert.equal(SY.describe(-1500), 'The device clock was 1.5 s ahead of the reference you entered.');
  assert.equal(SY.describe(125000), 'The device clock was 2 min 5 s behind the reference you entered.');
  assert.equal(SY.describe(-17159000), 'The device clock was 4 h 45 min ahead of the reference you entered.');
  assert.equal(SY.describe(59600), 'The device clock was 59.6 s behind the reference you entered.');
  assert.equal(SY.describe(60000), 'The device clock was 1 min 0 s behind the reference you entered.');
  assert.match(SY.describe(0), /matched/);
});

test('stopwatch: start, stop, laps and reset with a fixed clock', () => {
  let sw = TM.newStopwatch();
  sw = TM.swStart(sw, 1000);
  assert.equal(TM.swElapsed(sw, 4000), 3000);
  sw = TM.swStop(sw, 4500);
  assert.equal(TM.swElapsed(sw, 99999), 3500, 'stopped: the clock no longer counts');
  sw = TM.swStart(sw, 5000);
  sw = TM.swLap(sw, 6000);
  sw = TM.swLap(sw, 7500);
  same(sw.laps.map((l) => [l.total, l.split]), [[4500, 4500], [6000, 1500]]);
  assert.equal(TM.swElapsed(sw, 7500), 6000);
  same(TM.swReset(), { running: false, accMs: 0, startedAt: 0, laps: [] });
});

test('countdown: pause keeps the rest, and it ends at zero', () => {
  let t = TM.tmStart(TM.newTimer(60000), 0);
  assert.equal(TM.tmRemaining(t, 20000), 40000);
  t = TM.tmPause(t, 20000);
  assert.equal(TM.tmRemaining(t, 99999), 40000, 'paused: stays at 40 s');
  t = TM.tmStart(t, 100000);
  assert.equal(TM.tmRemaining(t, 110000), 30000);
  assert.equal(TM.tmDone(t, 139999), false);
  assert.equal(TM.tmDone(t, 140000), true);
  assert.equal(TM.tmRemaining(t, 999999), 0);
});

test('clock formatting and duration input', () => {
  assert.equal(TM.formatClock(3723456), '1:02:03');
  assert.equal(TM.formatClock(3723456, true), '1:02:03.4');
  assert.equal(TM.formatClock(-5), '0:00:00');
  assert.equal(TM.parseDuration('5'), 300000, 'a plain number is minutes');
  assert.equal(TM.parseDuration('4:30'), 270000);
  assert.equal(TM.parseDuration('1:05:00'), 3900000);
  assert.equal(TM.parseDuration('4:75'), null);
  assert.equal(TM.parseDuration('abc'), null);
});
