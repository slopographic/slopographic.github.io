/* SlopCentral format: reads any input into a version 2 envelope and validates it. Accepted inputs:
 *   a version 2 .slop-backup.json (format "slop-backup"),
 *   a version 1 Slop Data bundle (format "slop-data", what Admin's backup downloaded before),
 *   a version 1 Slopographic .slop ZIP (SlopBackup, what the Backup & restore dialog made before).
 * Nothing here touches app storage. Part of central.js; attaches to window.SlopCentral.format. */
(function () {
  'use strict';
  const C = window.SlopCentral;
  const FORMAT = 'slop-backup', VERSION = 2;
  const ENV_KEYS = ['format', 'version', 'created', 'apps', 'settings', 'registry', 'excluded'];
  const ID_RX = /^[a-z][a-z0-9-]{0,39}$/;
  const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
  const SECRET_RX = /token|secret|passw|api[_-]?key|private[_-]?key|credential/i;
  const MAX_DEPTH = 64, MAX_ERRORS = 50;
  // Words: shared/i18n/ui/<code>/backup.js (ui.backup.*) and the config checks' words (config.js, ui.cfgv.*)
  const tr = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const fail = (message) => ({ ok: false, envelope: null, errors: [message] });
  const validDate = (s) => typeof s === 'string' && s.length <= 40 && !Number.isNaN(Date.parse(s));

  /** Walks a parsed value: no prototype-changing keys, no key that names a secret, no absurd nesting. */
  function walk(v, path, errs, depth) {
    if (errs.length >= MAX_ERRORS) return;
    if (depth > MAX_DEPTH) { errs.push(`${path}: ${tr('ui.cfgv.deep')}`); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, errs, depth + 1)); return; }
    if (!isObj(v)) return;
    for (const k of Object.keys(v)) {
      const p = path ? `${path}.${k}` : k;
      if (BAD_KEYS.includes(k)) errs.push(`${p}: ${tr('ui.cfgv.not_allowed')}`);
      else if (SECRET_RX.test(k)) errs.push(`${p}: ${tr('ui.backup.v_secret')}`);
      walk(v[k], p, errs, depth + 1);
    }
  }

  /** The envelope's problems, first first. [] means a valid version 2 file. Never throws. */
  function validateEnvelope(env) {
    const errs = [];
    const err = (p, m) => { if (errs.length < MAX_ERRORS) errs.push(p ? `${p}: ${m}` : m); };
    if (!isObj(env)) return [tr('ui.cfgv.one_object')];
    for (const k of Object.keys(env)) if (!ENV_KEYS.includes(k)) err(k, tr('ui.cfgv.env_key'));
    if (env.format !== FORMAT) err('format', tr('ui.cfgv.must_be', { v: FORMAT }));
    if (env.version !== VERSION) {
      err('version', env.version === undefined ? tr('ui.backup.v_ver_missing', { v: String(VERSION) })
        : tr('ui.backup.v_ver_wrong', { got: JSON.stringify(env.version), v: String(VERSION) }));
    }
    if (!validDate(env.created)) err('created', tr('ui.cfgv.created'));
    if (!isObj(env.apps)) err('apps', tr('ui.cfgv.object'));
    if (!isObj(env.settings)) err('settings', tr('ui.cfgv.object'));
    if (!Array.isArray(env.registry) || env.registry.length > 200 || !env.registry.every((x) => typeof x === 'string' && ID_RX.test(x))) {
      err('registry', tr('ui.backup.v_registry'));
    }
    if (!Array.isArray(env.excluded) || env.excluded.length > 200
      || !env.excluded.every((x) => isObj(x) && typeof x.source === 'string' && typeof x.reason === 'string')) {
      err('excluded', tr('ui.backup.v_excluded'));
    }
    if (errs.length) return errs;
    for (const part of ['apps', 'settings']) {
      for (const id of Object.keys(env[part])) {
        const p = `${part}.${id}`, s = env[part][id];
        if (!ID_RX.test(id)) { err(p, tr('ui.backup.v_app_id')); continue; }
        if (!isObj(s) || Object.keys(s).some((k) => k !== 'version' && k !== 'data')) { err(p, tr('ui.backup.v_section')); continue; }
        if (!Number.isInteger(s.version) || s.version < 1 || s.version > 1000) err(`${p}.version`, tr('ui.backup.v_version'));
        if (!isObj(s.data)) err(`${p}.data`, tr('ui.cfgv.object'));
      }
    }
    walk(env.apps, 'apps', errs, 0);
    walk(env.settings, 'settings', errs, 0);
    return errs.slice(0, MAX_ERRORS);
  }

  /** Records per store or collection, for the summary. Settings count their keys. */
  function countsOf(data) {
    const src = isObj(data.stores) ? data.stores : isObj(data.collections) ? data.collections : null;
    if (!src) { const n = Object.keys(data).length; return { records: n, parts: { keys: n } }; }
    const parts = {};
    let records = 0;
    for (const [k, v] of Object.entries(src)) {
      const n = Array.isArray(v) ? v.length : Array.isArray(v && v.records) ? v.records.length : 0;
      parts[k] = n; records += n;
    }
    return { records, parts };
  }

  function parseText(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return fail(tr('ui.backup.not_json', { err: e.message })); }
    if (!isObj(obj)) return fail(tr('ui.backup.not_object'));
    if (obj.format === FORMAT) return { ok: true, errors: [], envelope: obj, legacy: null };
    if (obj.format === 'slop-data') return fromSlopDataV1(obj);
    return fail(tr('ui.backup.not_backup'));
  }

  /** A version 1 Slop Data bundle becomes the data section at version 1 (migration 2 fills what it lacks). */
  function fromSlopDataV1(b) {
    if (!isObj(b.collections)) return fail(tr('ui.backup.no_records'));
    return { ok: true, errors: [], legacy: tr('ui.backup.src_data_v1'), envelope: {
      format: FORMAT, version: VERSION, created: validDate(b.exportedAt) ? b.exportedAt : new Date().toISOString(),
      apps: { data: { version: 1, data: { collections: b.collections } } }, settings: {}, registry: ['data'],
      excluded: [{ source: tr('ui.backup.src_data_v1'), reason: tr('ui.backup.why_data_v1') }],
    } };
  }

  /** A version 1 Slopographic ZIP. Its IndexedDB databases map to apps by their old names; localStorage keeps only the profile. */
  async function readLegacyZip(file) {
    let b;
    try { b = await window.SlopBackupCore.read(file); } catch (e) { return fail(e.message || tr('ui.backup.not_backup')); }
    const dec = (j) => window.SlopBackupCodec.decode(j, b.bytesOf);
    const apps = {}, settings = {};
    try {
      for (const db of b.dbs) {
        if (db.name === 'slop-data') {
          apps.data = { version: 1, data: { collections: Object.fromEntries(db.stores.map((s) => [s.name, s.records.map((r) => dec(r.v))])) } };
          continue;
        }
        const spec = C.apps.specs.find((s) => s.legacy === db.name);
        if (!spec) continue;
        const stores = {};
        for (const s of db.stores) {
          if (spec.stores && !spec.stores.includes(s.name)) continue;
          stores[s.name] = { keyPath: s.keyPath == null ? null : s.keyPath, indexes: s.indexes || [],
            records: s.records.map((r) => (r.k !== undefined ? { k: dec(r.k), v: dec(r.v) } : { v: dec(r.v) })) };
        }
        apps[spec.id] = { version: 1, data: await C.idb.pack(stores) };
      }
    } catch (e) { return fail(tr('ui.backup.unreadable', { err: e.message || String(e) })); }
    try { const p = JSON.parse((b.local || {})['slop-profile']); if (isObj(p)) settings.profile = { version: 1, data: p }; } catch (e) { /* no profile */ }
    const kept = Object.keys(b.local || {}).filter((k) => k !== 'slop-profile').length;
    const created = validDate(b.manifest && b.manifest.created) ? b.manifest.created : new Date().toISOString();
    return { ok: true, errors: [], legacy: tr('ui.backup.src_v1'), envelope: {
      format: FORMAT, version: VERSION, created, apps, settings,
      registry: [...Object.keys(apps), ...Object.keys(settings)],
      excluded: [{ source: tr('ui.backup.src_v1'), reason: tr('ui.backup.why_v1', { n: kept }) }],
    } };
  }

  /** Any accepted input → { ok, errors, envelope, legacy }. Blobs are sniffed for the ZIP signature, not the name. */
  async function readFile(input) {
    if (!input) return fail(tr('ui.cfgv.no_file'));
    if (typeof input === 'string') return parseText(input);
    if (typeof input.slice !== 'function' || typeof input.text !== 'function') return fail(tr('ui.cfgv.no_file'));
    const head = new Uint8Array(await input.slice(0, 4).arrayBuffer());
    if (head[0] === 0x50 && head[1] === 0x4b) return readLegacyZip(input);
    try { return parseText(await input.text()); } catch (e) { return fail(tr('ui.cfgv.read_failed', { err: e.message })); }
  }

  C.format = { FORMAT, VERSION, ID_RX, isObj, validateEnvelope, countsOf, readFile };
})();
