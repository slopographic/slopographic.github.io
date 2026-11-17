// The to-do config kind 'todo' (a .slop.json file): tasks, with their subtasks nested under them. Import goes through
// validation, then one store transaction (parents first, so each subtask gets its parent's new id). Export reads the same
// shape back. Due dates are YYYY-MM-DD; due times are HH:MM in the task's zone. Needs shared/config and SlopData.
(function (g) {
  'use strict';
  const C = g.SlopConfig, S = g.SlopData, T = g.SlopTime, TK = g.SlopTasks;
  if (!C || !C.registerKind) return;
  const F = C.F;
  const tr = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

  const SUB = F.obj({ title: F.str({ max: 200, required: true }), done: F.bool({ desc: 'true when the subtask is done' }) });   // i18n-ignore: schema text for the config file and the assistant (API)
  const TASK = F.obj({
    title: F.str({ max: 200, required: true, desc: 'what has to be done' }),   // i18n-ignore: schema text for the config file and the assistant (API)
    notes: F.text({ max: 5000 }),
    due: F.str({ max: 10, pattern: DAY, desc: 'due date as YYYY-MM-DD, optional' }),   // i18n-ignore: schema text for the config file and the assistant (API)
    dueTime: F.str({ max: 5, pattern: HHMM, desc: 'due time as HH:MM in tz, optional; needs due' }),
    tz: F.str({ max: 64, desc: 'IANA time zone for the due time, such as Europe/Paris' }),   // i18n-ignore: schema text for the config file and the assistant (API)
    priority: F.enum(['none', 'low', 'high']),
    list: F.str({ max: 40, desc: 'the list name, such as Inbox or Work' }),   // i18n-ignore: schema text for the config file and the assistant (API)
    tags: F.list(F.str({ max: 40 }), { max: 20, desc: 'short labels' }),   // i18n-ignore: schema text for the config file and the assistant (API)
    done: F.bool({ desc: 'true when the task is complete' }),   // i18n-ignore: schema text for the config file and the assistant (API)
    freq: F.enum(['none', 'daily', 'weekly', 'monthly', 'yearly'], { desc: 'how often it repeats; needs due' }),
    until: F.str({ max: 10, pattern: DAY, desc: 'last day of the repeat, optional' }),   // i18n-ignore: schema text for the config file and the assistant (API)
    remind: F.int({ min: 0, max: 525600, desc: 'minutes before the due time to remind, optional' }),   // i18n-ignore: schema text for the config file and the assistant (API)
    subtasks: F.list(SUB, { max: 100, desc: 'steps of this task' }),   // i18n-ignore: schema text for the config file and the assistant (API)
  });

  /** Rules the schema cannot express: a due time needs a due date, a repeat needs a due date, and zones must be real. */
  function check(data) {
    const out = [];
    (data.tasks || []).forEach((t, i) => {
      const at = `tasks[${i}]`;
      if (t.dueTime && !t.due) out.push({ path: at, message: tr('todo.kind.time_needs_date') });
      if (t.freq && t.freq !== 'none' && !t.due) out.push({ path: at, message: tr('todo.kind.repeat_needs_date') });
      if (t.tz && !T.isZone(t.tz)) out.push({ path: `${at}.tz`, message: tr('todo.kind.bad_zone') });
      if (t.due && !T.parseDay(t.due)) out.push({ path: `${at}.due`, message: tr('todo.kind.bad_date') });
    });
    return out;
  }

  /** The stored shape of one task (without its id). */
  function toRecord(t) {
    return { title: t.title, notes: t.notes, due: t.due, dueTime: t.dueTime, tz: t.due ? t.tz || T.deviceZone() : undefined,
      priority: t.priority || 'none', list: t.list || 'Inbox', tags: t.tags || [], done: !!t.done, freq: t.due ? t.freq || 'none' : 'none',   // i18n-ignore: the stored name of the default list
      until: t.until, remind: t.remind };
  }

  C.registerKind('todo', 'todo', { fields: { tasks: F.list(TASK, { max: 1000, required: true, desc: 'the tasks to add, with subtasks inside' }) } },   // i18n-ignore: schema text for the config file and the assistant (API)
    /** Adds every task and subtask in one transaction. Nothing existing is changed. */
    async (data) => {
      let added = 0;
      const r = await S.store.transact(async (api) => {
        for (const t of data.tasks) {
          const w = await api.put('tasks', toRecord(t));
          if (!w.ok) return w;
          added++;
          for (const s of t.subtasks || []) {
            const x = await api.put('tasks', { title: s.title, done: !!s.done, list: t.list || 'Inbox', parentId: w.value.id });   // i18n-ignore: the stored name of the default list
            if (!x.ok) return x;
            added++;
          }
        }
        return { ok: true, value: added };
      });
      if (!r.ok) throw new Error(r.message || tr('todo.kind.add_failed'));
      return { added };
    },
    {
      get label() { return tr('todo.kind.label'); }, get description() { return tr('todo.kind.desc'); },
      read: async () => {
        const r = await S.store.list('tasks');
        if (!r.ok) throw new Error(r.message);
        const all = r.value;
        const tasks = TK.forView(all, 'all', '0000-00-00', { showDone: true }).map((t) => ({
          ...toRecord(t),
          subtasks: TK.children(all, t.id).sort(TK.compare).map((s) => ({ title: s.title, done: !!s.done })),
        }));
        return { tasks };
      },
      check,
    });
})(typeof window !== 'undefined' ? window : globalThis);
