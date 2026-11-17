// To-do rules, with no storage or DOM: the due moment of a task, which view a task belongs to, what completing it does
// (a repeating task moves its due date on instead of finishing), subtasks and sorting. Tasks are stored in the shared
// 'tasks' collection. Exposes window.SlopTasks. Needs tz.js and rrule.js first.
(function (g) {
  'use strict';
  const tr = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/backup3.js (ui.tasks.*)
  const T = g.SlopTime, RR = g.SlopRecur;
  const NS = (g.SlopTasks = g.SlopTasks || {});
  const DEFAULT_TIME = '09:00';   // a due date without a time is due at 09:00 for reminders
  const PRIORITY_RANK = { high: 0, none: 1, low: 2 };

  /** The instant a task is due, or null when it has no due date. Without a time it is due at 09:00 in its zone. */
  function dueAt(task, zone) {
    if (!task || !task.due) return null;
    return T.dayTimeToUtc(task.due, task.dueTime || DEFAULT_TIME, task.tz || zone || T.deviceZone());
  }

  /**
   * Which view a task is in on a given day: 'done', 'none' (no due date), 'overdue', 'today' or 'upcoming'.
   * Overdue and today tasks are both in Today; upcoming tasks are in Upcoming.
   */
  function bucket(task, today) {
    if (task.done) return 'done';
    if (!task.due) return 'none';
    if (task.due < today) return 'overdue';
    if (task.due === today) return 'today';
    return 'upcoming';
  }

  /** Whether a task is in the Today view: open, and due today or earlier. */
  const inToday = (task, today) => ['overdue', 'today'].includes(bucket(task, today));
  /** Whether a task is in the Upcoming view: open, and due after today. */
  const inUpcoming = (task, today) => bucket(task, today) === 'upcoming';

  /**
   * The changes that completing a task makes. A one-off task is marked done. A repeating task keeps its place and
   * moves its due date to the next occurrence, so it is open again. Returns null when there is nothing to change.
   */
  function complete(task, now = Date.now()) {
    if (task.done && !task.freq) return null;
    if (task.freq && task.freq !== 'none' && task.due) {
      const next = RR.advance(task.due, task.freq);
      if (!next) return { done: true, doneAt: now };
      if (task.until && next > task.until) return { done: true, doneAt: now };
      return { due: next, doneAt: now, done: false };
    }
    return { done: true, doneAt: now };
  }

  /** The changes that reopen a task. */
  const reopen = () => ({ done: false, doneAt: null });

  /** Subtasks of a task, in the order they were listed. */
  function children(tasks, id) {
    return tasks.filter((t) => t.parentId === id);
  }

  /** How many of a task's subtasks are done: { done, total }. */
  function progress(tasks, id) {
    const kids = children(tasks, id);
    return { done: kids.filter((k) => k.done).length, total: kids.length };
  }

  /** Sort order: earliest due first (no date last), then due time, then priority (high first), then title. */
  function compare(a, b) {
    const ad = a.due || '9999-12-31', bd = b.due || '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    const at = a.dueTime || '99:99', bt = b.dueTime || '99:99';
    if (at !== bt) return at < bt ? -1 : 1;
    const pa = PRIORITY_RANK[a.priority || 'none'], pb = PRIORITY_RANK[b.priority || 'none'];
    if (pa !== pb) return pa - pb;
    return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
  }

  /** The list names in use, Inbox first, then the rest in alphabetical order. */
  function listsOf(tasks) {
    const names = new Set(['Inbox']);
    for (const t of tasks) if (t.list) names.add(t.list);
    return [...names].sort((a, b) => (a === 'Inbox' ? -1 : b === 'Inbox' ? 1 : a.localeCompare(b)));
  }

  /**
   * The top-level tasks for a view, sorted. view: 'today' | 'upcoming' | 'all' | { list: name }. Done tasks are left out
   * unless showDone is true. Subtasks are not listed here; use children() under their parent.
   */
  function forView(tasks, view, today, { showDone = false, text = '' } = {}) {
    const q = text.trim().toLowerCase();
    const keep = (t) => {
      if (t.parentId) return false;
      if (q && !(String(t.title).toLowerCase().includes(q) || String(t.notes || '').toLowerCase().includes(q))) return false;
      if (view === 'today') return inToday(t, today) || (showDone && t.done && t.doneAt && T.parts(t.doneAt).day === today);
      if (view === 'upcoming') return inUpcoming(t, today);
      if (view && typeof view === 'object' && view.list) return t.list === view.list && (showDone || !t.done);
      return showDone || !t.done;
    };
    return tasks.filter(keep).sort(compare);
  }

  /** Errors for a task edit that the schema does not catch: a time without a date, or an unknown zone. */
  function editErrors(task) {
    const out = [];
    if (task.dueTime && !task.due) out.push(tr('ui.tasks.time_no_date'));
    if (task.tz && !T.isZone(task.tz)) out.push(tr('ui.tasks.bad_zone'));
    return out;
  }

  NS.DEFAULT_TIME = DEFAULT_TIME;
  NS.dueAt = dueAt;
  NS.bucket = bucket;
  NS.inToday = inToday;
  NS.inUpcoming = inUpcoming;
  NS.complete = complete;
  NS.reopen = reopen;
  NS.children = children;
  NS.progress = progress;
  NS.compare = compare;
  NS.listsOf = listsOf;
  NS.forView = forView;
  NS.editErrors = editErrors;
})(typeof window !== 'undefined' ? window : globalThis);
