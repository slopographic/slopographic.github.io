/* Slop Press — app state, revisions and undo history (JSON snapshots; assets are shared, never snapshotted). */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, M = PR.model;

  var S = PR.state = {
    doc: null,          // the open document
    rev: 0,             // bumps on every change (layout + render caches key off it)
    sel: [],            // selected item ids
    page: 0,            // current page index (or the master page being edited, see editMaster)
    editMaster: null,   // { id, side } when editing a master spread
    tool: 'select',
    text: null,         // text editing: { frame, story, caret, anchor }
    dirty: false,
    fileName: null
  };

  /* ---------- history ---------- */
  var H = PR.history = { undo: [], redo: [], max: 120 };
  function snap() {
    var d = S.doc, assets = d.assets; d.assets = null;
    var s = JSON.stringify({ doc: d, sel: S.sel, page: S.page, editMaster: S.editMaster });
    d.assets = assets;
    return s;
  }
  var last = null;
  /** Resets history to the current document (after open/new). */
  H.reset = function () { H.undo = []; H.redo = []; last = snap(); };
  /** Records a change. Call after mutating S.doc. merge: coalesce with the previous step if same label (typing). */
  H.commit = function (label, merge) {
    var cur = snap();
    if (cur === last) { PR.touch(); return; }
    var top = H.undo[H.undo.length - 1];
    if (merge && top && top.label === label && top.merge && Date.now() - top.t < 1500) { top.t = Date.now(); }
    else { H.undo.push({ label: label, state: last, t: Date.now(), merge: !!merge }); if (H.undo.length > H.max) H.undo.shift(); }
    H.redo = []; last = cur;
    S.dirty = true;
    PR.touch();
    PR.emit('commit', label);
  };
  function restore(json) {
    var o = JSON.parse(json), assets = S.doc.assets;
    o.doc.assets = assets; S.doc = o.doc; S.sel = o.sel || []; S.page = Math.min(o.page || 0, S.doc.pages.length - 1); S.editMaster = o.editMaster || null;
    S.text = null; last = json;
    PR.styles.invalidate(); PR.touch(); PR.emit('doc', 'history');
  }
  H.doUndo = function () { var e = H.undo.pop(); if (!e) return false; H.redo.push({ label: e.label, state: last }); restore(e.state); return e.label; };
  H.doRedo = function () { var e = H.redo.pop(); if (!e) return false; H.undo.push({ label: e.label, state: last, t: 0 }); restore(e.state); return e.label; };
  H.canUndo = function () { return H.undo.length > 0; };
  H.canRedo = function () { return H.redo.length > 0; };

  /** Marks the document changed (re-layout + redraw on the next frame). */
  PR.touch = function () { S.rev++; PR.emit('change', S.rev); };

  /** Replaces the open document. */
  PR.setDoc = function (doc, opts) {
    opts = opts || {};
    S.doc = M.normalize(doc); S.sel = []; S.page = 0; S.editMaster = null; S.text = null;
    S.dirty = !!opts.dirty; S.fileName = opts.fileName || null;
    S.driveId = null; // the Slop Drive record this document is linked to (set by hub.js), if any
    PR.styles.invalidate();
    H.reset(); PR.touch(); PR.emit('doc', 'open');
  };

  /** The item list currently being edited: the current page's, or a master page's. */
  PR.activeItems = function () {
    var d = S.doc;
    if (S.editMaster) { var m = M.findMaster(d, S.editMaster.id); if (m) return m.pages[Math.min(S.editMaster.side, m.pages.length - 1)].items; }
    return (d.pages[S.page] || d.pages[0]).items;
  };
  PR.selected = function () {
    return S.sel.map(function (id) { var f = M.findItem(S.doc, id); return f && f.item; }).filter(Boolean);
  };
  PR.select = function (ids) { S.sel = [].concat(ids || []).filter(Boolean); PR.emit('select', S.sel); PR.touch(); };
  void U;
})();
