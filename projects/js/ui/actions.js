// Slop Projects actions: every change the board, the timeline, the list and the dialogs make, each one write (one
// transaction) and one undo step (SlopUndo, shared/ui/undo.js): the toast says what was done and offers Undo, and Ctrl+Z
// undoes too. A date change moves later tasks on so no dependency is broken, in the same step. Exposes
// window.SlopProjects.actions.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const UI = g.SlopUI, T = g.SlopTime;
  const history = g.SlopUndo.create();
  const st = () => NS.state;
  const B = () => NS.board, D = () => NS.deps, ST = () => NS.store;
  const live = (msg) => { const n = document.getElementById('pLive'); if (n) n.textContent = msg; };
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const fail = (r, what) => { UI.toast(r && r.message ? `${what}: ${r.message}` : `${what}.`); return false; };
  const colName = (id) => ((st().project.columns || []).find((c) => c.id === id) || {}).name || id;
  const short = (day) => T.dayText(day, st().locale, { day: 'numeric', month: 'short' });

  /** Runs a write; on success keeps its undo step, says what was done and returns the write's value. */
  async function commit(promise, label, { toast = true } = {}) {
    const r = await promise;
    if (!r.ok) return fail(r, t('projects.act.not_saved'));
    if (r.value.undo.length) history.push(label, () => ST().write(r.value.undo));
    live(`${label}.`);
    if (toast) g.SlopUndo.toast(label, undo);
    await NS.app.reload();
    return r.value;
  }

  /** Undoes the newest step and says what was undone. */
  async function undo() {
    const r = await history.undo();
    UI.toast(r.ok ? t('projects.act.undone', { what: r.label }) : r.message);
    live(r.ok ? t('projects.act.undone', { what: r.label }) : r.message);
    if (r.ok) await NS.app.reload();
    return r.ok;
  }

  /** Moves a card to place `index` of a column (counted among all its cards). */
  function moveCard(id, column, index) {
    const tasks = st().tasks, task = tasks.find((x) => x.id === id);
    if (!task) return Promise.resolve(false);
    const changes = B().move(tasks, id, column, index);
    if (!changes.length) return Promise.resolve(false);
    const label = column === task.column ? t('projects.act.moved_place', { title: task.title, n: String(index + 1), column: colName(column) }) : t('projects.act.moved_col', { title: task.title, column: colName(column) });
    return commit(ST().patchTasks(changes), label);
  }

  /** Moves a card one column left or right (dir -1 or 1), or up and down its column (dy). Keeps its focus. */
  function nudge(id, dx, dy) {
    const p = st().project, tasks = st().tasks, task = tasks.find((x) => x.id === id);
    if (!task) return Promise.resolve(false);
    const cols = p.columns.map((c) => c.id), ci = cols.indexOf(B().columnOf(p, task));
    if (dx) {
      const to = cols[ci + dx];
      if (!to) return Promise.resolve(false);
      return moveCard(id, to, Math.min(B().indexOf(tasks, task), B().inColumn(tasks, to).length));
    }
    const at = B().indexOf(tasks, task) + dy;
    if (at < 0 || at >= B().inColumn(tasks, task.column).length) return Promise.resolve(false);
    return moveCard(id, task.column, at);
  }

  /** The patches for new dates on some tasks, with the later tasks moved on: [{ id, start, end }]. */
  function withShift(changes) {
    const by = new Map(changes.map((c) => [c.id, c]));
    const work = st().tasks.map((x) => (by.has(x.id) ? { ...x, ...by.get(x.id) } : x));
    const moved = D().shift(work).filter((c) => !by.has(c.id));
    return { list: [...changes, ...moved], moved: moved.length };
  }

  /** New dates for one task (a timeline drag or key); later tasks move on in the same step. */
  function setDates(id, dates, verb = 'moved') {
    const task = st().tasks.find((x) => x.id === id);
    if (!task || (task.start === dates.start && task.end === dates.end)) return Promise.resolve(false);
    const { list, moved } = withShift([{ id, start: dates.start, end: dates.end }]);
    const when = dates.start === dates.end ? short(dates.start) : `${short(dates.start)} – ${short(dates.end)}`;
    const what = t(`projects.act.dates_${verb === 'scheduled' ? 'scheduled' : verb === 'changed' ? 'changed' : 'moved'}`, { title: task.title, when });
    return commit(ST().patchTasks(list), moved ? t('projects.act.dates_more', { what, n: moved }) : what);
  }

  /** Gives an undated task dates: from the first free day (today, or after what it waits for), `days` long. */
  function schedule(id, days = 3) {
    const task = st().tasks.find((x) => x.id === id);
    if (!task) return Promise.resolve(false);
    const first = D().earliest(st().tasks, task);
    const start = first && first > st().today ? first : st().today;
    return setDates(id, { start, end: T.addDays(start, days - 1) }, 'scheduled');
  }

  /** Saves a task from the editor (new or changed), moving later tasks on when its dates changed. */
  function saveTask(rec) {
    const old = rec.id && st().tasks.find((x) => x.id === rec.id);
    const label = old ? t('projects.act.saved', { title: rec.title }) : t('projects.act.added', { title: rec.title });
    if (!old) return commit(ST().saveTask(rec), label);
    const dated = rec.start && (rec.start !== old.start || rec.end !== old.end);
    const extra = dated ? withShift([{ id: rec.id, start: rec.start, end: rec.end }]).list.filter((c) => c.id !== rec.id) : [];
    const ops = [{ op: 'patch', collection: 'projectTasks', id: rec.id, changes: rec },
      ...extra.map(({ id, ...changes }) => ({ op: 'patch', collection: 'projectTasks', id, changes }))];
    return commit(ST().write(ops), label);
  }

  /** Adds a task at the end of a column. */
  function addTask(title, column) {
    const p = st().project;
    const order = B().inColumn(st().tasks, column).length;
    return commit(ST().saveTask({ projectId: p.id, title, column, order, priority: 'none', tags: [], checklist: [], deps: [] }), t('projects.act.added', { title }), { toast: false });
  }

  /** Deletes a task (no question: Undo brings it back, with its links). */
  function deleteTask(id) {
    const task = st().tasks.find((x) => x.id === id);
    if (!task) return Promise.resolve(false);
    return commit(ST().removeTask(id, st().tasks), t('projects.act.deleted', { title: task.title }));
  }

  /** Saves the project (settings and columns); moves are the cards of removed columns. */
  const saveProject = (p, moves) => commit(ST().saveProject(p, moves), t('projects.act.saved', { title: p.name }));

  /** Deletes the project and its tasks; Undo brings them back. */
  async function deleteProject(p) {
    const yes = await UI.confirm(t('projects.act.del_project_q', { name: p.name }), t('projects.act.del_project_body'), t('ui.delete'), { danger: true });
    if (!yes) return false;
    return commit(ST().removeProject(p.id), t('projects.act.deleted_project', { name: p.name }));
  }

  /** Adds a project from a backup (io.read's value), and opens it. */
  async function addBundle(b, label) {
    const v = await commit(ST().addBundle(b), label);
    if (v) NS.app.open(b.project.id);
    return v;
  }

  NS.actions = { history, commit, undo, moveCard, nudge, setDates, schedule, saveTask, addTask, deleteTask, saveProject, deleteProject, addBundle };
})(typeof window !== 'undefined' ? window : globalThis);
