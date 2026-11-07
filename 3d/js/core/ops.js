/* Slop 3D scene operations (pure): each takes a scene and returns a NEW scene (or null when refused).
 * Transforms are local (relative to the parent), so a group moves its children with it. World-preserving
 * moves (reparent, group, ungroup) rewrite local transforms so nothing jumps on screen.
 * Sets window.Slop3D.ops. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const X = S.xform, M = S.model;

  /** The ids in `ids` that have no selected ancestor (their subtrees move with them). */
  function topLevel(s, ids) {
    const set = new Set(ids.filter((id) => s.nodes[id]));
    return [...set].filter((id) => {
      for (let p = s.nodes[id].parent; p; p = s.nodes[p] ? s.nodes[p].parent : null) if (set.has(p)) return false;
      return true;
    });
  }

  /** Moves id under parent (null = root) at index, keeping its world transform. Mutates s (a clone). */
  function reparentIn(s, id, parent, index) {
    const n = s.nodes[id];
    const W = M.worldMatrix(s, id);
    const Pw = parent ? M.worldMatrix(s, parent) : X.identity();
    const inv = X.invert(Pw);
    const L = inv ? X.mul(inv, W) : W;
    const t = X.decompose(L);
    n.transform = { p: t.p, r: t.r, s: t.s };
    M.detach(s, id);
    M.attach(s, id, parent, index);
  }

  /** Moves nodes under a group (or root) keeping world transforms. Null when it would make a cycle. */
  function reparent(scene, id, parent, index = -1) {
    const s = M.clone(scene);
    // ids can come from a drag that started on another page: only the scene's own nodes count (never __proto__)
    if (!Object.hasOwn(s.nodes, id)) return null;
    if (parent && (!Object.hasOwn(s.nodes, parent) || s.nodes[parent].type !== 'group' || M.isWithin(s, parent, id))) return null;
    reparentIn(s, id, parent, index);
    return s;
  }

  /** Copies the selected top-level nodes (and their subtrees) right after the originals. */
  function duplicate(scene, ids) {
    const s = M.clone(scene);
    const out = [];
    const copy = (oldId, parent) => {
      const src = s.nodes[oldId];
      s.seq += 1;
      const id = 'n' + s.seq;
      const n = Object.assign(M.clone(src), { id, parent });
      s.nodes[id] = n;
      if (src.children) n.children = src.children.map((c) => copy(c, id));
      return id;
    };
    for (const id of topLevel(s, ids)) {
      const parent = s.nodes[id].parent;
      const newId = copy(id, parent);
      const list = M.siblingsOf(s, parent);
      list.splice(list.indexOf(id) + 1, 0, newId);
      out.push(newId);
    }
    return { scene: s, ids: out };
  }

  /** Wraps the selected top-level nodes in a new group at the first one's place. */
  function group(scene, ids) {
    const s = M.clone(scene);
    const top = topLevel(s, ids);
    if (!top.length) return null;
    const parent = s.nodes[top[0]].parent;
    const g = M.makeNode(s, { type: 'group', name: 'Group' }); // i18n-ignore: object names: scene content
    s.nodes[g.id] = g;
    g.parent = parent;
    const list = M.siblingsOf(s, parent);
    list.splice(list.indexOf(top[0]), 0, g.id);
    for (const id of top) reparentIn(s, id, g.id, -1);
    return { scene: s, id: g.id };
  }

  /** Dissolves a group: its children take its place (world transforms kept). */
  function ungroup(scene, id) {
    const s = M.clone(scene);
    const g = s.nodes[id];
    if (!g || g.type !== 'group') return null;
    const parent = g.parent;
    let at = M.siblingsOf(s, parent).indexOf(id);
    for (const c of [...g.children]) reparentIn(s, c, parent, at++);
    M.detach(s, id);
    delete s.nodes[id];
    return s;
  }

  /** Sets one field by dotted path, e.g. 'name', 'visible', 'transform.p.0', 'material.color', 'light.intensity'. */
  function setField(scene, id, path, value) {
    const s = M.clone(scene);
    const node = s.nodes[id];
    if (!node) return null;
    const keys = String(path).split('.');
    let obj = node;
    for (const k of keys.slice(0, -1)) { obj = obj[k]; if (obj === undefined || obj === null) return null; }
    obj[keys[keys.length - 1]] = value;
    return s;
  }

  /** Moves the top-level selected nodes by a WORLD-space delta [x, y, z]. */
  function moveBy(scene, ids, d) {
    const s = M.clone(scene);
    for (const id of topLevel(s, ids)) {
      const n = s.nodes[id];
      const inv = n.parent ? X.invert(M.worldMatrix(s, n.parent)) : X.identity();
      const ld = inv ? X.dir(inv, d) : d;
      n.transform.p = n.transform.p.map((v, i) => X.r9(v + ld[i]));
    }
    return s;
  }

  /** Adds a tree { type, name, transform?, geom?, material?, light?, children? } under parent. Returns { scene, id }. */
  function importTree(scene, tree, parent = null, index = -1) {
    const s = M.clone(scene);
    const build = (t, par, at) => {
      const n = M.makeNode(s, t);
      n.parent = par;
      s.nodes[n.id] = n;
      M.attach(s, n.id, par, at);
      (t.children || []).forEach((c) => build(c, n.id, -1));
      return n.id;
    };
    const id = build(tree, parent && s.nodes[parent] && s.nodes[parent].type === 'group' ? parent : null, index);
    return { scene: s, id };
  }

  /** World-space bounding box of the visible meshes under ids (or all of them). { min, max } or null. */
  function bounds(scene, ids = null) {
    const want = ids && ids.length ? new Set(ids.flatMap((i) => M.subtree(scene, i))) : null;
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    let any = false;
    for (const id of Object.keys(scene.nodes)) {
      const n = scene.nodes[id];
      if (n.type !== 'mesh' || (want && !want.has(id)) || !visibleChain(scene, id)) continue;
      const g = S.geometry.build(n.geom), W = M.worldMatrix(scene, id), p = g.positions;
      for (let i = 0; i < p.length; i += 3) {
        const q = X.point(W, [p[i], p[i + 1], p[i + 2]]);
        for (let k = 0; k < 3; k++) { if (q[k] < min[k]) min[k] = q[k]; if (q[k] > max[k]) max[k] = q[k]; }
        any = true;
      }
    }
    return any ? { min, max } : null;
  }
  /** False when the node or one of its ancestors is hidden. */
  function visibleChain(scene, id) {
    for (let c = id; c; c = scene.nodes[c] ? scene.nodes[c].parent : null) if (scene.nodes[c] && !scene.nodes[c].visible) return false;
    return true;
  }

  S.ops = { topLevel, reparent, duplicate, group, ungroup, setField, moveBy, importTree, bounds, visibleChain };
})();
