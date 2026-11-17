// Slop Projects dependencies (finish-to-start) and the timeline geometry: loops are refused in plain words, later tasks
// move on so nothing starts before what it waits for ends (keeping their length, never earlier), broken links are
// named, a drag moves or resizes by whole days, and the shown span starts on a Monday.
// Covers: projects/js/core/deps.js, projects/js/core/bars.js
// Run: node --test tests/node/projects-deps.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './projects-env.mjs';

/** deepEqual on a plain copy (values made in the vm context have other prototypes). */
const eq = (a, b, m) => assert.deepEqual(plain(a), b, m);

const { P } = await load();
const D = P.deps, B = P.bars;
const t = (id, o = {}) => ({ id, title: id.toUpperCase(), column: 'todo', deps: [], ...o });

test('check drops unknown ids, itself and repeats', () => {
  const tasks = [t('a'), t('b')];
  eq((D.check(tasks, 'a', ['b', 'b', 'a', 'zzz'])), { ok: true, value: ['b'] });
});

test('check refuses a direct and an indirect loop, naming the task', () => {
  const tasks = [t('a'), t('b', { deps: ['a'] }), t('c', { deps: ['b'] })];
  const direct = D.check(tasks, 'a', ['b']);
  assert.equal(direct.ok, false);
  assert.match(direct.message, /"B" already waits for this task/);
  assert.equal(D.check(tasks, 'a', ['c']).ok, false);
  assert.equal(D.check(tasks, 'c', ['a']).ok, true);   // c already waits for b, which waits for a: no loop
});

test('order puts every task after what it waits for', () => {
  const tasks = [t('c', { deps: ['b'] }), t('b', { deps: ['a'] }), t('a')];
  eq(D.order(tasks).map((x) => x.id), ['a', 'b', 'c']);
});

test('shift moves later tasks on, keeping their length, through a chain', () => {
  const tasks = [
    t('a', { start: '2026-11-02', end: '2026-11-06' }),
    t('b', { start: '2026-11-05', end: '2026-11-07', deps: ['a'] }),        // starts before a ends: moves to 11-07
    t('c', { start: '2026-11-08', end: '2026-11-08', deps: ['b'] }),        // b now ends 11-09: c moves to 11-10
    t('d', { start: '2026-12-01', end: '2026-12-03', deps: ['a'] }),        // already later: stays
  ];
  eq((D.shift(tasks)), [
    { id: 'b', start: '2026-11-07', end: '2026-11-09' },
    { id: 'c', start: '2026-11-10', end: '2026-11-10' },
  ]);
});

test('shift never moves a task earlier, and ignores tasks without dates', () => {
  const tasks = [t('a', { start: '2026-11-02', end: '2026-11-03' }), t('b', { start: '2026-11-20', end: '2026-11-21', deps: ['a'] }), t('c', { deps: ['a'] })];
  eq((D.shift(tasks)), []);
});

test('the latest predecessor decides, and violations name the broken links', () => {
  const tasks = [t('a', { start: '2026-11-02', end: '2026-11-04' }), t('b', { start: '2026-11-02', end: '2026-11-10' }),
    t('c', { start: '2026-11-06', end: '2026-11-07', deps: ['a', 'b'] })];
  assert.equal(D.earliest(tasks, tasks[2]), '2026-11-11');
  eq((D.violations(tasks)), [{ from: 'b', to: 'c' }]);
  eq((D.shift(tasks)), [{ id: 'c', start: '2026-11-11', end: '2026-11-12' }]);
});

test('blockers are the open predecessors; without() unlinks a deleted task', () => {
  const tasks = [t('a', { column: 'done' }), t('b'), t('c', { deps: ['a', 'b'] })];
  eq(D.blockers(tasks, tasks[2], (x) => x.column === 'done').map((x) => x.id), ['b']);
  eq((D.without(tasks, 'a')), [{ id: 'c', deps: ['b'] }]);
});

test('a drag moves both ends, or one end, by whole days, and a task stays at least one day', () => {
  const task = { start: '2026-11-02', end: '2026-11-04' };
  assert.equal(B.daysFor(80, 36), 2);
  eq((B.drag('move', task, 3)), { start: '2026-11-05', end: '2026-11-07' });
  eq((B.drag('end', task, -5)), { start: '2026-11-02', end: '2026-11-02' });
  eq((B.drag('start', task, 9)), { start: '2026-11-04', end: '2026-11-04' });
  eq((B.drag('start', task, -1)), { start: '2026-11-01', end: '2026-11-04' });
});

test('the span starts on a Monday before the earliest date and is long enough for the zoom', () => {
  const sp = B.span({ start: '2026-11-04' }, [t('a', { start: '2026-11-10', end: '2026-11-12' })], '2026-11-05', 'day');
  assert.equal(sp.from, '2026-10-26');   // three days before 11-04 is 11-01 (a Sunday); its week starts 10-26
  assert.ok(sp.days >= 21);
  const wide = B.span({}, [], '2026-11-05', 'month');
  assert.ok(wide.days >= 180);
  const box = B.box(sp.from, { start: '2026-10-28', end: '2026-10-29' }, 36);
  eq((box), { x: 72, w: 72 });
  assert.equal(B.dayAt(sp.from, 75, 36), '2026-10-28');
});

test('scale labels: days with weekends and today, weeks on Mondays, months', () => {
  const sp = { from: '2026-11-02', to: '2026-11-15', days: 14 };
  const d = B.ticks(sp, 'day', '2026-11-05', 'en-US');
  assert.equal(d.bottom.length, 14);
  assert.equal(d.bottom.filter((x) => x.weekend).length, 4);
  assert.equal(d.bottom.find((x) => x.today).text, '5');
  assert.equal(d.top[0].text, 'November 2026');
  const w = B.ticks(sp, 'week', '2026-11-05', 'en-US');
  eq(w.bottom.map((x) => x.w), [112, 112]);
  const m = B.ticks({ from: '2026-11-02', to: '2027-01-31', days: 91 }, 'month', '2026-11-05', 'en-US');
  eq(m.bottom.map((x) => x.text), ['Nov', 'Dec', 'Jan']);
  eq(m.top.map((x) => x.text), ['2026', '2027']);
});

test('an arrow runs right then down when there is room, and loops back when there is not', () => {
  assert.equal(B.arrow({ x: 0, w: 72 }, 0, { x: 108, w: 36 }, 2, 40), 'M72 20H80V100H108');
  assert.equal(B.arrow({ x: 0, w: 72 }, 0, { x: 36, w: 36 }, 1, 40), 'M72 20H80V40H28V60H36');
});
