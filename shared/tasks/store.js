// To-do tasks in the shared store ('tasks'). fromForm checks the editor's values, save and patch write through
// SlopData.store, and complete and reopen use the rules in logic.js, so the To-do app and the Calendar's task layer
// change a task the same way. Exposes window.SlopTaskStore. Needs SlopData, tz.js, rrule.js and tasks/logic.js.
(function (g) {
  'use strict';
  const S = g.SlopData, T = g.SlopTime, RR = g.SlopRecur, TK = g.SlopTasks;
  const NS = (g.SlopTaskStore = g.SlopTaskStore || {});
  const PRIORITIES = ['none', 'low', 'high'];
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const tr = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/backup3.js (ui.tasks.*)

  /** The editor's values as a task record. Errors come back as { ok: false, error }. */
  function fromForm(form, existing = null) {
    const title = String(form.title || '').trim();
    if (!title) return { ok: false, error: tr('ui.tasks.need_title') };
    const due = form.due ? String(form.due) : undefined;
    if (due && !T.parseDay(due)) return { ok: false, error: tr('ui.tasks.bad_due') };
    const dueTime = form.dueTime ? String(form.dueTime) : undefined;
    if (dueTime && !HHMM.test(dueTime)) return { ok: false, error: tr('ui.tasks.bad_time') };
    const rec = {
      ...(existing ? { id: existing.id } : {}), title, due, dueTime,
      tz: form.tz || T.deviceZone(), notes: form.notes || undefined,
      priority: PRIORITIES.includes(form.priority) ? form.priority : 'none',
      list: String(form.list || 'Inbox').trim().slice(0, 40) || 'Inbox',
      tags: String(form.tags || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20),
      parentId: form.parentId || undefined, customerId: form.customerId || undefined,
      freq: RR.FREQS.includes(form.freq) && due ? form.freq : 'none',
      until: form.until && RR.FREQS.includes(form.freq) && due ? form.until : undefined,
      remind: form.remind === '' || form.remind === undefined || form.remind === null ? undefined : Number(form.remind),
    };
    if (!due) rec.tz = undefined;
    if (rec.until && !T.parseDay(rec.until)) return { ok: false, error: tr('ui.tasks.bad_until') };
    const errs = TK.editErrors(rec);
    if (errs.length) return { ok: false, error: errs[0] };
    return { ok: true, value: rec };
  }

  /** Live tasks. */
  const list = () => S.store.list('tasks');

  /** Creates a task, or merges changes into an existing one (the stored fields the form does not set are kept). */
  async function save(record) {
    if (!record.id) return S.store.put('tasks', { done: false, ...record });
    const cur = await S.store.get('tasks', record.id);
    if (!cur.ok) return cur;
    if (!cur.value) return { ok: false, code: 'not_found', message: tr('ui.tasks.gone') };
    return S.store.put('tasks', { ...cur.value, ...record });
  }

  /** Changes some fields of one task. */
  async function patch(id, changes) {
    const cur = await S.store.get('tasks', id);
    if (!cur.ok) return cur;
    if (!cur.value) return { ok: false, code: 'not_found', message: tr('ui.tasks.gone') };
    return S.store.put('tasks', { ...cur.value, ...changes });
  }

  /**
   * Completes a task (or moves a repeating one to its next due date). The change is one store write, so the Calendar
   * sees it the moment it is saved.
   */
  async function complete(id, now = Date.now()) {
    const cur = await S.store.get('tasks', id);
    if (!cur.ok) return cur;
    if (!cur.value) return { ok: false, code: 'not_found', message: tr('ui.tasks.gone') };
    const change = TK.complete(cur.value, now);
    if (!change) return { ok: true, value: cur.value };
    return S.store.put('tasks', { ...cur.value, ...change });
  }

  /** Reopens a completed task. */
  function reopen(id) { return patch(id, TK.reopen()); }

  /** Deletes a task and its subtasks in one transaction. */
  async function remove(id) {
    const all = await S.store.list('tasks');
    if (!all.ok) return all;
    const ids = [id];
    for (let i = 0; i < ids.length; i++) for (const t of all.value) if (t.parentId === ids[i]) ids.push(t.id);
    return S.store.transact(async (api) => {
      for (const k of ids) {
        const r = await api.remove('tasks', k);
        if (!r.ok) return r;
      }
      return { ok: true, value: ids.length };
    });
  }

  /** Tasks linked to one customer. */
  function forCustomer(customerId) { return S.store.list('tasks', { index: 'customerId', value: customerId }); }

  NS.PRIORITIES = PRIORITIES;
  NS.fromForm = fromForm;
  NS.list = list;
  NS.save = save;
  NS.patch = patch;
  NS.complete = complete;
  NS.reopen = reopen;
  NS.remove = remove;
  NS.forCustomer = forCustomer;
})(typeof window !== 'undefined' ? window : globalThis);
