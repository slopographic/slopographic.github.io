/* Slop 3D actions: every change to the document goes through commit(), which pushes it into the undo history.
 * Each action builds a new scene with the pure ops (core/ops.js) and returns true when something changed.
 * Keys merge consecutive edits into one undo step (a field being typed, a drag, a run of arrow nudges).
 * Sets window.Slop3D.actions. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const M = S.model, O = S.ops, st = S.state, s = st.s;
  let dragNo = 0;

  /** Makes doc the current document (in history, with the selection kept to nodes that still exist). */
  function commit(doc, key = null) {
    if (!doc) return false;
    if (JSON.stringify(doc) === JSON.stringify(s.doc)) return false;
    s.doc = doc;
    s.sel = s.sel.filter((id) => doc.nodes[id]);
    s.history.record(doc, key);
    s.file.dirty = true;
    st.emit('doc', key);
    st.emit('sel');
    return true;
  }
  function restore(snap) {
    if (!snap) return false;
    s.doc = snap;
    s.sel = s.sel.filter((id) => snap.nodes[id]);
    s.file.dirty = true;
    st.emit('doc', null);
    st.emit('sel');
    return true;
  }
  const undo = () => restore(s.history.undo());
  const redo = () => restore(s.history.redo());

  /** Adds a preset (cube, sphere…, sun, ambient, group) at the origin, or under a group, and selects it. */
  function add(kind, parent = null) {
    const spec = M.presetSpec(kind);
    if (!spec) return null;
    const r = M.addNode(s.doc, spec, parent, -1);
    commit(r.scene);
    st.select([r.id]);
    return r.id;
  }
  function importTree(tree, parent = null) {
    const r = O.importTree(s.doc, tree, parent, -1);
    commit(r.scene);
    st.select([r.id]);
    return r.id;
  }
  /** Adds several import trees (scene3d config objects, ops.importTree shape) as roots, in one undo step. */
  function addTrees(trees) {
    let doc = s.doc;
    const ids = trees.map((t) => { const r = O.importTree(doc, t, null, -1); doc = r.scene; return r.id; });
    commit(doc);
    st.select(ids);
    return ids;
  }
  function remove(ids = s.sel) {
    if (!ids.length) return false;
    const ok = commit(M.removeNodes(s.doc, ids));
    st.select([]);
    return ok;
  }
  function duplicate(ids = s.sel) {
    const r = O.duplicate(s.doc, ids);
    if (!r.ids.length) return false;
    commit(r.scene);
    st.select(r.ids);
    return true;
  }
  function group(ids = s.sel) {
    const r = O.group(s.doc, ids);
    if (!r) return false;
    commit(r.scene);
    st.select([r.id]);
    return true;
  }
  function ungroup(id = st.primary()) {
    const n = id && s.doc.nodes[id];
    if (!n || n.type !== 'group') return false;
    const kids = n.children.slice();
    const next = O.ungroup(s.doc, id);
    if (!next) return false;
    commit(next);
    st.select(kids);
    return true;
  }
  function reparent(id, parent, index = -1) {
    const next = O.reparent(s.doc, id, parent, index);
    if (!next) return false;
    return commit(next);
  }
  function setField(id, path, value, key = null) {
    const next = O.setField(s.doc, id, path, value);
    return next ? commit(next, key || `field:${id}:${path}`) : false;
  }
  /** Moves the selection by a world delta. A drag id keeps one gesture to one undo step. */
  function move(delta, key = 'nudge') {
    const next = O.moveBy(s.doc, s.sel, delta);
    return commit(next, key);
  }
  /** One drag gesture (for the gizmo): call once at pointer down, then drag() for each move. */
  const beginDrag = () => { dragNo += 1; return 'drag' + dragNo; };
  function setSnap(step) { s.snapStep = Math.max(0, +step || 0); st.emit('snap'); }
  function nudge(axis, sign, big = false) {
    const step = s.snapStep > 0 ? s.snapStep : 0.1;
    const d = [0, 0, 0];
    d[axis] = sign * step * (big ? 10 : 1);
    return move(d, 'nudge');
  }
  /** Shows or hides several nodes in one undo step. */
  function setVisible(ids, on) {
    let d = s.doc;
    for (const id of [].concat(ids)) d = O.setField(d, id, 'visible', !!on) || d;
    return commit(d, null);
  }

  S.actions = { commit, undo, redo, add, importTree, addTrees, remove, duplicate, group, ungroup, reparent, setField, move, beginDrag, setSnap, nudge, setVisible, restore };
})();
