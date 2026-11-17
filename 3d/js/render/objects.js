/* Slop 3D objects: turns the scene document into three.js objects under stage.world and keeps them in step.
 * sync(doc, { selected }) is cheap to call after every change: objects are created, updated or removed by node id,
 * geometry is rebuilt only when a shape changes, and selection outlines are redrawn. Meshes and light markers carry
 * userData.nodeId, which picking reads. Sets window.Slop3D.objects. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const D = Math.PI / 180;

  function toGeometry(THREE, g) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3));
    if (g.normals) geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.normals, 3));
    if (g.uvs) geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(g.indices), 1));
    if (!g.normals) geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }
  /** A change key for a shape: its parameters for primitives, a checksum over every value for meshes (edits move single vertices). */
  function geomKey(node) {
    const g = node.geom;
    if (g.kind !== 'mesh') return JSON.stringify(g);
    let sum = 0;
    const p = g.positions;
    for (let i = 0; i < p.length; i++) sum += p[i] * (1 + (i % 7) * 0.13);
    const idx = g.indices;
    for (let i = 0; i < idx.length; i++) sum += idx[i] * (1 + (i % 5) * 0.07);
    return `mesh:${p.length}:${idx.length}:${(g.faces || []).length}:${(g.hidden || []).length}:${sum}`;
  }

  /** create(THREE, world, requestRender): world is the stage's group for document objects. */
  function create(THREE, world, requestRender = () => {}) {
    const items = new Map(); // node id → { obj, kind, key, mesh?, marker? }
    const ui = new THREE.Group();
    ui.name = 'selection';
    world.parent.add(ui);
    const markerGeo = new THREE.OctahedronGeometry(0.12, 0);

    function meshFor(node, it) {
      if (!it.mesh) {
        it.mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
        it.mesh.userData.nodeId = node.id;
        it.obj.add(it.mesh);
      }
      const key = geomKey(node);
      if (it.key !== key) {
        it.mesh.geometry.dispose();
        it.mesh.geometry = toGeometry(THREE, S.geometry.build(node.geom));
        it.key = key;
      }
      const m = node.material, mat = it.mesh.material;
      mat.color.set(m.color);
      mat.roughness = m.roughness;
      mat.metalness = m.metallic;
      mat.opacity = m.opacity;
      mat.transparent = m.opacity < 1;
      if (m.map && mat.userData.map !== m.map) {
        mat.userData.map = m.map;
        new THREE.TextureLoader().load(m.map, (t) => { t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.needsUpdate = true; requestRender(); });
      } else if (!m.map && mat.map) { mat.map = null; mat.userData.map = null; mat.needsUpdate = true; }
    }
    function lightFor(node, it) {
      const L = node.light;
      if (!it.lit) {
        it.obj.removeFromParent();
        it.lit = true;
        it.obj = new THREE.Group();
        it.obj.userData.nodeId = node.id;
        it.light = L.kind === 'ambient' ? new THREE.AmbientLight() : new THREE.DirectionalLight();
        if (it.light.isDirectionalLight) { it.light.target.position.set(0, 0, 0); world.add(it.light.target); }
        it.obj.add(it.light);
        it.marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ wireframe: true }));
        it.marker.userData.nodeId = node.id;
        it.obj.add(it.marker);
      }
      it.light.color.set(L.color);
      it.light.intensity = L.intensity;
      it.marker.material.color.set(L.color);
    }
    function removeItem(id) {
      const it = items.get(id);
      if (!it) return;
      if (it.light && it.light.isDirectionalLight) world.remove(it.light.target);
      it.obj.removeFromParent();
      if (it.mesh) { it.mesh.geometry.dispose(); it.mesh.material.dispose(); }
      items.delete(id);
    }
    const objOf = (id, doc) => (doc.nodes[id] && doc.nodes[id].parent && items.get(doc.nodes[id].parent) ? items.get(doc.nodes[id].parent).obj : world);

    /** Creates, updates or removes objects so they match doc. opts: { selected: array of ids }. */
    function sync(doc, opts = {}) {
      const alive = new Set(Object.keys(doc.nodes));
      for (const id of [...items.keys()]) if (!alive.has(id)) removeItem(id);
      for (const id of alive) {
        const node = doc.nodes[id];
        const kind = node.type;
        let it = items.get(id);
        if (it && it.kind !== kind) { removeItem(id); it = null; }
        if (!it) {
          it = { obj: new THREE.Group(), kind, key: null, lit: false };
          it.obj.userData.nodeId = id;
          items.set(id, it);
        }
        if (kind === 'light') lightFor(node, it);
        else if (kind === 'mesh') meshFor(node, it);
        const p = node.transform.p, r = node.transform.r, s = node.transform.s;
        it.obj.position.set(p[0], p[1], p[2]);
        it.obj.rotation.set(r[0] * D, r[1] * D, r[2] * D, 'XYZ');
        it.obj.scale.set(s[0], s[1], s[2]);
        it.obj.visible = node.visible;
      }
      // Attach every object under its parent's object (parents are listed before their children in outliner order).
      for (const id of alive) {
        const it = items.get(id), parentObj = objOf(id, doc);
        if (it.obj.parent !== parentObj) parentObj.add(it.obj);
      }
      ui.clear();
      for (const id of opts.selected || []) {
        const it = items.get(id);
        if (it && alive.has(id)) ui.add(new THREE.BoxHelper(it.obj, 0xffb020));
      }
      return items;
    }
    /** Every pickable object (meshes and light markers) that is visible. */
    function pickables() {
      const out = [];
      for (const it of items.values()) {
        if (it.mesh) out.push(it.mesh);
        if (it.marker) out.push(it.marker);
      }
      return out.filter((o) => { for (let c = o; c; c = c.parent) if (c.visible === false) return false; return true; });
    }
    function dispose() { for (const id of [...items.keys()]) removeItem(id); ui.clear(); }
    return { sync, pickables, items, dispose };
  }

  S.objects = { create, toGeometry, geomKey };
})();
