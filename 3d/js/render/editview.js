/* Slop 3D mesh edit overlay: vertices (dots), edges (lines) and the selected faces (a tinted fill) of the mesh being
 * edited. The overlay is a child of the object's own three.js group, so it follows the object's transform. Hidden
 * faces are not drawn. sync(parent, mesh, sel) rebuilds it; clear() removes it. Sets window.Slop3D.editview. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const ORANGE = [1, 0.69, 0.125], DIM = [0.9, 0.91, 0.92], EDGE = [0.6, 0.63, 0.67];

  /** create(THREE) → { sync, clear }. */
  function create(THREE) {
    let root = null;
    const pointMat = new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, depthTest: false, transparent: true });
    const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.85 });
    const faceMat = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const geo = (pos, col) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return g;
    };
    function clear() {
      if (!root) return;
      root.removeFromParent();
      root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      root = null;
    }
    function sync(parent, m, sel) {
      clear();
      if (!parent || !m) return;
      const MH = S.mesh, SEL = S.meshsel;
      root = new THREE.Group();
      root.name = 'mesh-edit';
      parent.add(root);
      const used = new Set(), edges = new Map(), faces = [];
      m.faces.forEach((f, fi) => {
        if (f.hide) return;
        f.v.forEach((v) => used.add(v));
        for (const k of MH.keysOf(f.v)) if (!edges.has(k)) edges.set(k, SEL.parseKey(k));
        if (sel.mode === 'face' && sel.ids.has(fi)) faces.push(fi);
      });
      const pp = [], pc = [];
      for (const v of [...used].sort((a, b) => a - b)) {
        pp.push(...m.pos[v]);
        pc.push(...(sel.mode === 'vertex' && sel.ids.has(v) ? ORANGE : DIM));
      }
      if (pp.length) { const p = new THREE.Points(geo(pp, pc), pointMat); p.renderOrder = 3; root.add(p); }
      const lp = [], lc = [];
      for (const [k, [a, b]] of edges) {
        const c = sel.mode === 'edge' && sel.ids.has(k) ? ORANGE : EDGE;
        lp.push(...m.pos[a], ...m.pos[b]);
        lc.push(...c, ...c);
      }
      if (lp.length) { const l = new THREE.LineSegments(geo(lp, lc), lineMat); l.renderOrder = 2; root.add(l); }
      const fp = [];
      for (const fi of faces) {
        const v = m.faces[fi].v;
        for (let k = 1; k < v.length - 1; k++) for (const i of [v[0], v[k], v[k + 1]]) fp.push(...m.pos[i]);
      }
      if (fp.length) { const f = new THREE.Mesh(geo(fp), faceMat); f.renderOrder = 1; root.add(f); }
    }
    return { sync, clear };
  }

  S.editview = { create };
})();
