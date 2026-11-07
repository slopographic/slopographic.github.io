/* SlopUrlState — shared/urlstate: an app's place kept in the page URL (query string), so a link restores it and
 * back/forward move through it. Classic script, no dependencies. Sets window.SlopUrlState. See HANDOFF.md.
 *
 *   SlopUrlState.get(key, def)                    read a parameter, decoded to the type of def
 *   SlopUrlState.set(patch, { replace, state })   merge { key: value }; null or undefined removes a key.
 *                                                 replace (default true) uses replaceState; replace: false pushes
 *                                                 a history entry (a navigation). state is the history state.
 *   SlopUrlState.onChange(fn)                     fn(event) runs on popstate, so back and forward restore the state.
 *   SlopUrlState.link()                           the absolute URL of the current page, state included.
 *   SlopUrlState.scope(prefix)                    the same four calls with every key stored as "<prefix>.<key>",
 *                                                 so two apps on one page do not clash: scope('drv').get('cwd').
 *
 * Values: strings as they are; numbers and booleans as text; objects and arrays as JSON. Unknown parameters are kept
 * byte for byte. Every call is wrapped, so a blocked history API (a sandboxed frame, file:, private mode) never throws. */
(function (win) {
  'use strict';
  if (win.SlopUrlState) return;
  const NONE = {};
  const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };
  const unDec = (s) => safe(() => decodeURIComponent(s.replace(/\+/g, ' ')), s);
  const enc = (s) => encodeURIComponent(s);

  /** A value as text, or null for "remove this key". */
  function encode(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
    if (typeof v === 'boolean') return String(v);
    if (typeof v === 'object') { const s = safe(() => JSON.stringify(v), null); return typeof s === 'string' ? s : null; }
    return null;
  }
  const jsonish = (raw) => /^[[{]/.test(raw);
  /** Text back to the type of def. Text that does not fit def gives def (or the text, when def has no type). */
  function decode(raw, def) {
    if (raw === null) return def;
    if (typeof def === 'number') { const n = raw.trim() === '' ? NaN : Number(raw); return Number.isFinite(n) ? n : def; }
    if (typeof def === 'boolean') return raw === 'true' ? true : raw === 'false' ? false : def;
    if (typeof def === 'string') return raw;
    const parsed = jsonish(raw) ? safe(() => JSON.parse(raw), NONE) : NONE;
    const isObj = parsed !== NONE && parsed !== null && typeof parsed === 'object';
    if (def !== null && typeof def === 'object') return isObj ? parsed : def;
    return isObj ? parsed : raw;
  }

  /** The query string with the changes applied. Names in changes (null = remove) are replaced or dropped; every other
   * segment is kept as it was written. */
  function rewrite(query, changes) {
    const out = [], done = new Set();
    for (const seg of String(query || '').replace(/^\?/, '').split('&')) {
      if (!seg) continue;
      const i = seg.indexOf('=');
      const name = unDec(i < 0 ? seg : seg.slice(0, i));
      if (!changes.has(name)) { out.push(seg); continue; }
      if (done.has(name)) continue;
      done.add(name);
      const v = changes.get(name);
      if (v !== null) out.push(enc(name) + '=' + enc(v));
    }
    for (const [name, v] of changes) if (!done.has(name) && v !== null) out.push(enc(name) + '=' + enc(v));
    return out.length ? '?' + out.join('&') : '';
  }
  const search = () => safe(() => win.location.search, '');
  const current = () => safe(() => win.location.pathname + win.location.search + win.location.hash, null);

  /** The API for one prefix ('' for bare keys, 'drv.' for a scope). */
  function api(pre) {
    const get = (key, def) => {
      const raw = safe(() => new URLSearchParams(search()).get(pre + key), null);
      return raw === null ? def : decode(raw, def);
    };
    const set = (patch, opts) => {
      if (!patch || typeof patch !== 'object') return false;
      const changes = new Map();
      for (const k of Object.keys(patch)) changes.set(pre + k, encode(patch[k]));
      const here = current();
      if (here === null) return false;
      const next = safe(() => win.location.pathname + rewrite(search(), changes) + win.location.hash, null);
      if (next === null || next === here) return false;
      const replace = !opts || opts.replace !== false;
      const state = opts && 'state' in opts ? opts.state : replace ? safe(() => win.history.state, null) : null;
      return safe(() => { if (replace) win.history.replaceState(state, '', next); else win.history.pushState(state, '', next); return true; }, false);
    };
    const link = () => safe(() => new URL(win.location.href).href, '');
    const scope = (prefix) => api(pre + prefix + '.');
    return { get, set, onChange, link, scope };
  }

  const listeners = new Set();
  let wired = false;
  /** fn runs on every popstate. Returns a function that stops it. */
  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    if (!wired) {
      wired = true;
      safe(() => win.addEventListener('popstate', (e) => {
        for (const f of [...listeners]) { try { f(e); } catch (err) { if (win.console) win.console.warn('SlopUrlState: listener failed', err); } }
      }));
    }
    return () => { listeners.delete(fn); };
  }

  win.SlopUrlState = Object.assign(api(''), { _codec: { encode, decode, rewrite } });
})(window);
