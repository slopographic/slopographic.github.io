/* Slop Time per-viewer storage: a versioned envelope { v:1, data } in localStorage. Every access is wrapped, because
 * storage can be blocked or full. Classic script. Exposes window.SlopTimeKeep: get(key, fallback), put(key, data). */
(function (g) {
  'use strict';
  const get = (key, fallback) => {
    try {
      const env = JSON.parse(g.localStorage.getItem(key) || 'null');
      if (env && env.v === 1 && env.data !== undefined) return env.data;
    } catch (e) { /* blocked or corrupt: use the fallback */ }
    return fallback;
  };
  const put = (key, data) => {
    try { g.localStorage.setItem(key, JSON.stringify({ v: 1, data })); return true; } catch (e) { return false; }
  };
  g.SlopTimeKeep = Object.freeze({ get, put });
})(typeof window !== 'undefined' ? window : globalThis);
