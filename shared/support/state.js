/* Support card memory: one versioned envelope in localStorage under 'slop-support'.
 * { "v": 1, "shown": bool, "dismissed": bool }
 *   shown:     the card has been shown once on this browser (the first export of any app).
 *   dismissed: the visitor pressed "No thanks". The card never shows again on any app.
 * Every storage access is in try/catch. If storage is blocked, available() is false and no card is shown at all
 * (nothing could be remembered, so nobody is asked again and again). Classic script, exposes window.SlopSupportState. */
(function () {
  'use strict';
  var KEY = 'slop-support';
  var src = (document.currentScript && document.currentScript.src) || location.href;
  var base = new URL('../../', src).href; // site root, whatever page loaded us

  function load() {
    try { return { ok: true, raw: window.localStorage.getItem(KEY) }; }
    catch (e) { return { ok: false, raw: null }; }
  }
  function parse(raw) {
    if (!raw) return { v: 1, shown: false, dismissed: false };
    try {
      var o = JSON.parse(raw);
      if (!o || o.v !== 1) return { v: 1, shown: false, dismissed: false };
      return { v: 1, shown: o.shown === true, dismissed: o.dismissed === true };
    } catch (e) { return { v: 1, shown: false, dismissed: false }; }
  }
  function save(next) {
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); return true; }
    catch (e) { return false; }
  }

  var api = {
    KEY: KEY,
    base: base,
    /** False when localStorage cannot be used. The card then does not appear anywhere. */
    available: function () { return load().ok; },
    /** True once the card has been shown on this browser (the first export). */
    shown: function () { var r = load(); return !r.ok || parse(r.raw).shown; },
    /** True after "No thanks". */
    dismissed: function () { var r = load(); return !r.ok || parse(r.raw).dismissed; },
    /** Records that the card has been shown. Returns false if storage refused. */
    markShown: function () {
      var r = load(); if (!r.ok) return false;
      var s = parse(r.raw); s.shown = true;
      return save(s);
    },
    /** Records "No thanks": the card never shows again. Returns false if storage refused. */
    dismiss: function () {
      var r = load(); if (!r.ok) return false;
      var s = parse(r.raw); s.dismissed = true; s.shown = true;
      return save(s);
    }
  };
  window.SlopSupportState = Object.freeze(api);
})();
