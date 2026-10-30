/* SlopPresets import and export. A preset travels as a .slop.json file: the shared config envelope (shared/config) with
 * kind 'preset' and app 'slop', so SlopConfig's import dialogs and AI helpers understand it too. The data is the preset
 * without its id: { kind, label, description?, apps, params }. Every import is validated before it is saved.
 * Adds to window.SlopPresets: toEnvelope, fromEnvelope, exportText, exportFile, importText, importFile, errorText, and
 * registers the 'preset' kind with SlopConfig when shared/config is on the page. */
(function (g) {
  'use strict';
  const SP = (g.SlopPresets = g.SlopPresets || {});
  const FORMAT = 'slop-config', VERSION = 1, KIND = 'preset', APP = 'slop';
  const MAX_BYTES = 5 * 1024 * 1024;

  /** The preset's data (what the file's data holds). */
  function dataOf(p) {
    const d = { kind: p.kind, label: p.label };
    if (p.description) d.description = p.description;
    d.apps = p.apps.slice();
    d.params = JSON.parse(JSON.stringify(p.params));
    return d;
  }
  const fail = (message) => ({ ok: false, value: null, errors: [{ path: '', message }] });

  /** The .slop.json envelope for a preset. */
  SP.toEnvelope = function (p) {
    const env = { format: FORMAT, version: VERSION, kind: KIND, app: APP, name: p.label };
    if (p.description) env.description = p.description;
    env.created = new Date(p.modified || p.created || Date.now()).toISOString();
    env.data = dataOf(p);
    return env;
  };
  /** Checks a parsed envelope. Resolves { ok, value (the preset data), errors }. Never throws. */
  SP.fromEnvelope = function (env) {
    if (!env || typeof env !== 'object' || Array.isArray(env)) return fail('the file is not a JSON object');
    if (env.format !== FORMAT || env.version !== VERSION) return fail(`not a ${FORMAT} version ${VERSION} file`);
    if (env.kind !== KIND) return fail(`this file holds a "${env.kind}", not a preset`);
    const r = SP.validate(env.data);
    return r.ok ? { ok: true, value: r.value, errors: [] } : { ok: false, value: null, errors: r.errors };
  };
  /** The file text for a preset (the registry's copy, built-ins included), or null for an unknown id. */
  SP.exportText = function (id) {
    const p = SP.get(id);
    return p ? JSON.stringify(SP.toEnvelope(p), null, 2) : null;
  };
  /** { name, blob } for download: name is <label>.slop.json. Null for an unknown id. */
  SP.exportFile = function (id) {
    const text = SP.exportText(id);
    if (text === null) return null;
    const label = SP.get(id).label.replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').trim() || 'preset';
    return { name: label + '.slop.json', blob: new Blob([text], { type: 'application/json' }) };
  };
  /** Validates, then saves, a preset file's text. Resolves { ok, id, errors }. */
  SP.importText = async function (text) {
    let env;
    try { env = JSON.parse(text); } catch (e) { return { ok: false, errors: [{ path: '', message: 'not valid JSON: ' + e.message }] }; }
    const r = SP.fromEnvelope(env);
    if (!r.ok) return { ok: false, errors: r.errors };
    const s = await SP.save(r.value);
    return s.ok ? { ok: true, id: s.id, errors: [] } : { ok: false, errors: s.errors };
  };
  /** Imports a File or Blob (a .slop.json from disk or Slop Drive). Refuses files over 5 MB before reading them. */
  SP.importFile = async function (file) {
    if (!file || typeof file.text !== 'function') return { ok: false, errors: [{ path: '', message: SP.word('err_no_file') }] };
    if (file.size > MAX_BYTES) return { ok: false, errors: [{ path: '', message: SP.word('err_too_big', { size: '5 MB' }) }] };
    return SP.importText(await file.text());
  };
  /** The first few problems as one line, for toasts and alerts, in the page's language around them (the field-by-field
   *  details name the file's own fields, so they stay as the format writes them). */
  SP.errorText = function (errors) {
    const list = (errors || []).slice(0, 3).map((e) => (e.path ? e.path + ': ' : '') + e.message).join('; ');
    return list ? SP.word('err_problems', { list }) : SP.word('err_invalid');
  };

  /* SlopConfig: the 'preset' kind (app '*', so every app's Import dialog accepts it). */
  const C = g.SlopConfig;
  if (C && C.F && C.consts && !C.getKind(KIND, C.consts.SHARED)) {
    const F = C.F;
    C.registerKind(KIND, C.consts.SHARED, {
      strict: true,
      fields: {
        kind: F.enum(SP.KINDS, { required: true, desc: 'effect (layer or clip effects) or motion (keyframes over time)' }),
        label: F.str({ max: SP.LIMITS.label, required: true, desc: 'the preset name shown in menus' }),
        description: F.str({ max: SP.LIMITS.description, desc: 'one line saying what it does' }),
        apps: F.list(F.enum(Object.keys(SP.APPS)), { min: 1, max: SP.LIMITS.apps, required: true, desc: 'the apps it applies in' }),
        params: F.obj({}, { required: true, strict: false, desc: 'the effects, or the motion duration and tracks; checked by the preset rules' }),
      },
    }, async (data) => {
      const r = await SP.save(data);
      if (!r.ok) throw new Error(SP.errorText(r.errors));
    }, { label: 'Preset', description: 'One effect or motion preset', check: (data) => SP.validate(data).errors });
  }
})(typeof window !== 'undefined' ? window : globalThis);
