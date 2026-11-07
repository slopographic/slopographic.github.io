// Slop Projects dependencies (finish-to-start), with no storage or DOM. A task's deps are the tasks that must finish
// before it starts: on the timeline it starts the day after the latest of them ends. check() cleans a task's list and
// refuses a loop, shift() moves later tasks on so no dependency is broken (it never pulls a task earlier), violations()
// names the broken ones, and blockers() the open tasks a task waits for. Days are YYYY-MM-DD (SlopTime, shared/calendar/tz.js).
// Exposes window.SlopProjects.deps.
(function (g) {
  'use strict';
  const T = g.SlopTime;
  const NS = (g.SlopProjects = g.SlopProjects || {});

  const byId = (tasks) => new Map(tasks.map((t) => [t.id, t]));
  /** The tasks that list `id` among their deps. */
  const successors = (tasks, id) => tasks.filter((t) => (t.deps || []).includes(id));
  /** The tasks `task` depends on (that still exist). */
  const predecessors = (tasks, task) => { const m = byId(tasks); return (task.deps || []).map((d) => m.get(d)).filter(Boolean); };
  const scheduled = (t) => !!(t && t.start && t.end);

  /** Whether giving task `id` the deps `deps` makes a loop: some dep already waits, directly or not, on `id`. */
  function wouldLoop(tasks, id, deps) {
    const seen = new Set(), stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      for (const s of successors(tasks, cur)) {
        if (s.id === id) continue;   // the task's own old deps are being replaced
        if (deps.includes(s.id)) return s.id;
        if (!seen.has(s.id)) { seen.add(s.id); stack.push(s.id); }
      }
      if (deps.includes(cur) && cur !== id) return cur;
    }
    return null;
  }

  /**
   * Cleans a task's deps: drops unknown ids, itself and repeats. Refuses a list that makes a loop, in plain words.
   * Returns { ok: true, value: deps } or { ok: false, message }.
   */
  function check(tasks, id, deps) {
    const m = byId(tasks);
    const clean = [...new Set((deps || []).filter((d) => d && d !== id && m.has(d)))];
    const loop = wouldLoop(tasks, id, clean);
    if (loop) {
      const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
      const name = (m.get(loop) || {}).title || tr('projects.core.that_task');
      return { ok: false, message: tr('projects.core.loop', { name }) };
    }
    return { ok: true, value: clean };
  }

  /** The tasks in an order where every task comes after the tasks it depends on (tasks in a loop come last). */
  function order(tasks) {
    const m = byId(tasks), indeg = new Map(tasks.map((t) => [t.id, 0]));
    for (const t of tasks) for (const d of t.deps || []) if (m.has(d) && d !== t.id) indeg.set(t.id, indeg.get(t.id) + 1);
    const queue = tasks.filter((t) => indeg.get(t.id) === 0), out = [], done = new Set();
    while (queue.length) {
      const t = queue.shift();
      out.push(t); done.add(t.id);
      for (const s of successors(tasks, t.id)) {
        if (done.has(s.id)) continue;
        indeg.set(s.id, indeg.get(s.id) - 1);
        if (indeg.get(s.id) === 0) queue.push(s);
      }
    }
    return out.concat(tasks.filter((t) => !done.has(t.id)));
  }

  /** The first day a task may start: the day after the latest end among its scheduled predecessors, or null. */
  function earliest(tasks, task) {
    let last = null;
    for (const p of predecessors(tasks, task)) if (scheduled(p) && (!last || p.end > last)) last = p.end;
    return last ? T.addDays(last, 1) : null;
  }

  /**
   * Moves tasks later so every scheduled task starts after its scheduled predecessors end, keeping each one's length.
   * Tasks are never moved earlier. Returns the changes as [{ id, start, end }] (only the tasks that moved).
   */
  function shift(tasks) {
    const work = new Map(tasks.map((t) => [t.id, { ...t }]));
    const out = new Map();
    for (const t0 of order(tasks)) {
      const t = work.get(t0.id);
      if (!scheduled(t)) continue;
      const first = earliest([...work.values()], t);
      if (!first || t.start >= first) continue;
      const by = T.dayDiff(t.start, first);
      t.start = first;
      t.end = T.addDays(t.end, by);
      out.set(t.id, { id: t.id, start: t.start, end: t.end });
    }
    return [...out.values()];
  }

  /** The broken dependencies: [{ from, to }] where task `to` starts on or before the day task `from` ends. */
  function violations(tasks) {
    const out = [];
    for (const t of tasks) {
      if (!scheduled(t)) continue;
      for (const p of predecessors(tasks, t)) if (scheduled(p) && t.start <= p.end) out.push({ from: p.id, to: t.id });
    }
    return out;
  }

  /** The tasks `task` still waits for: its predecessors that are not done (isDone(task) says which are). */
  const blockers = (tasks, task, isDone) => predecessors(tasks, task).filter((p) => !isDone(p));

  /** Every task's deps without `id` (for deleting a task): [{ id, deps }] for the tasks that named it. */
  const without = (tasks, id) => successors(tasks, id).map((t) => ({ id: t.id, deps: t.deps.filter((d) => d !== id) }));

  NS.deps = { successors, predecessors, wouldLoop, check, order, earliest, shift, violations, blockers, without };
})(typeof window !== 'undefined' ? window : globalThis);
