/* Slop 3D mesh render arrays (pure). A mesh with polygon faces is drawn with flat faces where the surface bends
 * (more than 35 degrees between neighbouring faces) and smooth where it does not. Corners are split per face, so
 * positions, normals and indices here are render data only: the stored geom keeps the welded vertices.
 * build(geom) → { positions, normals, indices, triFace } where triFace[t] is the face each triangle belongs to.
 * Sets window.Slop3D.meshrender. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const CREASE = Math.cos(35 * Math.PI / 180);

  function build(geom) {
    const m = S.mesh.fromGeom(geom), U = S.mesh.unit, dot = S.mesh.dot;
    const area = [], vf = new Map(), vis = [];
    m.faces.forEach((f, fi) => {
      if (f.hide) return;
      vis.push(fi);
      area[fi] = S.mesh.areaVec(m.pos, f.v);
      for (const v of f.v) { if (!vf.has(v)) vf.set(v, []); vf.get(v).push(fi); }
    });
    const positions = [], normals = [], indices = [], triFace = [];
    for (const fi of vis) {
      const v = m.faces[fi].v, n0 = U(area[fi]), base = positions.length / 3;
      for (const vi of v) {
        const acc = [0, 0, 0];
        for (const g of vf.get(vi)) {
          if (dot(n0, U(area[g])) < CREASE) continue;
          for (let k = 0; k < 3; k++) acc[k] += area[g][k];
        }
        const n = U(acc);
        positions.push(m.pos[vi][0], m.pos[vi][1], m.pos[vi][2]);
        normals.push(...(S.mesh.len(n) > 0 ? n : [0, 1, 0]));
      }
      for (let k = 1; k < v.length - 1; k++) { indices.push(base, base + k, base + k + 1); triFace.push(fi); }
    }
    return { positions, normals, indices, triFace };
  }

  S.meshrender = { build, CREASE };
})();
