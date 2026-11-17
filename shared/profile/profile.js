/* Per-app settings: the person's overrides for each app's options, kept in localStorage under 'slop-profile'.
 * Apps read with SlopProfile.get(appId, key, appDefault) and never need the Settings page. Classic script, exposes
 * window.SlopProfile (and SlopProfile.create(opts) for tests). Only overrides are stored: a value equal to the
 * declared default is not kept. Every storage access is in try/catch; with blocked storage every read gives the default.
 * Options come from window.SLOP_APP_OPTIONS (shared/profile/app-options.js). See shared/profile/HANDOFF.md.
 * Also the side panels' sizes: panelSize(appId, panelId) and setPanelSize(appId, panelId, px | null). */
(function (g) {
  'use strict';
  const KEY = 'slop-profile';
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function validFor(opt, v) {
    if (!opt) return false;
    if (opt.type === 'bool') return typeof v === 'boolean';
    if (opt.type === 'string') return typeof v === 'string' && v.length <= 200;
    if (opt.type === 'number') return typeof v === 'number' && Number.isFinite(v) && (opt.min === undefined || v >= opt.min) && (opt.max === undefined || v <= opt.max);
    if (opt.type === 'enum') return Array.isArray(opt.values) && opt.values.includes(v);
    return false;
  }

  function safeLocalStorage() {
    try { return g.localStorage || null; } catch (e) { return null; }
  }

  /** A profile over the given storage (default: localStorage) and option map (default: SLOP_APP_OPTIONS). */
  function create(opts = {}) {
    const store = opts.storage !== undefined ? opts.storage : safeLocalStorage();
    const declared = () => (opts.options !== undefined ? opts.options : (g.SLOP_APP_OPTIONS || {}));
    const denied = { ok: false, error: 'Could not save: browser storage is blocked.' };

    // Envelope { v: 1, data: { <appId>: { <key>: value } } }. The unversioned shape written before v1 is still read.
    function readAll() {
      try {
        const o = JSON.parse(store.getItem(KEY) || 'null');
        const d = o && o.v === 1 && o.data !== undefined ? o.data : o;
        return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
      } catch (e) { return {}; }
    }
    function writeAll(o) {
      try { store.setItem(KEY, JSON.stringify({ v: 1, data: o })); return { ok: true }; } catch (e) { return denied; }
    }
    function optionsOf(appId) {
      const d = declared();
      return hasOwn(d, appId) && d[appId] && typeof d[appId] === 'object' ? d[appId] : {};
    }
    /** The app's stored override when it is valid, else `fallback` if given, else the declared default. */
    function get(appId, key, fallback) {
      const opt = optionsOf(appId)[key];
      const ov = readAll()[appId];
      if (ov && typeof ov === 'object' && hasOwn(ov, key) && validFor(opt, ov[key])) return ov[key];
      if (fallback !== undefined) return fallback;
      return opt ? opt.default : undefined;
    }
    /** Saves an override. Undeclared keys and invalid values are refused. A value equal to the default clears the override. */
    function set(appId, key, value) {
      const opt = optionsOf(appId)[key];
      if (!opt) return { ok: false, error: 'Unknown setting.' };
      if (!validFor(opt, value)) return { ok: false, error: 'That value is not allowed for this setting.' };
      const all = readAll();
      const prev = all[appId] && typeof all[appId] === 'object' ? all[appId] : {};
      const ov = { ...prev };
      if (value === opt.default) delete ov[key]; else ov[key] = value;
      if (Object.keys(ov).length) all[appId] = ov; else delete all[appId];
      return writeAll(all);
    }
    /** Clears every override for one app, so it is back on its own defaults. */
    function reset(appId) {
      const all = readAll();
      delete all[appId];
      return writeAll(all);
    }
    /** The effective values for one app: overrides where set, declared defaults elsewhere. */
    function all(appId) {
      return Object.fromEntries(Object.keys(optionsOf(appId)).map((k) => [k, get(appId, k)]));
    }
    /** Only what the person changed, for one app. */
    function overrides(appId) {
      const ov = readAll()[appId];
      const out = {};
      if (ov && typeof ov === 'object') for (const k of Object.keys(ov)) if (validFor(optionsOf(appId)[k], ov[k])) out[k] = ov[k];
      return out;
    }
    // Panel sizes (shared/ui/resize-panel.js): { '@panels': { <appId>: { <panelId>: px } } } in the same envelope. Not
    // declared options, so the Settings page does not list them; "Reset panel sizes" in an app's View menu clears them.
    const PANELS = '@panels';
    function panelSize(appId, id) {
      const p = readAll()[PANELS], v = p && p[appId] && p[appId][id];
      return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 10000 ? v : null;
    }
    function setPanelSize(appId, id, px) {
      const all = readAll(), p = Object.assign({}, all[PANELS]), a = Object.assign({}, p[appId]);
      if (px == null) delete a[id]; else if (typeof px === 'number' && Number.isFinite(px) && px > 0 && px < 10000) a[id] = Math.round(px); else return { ok: false, error: 'Not a width.' };
      if (Object.keys(a).length) p[appId] = a; else delete p[appId];
      if (Object.keys(p).length) all[PANELS] = p; else delete all[PANELS];
      return writeAll(all);
    }
    return { KEY, get, set, reset, all, overrides, options: optionsOf, appIds: () => Object.keys(declared()), panelSize, setPanelSize };
  }

  g.SlopProfile = Object.assign(create(), { create });
})(typeof window !== 'undefined' ? window : globalThis);
