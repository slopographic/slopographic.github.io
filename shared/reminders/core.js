// Reminder rules, with no storage or DOM. Reminders come from three places: an event (remind minutes before an
// occurrence), a to-do task (remind minutes before its due time) and a custom reminder (a row of its own). Event and
// task reminders are read from those records every time, never copied. The 'reminders' collection only records what
// the person did with one of them: snoozedUntil, firedAt, dismissedAt. Exposes window.SlopReminders. Needs tz.js,
// rrule.js and tasks/logic.js first.
(function (g) {
  'use strict';
  const T = g.SlopTime, RR = g.SlopRecur, TK = g.SlopTasks;
  const NS = (g.SlopReminders = g.SlopReminders || {});
  const MIN = 60000;
  const LATE = 5 * MIN;          // a reminder older than this when first seen is shown in the list, not as a popup
  /** A word from the shared tables (shared/i18n/ui/<code>/calendar.js), the key without SlopI18n. */
  const tr = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);
  // the snooze choices; label reads the chosen language each time it is asked for
  const snoozeOf = (id, ms, key, vars) => ({ id, ms, get label() { return tr(key, vars); } });
  const SNOOZES = [snoozeOf('5m', 5 * MIN, 'ui.reminders.minutes', { n: 5 }), snoozeOf('1h', 60 * MIN, 'ui.reminders.hours', { n: 1 }), snoozeOf('tomorrow', undefined, 'ui.reminders.tomorrow', { time: '09:00' })];
  let clock = () => Date.now();

  /** The clock the reminders use. Tests replace it with a fake clock. */
  const now = () => clock();
  function setClock(fn) { clock = typeof fn === 'function' ? fn : () => Date.now(); }

  /** The key of the state row for an event or task reminder (one per occurrence). */
  const stateKey = (source, refId, at) => `${source}:${refId}:${at}`;

  /**
   * Every reminder whose moment falls in [from, to), from events, open tasks and custom rows.
   * Each item: { key, source, refId, title, at, fireAt, dismissed, snoozedUntil, firedAt, stateId, isCustom, repeat }.
   * repeat is the event's repeat in words ("Every week") for a repeating event, else null.
   * stateId is the row that holds what the person did (created on the first snooze or dismiss for event and task items).
   * zone is the device zone (where a day without a time is 09:00).
   */
  function items({ events = [], tasks = [], records = [], from, to, zone }) {
    const rows = new Map(records.map((r) => [r.id, r]));
    const out = [];
    const push = (source, refId, title, at, stateId, repeat) => {
      const row = rows.get(stateId) || {};
      const isCustom = source === 'custom';
      out.push({
        key: stateId, source, refId, title, at,
        fireAt: row.snoozedUntil || at,
        snoozedUntil: row.snoozedUntil || null,
        firedAt: row.firedAt || null,
        dismissed: !!row.dismissedAt,
        stateId, isCustom, repeat: repeat || null,
      });
    };
    for (const ev of events) {
      if (ev.remind === undefined || ev.remind === null) continue;
      for (const o of RR.occurrences(ev, from, to, zone)) {
        const base = o.allDay ? T.dayTimeToUtc(o.startDay, TK.DEFAULT_TIME, zone) : o.start;
        const at = base - ev.remind * MIN;
        if (at < from || at >= to) continue;
        push('event', ev.id, ev.title, at, stateKey('event', ev.id, at), RR.FREQS.includes(ev.freq) ? RR.describe(ev) : null);
      }
    }
    for (const t of tasks) {
      if (t.done || !t.due || t.remind === undefined || t.remind === null) continue;
      const at = TK.dueAt(t, zone) - t.remind * MIN;
      if (at < from || at >= to) continue;
      push('task', t.id, t.title, at, stateKey('task', t.id, at));
    }
    for (const r of records) {
      if (r.source !== 'custom' || r.at < from || r.at >= to) continue;
      push('custom', r.id, r.title, r.at, r.id);
    }
    return out.sort((a, b) => a.at - b.at);
  }

  /** Where an item sits on the timeline: 'overdue' (before today), 'today' or 'later'. Dismissed items are left out by callers. */
  function group(item, today, zone) {
    const start = T.startOfDay(today, zone);
    const end = start + 25 * 60 * MIN;
    if (item.at < start) return 'overdue';
    if (item.at < end) return 'today';
    return 'later';
  }

  /**
   * Splits due items into those to show as a popup now and those that were due long ago (marked fired silently, so the
   * first open of the app does not show a backlog). An item is due when its fire time has passed and it has not fired for that time.
   */
  function due(list, at) {
    const notify = [], silent = [];
    for (const it of list) {
      if (it.dismissed || it.fireAt > at) continue;
      if (it.firedAt && it.firedAt >= it.fireAt) continue;
      (at - it.fireAt > LATE ? silent : notify).push(it);
    }
    return { notify, silent };
  }

  /**
   * A repeating event once: the first (next) of its occurrences in the list stands for the rest, which it counts in
   * `more`. Used for the Later group, which would otherwise list a weekly event about 58 times (the window is 400 days).
   * Other items pass through. Keeps the order. (Dismissed occurrences are filtered out before this, so dismissing the
   * next one brings up the one after.)
   */
  function nextOnly(list) {
    const first = new Map(), out = [];
    for (const it of list) {
      if (it.source !== 'event' || !it.repeat) { out.push(it); continue; }
      const seen = first.get(it.refId);
      if (seen) { seen.more++; continue; }
      const row = { ...it, more: 0 };
      out.push(row);
      first.set(it.refId, row);
    }
    return out;
  }

  /** The row to write when an item fires, snoozes or is dismissed. Custom rows keep their own fields. */
  function stateRow(item, patch) {
    return {
      id: item.stateId, source: item.source, refId: item.isCustom ? undefined : item.refId,
      title: item.title, at: item.at, ...patch,
    };
  }

  /** The snooze time for a choice: 5 minutes or 1 hour from now, or 09:00 tomorrow in the device zone. */
  function snoozeUntil(choice, at, zone) {
    if (choice === 'tomorrow') return T.dayTimeToUtc(T.addDays(T.todayIn(zone, at), 1), TK.DEFAULT_TIME, zone);
    const s = SNOOZES.find((x) => x.id === choice);
    return s && s.ms ? at + s.ms : null;
  }

  NS.SNOOZES = SNOOZES;
  NS.LATE = LATE;
  NS.now = now;
  NS.setClock = setClock;
  NS.stateKey = stateKey;
  NS.items = items;
  NS.group = group;
  NS.nextOnly = nextOnly;
  NS.due = due;
  NS.stateRow = stateRow;
  NS.snoozeUntil = snoozeUntil;
})(typeof window !== 'undefined' ? window : globalThis);
