// Slop Projects board rules, with no storage or DOM: the default columns, the tasks of a column in their order, moving a
// card (between and within columns) as the few records that change, column edits (add, rename, reorder, remove with
// where its cards go), WIP counts, filters, and the list view's sort. Exposes window.SlopProjects.board.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const DEFAULT_COLUMNS = [{ id: 'todo', name: 'To do' }, { id: 'doing', name: 'Doing' }, { id: 'done', name: 'Done', done: true }];   // i18n-ignore: the default columns' stored names (the UI names new ones from projects.col.<id>)
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2, none: 3 };
  const MAX_COLUMNS = 12;
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || String(a.title || '').localeCompare(String(b.title || ''));
  /** The tasks in one column, in their order on the board. */
  const inColumn = (tasks, colId) => tasks.filter((t) => t.column === colId).sort(byOrder);

  /** The column a task shows in: its own, or the first column when its column was removed. */
  function columnOf(project, task) {
    const cols = project.columns || [];
    return cols.some((c) => c.id === task.column) ? task.column : (cols[0] && cols[0].id);
  }

  /** Whether a task is finished: it sits in a column marked done (the last column when none is marked). */
  function isDone(project, task) {
    const cols = project.columns || [];
    const marked = cols.filter((c) => c.done);
    const ids = marked.length ? marked.map((c) => c.id) : cols.length ? [cols[cols.length - 1].id] : [];
    return ids.includes(task.column);
  }

  /**
   * Moves a task to place `index` of column `toCol` (index past the end puts it last). Returns the changes as
   * [{ id, column, order }] for every task whose column or order differs, so a move writes as few records as it can.
   * Orders are renumbered 0, 1, 2 in the columns the move touches. An unknown task returns [].
   */
  function move(tasks, taskId, toCol, index) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return [];
    const from = task.column;
    const target = inColumn(tasks, toCol).filter((t) => t.id !== taskId);
    const at = Math.max(0, Math.min(index == null ? target.length : index, target.length));
    target.splice(at, 0, task);
    const out = [];
    const note = (t, column, order) => { if (t.column !== column || (t.order || 0) !== order) out.push({ id: t.id, column, order }); };
    target.forEach((t, i) => note(t, toCol, i));
    if (from !== toCol) inColumn(tasks, from).filter((t) => t.id !== taskId).forEach((t, i) => note(t, from, i));
    return out;
  }

  /** The place of a task in its column (0 first). */
  const indexOf = (tasks, task) => inColumn(tasks, task.column).findIndex((t) => t.id === task.id);

  /** A short id for a new column, unique among the project's columns. */
  function newColumnId(columns, name) {
    const base = String(name || 'column').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'column';
    let id = base, n = 2;
    while (columns.some((c) => c.id === id)) id = `${base}-${n++}`;
    return id;
  }

  /** Columns with one added at the end. Refuses a blank name and more than 12 columns. */
  function addColumn(columns, name) {
    const nm = String(name || '').trim().slice(0, 40);
    if (!nm) return { ok: false, message: tr('projects.core.col_name') };
    if (columns.length >= MAX_COLUMNS) return { ok: false, message: tr('projects.core.max_cols', { n: MAX_COLUMNS }) };
    return { ok: true, value: [...columns, { id: newColumnId(columns, nm), name: nm }] };
  }

  /** Columns with one moved to place `index`. */
  function moveColumn(columns, id, index) {
    const from = columns.findIndex((c) => c.id === id);
    if (from < 0) return columns.slice();
    const out = columns.slice();
    const [c] = out.splice(from, 1);
    out.splice(Math.max(0, Math.min(index, out.length)), 0, c);
    return out;
  }

  /**
   * Removes a column. Its cards go to the end of `into` (the column before it, or the next one). The last column cannot
   * be removed. Returns { ok, columns, moves: [{ id, column, order }] }.
   */
  function removeColumn(columns, tasks, id, into) {
    if (columns.length <= 1) return { ok: false, message: tr('projects.core.one_col') };
    const i = columns.findIndex((c) => c.id === id);
    if (i < 0) return { ok: false, message: tr('projects.core.no_col') };
    const rest = columns.filter((c) => c.id !== id);
    const dest = rest.some((c) => c.id === into) ? into : (columns[i - 1] || columns[i + 1]).id;
    const start = inColumn(tasks, dest).length;
    const moves = inColumn(tasks, id).map((t, k) => ({ id: t.id, column: dest, order: start + k }));
    return { ok: true, columns: rest, moves, into: dest };
  }

  /** WIP of a column: how many cards it holds, its limit (0 = none) and whether it is over the limit. */
  function wip(tasks, column) {
    const count = tasks.filter((t) => t.column === column.id).length;
    const limit = column.wip || 0;
    return { count, limit, over: limit > 0 && count > limit };
  }

  /** People named on the project and on its tasks, sorted. */
  function peopleOf(project, tasks) {
    const set = new Set((project.people || []).filter(Boolean));
    for (const t of tasks) if (t.assignee) set.add(t.assignee);
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  /** Tags used on the tasks, sorted. */
  function tagsOf(tasks) {
    const set = new Set();
    for (const t of tasks) for (const x of t.tags || []) set.add(x);
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  /** Tasks that match the filters: assignee ('' any, '-' nobody), tag, and text in the title, description or tags. */
  function filter(tasks, { assignee = '', tag = '', text = '' } = {}) {
    const q = String(text).trim().toLowerCase();
    return tasks.filter((t) => {
      if (assignee === '-' ? t.assignee : assignee && t.assignee !== assignee) return false;
      if (tag && !(t.tags || []).includes(tag)) return false;
      if (q && ![t.title, t.description, t.assignee, ...(t.tags || [])].some((x) => String(x || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }

  /** Checklist progress: { done, total }. */
  const progress = (task) => ({ done: (task.checklist || []).filter((c) => c.done).length, total: (task.checklist || []).length });

  const SORTS = ['title', 'column', 'assignee', 'priority', 'start', 'end', 'due'];
  /**
   * The list view's order. key is one of SORTS; dir 'asc' or 'desc'. Empty values sort last either way. Ties keep the
   * board order. column sorts by the column's place on the board.
   */
  function sort(tasks, key, dir, project) {
    const cols = (project && project.columns) || [];
    const colAt = (t) => { const i = cols.findIndex((c) => c.id === t.column); return i < 0 ? 999 : i; };
    const val = (t) => (key === 'priority' ? PRIORITY_RANK[t.priority || 'none'] : key === 'column' ? colAt(t) : t[key]);
    const empty = (v) => v === undefined || v === null || v === '' || (key === 'priority' && v === 3);
    const sign = dir === 'desc' ? -1 : 1;
    return tasks.slice().sort((a, b) => {
      const va = val(a), vb = val(b);
      if (empty(va) !== empty(vb)) return empty(va) ? 1 : -1;
      if (!empty(va) && va !== vb) {
        const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { sensitivity: 'base', numeric: true });
        if (c) return c * sign;
      }
      return colAt(a) - colAt(b) || byOrder(a, b);
    });
  }

  NS.board = { DEFAULT_COLUMNS, MAX_COLUMNS, SORTS, inColumn, columnOf, isDone, move, indexOf, newColumnId, addColumn, moveColumn,
    removeColumn, wip, peopleOf, tagsOf, filter, progress, sort };
})(typeof window !== 'undefined' ? window : globalThis);
