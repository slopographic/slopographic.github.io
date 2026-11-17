// Slop Projects files, with no storage or DOM: the CSV of a project's tasks (for a spreadsheet), and the JSON backup of
// one project with its tasks (format "slop-projects", version 1). Reading a backup checks its shape and gives the project
// and every task new ids (dependencies follow them), so a backup can be opened twice, or next to the project it came from.
// Exposes window.SlopProjects.io.
(function (g) {
  'use strict';
  const NS = (g.SlopProjects = g.SlopProjects || {});
  const FORMAT = 'slop-projects', VERSION = 1;
  const PROJECT_FIELDS = ['name', 'color', 'start', 'end', 'notes', 'columns', 'people', 'customerId'];
  const TASK_FIELDS = ['title', 'description', 'column', 'order', 'assignee', 'priority', 'start', 'end', 'due', 'tags', 'checklist', 'deps', 'customerId'];
  const MAX_TASKS = 5000;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;

  const cell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };
  const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null && o[k] !== '').map((k) => [k, o[k]]));
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  /**
   * The CSV of a project's tasks in board order: title, column, assignee, priority, dates, tags, checklist, what each
   * waits for, customer and description. customers: Map of id to name. A cell that a spreadsheet would run as a formula
   * is kept as text.
   */
  function csv(project, tasks, customers = new Map()) {
    const B = NS.board;
    const cols = project.columns || [];
    const colName = new Map(cols.map((c) => [c.id, c.name]));
    const title = new Map(tasks.map((t) => [t.id, t.title]));
    const head = ['Title', 'Column', 'Assignee', 'Priority', 'Start', 'End', 'Due', 'Tags', 'Checklist', 'Depends on', 'Customer', 'Description'];   // i18n-ignore: CSV column names (file format)
    const rows = B.sort(tasks, 'column', 'asc', project).map((t) => {
      const p = B.progress(t);
      return [t.title, colName.get(t.column) || '', t.assignee || '', t.priority && t.priority !== 'none' ? t.priority : '', t.start || '', t.end || '', t.due || '',
        (t.tags || []).join(', '), p.total ? `${p.done}/${p.total}` : '', (t.deps || []).map((d) => title.get(d)).filter(Boolean).join('; '),
        t.customerId ? customers.get(t.customerId) || '' : '', t.description || ''].map(cell).join(',');
    });
    return [head.join(','), ...rows].join('\r\n') + '\r\n';
  }

  /** The backup of one project: its fields and its tasks, without the store's own stamps. */
  function backup(project, tasks, now = new Date()) {
    return {
      format: FORMAT, version: VERSION, exportedAt: now.toISOString(),
      project: { id: project.id, ...pick(project, PROJECT_FIELDS) },
      tasks: NS.board.sort(tasks, 'column', 'asc', project).map((t) => ({ id: t.id, ...pick(t, TASK_FIELDS) })),
    };
  }

  /** A file name for a project's files: "Website launch.json". */
  const fileName = (project, ext) => `${String(project.name || 'Project').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Project'}.${ext}`;

  /**
   * Reads a backup (parsed JSON). newId() makes ids. customers: a Set of customer ids that exist here (links to others
   * are dropped). Returns { ok: true, project, tasks, notes } with fresh ids, or { ok: false, message }.
   */
  function read(data, newId, customers = new Set()) {
    const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
    if (!isObj(data)) return { ok: false, message: tr('projects.core.not_backup') };
    if (data.format !== undefined && data.format !== FORMAT) return { ok: false, message: tr('projects.core.not_backup') };
    if (data.version !== undefined && !(Number.isInteger(data.version) && data.version >= 1 && data.version <= VERSION)) return { ok: false, message: tr('projects.core.newer') };
    const p = data.project;
    if (!isObj(p) || typeof p.name !== 'string' || !p.name.trim()) return { ok: false, message: tr('projects.core.no_name') };
    if (!Array.isArray(data.tasks)) return { ok: false, message: tr('projects.core.no_tasks') };
    if (data.tasks.length > MAX_TASKS) return { ok: false, message: tr('projects.core.max_tasks', { n: MAX_TASKS }) };
    const notes = [];
    const project = { ...pick(p, PROJECT_FIELDS), id: newId(), name: p.name.trim().slice(0, 120) };
    let cols = Array.isArray(p.columns) ? p.columns.filter((c) => isObj(c) && typeof c.id === 'string' && c.id && typeof c.name === 'string' && c.name.trim()) : [];
    cols = cols.filter((c, i) => cols.findIndex((x) => x.id === c.id) === i).slice(0, NS.board.MAX_COLUMNS)
      .map((c) => ({ id: c.id.slice(0, 40), name: c.name.trim().slice(0, 40), ...(Number.isInteger(c.wip) && c.wip > 0 && c.wip <= 999 ? { wip: c.wip } : {}), ...(c.done ? { done: true } : {}) }));
    if (!cols.length) cols = NS.board.DEFAULT_COLUMNS.map((c) => ({ ...c }));
    project.columns = cols;
    project.people = Array.isArray(p.people) ? p.people.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 80)).slice(0, 50) : [];
    for (const k of ['start', 'end']) if (project[k] !== undefined && !DAY.test(project[k])) delete project[k];
    if (project.start && project.end && project.end < project.start) delete project.end;
    if (project.customerId && !customers.has(project.customerId)) delete project.customerId;
    const ids = new Map();
    const raw = data.tasks.filter((t) => isObj(t) && typeof t.title === 'string' && t.title.trim());
    if (raw.length < data.tasks.length) notes.push(`${data.tasks.length - raw.length} entries without a title were left out.`);
    for (const t of raw) ids.set(typeof t.id === 'string' && t.id ? t.id : Symbol('task'), newId());
    const keys = [...ids.keys()];
    const tasks = raw.map((t, i) => {
      const out = { ...pick(t, TASK_FIELDS), id: ids.get(keys[i]), projectId: project.id, title: t.title.trim().slice(0, 200) };
      if (!cols.some((c) => c.id === out.column)) out.column = cols[0].id;
      out.order = Number.isInteger(out.order) && out.order >= 0 ? Math.min(out.order, 1e6) : i;
      for (const k of ['start', 'end', 'due']) if (out[k] !== undefined && !DAY.test(out[k])) delete out[k];
      if (!out.start !== !out.end || (out.start && out.end < out.start)) { delete out.start; delete out.end; }
      out.tags = Array.isArray(out.tags) ? [...new Set(out.tags.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 40)))].slice(0, 20) : [];
      out.checklist = Array.isArray(out.checklist) ? out.checklist.filter((c) => isObj(c) && typeof c.text === 'string' && c.text.trim()).slice(0, 100).map((c) => ({ text: c.text.trim().slice(0, 200), done: !!c.done })) : [];
      out.deps = Array.isArray(out.deps) ? [...new Set(out.deps.map((d) => ids.get(d)).filter((d) => d && d !== out.id))].slice(0, 50) : [];
      if (!['none', 'low', 'medium', 'high'].includes(out.priority)) out.priority = 'none';
      if (out.customerId && !customers.has(out.customerId)) delete out.customerId;
      for (const k of ['description', 'assignee']) if (out[k] !== undefined) out[k] = String(out[k]).slice(0, k === 'assignee' ? 80 : 5000);
      return out;
    });
    let loops = 0;   // one at a time, so breaking one loop keeps the rest of the links
    for (const t of tasks) if (t.deps.length && NS.deps.wouldLoop(tasks, t.id, t.deps)) { t.deps = []; loops++; }
    if (loops) notes.push(tr('projects.core.loops', { n: loops }));
    return { ok: true, project, tasks, notes };
  }

  /** Reads backup text: JSON.parse, then read(). */
  function readText(text, newId, customers) {
    let data;
    try { data = JSON.parse(String(text).replace(/^﻿/, '')); } catch (e) { return { ok: false, message: g.SlopI18n ? g.SlopI18n.t('projects.core.not_json') : 'projects.core.not_json' }; }
    return read(data, newId, customers);
  }

  NS.io = { FORMAT, VERSION, csv, backup, fileName, read, readText };
})(typeof window !== 'undefined' ? window : globalThis);
