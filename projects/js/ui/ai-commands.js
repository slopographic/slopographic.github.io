// Slop Projects commands with arguments (shared/commands/args.js), for the command palette, macros and every AI surface
// (the Slop AI panel, WebMCP): make a project, add, move, edit and delete tasks, set what a task waits for, add a column,
// list the tasks and save a backup or CSV to Slop Drive. They call NS.actions, so each change is one undo step. From the
// palette (no arguments) they open the matching dialog. Registered by commands.js init(); also SlopCmd.provide({ state,
// checkpoint }) from ai-ops.js. Exposes window.SlopProjects.ai.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const O = () => NS.aiOps, A = () => NS.actions;
  const S = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 200, description }, extra);
  const DAY = (name, description) => S(name, `${description}: YYYY-MM-DD, today, tomorrow or +3`, { maxLength: 20 });
  const PRI = { name: 'priority', type: 'enum', values: ['none', 'low', 'medium', 'high'], description: 'priority' };
  const TASK = S('task', 'the task: its id or title', { required: true });   // i18n-ignore: the assistant's tools and replies (English: API)
  const has = () => !!NS.state.project;
  const toast = (m) => { if (g.SlopUI) g.SlopUI.toast(m); return m; };
  /** The palette's way (no arguments): the task with the focus, else a hint. */
  const onFocused = (fn) => { const t = O().focused(); if (t) return fn(t); return toast('Select a task on the board or in the list first, then run this again.'); };   // i18n-ignore: the assistant's tools and replies (English: API)

  async function newProject(a) {
    if (!a) return NS.projectDialog.create();
    const names = O().words(a.columns).slice(0, NS.board.MAX_COLUMNS);
    let columns;
    if (names.length) {
      columns = [];
      for (const n of names) columns = NS.board.addColumn(columns, n).value || columns;
      columns[columns.length - 1].done = true;   // finished work goes in the last column
    }
    await O().must(NS.projectDialog.make(a.name, { columns, color: a.color, start: O().day(a.start, 'start') }), 'The project');   // i18n-ignore: the assistant's tools and replies (English: API)
    const p = NS.state.project;
    return `Made and opened the project "${p.name}" (id ${p.id}) with the columns ${p.columns.map((c) => c.name).join(', ')}.`;   // i18n-ignore: the assistant's tools and replies (English: API)
  }

  async function openProject(a) {
    if (!a) { const n = document.getElementById('pPick'); if (n) n.focus(); return 'Pick a project in the bar.'; }   // i18n-ignore: the assistant's tools and replies (English: API)
    const p = O().projectBy(a.project);
    await NS.app.open(p.id);
    return `Opened "${p.name}".`;   // i18n-ignore: the assistant's tools and replies (English: API)
  }

  async function addTask(a) {
    if (!a) return NS.editor.open({});
    const p = O().project(), col = a.column ? O().column(a.column) : p.columns[0];
    const { start, end } = O().dates(a);
    const rec = { projectId: p.id, title: a.title.slice(0, 200), column: col.id, order: NS.board.inColumn(NS.state.tasks, col.id).length,
      priority: a.priority || 'none', tags: O().words(a.tags).slice(0, 20).map((x) => x.slice(0, 40)), checklist: O().checklist(a.checklist),
      deps: a.waits_for ? O().waitsFor(a.waits_for, undefined) : [], assignee: a.assignee || undefined, description: a.notes || undefined,
      start, end, due: O().day(a.due, 'due') };
    const v = await O().must(A().saveTask(rec), `"${rec.title}"`);
    const id = v.records && v.records[0] && v.records[0].id;
    return `Added "${rec.title}" to ${col.name}${start ? ` (${start === end ? start : `${start} to ${end}`})` : ''}; its id is ${id}.`;   // i18n-ignore: the assistant's tools and replies (English: API)
  }

  async function moveTask(a) {
    if (!a) return onFocused((t) => NS.editor.open({ task: t }));
    const t = O().task(a.task), col = a.column ? O().column(a.column) : O().column(t.column);
    const n = NS.board.inColumn(NS.state.tasks, col.id).length - (col.id === t.column ? 1 : 0);
    const index = a.order == null ? n : Math.max(0, Math.min(n, a.order - 1));
    if (col.id === t.column && NS.board.indexOf(NS.state.tasks, t) === index) return `"${t.title}" is already at place ${index + 1} in ${col.name}.`;
    await O().must(A().moveCard(t.id, col.id, index), `The move of "${t.title}"`);   // i18n-ignore: the assistant's tools and replies (English: API)
    return `Moved "${t.title}" to place ${index + 1} in ${col.name}.`;   // i18n-ignore: the assistant's tools and replies (English: API)
  }

  async function editTask(a) {
    if (!a) return onFocused((t) => NS.editor.open({ task: t }));
    const t = O().task(a.task), rec = { id: t.id, title: a.title ? a.title.slice(0, 200) : t.title }, said = [];
    if (a.title) said.push('title');
    if (a.notes != null) { rec.description = a.notes || undefined; said.push('notes'); }
    if (a.assignee != null) { rec.assignee = a.assignee || undefined; said.push('assignee'); }
    if (a.priority) { rec.priority = a.priority; said.push('priority'); }
    if (a.tags != null) { rec.tags = O().words(a.tags).slice(0, 20); said.push('tags'); }
    if (a.due != null) { rec.due = O().day(a.due, 'due'); said.push('due day'); }   // i18n-ignore: the assistant's tools and replies (English: API)
    if (a.clear_dates) { rec.start = undefined; rec.end = undefined; said.push('dates cleared'); } else if (a.start || a.end) { Object.assign(rec, O().dates(a, t)); said.push('dates'); }   // i18n-ignore: the assistant's tools and replies (English: API)
    if (a.checklist != null) { rec.checklist = O().checklist(a.checklist); said.push('checklist'); }
    if (a.tick) {
      const list = (rec.checklist || t.checklist || []).map((c) => ({ ...c })), k = a.tick.toLowerCase();
      const item = list.find((c) => c.text.toLowerCase() === k) || list.find((c) => c.text.toLowerCase().includes(k));
      if (!item) throw new Error(`"${t.title}" has no checklist item "${a.tick}".`);
      item.done = true; rec.checklist = list; said.push(`ticked "${item.text}"`);
    }
    if (!said.length) throw new Error('Nothing to change: give a title, notes, assignee, priority, tags, dates, due, checklist or tick.');
    await O().must(A().saveTask(rec), `"${rec.title}"`);
    return `Saved "${rec.title}": ${said.join(', ')}.`;   // i18n-ignore: the assistant's tools and replies (English: API)
  }

  async function setDependency(a) {
    if (!a) return onFocused((t) => NS.editor.open({ task: t }));
    const t = O().task(a.task), now = t.deps || [];
    const named = a.waits_for ? O().words(a.waits_for).map((k) => O().task(k).id) : [];
    const want = a.mode === 'replace' ? named : a.mode === 'remove' ? now.filter((d) => !named.includes(d)) : [...now, ...named];
    const deps = O().waitsFor(want.join(','), t.id);
    await O().must(A().saveTask({ id: t.id, title: t.title, deps }), `"${t.title}"`);
    const titles = deps.map((d) => NS.state.tasks.find((x) => x.id === d)).filter(Boolean).map((x) => `"${x.title}"`);
    return titles.length ? `"${t.title}" now waits for ${titles.join(', ')}.` : `"${t.title}" waits for nothing now.`;
  }

  async function deleteTask(a) {
    if (!a) return onFocused((t) => NS.editor.open({ task: t }));
    const t = O().task(a.task);
    await O().must(A().deleteTask(t.id), `The delete of "${t.title}"`);   // i18n-ignore: the assistant's tools and replies (English: API)
    return `Deleted "${t.title}". Undo brings it back.`;   // i18n-ignore: the assistant's tools and replies (English: API)
  }

  async function addColumn(a) {
    if (!a) return NS.projectDialog.open();
    const p = O().project(), r = NS.board.addColumn(p.columns, a.name);
    if (!r.ok) throw new Error(r.message);
    const col = r.value[r.value.length - 1];
    if (a.wip) col.wip = a.wip;
    const columns = a.position ? NS.board.moveColumn(r.value, col.id, a.position - 1) : r.value;
    await O().must(A().saveProject({ ...p, columns }, []), 'The column');   // i18n-ignore: the assistant's tools and replies (English: API)
    return `Added the column "${col.name}" (id ${col.id}).`;   // i18n-ignore: the assistant's tools and replies (English: API)
  }

  function listTasks(a) {
    if (!a) { NS.app.go('list'); return 'Showing the list.'; }   // i18n-ignore: the assistant's tools and replies (English: API)
    return O().tasks({ column: a.column, assignee: a.assignee });
  }

  async function saveToDrive(a) {
    const f = a || { format: 'json' }, p = O().project(), hub = g.SlopHub;
    if (!hub || !hub.put) throw new Error('Slop Drive is not available on this page.');
    const blob = f.format === 'csv' ? new Blob(['﻿' + NS.io.csv(p, NS.state.tasks, NS.state.customers)], { type: 'text/csv' })
      : new Blob([JSON.stringify(NS.io.backup(p, NS.state.tasks), null, 2)], { type: 'application/json' });
    const name = NS.io.fileName(p, f.format === 'csv' ? 'csv' : 'json');
    const id = await hub.put(blob, { name, from: 'projects' });
    return toast(`Saved "${name}" to Slop Drive (id ${id}).`);   // i18n-ignore: the assistant's tools and replies (English: API)
  }

  const T = (o) => Object.assign({ group: 'Projects', keys: [], destructive: false }, o);   // i18n-ignore: the assistant's tools and replies (English: API)
  const LIST = [
    T({ id: 'projects.newProject', tool: 'new_project', title: 'Projects: new project', keywords: ['make', 'create', 'board'], run: newProject,   // i18n-ignore: the assistant's tools and replies (English: API)
      description: 'Make a new project and open it. Nothing is replaced: other projects stay.',   // i18n-ignore: the assistant's tools and replies (English: API)
      args: [S('name', 'project name', { required: true, maxLength: 120 }), S('columns', 'board columns, separated by commas; the last holds finished work', { default: 'To do, Doing, Done', maxLength: 600 }),   // i18n-ignore: the assistant's tools and replies (English: API)
        { name: 'color', type: 'enum', values: NS.projectDialog.COLORS.map((c) => c[0]), default: 'blue', description: 'colour' }, DAY('start', 'start day (default today)')] }),   // i18n-ignore: the assistant's tools and replies (English: API)
    T({ id: 'projects.openProject', tool: 'open_project', title: 'Projects: open a project', keywords: ['switch', 'pick'], run: openProject,   // i18n-ignore: the assistant's tools and replies (English: API)
      description: 'Open another project by its id or name.', args: [S('project', 'project id or name', { required: true })] }),   // i18n-ignore: the assistant's tools and replies (English: API)
    T({ id: 'projects.newTask', tool: 'add_task', title: 'Projects: new task', keys: ['n'], keywords: ['add', 'card'], when: has, run: addTask,   // i18n-ignore: the assistant's tools and replies (English: API)
      description: 'Add a task to a column of the open project, with optional dates, assignee, notes, checklist and what it waits for.',   // i18n-ignore: the assistant's tools and replies (English: API)
      args: [S('title', 'task title', { required: true }), S('column', 'column id or name (default the first)'), DAY('start', 'first day'), DAY('end', 'last day'), DAY('due', 'due day'),   // i18n-ignore: the assistant's tools and replies (English: API)
        S('assignee', 'who does it', { maxLength: 80 }), S('notes', 'description', { maxLength: 5000 }), Object.assign({}, PRI, { default: 'none' }), S('tags', 'tags, separated by commas', { maxLength: 400 }),   // i18n-ignore: the assistant's tools and replies (English: API)
        S('checklist', 'checklist items separated by ; ("[x] item" is ticked)', { maxLength: 5000 }), S('waits_for', 'tasks (ids or titles, separated by commas) that must finish first', { maxLength: 1000 })] }),   // i18n-ignore: the assistant's tools and replies (English: API)
    T({ id: 'projects.moveTask', tool: 'move_task', title: 'Projects: move a task', keywords: ['column', 'reorder', 'drag'], when: has, run: moveTask,   // i18n-ignore: the assistant's tools and replies (English: API)
      description: 'Move a task to another column and/or to a place in its column (1 is the top).',   // i18n-ignore: the assistant's tools and replies (English: API)
      args: [TASK, S('column', 'column id or name (default its own)'), { name: 'order', type: 'number', integer: true, min: 1, max: 5000, description: 'place in the column, 1 is the top (default the end)' }] }),   // i18n-ignore: the assistant's tools and replies (English: API)
    T({ id: 'projects.editTask', tool: 'edit_task', title: 'Projects: edit a task', keywords: ['change', 'rename', 'dates', 'assign'], when: has, run: editTask,   // i18n-ignore: the assistant's tools and replies (English: API)
      description: 'Change fields of a task; only the fields given change. Later tasks move on when its dates change.',   // i18n-ignore: the assistant's tools and replies (English: API)
      args: [TASK, S('title', 'new title'), S('notes', 'new description ("" clears it)', { maxLength: 5000 }), S('assignee', 'who does it ("" for nobody)', { maxLength: 80 }), PRI,   // i18n-ignore: the assistant's tools and replies (English: API)
        DAY('start', 'first day'), DAY('end', 'last day'), DAY('due', 'due day ("" clears it)'), { name: 'clear_dates', type: 'boolean', default: false, description: 'take the task off the timeline' },   // i18n-ignore: the assistant's tools and replies (English: API)
        S('tags', 'tags, separated by commas (replaces them)', { maxLength: 400 }), S('checklist', 'the whole checklist, items separated by ; (replaces it)', { maxLength: 5000 }), S('tick', 'a checklist item to mark done')] }),   // i18n-ignore: the assistant's tools and replies (English: API)
    T({ id: 'projects.setDependency', tool: 'set_dependency', title: 'Projects: set what a task waits for', keywords: ['dependency', 'depends', 'blocked', 'gantt'], when: has, run: setDependency,   // i18n-ignore: the assistant's tools and replies (English: API)
      description: 'Make a task wait for other tasks (finish to start). A loop is refused.',   // i18n-ignore: the assistant's tools and replies (English: API)
      args: [TASK, S('waits_for', 'tasks (ids or titles, separated by commas)', { maxLength: 1000 }), { name: 'mode', type: 'enum', values: ['add', 'replace', 'remove'], default: 'add', description: 'add to, replace or remove from its list' }] }),   // i18n-ignore: the assistant's tools and replies (English: API)
    T({ id: 'projects.deleteTask', tool: 'delete_task', title: 'Projects: delete a task', keywords: ['remove'], when: has, run: deleteTask, destructive: true,   // i18n-ignore: the assistant's tools and replies (English: API)
      description: 'Delete a task (Undo brings it back during this visit).', args: [TASK] }),   // i18n-ignore: the assistant's tools and replies (English: API)
    T({ id: 'projects.addColumn', tool: 'add_column', title: 'Projects: add a column', keywords: ['board', 'stage'], when: has, run: addColumn,   // i18n-ignore: the assistant's tools and replies (English: API)
      description: 'Add a column to the board of the open project.',   // i18n-ignore: the assistant's tools and replies (English: API)
      args: [S('name', 'column name', { required: true, maxLength: 40 }), { name: 'wip', type: 'number', integer: true, min: 0, max: 999, default: 0, description: 'limit of cards, 0 is no limit' },   // i18n-ignore: the assistant's tools and replies (English: API)
        { name: 'position', type: 'number', integer: true, min: 1, max: 12, description: 'place among the columns, 1 is the left (default the end)' }] }),   // i18n-ignore: the assistant's tools and replies (English: API)
    T({ id: 'projects.listTasks', tool: 'list_tasks', title: 'Projects: list the tasks', keywords: ['show', 'read'], when: has, run: listTasks,   // i18n-ignore: the assistant's tools and replies (English: API)
      description: 'The tasks of the open project in board order (ids, column, place, dates, assignee, checklist, waits for). Changes nothing.',   // i18n-ignore: the assistant's tools and replies (English: API)
      args: [S('column', 'only this column (id or name)'), S('assignee', 'only this person')] }),   // i18n-ignore: the assistant's tools and replies (English: API)
    T({ id: 'projects.saveToDrive', tool: 'export_to_drive', title: 'Projects: save to Slop Drive', keywords: ['export', 'backup', 'csv', 'json'], when: has, run: saveToDrive,   // i18n-ignore: the assistant's tools and replies (English: API)
      description: 'Save the open project to Slop Drive as a JSON backup (opens again in Slop Projects) or its tasks as CSV (for a spreadsheet).',   // i18n-ignore: the assistant's tools and replies (English: API)
      args: [{ name: 'format', type: 'enum', values: ['json', 'csv'], default: 'json', description: 'json backup or csv tasks' }] }),   // i18n-ignore: the assistant's tools and replies (English: API)
  ];

  /** Registers the commands (they replace the plain New task and New project of commands.js) and the AI state. */
  function init() {
    if (!g.SlopCmd || !g.SlopCmd.register) return;
    // the palette shows these titles: in the chosen language (the tool names, descriptions and arguments stay English: API)
    const TITLES = { 'projects.newProject': 'new_project', 'projects.openProject': 'open_project', 'projects.newTask': 'new_task', 'projects.moveTask': 'move_task',
      'projects.editTask': 'edit_task', 'projects.setDependency': 'set_dep', 'projects.deleteTask': 'delete_task', 'projects.addColumn': 'add_column',
      'projects.listTasks': 'list_tasks', 'projects.saveToDrive': 'save_drive' };
    const I = g.SlopI18n, words = (c) => (I && TITLES[c.id] ? { ...c, title: I.t('projects.cmd.' + TITLES[c.id]), group: I.t('projects.cmd.g') } : c);
    const reg = () => g.SlopCmd.register(LIST.map(words));
    reg();
    if (I) I.on(reg);
    if (g.SlopCmd.provide) g.SlopCmd.provide({ state: () => O().state(), checkpoint: () => O().checkpoint() });
  }

  NS.ai = { init, list: LIST };
})(typeof window !== 'undefined' ? window : globalThis);
