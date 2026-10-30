/* SlopCut: the current document, edits and undo/redo (snapshot based; the media bin is not undone).
   SE.doc            the current project
   SE.change(label, fn, { key })   snapshot, run fn(doc), notify. Same key within 900 ms coalesces (drags, sliders).
   SE.history.undo() / redo() / canUndo() / canRedo() / labels */
(function () {
  'use strict';
  const SE = window.SE, M = SE.model;
  const H = SE.history = { undoStack: [], redoStack: [], max: 200 };
  let lastKey = null, lastTime = 0;

  function state(p) { const s = M.snapshot(p); delete s.media; return s; }
  function apply(s) {
    const media = SE.doc.media;
    SE.doc = M.normalize(Object.assign(JSON.parse(JSON.stringify(s)), { media }));
  }
  /** Take a snapshot before a mutation. */
  H.begin = function (label, key) {
    const now = performance.now();
    if (key && key === lastKey && now - lastTime < 900 && H.undoStack.length) { lastTime = now; return; }
    H.undoStack.push({ label, s: state(SE.doc) });
    if (H.undoStack.length > H.max) H.undoStack.shift();
    H.redoStack.length = 0;
    lastKey = key || null; lastTime = now;
  };
  H.breakCoalescing = () => { lastKey = null; };
  H.canUndo = () => H.undoStack.length > 0;
  H.canRedo = () => H.redoStack.length > 0;
  H.undoLabel = () => (H.undoStack.length ? H.undoStack[H.undoStack.length - 1].label : '');
  H.redoLabel = () => (H.redoStack.length ? H.redoStack[H.redoStack.length - 1].label : '');
  H.undo = function () {
    const e = H.undoStack.pop(); if (!e) return false;
    H.redoStack.push({ label: e.label, s: state(SE.doc) });
    apply(e.s); lastKey = null;
    SE.emit('change', { label: SE.util.t('ui.undo_what', { what: e.label }), history: true });
    return true;
  };
  H.redo = function () {
    const e = H.redoStack.pop(); if (!e) return false;
    H.undoStack.push({ label: e.label, s: state(SE.doc) });
    apply(e.s); lastKey = null;
    SE.emit('change', { label: SE.util.t('ui.redo_what', { what: e.label }), history: true });
    return true;
  };
  H.reset = function () { H.undoStack.length = 0; H.redoStack.length = 0; lastKey = null; };

  SE.doc = M.newProject();
  /** Mutate the document as one undoable step. fn may return false to cancel (snapshot is dropped). */
  SE.change = function (label, fn, opts = {}) {
    const before = H.undoStack.length, redo = H.redoStack.slice();
    H.begin(label, opts.key);
    let r;
    try { r = fn(SE.doc); } catch (e) { if (H.undoStack.length > before) H.undoStack.pop(); H.redoStack.push(...redo); throw e; }
    if (r === false) { if (H.undoStack.length > before) H.undoStack.pop(); H.redoStack.length = 0; H.redoStack.push(...redo); return r; }
    SE.emit('change', { label });
    return r;
  };
  /** Replace the whole document (open/new/restore): clears history. */
  SE.setDoc = function (p) {
    SE.doc = M.normalize(p); H.reset();
    SE.emit('doc', {}); SE.emit('change', { label: SE.util.t('slopedit.io.open'), history: true });
  };
})();
