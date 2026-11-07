/* The consent record in localStorage under 'slop-consent'. Classic script, exposes window.SlopConsentState.
 * Record: { "version": <policyVersion>, "timestamp": <ms>, "categories": { "necessary": true, "analytics": bool, "ads": bool, "rates": bool } }
 * Every storage access is wrapped. If storage is blocked: current() is all denied and needsChoice() is false,
 * so nobody is asked over and over. A record from another policy version counts as missing (the visitor is asked again). */
(function () {
  'use strict';
  var KEY = 'slop-consent';
  var cfg = window.SLOP_CONSENT_CONFIG;
  var src = (document.currentScript && document.currentScript.src) || location.href;
  var base = new URL('../../', src).href; // site root, whatever page loaded us

  function load() {
    try { return { ok: true, raw: window.localStorage.getItem(KEY) }; }
    catch (e) { return { ok: false, raw: null }; }
  }
  function parse(raw) {
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || !o.categories || typeof o.categories !== 'object') return null;
      return {
        version: Number(o.version),
        timestamp: Number(o.timestamp) || 0,
        categories: { necessary: true, analytics: o.categories.analytics === true, ads: o.categories.ads === true, rates: o.categories.rates === true }
      };
    } catch (e) { return null; }
  }
  function record() {
    var r = load();
    return { ok: r.ok, rec: parse(r.raw) };
  }
  function outdated(rec) { return !rec || rec.version !== cfg.policyVersion; }

  var api = {
    KEY: KEY,
    base: base,
    /** False when localStorage cannot be used (blocked, disabled, private mode with no quota). */
    available: function () { return load().ok; },
    /** The stored record as parsed, or null when missing or corrupt. Includes outdated records. */
    read: function () { return record().rec; },
    /** True when storage works and the visitor has no current-policy choice yet. */
    needsChoice: function () { var r = record(); return r.ok && outdated(r.rec); },
    /** The categories that apply right now. Missing, outdated or blocked storage means analytics and ads are off. */
    current: function () {
      var r = record();
      var rec = r.ok && !outdated(r.rec) ? r.rec : null;
      return { necessary: true, analytics: !!(rec && rec.categories.analytics), ads: !!(rec && rec.categories.ads), rates: !!(rec && rec.categories.rates) };
    },
    /** The categories from a record of an older policy version, or null. Only a default for the next choice: nothing is on because of it. */
    previous: function () { var r = record(); return r.ok && r.rec && outdated(r.rec) ? r.rec.categories : null; },
    /** Saves a choice for the current policy version. Returns the record, or null if storage refused. */
    write: function (cats) {
      var rec = {
        version: cfg.policyVersion,
        timestamp: Date.now(),
        categories: { necessary: true, analytics: !!(cats && cats.analytics === true), ads: !!(cats && cats.ads === true), rates: !!(cats && cats.rates === true) }
      };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(rec));
        return rec;
      } catch (e) { return null; }
    }
  };
  window.SlopConsentState = Object.freeze(api);
})();
