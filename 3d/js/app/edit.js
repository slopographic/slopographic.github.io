/* Slop 3D mesh edit mode (app): which mesh is being edited, its element mode and selection, and the commit path.
 * Every mesh change replaces the node's geom through commit, so undo and redo work per operation, and a transform
 * gesture (sess = begin()) is one undo step however many moves it had. Selection is session state only.
 * Sets window.Slop3D.edit. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const st = S.state, s = st.s, A = S.actions, O = S.ops, MH = S.mesh, SEL = S.meshsel, MO = S.meshops, MX = S.meshxf, X = S.xform;
  const ed = (s.edit = { id: null, mode: 'vertex', sel: SEL.empty('vertex'), info: '' });
  const toast = (m) => { if (window.SlopUI) SlopUI.toast(m); };
  const t = S.t;
  const ERR = { delete_all: '3d.edit.err_delete_all', merge_all: '3d.edit.err_merge_all', fill_loop: '3d.edit.err_fill_loop' };
  let sessions = 0;

  const node = () => (ed.id && s.doc.nodes[ed.id]) || null;
  const active = () => { const n = node(); return !!(n && n.type === 'mesh' && n.geom.kind === 'mesh'); };
  const mesh = () => MH.fromGeom(node().geom);
  const emit = () => st.emit('edit');
  /** Replaces the edited node's geom. Returns the commit result (false when nothing changed). */
  function store(m, key = null) {
    const next = O.setField(s.doc, ed.id, 'geom', MH.toGeom(m));
    return next ? A.commit(next, key) : false;
  }
  /** Drops selected ids that no longer exist (after undo, redo or a delete from elsewhere). */
  function clampSel(m, sel) {
    const ids = new Set();
    for (const x of sel.ids) {
      if (sel.mode === 'vertex' && x < m.pos.length) ids.add(x);
      else if (sel.mode === 'face' && m.faces[x]) ids.add(x);
      else if (sel.mode === 'edge') { const [a, b] = SEL.parseKey(x); if (a < m.pos.length && b < m.pos.length) ids.add(x); }
    }
    return { mode: sel.mode, ids };
  }
  function exit() {
    if (!ed.id) return;
    ed.id = null;
    ed.sel = SEL.empty(ed.mode);
    ed.info = '';
    emit();
  }
  /** Enters edit mode on a mesh (primitives are baked into an editable mesh first, as one undo step). */
  function enter(id = st.primary()) {
    const n = id && s.doc.nodes[id];
    if (!n || n.type !== 'mesh') { toast(t('3d.edit.pick_mesh')); return false; }
    if (ed.id !== id) exit();
    if (n.geom.kind !== 'mesh') A.commit(O.setField(s.doc, id, 'geom', MH.toGeom(MH.bake(n.geom))));
    ed.id = id;
    ed.sel = SEL.empty(ed.mode);
    st.select([id]);
    emit();
    return true;
  }
  const toggle = () => (ed.id ? (exit(), true) : enter());
  function setMode(mode) {
    if (!active() || !SEL.MODES.includes(mode)) return false;
    ed.sel = SEL.convert(mesh(), ed.sel, mode);
    ed.mode = mode;
    emit();
    return true;
  }
  /** Changes the selection with a set of ids: how is 'replace', 'add', 'toggle' or 'sub'. */
  function setSelection(ids, how = 'replace') {
    const cur = how === 'replace' ? new Set() : new Set(ed.sel.ids);
    for (const x of ids) {
      if (how === 'toggle') { if (cur.has(x)) cur.delete(x); else cur.add(x); }
      else if (how === 'sub') cur.delete(x);
      else cur.add(x);
    }
    ed.sel = { mode: ed.mode, ids: cur };
    emit();
  }
  /** Selects the edge loops through the given edge keys (switches to edge mode). */
  function loopSelect(keys, how = 'replace') {
    if (!active()) return false;
    setMode('edge');
    const m = mesh(), all = new Set();
    for (const k of keys) for (const x of SEL.loop(m, k)) all.add(x);
    setSelection(all, how);
    return true;
  }
  const selectAll = () => { if (active()) { ed.sel = SEL.selectAll(mesh(), ed.mode); emit(); } };
  const invert = () => { if (active()) { ed.sel = SEL.invert(mesh(), ed.sel); emit(); } };
  const clear = () => { ed.sel = SEL.empty(ed.mode); emit(); };
  const hasSel = () => ed.sel.ids.size > 0;
  const asFaces = (m, sel) => SEL.convert(m, sel, 'face');

  /** Runs a mesh operation on the selection and stores the result. fn(mesh, sel) → { mesh, sel } | null | { error }. */
  function run(label, fn, key = null) {
    if (!active()) return false;
    const r = fn(mesh(), ed.sel);
    if (!r) { toast(t('3d.edit.nothing_to_do', { op: t(label) })); return false; }
    if (r.error) { toast(ERR[r.code] ? t(ERR[r.code]) : r.error); return false; }
    store(r.mesh, key);
    ed.sel = r.sel;
    ed.mode = r.sel.mode;
    emit();
    return true;
  }
  /** The average normal of the selected faces, in world space (for constraining an extrude). */
  function worldNormal() {
    const m = mesh(), F = [...asFaces(m, ed.sel).ids];
    const n = [0, 0, 0];
    for (const f of F) { const a = MH.areaVec(m.pos, m.faces[f].v); for (let k = 0; k < 3; k++) n[k] += a[k]; }
    const W = S.model.worldMatrix(s.doc, ed.id);
    const u = X.normalApply(X.normalMatrix(W), MH.unit(n));
    return MH.len(u) > 0 ? u : null;
  }
  /** A transform gesture on the selected elements. apply(A) moves the vertices from where they were when the gesture
   * began (A is a world-space matrix), so each call replaces the last and the gesture is one undo step. */
  function begin() {
    if (!active() || !hasSel()) return null;
    const W = S.model.worldMatrix(s.doc, ed.id), start = mesh(), verts = SEL.vertsOf(start, ed.sel);
    if (!verts.size) return null;
    const key = 'edit-' + (++sessions);
    return {
      pivot: X.point(W, MX.centre(start, verts)),
      apply(world) { const L = MX.toLocal(W, world); return L ? store(MX.apply(start, verts, L), key) : false; },
    };
  }
  /** World pivot of the selection (where the gizmo sits), or null. */
  function pivot() {
    if (!active() || !hasSel()) return null;
    const m = mesh(), v = SEL.vertsOf(m, ed.sel);
    return v.size ? X.point(S.model.worldMatrix(s.doc, ed.id), MX.centre(m, v)) : null;
  }
  function setInfo(msg) { ed.info = msg || ''; emit(); }

  st.on('doc', () => {
    if (!ed.id) return;
    if (!active()) { exit(); return; }
    ed.sel = clampSel(mesh(), ed.sel);
    emit();
  });
  st.on('sel', () => { if (ed.id && !s.sel.includes(ed.id)) exit(); });

  S.edit = {
    active, node, mesh, sel: () => ed.sel, mode: () => ed.mode, info: () => ed.info, hasSel, setInfo,
    enter, exit, toggle, setMode, setSelection, loopSelect, selectAll, invert, clear, run,
    extrude: () => run('3d.edit.op_extrude', (m, sel) => MO.extrude(m, asFaces(m, sel))),
    remove: () => run('3d.edit.op_delete', (m, sel) => MO.remove(m, sel)),
    subdivide: () => run('3d.edit.op_subdivide', (m, sel) => MO.subdivide(m, asFaces(m, sel))),
    mergeCentre: () => run('3d.edit.op_merge', (m, sel) => MO.mergeCentre(m, sel)),
    mergeByDistance: (tol = 0.0001) => run('3d.edit.op_merge_dist', (m, sel) => MO.mergeByDistance(m, sel, tol)),
    flip: () => run('3d.edit.op_flip', (m, sel) => MO.flip(m, asFaces(m, sel))),
    fill: () => run('3d.edit.op_fill', (m, sel) => MO.fill(m, sel)),
    hide: () => run('3d.edit.op_hide', (m, sel) => MO.hide(m, sel)),
    reveal: () => run('3d.edit.op_reveal', (m) => MO.reveal(m)),
    worldNormal, begin, pivot,
  };
})();
