/* Slop Slides: editor state and the change pipeline. Every edit goes through A.change(label, fn, key): it records an
   undo step, runs fn and marks the open presentation unsaved. The open presentation is one tab of the strip (ui/tabs.js),
   which keeps it on this device and saves it to Slop Drive. Views subscribe with A.on(event, fn):
   load (a presentation was put on screen), deck (structure replaced by undo or redo), change (any edit, cheap to repaint),
   select (object selection), slide (current slide moved), render (repaint only), mode (edit | present).
   Exposes window.SS.app. */
(function () {
  'use strict';
  var SS = window.SS, O = SS.objects;
  var A = SS.app = { deck: null, idx: 0, sel: [], doc: null, dirty: false, mode: 'edit', clip: null, hist: null };
  var listeners = {};
  A.on = function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); };
  A.emit = function (ev, data) { (listeners[ev] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); };

  /** The undo history of one open presentation (every tab has its own). */
  A.makeHist = function () {
    return SS.History(function () { return A.deck; }, function (d) {
      A.deck = d;
      A.idx = Math.max(0, Math.min(A.idx, d.slides.length - 1));
      A.sel = A.sel.filter(function (id) { return !!O.find(A.slide(), id); });
      A.emit('deck');
      A.emit('change');
    }, { coalesce: 800, limit: 300 });
  };
  A.hist = A.makeHist();

  A.slide = function () { return A.deck.slides[A.idx] || null; };
  /** Selected objects on the current slide (groups' children included when selected by id). */
  A.selObjs = function () {
    var s = A.slide();
    return s ? A.sel.map(function (id) { return O.find(s, id); }).filter(Boolean) : [];
  };

  /** Records one undo step (before fn runs), then marks the deck changed. key merges quick repeats (typing, nudging). */
  A.change = function (label, fn, key) {
    if (A.mode !== 'edit' || !A.deck) return null;
    A.hist.push(label, key);
    var r = fn ? fn() : null;
    A.touch();
    return r;
  };
  /** The deck changed without a new undo step (a drag in progress, or undo/redo). */
  A.touch = function () {
    A.dirty = true;
    A.emit('change');
  };
  A.undo = function () { if (A.mode !== 'edit') return false; var r = A.hist.undo(); if (r) A.touch(); return r; };
  A.redo = function () { if (A.mode !== 'edit') return false; var r = A.hist.redo(); if (r) A.touch(); return r; };
  A.select = function (ids) { A.sel = (ids || []).slice(); A.emit('select'); };
  A.go = function (i) {
    if (!A.deck) return;
    A.idx = Math.max(0, Math.min(i, A.deck.slides.length - 1));
    A.sel = [];
    A.emit('slide');
    A.emit('select');
  };
})();
