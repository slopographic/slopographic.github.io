/* Slop Slides: undo/redo as JSON snapshots of the deck without its media table (media is append-only while
   editing, so restoring an older snapshot never loses an image). Edits within `coalesce` ms with the same key
   merge into one step (dragging a slider, typing). */
(function () {
  'use strict';
  var SS = window.SS;
  SS.History = function (getDeck, setDeck, opts) {
    opts = opts || {};
    var undo = [], redo = [], limit = opts.limit || 200, lastKey = null, lastT = 0, listeners = [];
    function snap() { var d = getDeck(), m = d.media; d.media = undefined; var s = JSON.stringify(d); d.media = m; return s; }
    function restore(s) { var cur = getDeck(), d = JSON.parse(s); d.media = cur.media; setDeck(d); }
    var api = {
      /** Call BEFORE mutating. key: optional coalescing key. */
      push: function (label, key) {
        var now = Date.now();
        if (key && key === lastKey && now - lastT < (opts.coalesce || 800)) { lastT = now; return; }
        undo.push({ s: snap(), label: label || '' });
        if (undo.length > limit) undo.shift();
        redo.length = 0; lastKey = key || null; lastT = now;
        emit();
      },
      undo: function () { if (!undo.length) return false; var e = undo.pop(); redo.push({ s: snap(), label: e.label }); restore(e.s); lastKey = null; emit(); return e.label || true; },
      redo: function () { if (!redo.length) return false; var e = redo.pop(); undo.push({ s: snap(), label: e.label }); restore(e.s); lastKey = null; emit(); return e.label || true; },
      canUndo: function () { return undo.length > 0; },
      canRedo: function () { return redo.length > 0; },
      label: function (which) { var a = which === 'redo' ? redo : undo; return a.length ? a[a.length - 1].label : ''; },
      /** Forgets the newest undo step (an edit that turned out to change nothing). */
      drop: function () { undo.pop(); lastKey = null; emit(); },
      clear: function () { undo.length = 0; redo.length = 0; lastKey = null; emit(); },
      breakCoalesce: function () { lastKey = null; },
      on: function (fn) { listeners.push(fn); }
    };
    function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
    return api;
  };
})();
