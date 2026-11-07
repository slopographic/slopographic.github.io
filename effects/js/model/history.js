// Slop Effects undo and redo: a stack of whole-document snapshots. Every edit is one step (a drag is one step when it ends).
// Documents are never mutated, so a snapshot is the document as it was. Pure. Classic script: window.SlopEffects.history.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const LIMIT = 200;

  /** A new history. */
  const create = () => ({ past: [], future: [] });

  /** The history after an edit: the document before it goes on the undo stack, and the redo stack is cleared. */
  function push(h, before) {
    return { past: h.past.concat([before]).slice(-LIMIT), future: [] };
  }

  /** Undo: { h, doc } with the document from before the last edit, or null when there is nothing to undo. */
  function undo(h, current) {
    if (!h.past.length) return null;
    const doc = h.past[h.past.length - 1];
    return { h: { past: h.past.slice(0, -1), future: [current].concat(h.future).slice(0, LIMIT) }, doc };
  }

  /** Redo: { h, doc }, or null when there is nothing to redo. */
  function redo(h, current) {
    if (!h.future.length) return null;
    const [doc, ...rest] = h.future;
    return { h: { past: h.past.concat([current]).slice(-LIMIT), future: rest }, doc };
  }

  ns.history = { create, push, undo, redo, LIMIT };
})(typeof window !== 'undefined' ? window : globalThis);
