// The calendar's view model: the events (expanded for repeats) and, when the task layer is on, the open to-do tasks that
// fall in a range of days. Every item is read from the store; nothing is copied. Each item keeps its own zone, so the
// view can show the time in the viewer's zone and in the event's zone. Exposes window.SlopCal.model.
(function (g) {
  'use strict';
  const T = g.SlopTime, RR = g.SlopRecur, TK = g.SlopTasks;
  const NS = (g.SlopCal = g.SlopCal || {});
  const TASK_BLOCK = 30 * 60000; // a timed task shows as a 30-minute block

  function eventItem(e, o) {
    return {
      kind: 'event', key: o.key, id: e.id, title: e.title, color: e.color || 'blue', allDay: !!o.allDay,
      startDay: o.startDay, endDay: o.endDay || o.startDay, start: o.start, end: o.end, zone: e.tz, rec: e,
      eventKind: e.kind || 'event', location: e.location || '', done: false,
    };
  }

  function taskItem(t, zone) {
    if (!t.due || t.done) return null;
    const base = { kind: 'task', key: `task:${t.id}`, id: t.id, title: t.title, color: 'grey', rec: t, zone: t.tz || zone, eventKind: 'task', location: '', done: false };
    if (!t.dueTime) return { ...base, allDay: true, startDay: t.due, endDay: t.due };
    const start = TK.dueAt(t, zone);
    return { ...base, allDay: false, start, end: start + TASK_BLOCK, startDay: T.parts(start, t.tz || zone).day };
  }

  /**
   * The items for the days fromDay to toDay (inclusive, YYYY-MM-DD in the viewer's zone). showTasks adds the open tasks
   * that have a due date in the range. Resolves to a Result whose value is the list sorted by start.
   */
  async function load(fromDay, toDay, zone, { showTasks = true } = {}) {
    const fromMs = T.startOfDay(fromDay, zone), toMs = T.startOfDay(T.addDays(toDay, 1), zone);
    const [ev, tk] = await Promise.all([g.SlopEvents.list(), showTasks ? g.SlopTaskStore.list() : { ok: true, value: [] }]);
    if (!ev.ok) return ev;
    if (!tk.ok) return tk;
    const items = [];
    for (const e of ev.value) for (const o of RR.occurrences(e, fromMs, toMs, zone)) items.push(eventItem(e, o));
    for (const t of tk.value) {
      const it = taskItem(t, zone);
      if (!it) continue;
      if (it.allDay ? (it.startDay <= toDay && it.endDay >= fromDay) : (it.start < toMs && it.end > fromMs)) items.push(it);
    }
    return { ok: true, value: items.sort(byStart) };
  }

  const byStart = (a, b) => (a.allDay === b.allDay ? (a.allDay ? (a.startDay < b.startDay ? -1 : 1) : a.start - b.start) : a.allDay ? -1 : 1);

  /** The items that touch one viewer day. All-day items match by day; timed items match by overlap with the day. */
  function forDay(items, day, zone) {
    const s = T.startOfDay(day, zone), e = T.startOfDay(T.addDays(day, 1), zone);
    return items.filter((it) => (it.allDay ? it.startDay <= day && it.endDay >= day : it.start < e && it.end > s));
  }

  /** The time as the viewer reads it, and as the event's zone reads it when that zone differs. */
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  /** The kind of an item in words: Event, Call, Meeting, or To-do for a task. */
  const KINDS = { event: 'calendar.views.kind.event', call: 'calendar.views.kind.call', meeting: 'calendar.views.kind.meeting', task: 'calendar.views.kind.task' };
  const kindText = (it) => (KINDS[it.kind === 'task' ? 'task' : it.eventKind] ? tr(KINDS[it.kind === 'task' ? 'task' : it.eventKind]) : it.eventKind);
  function timeLabel(it, zone, locale) {
    if (it.allDay) return tr('calendar.views.all_day');
    const mine = T.timeText(it.start, zone, locale);
    if (!it.zone || it.zone === zone) return mine;
    return tr('calendar.views.in_zone', { time: mine, there: T.timeText(it.start, it.zone, locale), zone: it.zone });
  }

  /** The event's own zone and its short name at that time, for the zone line in the editor and the agenda. */
  function zoneNote(it) {
    if (it.allDay || !it.zone) return '';
    return `${it.zone} (${T.zoneLabel(it.start, it.zone)})`;
  }

  NS.model = { load, forDay, timeLabel, zoneNote, kindText, TASK_BLOCK };
})(typeof window !== 'undefined' ? window : globalThis);
