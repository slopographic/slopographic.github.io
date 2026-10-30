// Slop Effects app state: the document, its undo history, the selection, the playhead, the play range and the loop.
// Every edit goes through edit(label, fn): one call is one undo step. A drag uses live(fn) while it moves, then
// commitLive(label) when the mouse is released (or cancelLive() to drop it), so a drag is one step too. Listeners are
// told what changed: 'doc', 'time', 'sel', 'view'. Classic script: window.SlopEffects.state.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});

  /** A store around a document. */
  function create(doc) {
    const listeners = [];
    const S = {
      doc,
      hist: ns.history.create(),
      drag: null,          // the document before a live drag started (null when not dragging)
      lastLabel: '',
      sel: { layer: null, keys: [], fx: null },
      playhead: 0,
      range: null,         // { in, out } in seconds, or null
      loop: true,
      file: { name: '', driveId: '' },
    };
    const emit = (what) => listeners.slice().forEach((fn) => { try { fn(what, S); } catch (e) { console.error(e); } });

    /** Keeps the selection pointing at things that still exist. */
    function tidy() {
      if (S.sel.layer && !S.doc.layers.some((l) => l.id === S.sel.layer)) { S.sel.layer = null; S.sel.fx = null; S.sel.keys = []; }
      if (S.sel.fx && !(S.sel.layer && ns.core.findLayer(S.doc, S.sel.layer).effects.some((f) => f.id === S.sel.fx))) S.sel.fx = null;
      S.sel.keys = S.sel.keys.filter((k) => S.doc.layers.some((l) => l.id === k.layer) && (S.doc.tl.tracks[k.layer] || {})[k.prop]);
      S.playhead = Math.min(S.playhead, S.doc.comp.duration);
      if (S.range) S.range = { in: Math.min(S.range.in, S.doc.comp.duration), out: Math.min(S.range.out, S.doc.comp.duration) };
    }

    /** One edit: fn(doc) returns the new document (the same object means no change, so no undo step). */
    function edit(label, fn) {
      if (S.drag) throw new Error('an edit cannot run during a drag');
      const before = S.doc;
      const next = fn(before);
      if (next === before) return false;
      S.hist = ns.history.push(S.hist, before);
      S.doc = next;
      S.lastLabel = label;
      tidy();
      emit('doc');
      return true;
    }

    /**
     * Moves the document during a drag without an undo step. fn receives the document as it was when the drag began (not
     * the last move), so each call can say where things are relative to the start.
     */
    function live(fn) {
      if (!S.drag) S.drag = S.doc;
      S.doc = fn(S.drag);
      tidy();
      emit('doc');
    }

    /** Ends a drag: it becomes one undo step if anything moved. */
    function commitLive(label) {
      if (!S.drag) return;
      const before = S.drag;
      S.drag = null;
      if (S.doc !== before) { S.hist = ns.history.push(S.hist, before); S.lastLabel = label; }
      emit('doc');
    }

    /** Drops a drag and puts the document back. */
    function cancelLive() {
      if (!S.drag) return;
      S.doc = S.drag;
      S.drag = null;
      emit('doc');
    }

    function undo() {
      if (S.drag) return false;
      const r = ns.history.undo(S.hist, S.doc);
      if (!r) return false;
      S.hist = r.h; S.doc = r.doc; tidy(); emit('doc');
      return true;
    }
    function redo() {
      if (S.drag) return false;
      const r = ns.history.redo(S.hist, S.doc);
      if (!r) return false;
      S.hist = r.h; S.doc = r.doc; tidy(); emit('doc');
      return true;
    }

    /** Replaces the whole document (open a project, import a config). One undo step. */
    function replace(next, label) {
      if (S.drag) S.drag = null;
      S.hist = ns.history.push(S.hist, S.doc);
      S.doc = next;
      S.lastLabel = label;
      S.playhead = 0;
      S.range = null;
      S.sel = { layer: null, keys: [], fx: null };
      tidy();
      emit('doc');
    }

    /** Sets the playhead to a time, snapped to a frame and kept inside the composition. */
    function seek(t) {
      const p = ns.core.snap(S.doc.comp, Math.min(S.doc.comp.duration, Math.max(0, Number.isFinite(t) ? t : 0)));
      if (p === S.playhead) return;
      S.playhead = Math.min(p, S.doc.comp.duration);
      emit('time');
    }
    function select(patch) {
      Object.assign(S.sel, patch);
      tidy();
      emit('sel');
    }
    function setRange(r) { S.range = r; emit('view'); }
    function setLoop(on) { S.loop = !!on; emit('view'); }
    function setFile(f) { S.file = { ...S.file, ...f }; emit('view'); }

    Object.assign(S, { edit, live, commitLive, cancelLive, undo, redo, replace, seek, select, setRange, setLoop, setFile, tidy });
    S.on = (fn) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; };
    S.emit = emit;
    S.isDragging = () => !!S.drag;
    S.canUndo = () => !S.drag && S.hist.past.length > 0;
    S.canRedo = () => !S.drag && S.hist.future.length > 0;
    return S;
  }

  ns.state = { create };
})(typeof window !== 'undefined' ? window : globalThis);
