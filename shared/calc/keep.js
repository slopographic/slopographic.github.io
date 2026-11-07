/* Slopculator per-viewer storage: a versioned envelope { v:1, data } in localStorage. Every access is wrapped, because
 * storage can be blocked or full (private windows). Classic script. Exposes window.SlopCalcKeep: read(key, fallback), write(key, data). */
(function (g) {
  'use strict';
  const read = (key, fallback) => {
    try {
      const env = JSON.parse(g.localStorage.getItem(key) || 'null');
      if (env && env.v === 1 && Array.isArray(env.data)) return env.data;
    } catch (e) { /* blocked or corrupt: start empty */ }
    return fallback;
  };
  const write = (key, data) => {
    try { g.localStorage.setItem(key, JSON.stringify({ v: 1, data })); return true; } catch (e) { return false; }
  };
  g.SlopCalcKeep = Object.freeze({ read, write });
})(typeof window !== 'undefined' ? window : globalThis);
