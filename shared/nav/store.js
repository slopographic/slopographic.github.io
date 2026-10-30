/* SlopNav store: the active navigation preset per app and each app's Custom bindings, kept in
 * localStorage 'slop-nav' (try/catch everywhere; falls back to memory when storage is blocked).
 * Shape: { v: 1, apps: { <app>: { preset: '<id>', custom: { from: '<id>', bindings: {...} } | null } } }
 * Classic script; sets window.SlopNav.store. Profile pages call this same API (see HANDOFF.md). */
(function () {
  'use strict';
  const N = (window.SlopNav = window.SlopNav || {});
  const KEY = 'slop-nav';
  let mem = null; // the in-memory copy, used when storage is missing or throws
  const listeners = new Set();

  function storage() {
    try { return window.localStorage || null; } catch (e) { return null; }
  }
  const fresh = () => ({ v: 1, apps: {} });
  function read() {
    if (mem) return mem;
    let raw = null;
    try { const s = storage(); raw = s ? s.getItem(KEY) : null; } catch (e) { raw = null; }
    let data = fresh();
    try { if (raw) { const d = JSON.parse(raw); if (d && d.v === 1 && d.apps && typeof d.apps === 'object') data = d; } } catch (e) { /* corrupt: start fresh */ }
    mem = data;
    return data;
  }
  function write(data) {
    mem = data;
    try { const s = storage(); if (s) s.setItem(KEY, JSON.stringify(data)); } catch (e) { /* blocked or full: memory only */ }
    for (const fn of [...listeners]) { try { fn(); } catch (e) { console.error(e); } }
  }
  function entry(app) {
    const e = read().apps[app];
    const preset = e && N.presets.has(e.preset) ? e.preset : N.presets.DEFAULT;
    let custom = null;
    if (e && e.custom && typeof e.custom === 'object') {
      const v = N.validate.validate(e.custom.bindings);
      if (v.ok) custom = { from: N.presets.has(e.custom.from) ? e.custom.from : N.presets.DEFAULT, bindings: v.value };
    }
    return { preset, custom };
  }

  /** The active preset for an app, with its bindings resolved (Custom uses the saved bindings). */
  function resolve(app) {
    const e = entry(app);
    const base = N.presets.get(e.preset) || N.presets.get(N.presets.DEFAULT);
    if (e.preset === 'custom') {
      const b = e.custom ? e.custom.bindings : N.presets.get(N.presets.DEFAULT).bindings;
      return { id: 'custom', name: N.presets.get('custom').name, blurb: base.blurb, custom: true, bindings: N.presets.clone(b) };
    }
    return base;
  }
  /** Stored state for an app: { preset, custom }. Read-only copy. */
  function get(app) {
    const e = entry(app);
    return { preset: e.preset, custom: e.custom ? { from: e.custom.from, bindings: N.presets.clone(e.custom.bindings) } : null };
  }
  function update(app, fn) {
    const data = read();
    const apps = Object.assign({}, data.apps);
    apps[app] = Object.assign({ preset: N.presets.DEFAULT, custom: null }, apps[app] || {}, fn(entry(app)));
    write({ v: 1, apps });
  }
  /** Makes a built-in preset (or 'custom') the active one for an app. */
  function setPreset(app, id) {
    if (!N.presets.has(id)) return { ok: false, errors: [`unknown preset "${id}"`] };
    update(app, () => ({ preset: id }));
    return { ok: true, errors: [] };
  }
  /** Saves Custom bindings for an app (validated; invalid bindings are rejected and nothing is saved). */
  function setCustom(app, bindings, from) {
    const v = N.validate.validate(bindings);
    if (!v.ok) return { ok: false, errors: v.errors };
    const base = N.presets.has(from) ? from : N.presets.DEFAULT;
    update(app, (e) => ({ custom: { from: base, bindings: v.value }, preset: e.preset }));
    return { ok: true, errors: [], value: N.presets.clone(v.value) };
  }
  /** Forgets an app's Custom bindings; if Custom was active, Slop becomes active. */
  function clearCustom(app) {
    update(app, (e) => ({ custom: null, preset: e.preset === 'custom' ? N.presets.DEFAULT : e.preset }));
  }
  /** Calls fn() after any change. Returns the unsubscribe function. */
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  N.store = { get, resolve, setPreset, setCustom, clearCustom, subscribe, KEY, _reset: () => { mem = null; } };
})();
