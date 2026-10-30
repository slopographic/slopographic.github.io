/* Slop 3D scene model (pure, JSON-only). A scene is plain data, so it saves, undoes and tests as-is:
 *   { format: 'slop-3d', version: 1, name, seq, background, roots: [id…], nodes: { id: Node } }
 *   Node = { id, type: 'mesh' | 'group' | 'light', name, visible, parent: id | null,
 *            transform: { p: [x,y,z], r: [x,y,z] degrees, s: [x,y,z] },
 *            geom, material            (mesh only)
 *            children: [id…]           (group only)
 *            light: { kind: 'directional' | 'ambient', color, intensity }   (light only) }
 * Functions here never mutate their input: they return a new scene. Sets window.Slop3D.model. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const X = S.xform;
  const FORMAT = 'slop-3d', VERSION = 1;
  const TYPES = ['mesh', 'group', 'light'];
  const LIGHT_KINDS = ['directional', 'ambient'];
  const clone = (v) => JSON.parse(JSON.stringify(v));

  const transform = (p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => ({ p: p.slice(), r: r.slice(), s: s.slice() });
  const material = (o = {}) => Object.assign({ color: o.color || '#c9c3b6', roughness: o.roughness ?? 0.55, metallic: o.metallic ?? 0, opacity: o.opacity ?? 1 }, o.map ? { map: String(o.map) } : {});
  const local = (n) => X.fromTRS(n.transform.p, n.transform.r, n.transform.s);

  function emptyScene(name = 'Untitled') {
    return { format: FORMAT, version: VERSION, name, seq: 0, background: '#1d1e22', roots: [], nodes: {} };
  }
  /** A new scene starts with a sun and an ambient light, so a first object is lit. */
  function defaultScene(name) {
    let r = addNode(emptyScene(name), { type: 'light', name: 'Sun', light: { kind: 'directional', color: '#fff4e0', intensity: 2.2 }, transform: transform([3, 5, 4]) }); // i18n-ignore: object names: scene content
    r = addNode(r.scene, { type: 'light', name: 'Ambient', light: { kind: 'ambient', color: '#ffffff', intensity: 0.6 } }); // i18n-ignore: object names: scene content
    return r.scene;
  }
  const nextId = (scene) => { scene.seq += 1; return 'n' + scene.seq; };

  /** Builds a node object (not yet in any scene). spec: { type, name, transform, geom, material, light, visible } */
  function makeNode(scene, spec) {
    const type = TYPES.includes(spec.type) ? spec.type : 'group';
    const n = { id: nextId(scene), type, name: String(spec.name || type), visible: spec.visible !== false, parent: null, transform: transform(spec.transform?.p, spec.transform?.r, spec.transform?.s) };
    if (type === 'mesh') { n.geom = spec.geom && spec.geom.kind === 'mesh' ? clone(spec.geom) : S.geometry.normalize(spec.geom); n.material = material(spec.material); }
    if (type === 'group') n.children = [];
    if (type === 'light') n.light = Object.assign({ kind: 'directional', color: '#ffffff', intensity: 1 }, clone(spec.light || {}));
    return n;
  }
  /** The child-id list that holds id's siblings (roots or the parent's children). */
  const siblingsOf = (s, parentId) => (parentId ? s.nodes[parentId].children : s.roots);

  /** Adds a node under parent (null = root) at index (-1 = end). Returns { scene, id }. */
  function addNode(scene, spec, parent = null, index = -1) {
    const s = clone(scene);
    if (parent && (!s.nodes[parent] || s.nodes[parent].type !== 'group')) parent = null;
    const n = makeNode(s, spec);
    n.parent = parent;
    s.nodes[n.id] = n;
    const list = siblingsOf(s, parent);
    if (index < 0 || index > list.length) list.push(n.id); else list.splice(index, 0, n.id);
    return { scene: s, id: n.id };
  }

  /** Depth-first list of { id, depth } in outliner order. */
  function flatten(scene) {
    const out = [];
    const walk = (ids, depth) => ids.forEach((id) => {
      const n = scene.nodes[id];
      if (!n) return;
      out.push({ id, depth });
      if (n.children) walk(n.children, depth + 1);
    });
    walk(scene.roots, 0);
    return out;
  }
  /** The id plus every id below it. */
  function subtree(scene, id) {
    const out = [];
    const walk = (i) => { const n = scene.nodes[i]; if (!n) return; out.push(i); (n.children || []).forEach(walk); };
    walk(id);
    return out;
  }
  /** True when `ancestor` is `id` or sits above it. */
  function isWithin(scene, id, ancestor) {
    for (let cur = id; cur; cur = scene.nodes[cur] ? scene.nodes[cur].parent : null) if (cur === ancestor) return true;
    return false;
  }
  /** Removes the nodes and everything below them. */
  function removeNodes(scene, ids) {
    const s = clone(scene);
    const gone = new Set();
    for (const id of ids) if (s.nodes[id]) subtree(s, id).forEach((x) => gone.add(x));
    for (const id of gone) {
      const n = s.nodes[id];
      if (gone.has(n.parent)) continue;   // its parent's list is dropped with the parent
      const list = siblingsOf(s, n.parent);
      const at = list.indexOf(id);
      if (at >= 0) list.splice(at, 1);
    }
    for (const id of gone) delete s.nodes[id];
    return s;
  }
  /** Removes id from its parent list without deleting it (keeps the node object). */
  function detach(s, id) {
    if (!Object.hasOwn(s.nodes, id)) return;
    const n = s.nodes[id];
    const list = siblingsOf(s, n.parent);
    const at = list.indexOf(id);
    if (at >= 0) list.splice(at, 1);
    n.parent = null;
  }
  /** Puts an already-detached node under parent (null = root) at index. */
  function attach(s, id, parent, index = -1) {
    if (!Object.hasOwn(s.nodes, id)) return;
    const n = s.nodes[id];
    n.parent = parent;
    const list = siblingsOf(s, parent);
    if (index < 0 || index > list.length) list.push(id); else list.splice(index, 0, id);
  }

  /** Local matrix of a node, and its world matrix (parents applied, outermost last). */
  const localMatrix = (scene, id) => local(scene.nodes[id]);
  function worldMatrix(scene, id) {
    let m = local(scene.nodes[id]);
    for (let cur = scene.nodes[id].parent; cur; cur = scene.nodes[cur].parent) m = X.mul(local(scene.nodes[cur]), m);
    return m;
  }

  /** Human label for the outliner and menus. */
  function typeLabel(n) {
    if (!n) return '';
    if (n.type === 'light') return n.light.kind === 'ambient' ? 'Ambient light' : 'Directional light';
    if (n.type === 'group') return 'Group';
    return n.geom.kind === 'mesh' ? 'Mesh' : (n.geom.kind[0].toUpperCase() + n.geom.kind.slice(1));
  }

  /** Presets used by Add menu and toolbar. */
  const PRESETS = {
    cube: { name: 'Cube', geom: { kind: 'cube' } }, sphere: { name: 'Sphere', geom: { kind: 'sphere' } }, // i18n-ignore: object names: scene content
    cylinder: { name: 'Cylinder', geom: { kind: 'cylinder' } }, cone: { name: 'Cone', geom: { kind: 'cone' } }, // i18n-ignore: object names: scene content
    torus: { name: 'Torus', geom: { kind: 'torus' } }, plane: { name: 'Plane', geom: { kind: 'plane' } }, // i18n-ignore: object names: scene content
    blob: { name: 'Blob', geom: { kind: 'blob' } }, // i18n-ignore: object names: scene content
  };
  function presetSpec(kind) {
    if (kind === 'directional' || kind === 'ambient') {
      return kind === 'ambient'
        ? { type: 'light', name: 'Ambient', light: { kind, color: '#ffffff', intensity: 0.6 } } // i18n-ignore: object names: scene content
        : { type: 'light', name: 'Sun', light: { kind, color: '#fff4e0', intensity: 2.2 }, transform: { p: [3, 5, 4] } }; // i18n-ignore: object names: scene content
    }
    if (kind === 'group') return { type: 'group', name: 'Group' }; // i18n-ignore: object names: scene content
    const p = PRESETS[kind];
    return p ? { type: 'mesh', name: p.name, geom: S.geometry.normalize(p.geom) } : null;
  }

  S.model = { FORMAT, VERSION, TYPES, LIGHT_KINDS, clone, transform, material, local, emptyScene, defaultScene, makeNode, addNode, siblingsOf, nextId,
    flatten, subtree, isWithin, removeNodes, detach, attach, localMatrix, worldMatrix, typeLabel, presetSpec, PRESETS };
})();
