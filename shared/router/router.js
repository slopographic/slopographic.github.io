/* SlopRoute — shared/router: URL parameters that name a section of an app (?view=export, ?panel=history, ?doc=...).
 * Classic script. Needs shared/urlstate/urlstate.js loaded first (it does the URL work). Sets window.SlopRoute.
 * See HANDOFF.md for the parameters of every app.
 *
 *   const R = SlopRoute.register('hex', {
 *     params: {
 *       view: { values: ['bytes', 'text', 'diff'], def: 'bytes', legacy: ['v'] },  // a fixed list
 *       doc:  { pattern: /^[\w-]{1,64}$/, def: '' },                             // a free id that must match
 *       page: { int: true, min: 1, max: 999, def: 1 },                           // a whole number
 *       q:    { def: '', max: 120 },                                             // text, cut to max characters
 *     },
 *     ready: () => document.body.classList.contains('ready'),  // optional: apply on load once this is true (the app has booted)
 *     apply(state, why) { ... },            // why: 'load' (on register or ready) or 'popstate' (back and forward)
 *     hash: (h) => ({ view: 'diff' }),      // optional: map an old #hash link to parameters
 *   });
 *   R.get('view')                  the current value (typed: a number for int)
 *   R.has('view')                  true when the URL carries the parameter (a link named it), not just its default
 *   R.state()                      every current value, defaults filled in
 *   R.set({ view: 'text' })        replaceState (default). { push: true } pushes one history entry (a navigation);
 *                                  { push: true, state } also stores state on that entry.
 *                                  A value equal to its default removes the parameter, so plain links stay short.
 *   R.link()                       the absolute URL of the current state
 *   SlopRoute.describe(app?)       printable lines: each parameter, its values and default. No app: every app.
 *   SlopRoute.list(app)            the same as data: [{ name, values, pattern, int, min, max, def, legacy, now }]
 *
 * Rules: a value outside its list, pattern or range gives the default. Unknown parameters and the hash are kept as
 * they were written, so other tools on the page keep working. A legacy name is read when the canonical one is absent
 * and is dropped the next time the app writes the parameter. Every call is wrapped and never throws. */
(function (win) {
  'use strict';
  if (win.SlopRoute) return;
  const U = win.SlopUrlState;
  const apps = new Map();   // app name -> { spec, params: [{ name, ... }], handle }
  let wired = false;
  const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };

  /** A raw URL value (or null) to a valid value of the parameter. Anything that does not fit gives the default. */
  function coerce(p, raw) {
    if (raw === null || raw === undefined) return p.def;
    if (p.values) return p.values.includes(raw) ? raw : p.def;
    if (p.int) {
      const n = /^-?\d+$/.test(raw) ? Number(raw) : NaN;
      const lo = p.min ?? -Infinity, hi = p.max ?? Infinity;
      return Number.isFinite(n) && n >= lo && n <= hi ? n : p.def;
    }
    if (p.pattern) return p.pattern.test(raw) ? raw : p.def;
    return raw.slice(0, p.max || 200);
  }
  /** The text a value is written as in the URL, or null when it equals the default (the key is then removed). */
  function text(p, v) {
    if (v === null || v === undefined) return null;
    const s = String(v);
    return s === String(p.def) ? null : s;
  }
  /** Normalise one parameter spec: name, list, pattern, int, range, default, legacy names. */
  function norm(name, p) {
    const out = { name, values: p.values || null, pattern: p.pattern || null, int: !!p.int, min: p.min, max: p.max,
      def: p.def === undefined ? (p.int ? 0 : '') : p.def, legacy: p.legacy || [] };
    if (out.values && out.def !== '' && !out.values.includes(String(out.def))) out.def = out.values[0];   // '' = none
    return out;
  }
  /** The parameters of one app as they are in the URL now, defaults filled in. The hash (an old link) is read on load only. */
  function readState(entry, fromHash) {
    const out = {};
    for (const p of entry.params) {
      let raw = safe(() => U.get(p.name, null), null);
      if (raw === null) for (const old of p.legacy) { raw = safe(() => U.get(old, null), null); if (raw !== null) break; }
      if (raw === null && fromHash && entry.hashed && entry.hashed[p.name] !== undefined) raw = String(entry.hashed[p.name]);
      out[p.name] = coerce(p, raw);
    }
    return out;
  }
  /** What an old #hash link says, read once when the app registers. */
  function hashed(entry) {
    const h = safe(() => win.location.hash, '');
    if (!entry.spec.hash || !h) return null;
    return safe(() => entry.spec.hash(h), null) || null;
  }
  function run(entry, why) {
    if (typeof entry.spec.apply !== 'function') return;
    safe(() => entry.spec.apply(readState(entry, why === 'load'), why));
  }

  /** The handle an app keeps: read, write and link its own parameters. */
  function handleFor(entry) {
    const byName = new Map(entry.params.map((p) => [p.name, p]));
    return {
      get(name) { return readState(entry, false)[name]; },
      state() { return readState(entry, false); },
      /** Does the URL carry this parameter (or one of its old names)? */
      has(name) {
        const p = byName.get(name);
        return !!p && [p.name, ...p.legacy].some((k) => safe(() => U.get(k, null), null) !== null);
      },
      set(patch, opts) {
        if (!patch || typeof patch !== 'object') return false;
        const changes = {};
        for (const k of Object.keys(patch)) {
          const p = byName.get(k);
          if (!p) continue;
          changes[k] = text(p, coerce(p, patch[k] === null || patch[k] === undefined ? null : String(patch[k])));
          for (const old of p.legacy) changes[old] = null;
        }
        const o = { replace: !(opts && opts.push) };
        if (opts && 'state' in opts) o.state = opts.state;   // a history state for the entry (Drive keeps the folder in it)
        return U.set(changes, o);
      },
      link() { return safe(() => U.link(), ''); },
    };
  }

  function wire() {
    if (wired || !U) return;
    wired = true;
    U.onChange(() => { for (const entry of apps.values()) run(entry, 'popstate'); });
  }

  /** Register an app's parameters. Applies the URL to the app at once. Returns the app's handle. */
  function register(app, spec) {
    if (!U) { if (win.console) win.console.warn('SlopRoute: shared/urlstate is not loaded'); return null; }
    const params = Object.entries((spec && spec.params) || {}).map(([name, p]) => norm(name, p));
    const entry = { app, spec: spec || {}, params, handle: null, hashed: null };
    entry.handle = handleFor(entry);
    entry.hashed = hashed(entry);
    apps.set(app, entry);
    wire();
    whenReady(entry, () => run(entry, 'load'));
    return entry.handle;
  }
  /** Runs fn once the app reports ready (spec.ready() is true), polling every 40 ms for at most 15 s, then anyway. */
  function whenReady(entry, fn) {
    const ready = entry.spec.ready;
    if (typeof ready !== 'function') return fn();
    const ok = () => safe(() => !!ready(), false);
    // Always after this call returns: the app's own const for the handle must exist before apply reads it.
    if (ok()) return win.setTimeout(fn, 0);
    const t0 = Date.now();
    const id = win.setInterval(() => { if (ok() || Date.now() - t0 > 15000) { win.clearInterval(id); fn(); } }, 40);
  }

  /** The parameters of an app as data, with what each one reads now. */
  function list(app) {
    const e = apps.get(app);
    if (!e) return [];
    const now = readState(e, false);
    return e.params.map((p) => ({ name: p.name, values: p.values, pattern: p.pattern ? String(p.pattern) : null,
      int: p.int, min: p.min, max: p.max, def: p.def, legacy: p.legacy, now: now[p.name] }));
  }
  /** Printable lines: ?name=<a|b|c> (default a). The app names come first. */
  function describe(app) {
    const names = app ? [app] : [...apps.keys()];
    const lines = [];
    for (const n of names) {
      const items = list(n);
      lines.push(n + (items.length ? '' : ': no parameters'));
      for (const p of items) {
        const shape = p.values ? '<' + p.values.join('|') + '>' : p.int ? '<number ' + p.min + '-' + p.max + '>' : p.pattern ? '<id>' : '<text>';
        const old = p.legacy.length ? '  (also reads ?' + p.legacy.join(', ?') + ')' : '';
        lines.push('  ?' + p.name + '=' + shape + '  default ' + JSON.stringify(p.def) + old);
      }
    }
    return lines.join('\n');
  }

  win.SlopRoute = { register, list, describe, apps: () => [...apps.keys()] };
})(window);
