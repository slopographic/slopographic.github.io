/* Shared video core (window.SlopVideo.seed): seeded randomness for the random edit. mulberry32 is small,
   fast and good enough for shuffling clips. A seed is a uint32 shown as 8 hex digits; anything typed in is
   hashed to one. Loaded by SlopCut and Reel Remix; pure, no DOM. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const S = (SV.seed = {});
  /** A word people read from the shared tables (shared/i18n/ui/<code>/video.js): key ui.video.<list>.<id>, the id in
   *  lower case with other characters as _. Read each time a list is shown (never kept), so it follows a language
   *  change; the key itself without SlopI18n (tests load the en table). words(list, ids) gives [[id, label]]. */
  SV.word = (list, id, vars) => { const I = root.SlopI18n, k = 'ui.video.' + list + '.' + String(id).toLowerCase().replace(/[^a-z0-9]+/g, '_'); return I ? I.t(k, vars) : k; };
  SV.words = (list, ids) => ids.map((id) => [id, SV.word(list, id)]);

  /** A deterministic generator: rng() returns floats in [0, 1). */
  S.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  /** A fresh random seed (uint32). */
  S.make = function () {
    const b = new Uint32Array(1);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(b); else b[0] = Math.floor(Math.random() * 4294967296);
    return b[0];
  };
  /** FNV-1a hash of a string, so any text works as a seed. */
  S.hash = function (str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  };
  /** Seed from user text: empty gives a new seed, 1–8 hex digits are taken as the seed, other text is hashed. */
  S.parse = function (text) {
    const t = String(text == null ? '' : text).trim();
    if (!t) return S.make();
    if (/^[0-9a-f]{1,8}$/i.test(t)) return parseInt(t, 16) >>> 0;
    return S.hash(t);
  };
  S.hex = (n) => (n >>> 0).toString(16).padStart(8, '0');
  /** A shuffled copy of arr (Fisher–Yates) using rng. */
  S.shuffle = function (arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
})();
