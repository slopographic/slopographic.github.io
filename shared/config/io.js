/* SlopConfig import and export. exportFile() builds a validated <name>.slop.json File. Every import (a file, Slop Drive,
 * or a checked AI reply) goes through validate → apply: nothing is applied before validation passes, applies run one at
 * a time, and an apply that throws runs its undo steps (store writes roll back by themselves inside their transaction).
 * Exposes SlopConfig.exportFile, exportKind, importFile, importText, importFromDrive and applyValue. */
(function (g) {
  'use strict';
  const C = (g.SlopConfig = g.SlopConfig || {});
  const { LIMITS } = C.consts;
  // Words: shared/i18n/ui/<code>/config.js (keys ui.cfgv.*), read when a message is made
  const tr = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);
  let chain = Promise.resolve(); // applies queue up, so two imports never interleave

  const fail = (message) => ({ ok: false, applied: false, value: null, errors: [{ path: '', message }] });

  function safeName(name) {
    const s = String(name || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
    return s || 'untitled';
  }

  /** A File named <name>.slop.json holding the validated envelope. Throws when the data is not valid for the kind. */
  function exportFile(kind, app, name, data, opts = {}) {
    const r = C.validate(C.envelope(kind, app, name, data, opts));
    if (!r.ok) throw new Error(tr('ui.cfgv.cannot_export', { kind, err: C.errorText(r.errors) }));
    const text = JSON.stringify(r.value, null, 2);
    const fname = `${safeName(name)}.slop.json`;
    const type = 'application/json';
    try { return new File([text], fname, { type }); } catch (e) {
      const b = new Blob([text], { type });
      b.name = fname;
      return b;
    }
  }

  /** Reads the kind's current data with its read() and exports it. Throws when the kind has no read(). */
  async function exportKind(kind, app, name, opts = {}) {
    const e = C.getKind(kind, app);
    if (!e) throw new Error(tr('ui.cfgv.unknown_kind', { kind, app }));
    if (!e.read) throw new Error(tr('ui.cfgv.no_export', { kind }));
    return exportFile(kind, app, name, await e.read(), opts);
  }

  /** Runs the kind's apply on a validated value. Serialised; on a throw, the undo steps run in reverse. */
  function applyValue(value, opts = {}) {
    const run = chain.then(() => doApply(value, opts));
    chain = run.catch(() => {});
    return run;
  }

  async function doApply(input, opts) {
    const r = C.validate(input, opts);
    if (!r.ok) return { ok: false, applied: false, value: null, errors: r.errors };
    const v = r.value;
    const entry = C.getKind(v.kind, v.app);
    const undo = [];
    const ctx = {
      app: v.app, kind: v.kind, name: v.name, importer: opts.app || null,
      undo: (fn) => { if (typeof fn === 'function') undo.push(fn); },
    };
    try {
      const res = await entry.apply(v.data, ctx);
      if (res && res.ok === false) throw new Error(res.message || tr('ui.cfgv.refused'));
      return { ok: true, applied: true, value: v, errors: [] };
    } catch (e) {
      for (const fn of undo.reverse()) { try { await fn(); } catch (e2) { /* keep undoing the rest */ } }
      const why = e && e.message ? e.message : String(e);
      return { ok: false, applied: false, rolledBack: true, value: null, errors: [{ path: '', message: tr('ui.cfgv.apply_failed', { err: why }) }] };
    }
  }

  /** Validates the text of a file, then applies it. opts.app: the app importing it. */
  async function importText(text, opts = {}) {
    const r = C.validate(text, opts);
    if (!r.ok) return { ok: false, applied: false, value: null, errors: r.errors };
    return applyValue(r.value, opts);
  }

  /** A File or Blob from the picker or from Slop Drive. Refuses anything over 5 MB before reading it. */
  async function importFile(file, opts = {}) {
    if (!file || typeof file.text !== 'function') return fail(tr('ui.cfgv.no_file'));
    if (file.size > LIMITS.bytes) return fail(tr('ui.cfgv.too_big'));
    let text;
    try { text = await file.text(); } catch (e) { return fail(tr('ui.cfgv.read_failed', { err: e.message })); }
    return importText(text, opts);
  }

  /** Picks a file from Slop Drive, then imports it. Resolves cancelled: true when the picker is closed. */
  async function importFromDrive(opts = {}) {
    const H = g.SlopHub;
    if (!H || !H.pickFromDrive || !H.get) return fail(tr('ui.cfgv.no_drive'));
    const pick = await H.pickFromDrive({ accept: ['application/json', 'text/plain'], title: opts.title || tr('ui.config.from_drive_title') });
    if (!pick) return { ok: false, cancelled: true, applied: false, value: null, errors: [] };
    const rec = await H.get(pick.id);
    if (!rec || !rec.blob) return fail(tr('ui.cfgv.drive_empty'));
    return importFile(rec.blob, opts);
  }

  C.exportFile = exportFile;
  C.exportKind = exportKind;
  C.applyValue = applyValue;
  C.importText = importText;
  C.importFile = importFile;
  C.importFromDrive = importFromDrive;
})(typeof window !== 'undefined' ? window : globalThis);
