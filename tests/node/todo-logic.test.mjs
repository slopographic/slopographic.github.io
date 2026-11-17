// To-do and reminder rules on fixed dates: due moments, the Today and Upcoming buckets, completing a repeating task,
// list and sort order, and which reminders are due at a given instant. Classic scripts run in one vm context.
// Run: node tests/run.mjs todo
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
const I18N = withI18n(ctx, 'en');   // the repeat words and snooze choices, as a page has them (shared/i18n/ui/en/calendar.js)
for (const f of ['calendar/tz.js', 'calendar/rrule.js', 'tasks/logic.js', 'reminders/core.js']) {
  vm.runInContext(await readFile(path.join(ROOT, 'shared', f), 'utf8'), ctx, { filename: f });
}
const T = ctx.SlopTime, TK = ctx.SlopTasks, NR = ctx.SlopReminders;
const PARIS = 'Europe/Paris', NY = 'America/New_York';
/** Results built in the vm context have another prototype, so compare them as JSON text. */
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
const task = (o) => ({ id: o.id || 't', title: 'Task', done: false, list: 'Inbox', priority: 'none', tags: [], tz: PARIS, ...o });

test('a task with a due time is due at that wall time in its zone', () => {
  const t = task({ due: '2026-10-15', dueTime: '14:30', tz: PARIS });
  assert.equal(TK.dueAt(t), T.wallToUtc(2026, 10, 15, 14, 30, PARIS));
  assert.equal(T.parts(TK.dueAt(t), NY).h, 8); // 14:30 Paris is 08:30 New York in October
});

test('a due date without a time is due at 09:00 for reminders', () => {
  const t = task({ due: '2026-10-15', tz: NY });
  assert.equal(T.parts(TK.dueAt(t), NY).h, 9);
  assert.equal(TK.dueAt(task({})), null);
});

test('buckets: overdue and today are both in Today, later is Upcoming, no date is in neither', () => {
  const today = '2026-10-11';
  same(TK.bucket(task({ due: '2026-10-10' }), today), 'overdue');
  same(TK.bucket(task({ due: '2026-10-11' }), today), 'today');
  same(TK.bucket(task({ due: '2026-10-12' }), today), 'upcoming');
  same(TK.bucket(task({}), today), 'none');
  same(TK.bucket(task({ due: '2026-10-10', done: true }), today), 'done');
  assert.equal(TK.inToday(task({ due: '2026-10-10' }), today), true);
  assert.equal(TK.inUpcoming(task({ due: '2026-10-12' }), today), true);
  assert.equal(TK.inUpcoming(task({}), today), false);
});

test('completing a one-off task marks it done; reopening clears it', () => {
  const c = TK.complete(task({ due: '2026-10-11' }), 1000);
  same(c, { done: true, doneAt: 1000 });
  same(TK.reopen(), { done: false, doneAt: null });
});

test('completing a weekly task moves it to next week and keeps it open', () => {
  const c = TK.complete(task({ due: '2026-10-11', freq: 'weekly' }), 5000);
  assert.equal(c.done, false);
  assert.equal(c.due, '2026-10-18');
  assert.equal(c.doneAt, 5000);
});

test('a monthly task on the 31st lands on the next month that has one', () => {
  assert.equal(TK.complete(task({ due: '2026-01-31', freq: 'monthly' })).due, '2026-03-31');
});

test('a repeat that ends before the next date finishes the task', () => {
  const c = TK.complete(task({ due: '2026-10-11', freq: 'weekly', until: '2026-10-14' }), 1);
  same(c, { done: true, doneAt: 1 });
});

test('the Today view has overdue and today tasks, sorted by due time then priority', () => {
  const today = '2026-10-11';
  const tasks = [
    task({ id: 'a', title: 'Later', due: '2026-10-12' }),
    task({ id: 'b', title: 'Pay', due: '2026-10-09', priority: 'high' }),
    task({ id: 'c', title: 'Call', due: '2026-10-11', dueTime: '15:00' }),
    task({ id: 'd', title: 'Mail', due: '2026-10-11', dueTime: '09:00' }),
    task({ id: 'e', title: 'Done', due: '2026-10-11', done: true }),
    task({ id: 'f', title: 'Sub', due: '2026-10-11', parentId: 'd' }),
    task({ id: 'g', title: 'Someday' }),
  ];
  const ids = TK.forView(tasks, 'today', today).map((t) => t.id);
  same(ids, ['b', 'd', 'c']);
  same(TK.forView(tasks, 'upcoming', today).map((t) => t.id), ['a']);
  same(TK.forView(tasks, { list: 'Inbox' }, today).map((t) => t.id).sort(), ['a', 'b', 'c', 'd', 'g'].sort());
  same(TK.forView(tasks, 'all', today, { showDone: true, text: 'mail' }).map((t) => t.id), ['d']);
});

test('subtasks are counted under their parent', () => {
  const tasks = [task({ id: 'p' }), task({ id: 's1', parentId: 'p', done: true }), task({ id: 's2', parentId: 'p' })];
  same(TK.progress(tasks, 'p'), { done: 1, total: 2 });
});

test('lists: Inbox first, then the others in alphabetical order', () => {
  same(TK.listsOf([task({ list: 'Work' }), task({ list: 'Home' }), task({ list: 'Inbox' })]), ['Inbox', 'Home', 'Work']);
});

test('reminders fire at the task reminder time and not again once fired', () => {
  const tasks = [task({ id: 'r1', title: 'Renew', due: '2026-10-15', dueTime: '10:00', remind: 30, tz: PARIS })];
  const from = T.wallToUtc(2026, 10, 1, 0, 0, PARIS), to = T.wallToUtc(2026, 11, 1, 0, 0, PARIS);
  const [item] = NR.items({ tasks, records: [], from, to, zone: PARIS });
  assert.equal(item.at, T.wallToUtc(2026, 10, 15, 9, 30, PARIS));
  assert.equal(item.source, 'task');
  // Before the time: nothing. At the time: due once. After it fired: nothing.
  assert.equal(NR.due([item], item.at - 1000).notify.length, 0);
  assert.equal(NR.due([item], item.at).notify.length, 1);
  const fired = { ...item, firedAt: item.fireAt };
  assert.equal(NR.due([fired], item.at + 60000).notify.length, 0);
});

test('a snoozed reminder is due again at the snooze time, and a dismissed one never is', () => {
  const now = T.wallToUtc(2026, 10, 11, 12, 0, PARIS);
  const row = { id: 'c1', source: 'custom', title: 'Ring back', at: now - 60000, firedAt: now - 60000, snoozedUntil: now + 5 * 60000 };
  const [item] = NR.items({ records: [row], from: now - 86400000, to: now + 86400000, zone: PARIS });
  assert.equal(NR.due([item], now + 60000).notify.length, 0);
  assert.equal(NR.due([item], now + 5 * 60000).notify.length, 1);
  const dismissed = { ...row, dismissedAt: now };
  const [d] = NR.items({ records: [dismissed], from: now - 86400000, to: now + 86400000, zone: PARIS });
  assert.equal(NR.due([d], now + 10 * 60000).notify.length, 0);
});

test('a reminder that was due long ago is marked silently, not shown as a popup', () => {
  const at = T.wallToUtc(2026, 10, 11, 8, 0, PARIS);
  const [item] = NR.items({ records: [{ id: 'old', source: 'custom', title: 'Old', at }], from: at - 1, to: at + 1, zone: PARIS });
  const r = NR.due([item], at + 3 * 3600000);
  assert.equal(r.notify.length, 0);
  assert.equal(r.silent.length, 1);
});

test('the tomorrow snooze is 09:00 on the next day in the zone', () => {
  const now = T.wallToUtc(2026, 10, 11, 22, 0, NY);
  assert.equal(NR.snoozeUntil('tomorrow', now, NY), T.wallToUtc(2026, 10, 12, 9, 0, NY));
  assert.equal(NR.snoozeUntil('1h', now, NY), now + 3600000);
});

test('a weekly event shows once in Later (its next occurrence, saying "Every week"), not once per week for the window', () => {
  // Covers: shared/reminders/core.js
  const start = T.wallToUtc(2026, 10, 12, 10, 0, PARIS);
  const ev = { id: 'w1', title: 'Standup', allDay: false, start, end: start + 3600000, tz: PARIS, freq: 'weekly', remind: 15 };
  const once = { id: 'o1', title: 'Dentist', allDay: false, start: start + 86400000, end: start + 90000000, tz: PARIS, freq: 'none', remind: 15 };
  const from = start - 86400000, to = from + 400 * 86400000;
  const all = NR.items({ events: [ev, once], records: [], from, to, zone: PARIS });
  assert.ok(all.filter((x) => x.refId === 'w1').length > 50);   // the window holds about 58 weeks
  const later = NR.nextOnly(all);
  same(later.map((x) => [x.refId, x.repeat]), [['w1', 'Every week'], ['o1', null]]);
  assert.equal(later[0].at, start - 15 * 60000);
  assert.equal(later[0].more, all.filter((x) => x.refId === 'w1').length - 1);
});

test('the snooze choices read the chosen language each time (shared/i18n/ui/<code>/calendar.js)', () => {
  same(NR.SNOOZES.map((s) => s.label), ['5 minutes', '1 hour', 'Tomorrow, 09:00']);
  withI18n(ctx, 'sv');   // the same context, now in Swedish
  try { same(NR.SNOOZES.map((s) => s.label), ['5 minuter', '1 timme', 'I morgon 09:00']); } finally { ctx.SlopI18n = I18N; }
});

// Covers: shared/tasks/logic.js, shared/i18n/ui/en/backup3.js, shared/i18n/ui/sv/backup3.js
test('the edit checks speak the chosen language (keys ui.tasks.*, read when checked)', () => {
  assert.deepEqual([...TK.editErrors({ dueTime: '10:00' })], ['give the task a due date before a due time']);
  withI18n(ctx, 'sv');
  try {
    assert.deepEqual([...TK.editErrors({ dueTime: '10:00', due: '2026-10-12', tz: 'Nowhere/Land' })], ['tidszonen är okänd']);
    assert.deepEqual([...TK.editErrors({ dueTime: '10:00' })], ['ge uppgiften ett förfallodatum innan du anger en förfallotid']);
  } finally { ctx.SlopI18n = I18N; }
});
