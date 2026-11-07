// Slop Projects storage: projects and their tasks in the shared store (SlopData collections 'projects' and
// 'projectTasks', shared/data). Every change goes through write(ops), one transaction that hands back the ops that
// reverse it, so any move, edit or delete is one undo step (shared/ui/undo.js keeps the steps).
//   ops: [{ op: 'put', collection, value }      create, or replace the whole record
//         { op: 'patch', collection, id, changes } change some fields
//         { op: 'remove', collection, id }]
// Calls resolve to a SlopData Result and never reject. Exposes window.SlopProjects.store.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const S = () => g.SlopData;
  const P = 'projects', TK = 'projectTasks';
  const META = ['createdAt', 'updatedAt', 'version', 'deletedAt'];
  const bare = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !META.includes(k)));

  /** Runs the ops in one transaction. Resolves to { ok, value: { undo: ops, records } }: undo reverses them all. */
  function write(ops) {
    return S().store.transact(async (api) => {
      const undo = [], records = [];
      for (const o of ops) {
        const key = o.op === 'put' ? o.value.id : o.id;
        const cur = key ? await api.get(o.collection, key) : { ok: true, value: null };
        if (!cur.ok) return cur;
        const prev = cur.value;
        let r;
        if (o.op === 'remove') {
          if (!prev) continue;
          r = await api.remove(o.collection, o.id);
          if (r.ok) undo.unshift({ op: 'put', collection: o.collection, value: bare(prev) });
        } else {
          if (o.op === 'patch' && !prev) return { ok: false, code: 'not_found', message: g.SlopI18n ? g.SlopI18n.t('projects.core.gone') : 'projects.core.gone' };
          const value = o.op === 'patch' ? { ...bare(prev), ...o.changes } : o.value;
          for (const k of Object.keys(value)) if (value[k] === undefined) delete value[k];
          r = await api.put(o.collection, value);
          if (r.ok) undo.unshift(prev ? { op: 'put', collection: o.collection, value: bare(prev) } : { op: 'remove', collection: o.collection, id: r.value.id });
        }
        if (!r.ok) return r;
        records.push(r.value);
      }
      return { ok: true, value: { undo, records } };
    });
  }

  const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base', numeric: true });
  /** Every project, by name. */
  async function projects() {
    const r = await S().store.list(P);
    return r.ok ? { ok: true, value: r.value.sort(byName) } : r;
  }
  /** The tasks of one project. */
  const tasks = (projectId) => S().store.list(TK, { index: 'projectId', value: projectId });
  const project = (id) => S().store.get(P, id);

  /** Patches for many tasks: [{ id, ...changes }] as one write. */
  const patchTasks = (list) => write(list.map(({ id, ...changes }) => ({ op: 'patch', collection: TK, id, changes })));

  /** Creates a task, or merges changes into it. */
  const saveTask = (value) => (value.id ? write([{ op: 'patch', collection: TK, id: value.id, changes: value }]) : write([{ op: 'put', collection: TK, value }]));

  /** Saves a project (create or replace), with optional task moves in the same transaction (a removed column). */
  const saveProject = (value, moves = []) => write([{ op: value.id ? 'patch' : 'put', collection: P, id: value.id, changes: value, value },
    ...moves.map(({ id, ...changes }) => ({ op: 'patch', collection: TK, id, changes }))]);

  /** Deletes a task and takes it out of the deps of the tasks that waited for it. */
  function removeTask(id, all) {
    const unlink = NS.deps.without(all, id).map((x) => ({ op: 'patch', collection: TK, id: x.id, changes: { deps: x.deps } }));
    return write([...unlink, { op: 'remove', collection: TK, id }]);
  }

  /** Deletes a project and all of its tasks. */
  async function removeProject(id) {
    const t = await tasks(id);
    if (!t.ok) return t;
    return write([...t.value.map((x) => ({ op: 'remove', collection: TK, id: x.id })), { op: 'remove', collection: P, id }]);
  }

  /** Adds a project read from a backup (io.read): the project, then its tasks, in one transaction. */
  const addBundle = (b) => write([{ op: 'put', collection: P, value: b.project }, ...b.tasks.map((t) => ({ op: 'put', collection: TK, value: t }))]);

  NS.store = { write, projects, project, tasks, patchTasks, saveTask, saveProject, removeTask, removeProject, addBundle, newId: () => S().store.newId() };
})(typeof window !== 'undefined' ? window : globalThis);
