/* SlopSample: seeded sample content for every app that wants some (a sample signature, a sample quote with a customer and
 * lines, a contact, an expense…). The one source of truth: no app keeps its own lists of names or its own random numbers.
 * The same seed always gives the same sample, in every browser and in Node; nothing here reads Math.random or the clock
 * (only newSeed, which makes a fresh seed, uses Math.random, and a caller may pass its own). Not to be confused with
 * shared/samples (SlopSamples: sample FILES, pictures and PDFs, for "Try it with a sample").
 * Files (classic scripts, load in this order): rng.js (this), en.js and sv.js (the words of each language), people.js
 * (people, companies, addresses, colours), goods.js (products and services with prices, dates), records.js (records for
 * the business apps' store). Sets window.SlopSample:
 *   rng(seed) -> { next() [0,1), int(lo, hi), pick(list), chance(p), float(lo, hi), shuffle(list), fork(label) }
 *   hashSeed(text) -> uint32      newSeed(rand?) -> '4821' style seed      normSeed(s) -> the seed as text ('' -> new)
 *   addLocale(id, words), locale(id) -> words (falls back to 'en'), LOCALES -> [[id, name]]
 * fork(label) gives a generator of its own for one part (rng(seed + '/' + label)), so adding a part never changes another. */
(function (g) {
  'use strict';
  const NS = (g.SlopSample = g.SlopSample || {});
  if (NS.rng) return;
  const MAX_SEED = 40;

  /** A 32-bit hash of any string (FNV-1a, then a final avalanche). The same as shared/templates/rng.js. */
  function hashSeed(text) {
    let h = 0x811c9dc5;
    const s = String(text);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }

  /** A generator seeded from a string (mulberry32 over the hash). */
  function rng(seed) {
    const base = String(seed);
    let a = hashSeed(base);
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
    return {
      seed: base, next, int,
      float: (lo, hi) => lo + next() * (hi - lo),
      pick: (list) => list[Math.floor(next() * list.length)],
      chance: (p) => next() < p,
      shuffle: (list) => { const out = list.slice(); for (let i = out.length - 1; i > 0; i--) { const j = int(0, i); [out[i], out[j]] = [out[j], out[i]]; } return out; },
      fork: (label) => rng(base + '/' + label),
    };
  }

  /** A fresh seed: a number of four or five digits, short enough to say and to type again. */
  const newSeed = (rand = Math.random) => String(1000 + Math.floor(rand() * 99000));
  /** The seed as given (trimmed, at most 40 characters), or a fresh one when it is empty. */
  const normSeed = (s, rand) => String(s == null ? '' : s).trim().slice(0, MAX_SEED) || newSeed(rand);

  const words = {};
  const names = [];
  /** Adds the words of a language (en.js, sv.js). */
  function addLocale(id, w) { if (!words[id]) names.push([id, w.name || id]); words[id] = w; }
  /** The words of a language; 'sv-SE' and 'sv' are the same; an unknown language is English. */
  function locale(id) {
    const k = String(id || 'en').toLowerCase().split(/[-_]/)[0];
    return words[k] || words.en;
  }

  Object.assign(NS, { MAX_SEED, hashSeed, rng, newSeed, normSeed, addLocale, locale, LOCALES: names });
})(typeof window !== 'undefined' ? window : globalThis);
