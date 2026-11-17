// Slop Projects for the assistant: the helpers behind the AI commands (ai-commands.js). They find a task, a column or a
// project by id or by name, read dates and lists the way a person types them, and build the small JSON summary the
// assistant reads (SlopCmd.provide({ state })) and the checkpoint that undoes every AI change (SlopUndo steps). Every
// change still goes through NS.actions, so each one is one undo step. Exposes window.SlopProjects.aiOps.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const st = () => NS.state;
  const low = (v) => String(v == null ? '' : v).trim().toLowerCase();
  const DAY = /^\d{4}-\d{2}-\d{2}$/;

  /** The open project, or an Error with what to do. */
  function project() {
    if (!st().project) throw new Error('There is no project yet. Make one first (new_project).');
    return st().project;
  }

  /** Finds one item by id, by exact name, then by a unique part of the name. */
  function findIn(list, key, nameOf, what) {
    const k = low(key);
    if (!k) throw new Error(`Say which ${what}.`);
    const hit = list.find((x) => low(x.id) === k) || list.find((x) => low(nameOf(x)) === k);
    if (hit) return hit;
    const part = list.filter((x) => low(nameOf(x)).includes(k));
    if (part.length === 1) return part[0];
    if (part.length > 1) throw new Error(`More than one ${what} matches "${key}": ${part.slice(0, 5).map(nameOf).join(', ')}. Use the id.`);
    throw new Error(`No ${what} called "${key}".`);
  }
  const task = (key) => { project(); return findIn(st().tasks, key, (t) => t.title, 'task'); };
  const column = (key) => findIn(project().columns, key, (c) => c.name, 'column');
  const projectBy = (key) => findIn(st().projects, key, (p) => p.name, 'project');

  /** A day as YYYY-MM-DD: also "today", "tomorrow" and "+3" (days from today). '' and undefined stay undefined. */
  function day(v, name) {
    const s = low(v);
    if (!s) return undefined;
    if (s === 'today') return st().today;
    if (s === 'tomorrow') return g.SlopTime.addDays(st().today, 1);
    if (/^[+-]\d{1,4}$/.test(s)) return g.SlopTime.addDays(st().today, Number(s));
    if (!DAY.test(s) || Number.isNaN(Date.parse(s))) throw new Error(`${name} must be a day like 2026-05-31 (or today, tomorrow, +3).`);
    return s;
  }
  /** "a, b; c" → ['a', 'b', 'c']. */
  const words = (v, sep = /[,;\n]/) => String(v || '').split(sep).map((x) => x.trim()).filter(Boolean);
  /** Checklist text: items split by ; or new lines; "[x] item" or "x: item" is ticked. */
  const checklist = (v) => words(v, /[;\n]/).slice(0, 100).map((x) => {
    const m = x.match(/^\[(x| )\]\s*(.*)$/i);
    return m ? { text: m[2].slice(0, 200), done: low(m[1]) === 'x' } : { text: x.slice(0, 200), done: false };
  }).filter((c) => c.text);
  /** Task ids from titles or ids, refusing a loop for task `id`. */
  function waitsFor(v, id) {
    const deps = words(v).map((k) => task(k).id);
    const r = NS.deps.check(st().tasks, id, deps);
    if (!r.ok) throw new Error(r.message);
    return r.value;
  }

  /** Start and end the editor's way: one given makes a one-day task; the end may not come before the start. */
  function dates(a, old = {}) {
    let start = a.start !== undefined && a.start !== '' ? day(a.start, 'start') : old.start;
    let end = a.end !== undefined && a.end !== '' ? day(a.end, 'end') : old.end;
    if (start && !end) end = start;
    if (end && !start) start = end;
    if (start && end < start) throw new Error('The end is before the start.');
    return { start, end };
  }

  /** Runs an action that resolves to false when it could not save, and throws then. */
  async function must(promise, what) {
    const v = await promise;
    if (!v) throw new Error(`${what} could not be saved.`);
    return v;
  }

  const colName = (id) => (project().columns.find((c) => c.id === id) || {}).name || id;
  /** One task for the assistant: ids, place, dates, people, progress, what it waits for. */
  function taskView(t) {
    const p = NS.board.progress(t);
    const out = { id: t.id, title: t.title, column: t.column, columnName: colName(t.column), order: NS.board.indexOf(st().tasks, t) + 1 };
    for (const k of ['assignee', 'start', 'end', 'due']) if (t[k]) out[k] = t[k];
    if (t.priority && t.priority !== 'none') out.priority = t.priority;
    if ((t.tags || []).length) out.tags = t.tags;
    if (p.total) out.checklist = `${p.done}/${p.total}`;
    if ((t.deps || []).length) out.waitsFor = t.deps;
    if (NS.board.isDone(project(), t)) out.done = true;
    return out;
  }
  /** Tasks in board order, optionally only one column's or one person's. */
  function tasks({ column: col, assignee } = {}) {
    const p = project();
    let list = NS.board.sort(st().tasks, 'column', 'asc', p);
    if (col) { const c = column(col); list = list.filter((t) => t.column === c.id); }
    if (assignee) list = list.filter((t) => low(t.assignee) === low(assignee));
    return list.map(taskView);
  }

  /** The app state the assistant reads first (app_state). */
  function state() {
    const s = st(), p = s.project;
    return {
      app: 'Slop Projects', today: s.today, view: s.view,   // i18n-ignore: the assistant's tools and replies (English: API)
      projects: s.projects.map((x) => ({ id: x.id, name: x.name })),
      project: p ? { id: p.id, name: p.name, start: p.start, end: p.end, people: p.people || [], columns: p.columns.map((c) => ({ id: c.id, name: c.name, ...(c.done ? { done: true } : {}), ...(c.wip ? { wip: c.wip } : {}) })) } : null,
      tasks: p ? tasks().slice(0, 150) : [], taskCount: s.tasks.length,
    };
  }
  /** "Undo all AI changes": undoes the steps made after this point. */
  function checkpoint() {
    const H = NS.actions.history, mark = H.size;
    return async () => { while (H.size > mark) if (!(await NS.actions.undo())) break; };
  }
  /** The task a palette run works on: the focused card or list row. */
  function focused() {
    const n = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-id]');
    return n ? st().tasks.find((t) => t.id === n.dataset.id) || null : null;
  }

  NS.aiOps = { project, task, column, projectBy, day, words, checklist, waitsFor, dates, must, tasks, taskView, state, checkpoint, focused };
})(typeof window !== 'undefined' ? window : globalThis);
