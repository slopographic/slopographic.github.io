/* The Slopographic config in the chosen local folder: slopographic.slop.json at the folder's root.
 * save() writes the shared 'settings' kind (app 'slop') through SlopConfig.exportKind. preview() reads the file back,
 * checks it with SlopConfig.validate and lists what applying it would change. apply(preview) runs the validated value
 * through SlopConfig.applyValue, so nothing is applied that was not shown. Nothing is sent anywhere: all file I/O goes
 * through SlopSyncProviders.local, which only touches the folder the person chose.
 * Needs shared/sync/providers/local.js and the config scripts (schema, validate, io, kinds) and SlopData for the
 * settings store. Classic script. Exposes window.SlopConfigFolder. */
(function (g) {
  'use strict';
  const FILE = 'slopographic.slop.json';
  const APP = 'slop';
  const KIND = 'settings';
  const FIELDS = [
    { key: 'defaultCurrency', label: 'ui.config.f_currency' },
    { key: 'locale', label: 'ui.config.f_locale' },
    { key: 'defaultTaxRate', label: 'ui.config.f_tax', suffix: '%' },
  ];
  // Words: shared/i18n/ui/<code>/config.js, read when a result is made
  const tr = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);
  const fail = (error) => ({ ok: false, error });
  const local = () => (g.SlopSyncProviders && g.SlopSyncProviders.local) || null;
  const C = () => g.SlopConfig || null;
  const show = (v, suffix = '') => (v === undefined || v === null || v === '' ? tr('ui.config.not_set') : `${v}${suffix}`);

  /** Writes the current settings to the folder root. Resolves { ok, name } or { ok: false, error }. */
  async function save() {
    const l = local(), c = C();
    if (!l || !c) return fail(tr('ui.config.no_tools'));
    let file;
    try { file = await c.exportKind(KIND, APP, 'Slopographic'); } catch (e) { return fail(tr('ui.config.read_failed', { err: e.message })); }
    try {
      await l.upload(null, FILE, new Blob([await file.text()], { type: 'application/json' }));
    } catch (e) { return fail(e.message || tr('ui.config.write_failed')); }
    return { ok: true, name: FILE };
  }

  /** Reads the file back and checks it. Resolves { ok, value, name, changes: [{ key, label, from, to }] } or a failure. */
  async function preview() {
    const l = local(), c = C();
    if (!l || !c) return fail(tr('ui.config.no_tools'));
    let blob;
    try { blob = await l.download(null, FILE); } catch (e) { return fail(e.message || tr('ui.config.folder_failed')); }
    if (!blob) return fail(tr('ui.config.no_file', { file: FILE }));
    const r = c.validate(await blob.text(), { app: APP });
    if (!r.ok) return { ok: false, error: tr('ui.config.invalid', { file: FILE, err: c.errorText(r.errors) }), errors: r.errors };
    const entry = c.getKind(KIND, APP);
    if (!entry || !entry.read) return fail(tr('ui.config.no_kind'));
    let cur;
    try { cur = await entry.read(); } catch (e) { return fail(tr('ui.config.cur_failed', { err: e.message })); }
    const data = r.value.data;
    const changes = FIELDS.filter((f) => data[f.key] !== undefined && data[f.key] !== cur[f.key]).map((f) => ({
      key: f.key, label: tr(f.label), from: show(cur[f.key], f.suffix), to: show(data[f.key], f.suffix),
    }));
    return { ok: true, value: r.value, name: FILE, changes };
  }

  /** Applies a preview() result. Resolves { ok, applied } or { ok: false, error }. */
  async function apply(p) {
    const c = C();
    if (!c || !p || !p.ok) return fail(tr('ui.config.nothing_apply'));
    const r = await c.applyValue(p.value, { app: APP });
    if (!r.ok) return fail(c.errorText(r.errors) || tr('ui.config.not_applied'));
    return { ok: true, applied: p.changes.length };
  }

  g.SlopConfigFolder = { FILE, save, preview, apply };
})(typeof window !== 'undefined' ? window : globalThis);
