// The task editor: a SlopUI dialog for one task. It holds the fields, a repeat and a reminder, a CRM customer link and the
// zone of a due time. Subtasks are added and removed in the dialog and saved at once (they are tasks of their own).
// Saving validates first, and a bad form keeps the dialog open. Exposes window.SlopTodo.editor.
(function (g) {
  'use strict';
  const S = g.SlopData, T = g.SlopTime, TS = g.SlopTaskStore, TK = g.SlopTasks, UI = g.SlopUI, el = UI.el;
  const NS = (g.SlopTodo = g.SlopTodo || {});
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const REMINDERS = [{ v: '', key: 'todo.ed.no_reminder' }, { v: 0, key: 'todo.ed.at_due' }, { v: 15, key: 'todo.ed.15m' }, { v: 60, key: 'todo.ed.1h' }, { v: 1440, key: 'todo.ed.1d' }];
  const FALLBACK = ['UTC', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'];
  const field = (id, label, node) => el('label', { class: 'field' }, el('span', null, label), node);
  const inp = (id, type, value, label, extra = {}) => el('input', { id, type, value: value ?? '', 'aria-label': label, ...extra });
  const sel = (id, opts, value, label) => el('select', { id, 'aria-label': label }, opts.map((o) => el('option', { value: o.v, selected: String(o.v) === String(value) }, o.label)));

  function zones(current) {
    let all = FALLBACK;
    try { if (Intl.supportedValuesOf) all = Intl.supportedValuesOf('timeZone'); } catch (e) { /* short list */ }
    return [...new Set([current, T.deviceZone(), ...all].filter(Boolean))];
  }

  /** The editor's starting values for a task, or for a new one (list and due day preset). */
  function start(task, opts) {
    if (task) return { ...task, tags: (task.tags || []).join(', '), remind: task.remind ?? '', freq: task.freq || 'none', tz: task.tz || T.deviceZone() };
    return { title: opts.title || '', notes: '', due: opts.due || '', dueTime: '', tz: T.deviceZone(), priority: 'none', list: opts.list || 'Inbox',   // i18n-ignore: the stored name of the default list
      tags: '', freq: 'none', until: '', remind: '', customerId: opts.customerId || '', parentId: opts.parentId || '' };
  }

  /**
   * Opens the editor. opts: { task (to edit), list, due, parentId, title, customerId, today, onDone }. A subtask is added
   * with parentId set; its parent's dialog shows it in the list.
   */
  async function open(opts = {}) {
    const task = opts.task || null;
    const f = start(task, opts);
    const cust = await S.store.list('customers');
    const customers = cust.ok ? cust.value.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))) : [];
    const lists = await listNames();
    const kids = task ? (await S.store.list('tasks')).value.filter((sub) => sub.parentId === task.id) : [];
    const subs = el('ul', { class: 'sub-list', 'aria-label': t('todo.ed.subtasks') }, kids.sort(TK.compare).map((k) => subRow(k)));
    const subInput = inp('tSubTitle', 'text', '', t('todo.ed.new_subtask'), { maxlength: 200, placeholder: t('todo.ed.add_subtask') });
    const subAdd = el('button', { type: 'button', class: 'btn', onclick: async () => {
      const title = subInput.value.trim();
      if (!task || !title) return;
      const r = await TS.save({ title, list: f.list || 'Inbox', parentId: task.id, done: false });   // i18n-ignore: the stored name of the default list
      if (!r.ok) UI.toast(r.message); else { subInput.value = ''; subs.append(subRow(r.value)); }
    } }, t('todo.ed.add'));
    const body = el('form', { class: 'task-form', id: 'tForm', onsubmit: (e) => e.preventDefault() },
      field('teTitle', t('todo.ed.title'), inp('teTitle', 'text', f.title, t('todo.ed.title'), { maxlength: 200, required: true, autofocus: true })),
      field('tNotes', t('todo.ed.notes'), el('textarea', { id: 'tNotes', rows: 3, maxlength: 5000, 'aria-label': t('todo.ed.notes') }, f.notes || '')),
      el('div', { class: 'ev-row' },
        field('tDue', t('todo.ed.due_date'), inp('tDue', 'date', f.due, t('todo.ed.due_date'))),
        field('tTime', t('todo.ed.due_time'), inp('tTime', 'time', f.dueTime, t('todo.ed.due_time')))),
        field('tTz', t('todo.ed.zone'), sel('tTz', zones(f.tz).map((z) => ({ v: z, label: z })), f.tz, t('todo.ed.zone'))),
      el('div', { class: 'ev-row' },
        field('tPriority', t('todo.ed.priority'), sel('tPriority', [{ v: 'none', label: t('todo.ed.p_none') }, { v: 'low', label: t('todo.ed.p_low') }, { v: 'high', label: t('todo.ed.p_high') }], f.priority, t('todo.ed.priority'))),
        field('teList', t('todo.ed.list'), el('span', null, inp('teList', 'text', f.list, t('todo.ed.list'), { list: 'tListNames', maxlength: 40 }),
          el('datalist', { id: 'tListNames' }, lists.map((n) => el('option', { value: n })))))),
      field('tTags', t('todo.ed.tags'), inp('tTags', 'text', f.tags, t('todo.ed.tags_aria'), { maxlength: 400 })),
      el('div', { class: 'ev-row' },
        field('tRepeat', t('todo.ed.repeat'), sel('tRepeat', [['none', t('todo.ed.r_none')], ['daily', t('todo.ed.r_daily')], ['weekly', t('todo.ed.r_weekly')], ['monthly', t('todo.ed.r_monthly')], ['yearly', t('todo.ed.r_yearly')]].map(([v, label]) => ({ v, label })), f.freq, t('todo.ed.repeat'))),
        field('tUntil', t('todo.ed.until'), inp('tUntil', 'date', f.until, t('todo.ed.until_aria')))),
      el('div', { class: 'ev-row' },
        field('tRemind', t('todo.ed.reminder'), sel('tRemind', REMINDERS.map((r) => ({ v: r.v, label: t(r.key) })), f.remind, t('todo.ed.reminder')))),
        field('tCustomer', t('todo.ed.customer'), sel('tCustomer', [{ v: '', label: t('todo.ed.no_customer') }, ...customers.map((c) => ({ v: c.id, label: c.name }))], f.customerId, t('todo.ed.customer'))),
        el('p', { class: 'note' }, t('todo.ed.cal_note')),
        task ? el('section', { class: 'sub-sec' }, el('h4', { class: 'sub-t' }, t('todo.ed.subtasks')), subs,
        el('div', { class: 'inline' }, subInput, subAdd)) : el('p', { class: 'note' }, t('todo.ed.save_first')));
    const read = () => {
      const v = (id) => body.querySelector(`#${id}`).value;
      return { title: v('teTitle'), notes: v('tNotes'), due: v('tDue'), dueTime: v('tTime'), tz: v('tTz'), priority: v('tPriority'),
        list: v('teList'), tags: v('tTags'), freq: v('tRepeat'), until: v('tUntil'), remind: v('tRemind'), customerId: v('tCustomer'),
        parentId: f.parentId };
    };
    const save = async () => {
      const res = TS.fromForm(read(), task);
      if (!res.ok) { UI.toast(res.error); return false; }
      const r = await TS.save(res.value);
      if (!r.ok) { UI.toast(r.message || t('todo.ed.save_failed')); return false; }
      if (opts.onDone) opts.onDone(r.value);
      return true;
    };
    const remove = async () => {
      const kidCount = kids.length;
      const yes = await UI.confirm(t('todo.ed.del_q'), kidCount ? t('todo.ed.del_kids', { n: kidCount }) : t('todo.ed.del_final'), t('ui.delete'), { danger: true });
      if (!yes) return false;
      const r = await TS.remove(task.id);
      if (!r.ok) { UI.toast(r.message); return false; }
      if (opts.onDone) opts.onDone(null);
      return true;
    };
    const buttons = [{ label: t('menu.cancel') }];
    if (task) buttons.push({ label: t('ui.delete'), danger: true, act: remove });
    buttons.push({ label: t('menu.save'), primary: true, act: async () => ((await save()) ? undefined : false) });
    return UI.dialog({ title: task ? t('todo.ed.edit_task') : t('todo.ed.new_task'), body, buttons, cls: 'task-dlg', dismissable: true });
  }

  /** One subtask in the dialog: its title and a checkbox that completes it at once. */
  function subRow(k) {
    return el('li', { class: `sub-row${k.done ? ' is-done' : ''}` },
      el('input', { type: 'checkbox', checked: !!k.done, 'aria-label': t('todo.row.complete', { title: k.title }), onchange: async (e) => {
        const r = e.target.checked ? await TS.complete(k.id) : await TS.reopen(k.id);
        if (!r.ok) UI.toast(r.message);
      } }),
      el('span', null, k.title));
  }

  /** The list names in use, for the list field's suggestions. */
  async function listNames() {
    const r = await S.store.list('tasks');
    return r.ok ? TK.listsOf(r.value) : ['Inbox'];
  }

  NS.editor = { open, start, zones, REMINDERS };
})(typeof window !== 'undefined' ? window : globalThis);
