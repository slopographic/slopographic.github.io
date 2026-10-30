// The task editor: the task panel on the right (js/ui/task-panel.js) for one task (new or existing): title, description, column, assignee (from the
// project's people, or a new name), priority, start and end (a one-day task when only one is given), due day, tags, the
// CRM customer it is for (when there are customers), the checklist and what it waits for. Save checks first and keeps
// the dialog open on a problem; it is one undo step, and later tasks move on when the dates change. Delete has Undo.
// Exposes window.SlopProjects.editor.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const UI = g.SlopUI, el = UI.el;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const PRI = [['none', 'projects.card.none'], ['low', 'projects.card.low'], ['medium', 'projects.card.medium'], ['high', 'projects.card.high']];   // keys
  const field = (label, node, cls) => el('label', { class: `field${cls ? ` ${cls}` : ''}` }, el('span', null, label), node);
  const input = (id, type, value, extra = {}) => el('input', { id, type, value: value ?? '', autocomplete: 'off', ...extra });
  const select = (id, opts, value) => el('select', { id }, opts.map(([v, l]) => el('option', { value: v, selected: String(v) === String(value ?? '') }, l)));

  /** The record from the form, or { error }. */
  function read(body, f, parts, task) {
    const v = (id) => body.querySelector(`#${id}`).value.trim();
    const title = v('peTitle');
    if (!title) return { error: t('projects.ed.no_title') };
    let start = v('peStart'), end = v('peEnd');
    if (start && !end) end = start;
    if (end && !start) start = end;
    if (start && end < start) return { error: t('projects.ed.end_before') };
    const s = NS.state;
    const cust = body.querySelector('#peCustomer');
    return {
      value: {
        ...(task ? { id: task.id } : { order: NS.board.inColumn(s.tasks, v('peColumn')).length }),
        projectId: s.project.id, title, description: v('peDesc') || undefined, column: v('peColumn'), assignee: v('peWho') || undefined,
        priority: v('pePriority'), start: start || undefined, end: end || undefined, due: v('peDue') || undefined,
        tags: [...new Set(v('peTags').split(',').map((x) => x.trim().slice(0, 40)).filter(Boolean))].slice(0, 20),
        checklist: parts.check.value(), deps: parts.deps.value(), customerId: (cust && cust.value) || undefined,
      },
    };
  }

  /** Opens the editor. opts: { task } to edit, or { column, title, start } for a new one. */
  function open(opts = {}) {
    const s = NS.state, p = s.project;
    if (!p) return null;
    const task = opts.task ? s.tasks.find((x) => x.id === opts.task.id) || opts.task : null;
    const f = task || { title: opts.title || '', column: opts.column || p.columns[0].id, priority: 'none', tags: [], checklist: [], deps: [], start: opts.start, end: opts.start };
    const people = NS.board.peopleOf(p, s.tasks);
    const parts = { check: NS.editorParts.checklist(f.checklist), deps: NS.editorParts.waitsFor(task ? task.id : null, f.deps, s.tasks) };
    const customers = [...s.customers.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const body = el('form', { class: 'pe-form', onsubmit: (e) => e.preventDefault() },
      field(t('projects.ed.title'), input('peTitle', 'text', f.title, { maxlength: 200, required: true, autofocus: true }), 'wide'),
      field(t('projects.ed.desc'), el('textarea', { id: 'peDesc', rows: 3, maxlength: 5000 }, f.description || ''), 'wide'),
      field(t('projects.ed.column'), select('peColumn', p.columns.map((c) => [c.id, c.name]), f.column)),
      field(t('projects.ed.assignee'), el('span', { class: 'pe-who' }, input('peWho', 'text', f.assignee, { list: 'pePeople', maxlength: 80, placeholder: t('projects.ed.nobody') }),
        el('datalist', { id: 'pePeople' }, people.map((n) => el('option', { value: n }))))),
      field(t('projects.ed.priority'), select('pePriority', PRI.map(([v, k]) => [v, t(k)]), f.priority || 'none')),
      field(t('projects.ed.due'), input('peDue', 'date', f.due)),
      field(t('projects.ed.start'), input('peStart', 'date', f.start)),
      field(t('projects.ed.end'), input('peEnd', 'date', f.end)),
      field(t('projects.ed.tags'), input('peTags', 'text', (f.tags || []).join(', '), { maxlength: 400 }), 'wide'),
      customers.length ? field(t('projects.ed.customer'), el('span', { class: 'inline' }, select('peCustomer', [['', t('projects.ed.no_customer')], ...customers], f.customerId),
        el('a', { class: 'btn small', href: '../crm/#customers', title: t('projects.ed.open_crm') }, 'CRM')), 'wide') : null,   // i18n-ignore: class names
      el('div', { class: 'wide' }, parts.check.el),
      el('div', { class: 'wide' }, parts.deps.el),
      el('p', { class: 'note wide' }, t('projects.ed.note')));   // i18n-ignore: class names
    const save = async () => {
      const r = read(body, f, parts, task);
      if (r.error) { UI.toast(r.error); return false; }
      const ok = await NS.actions.saveTask(r.value);
      return ok ? undefined : false;
    };
    const buttons = [{ label: t('menu.cancel') }];
    if (task) buttons.push({ label: t('ui.delete'), danger: true, act: () => { NS.actions.deleteTask(task.id); } });
    buttons.push({ label: task ? t('menu.save') : t('projects.ed.add_task'), primary: true, act: save });
    return NS.taskPanel.show({ title: task ? t('projects.ed.edit_task') : t('projects.ed.new_task'), body, buttons });
  }

  NS.editor = { open, read };
})(typeof window !== 'undefined' ? window : globalThis);
