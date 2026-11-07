/* Slop Reports: the saved report definitions, kept in this browser's localStorage under one versioned envelope:
 *   { v: 1, reports: [ { id, title, ... } ] }
 * Every read and write is wrapped: when storage is blocked or the envelope is not ours, the list is empty and nothing
 * is lost from the built-in reports. Classic script: sets window.SlopReports.saved. */
(function (g) {
  'use strict';
  const ns = (g.SlopReports = g.SlopReports || {});
  const KEY = 'slop-reports';
  const VERSION = 1;

  /** The saved definitions. [] when there are none or storage cannot be read. */
  function list() {
    try {
      const env = JSON.parse(g.localStorage.getItem(KEY) || 'null');
      return env && env.v === VERSION && Array.isArray(env.reports) ? env.reports : [];
    } catch (e) { return []; }
  }

  function write(reports) {
    try { g.localStorage.setItem(KEY, JSON.stringify({ v: VERSION, reports })); return true; } catch (e) { return false; }
  }

  /** Adds or replaces a definition by id. Resolves to { ok, error? }. A built-in id cannot be taken. */
  function save(def) {
    const builtin = (ns.BUILTIN || []).some((b) => b.id === def.id);
    const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
    if (builtin) return { ok: false, error: t('reports.sv.builtin_id') };
    const rest = list().filter((r) => r.id !== def.id);
    return write([...rest, def]) ? { ok: true } : { ok: false, error: t('reports.sv.no_save') };
  }

  function remove(id) {
    return write(list().filter((r) => r.id !== id));
  }

  ns.saved = { KEY, VERSION, list, save, remove };
})(typeof window !== 'undefined' ? window : globalThis);
