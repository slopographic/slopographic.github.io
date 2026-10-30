/* Slop 3D editable mesh (pure). Working form: { pos: [[x,y,z]…], faces: [{ v: [i…], hide: bool }…] }, polygons over
 * welded vertices. Stored form (a geom with kind 'mesh'): positions (flat xyz), faces (polygon index lists, optional),
 * hidden (indices of faces that are not drawn, optional), indices (triangles of the visible faces, for readers that only
 * know triangles). Without faces every triangle of indices is one face (imported and older meshes).
 * Sets window.Slop3D.mesh. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const EPS = 1e-12;
  const key = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
  const rnd = (v) => Math.round(v * 1e9) / 1e9;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const l = len(a); return l > EPS ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };

  /** Newell area vector of a polygon: direction = winding normal, length = area. */
  function areaVec(pos, v) {
    const n = [0, 0, 0];
    for (let k = 0; k < v.length; k++) {
      const p = pos[v[k]], q = pos[v[(k + 1) % v.length]];
      n[0] += (p[1] - q[1]) * (p[2] + q[2]);
      n[1] += (p[2] - q[2]) * (p[0] + q[0]);
      n[2] += (p[0] - q[0]) * (p[1] + q[1]);
    }
    return n.map((x) => x / 2);
  }
  /** The working form of a stored mesh geom (never mutates it). */
  function fromGeom(g) {
    const pos = [];
    for (let i = 0; i < g.positions.length; i += 3) pos.push([g.positions[i], g.positions[i + 1], g.positions[i + 2]]);
    const hidden = new Set(g.hidden || []);
    let faces;
    if (Array.isArray(g.faces)) faces = g.faces.map((v, f) => ({ v: v.slice(), hide: hidden.has(f) }));
    else {
      faces = [];
      for (let i = 0; i < g.indices.length; i += 3) faces.push({ v: [g.indices[i], g.indices[i + 1], g.indices[i + 2]], hide: false });
    }
    return { pos, faces };
  }
  /** The stored form of a working mesh. Triangulates the visible faces into indices (fan from each first corner). */
  function toGeom(m) {
    const positions = [], indices = [], faces = [], hidden = [];
    for (const p of m.pos) positions.push(rnd(p[0]), rnd(p[1]), rnd(p[2]));
    m.faces.forEach((f, fi) => {
      faces.push(f.v.slice());
      if (f.hide) { hidden.push(fi); return; }
      for (let k = 1; k < f.v.length - 1; k++) indices.push(f.v[0], f.v[k], f.v[k + 1]);
    });
    const g = { kind: 'mesh', positions, indices, faces };
    if (hidden.length) g.hidden = hidden;
    return g;
  }
  /** True when every corner of polygon v turns the same way as normal n (a convex polygon). */
  function convex(pos, v, n) {
    for (let i = 0; i < v.length; i++) {
      const a = pos[v[(i + v.length - 1) % v.length]], b = pos[v[i]], c = pos[v[(i + 1) % v.length]];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (dot(cr, n) <= EPS) return false;
    }
    return true;
  }
  /** Joins triangle pairs that share an edge and lie in one plane into quads (a cube's faces come out as 6 quads). */
  function mergePairs(pos, tris) {
    const nrm = tris.map((v) => unit(areaVec(pos, v)));
    const dir = new Map();
    tris.forEach((v, t) => { for (let k = 0; k < 3; k++) dir.set(v[k] + '>' + v[(k + 1) % 3], t); });
    const used = new Array(tris.length).fill(false), out = [];
    tris.forEach((v, t) => {
      if (used[t]) return;
      used[t] = true;
      for (let k = 0; k < 3; k++) {
        const p = v[k], q = v[(k + 1) % 3], u = dir.get(q + '>' + p);
        if (u === undefined || used[u] || dot(nrm[t], nrm[u]) < 1 - 1e-9) continue;
        const quad = [q, v[(k + 2) % 3], p, tris[u].find((x) => x !== p && x !== q)];
        if (!convex(pos, quad, nrm[t])) continue;
        used[u] = true;
        out.push(quad);
        return;
      }
      out.push(v);
    });
    return out;
  }
  /** Turns a primitive (or any stored geom) into a welded working mesh with polygon faces. */
  function bake(geom) {
    const b = S.geometry.build(geom), P = b.positions, idOf = new Map(), pos = [], vmap = [];
    for (let i = 0; i < P.length / 3; i++) {
      const k = Math.round(P[3 * i] * 1e6) + ',' + Math.round(P[3 * i + 1] * 1e6) + ',' + Math.round(P[3 * i + 2] * 1e6);
      if (!idOf.has(k)) { idOf.set(k, pos.length); pos.push([P[3 * i], P[3 * i + 1], P[3 * i + 2]]); }
      vmap.push(idOf.get(k));
    }
    const tris = [];
    for (let t = 0; t < b.indices.length; t += 3) {
      const v = [vmap[b.indices[t]], vmap[b.indices[t + 1]], vmap[b.indices[t + 2]]];
      if (v[0] !== v[1] && v[1] !== v[2] && v[0] !== v[2] && len(areaVec(pos, v)) > EPS) tris.push(v);
    }
    return { pos, faces: mergePairs(pos, tris).map((v) => ({ v, hide: false })) };
  }
  /** Directed-edge map over every face: 'a-b' (a < b) → { a, b, faces: [face ids] }. */
  function edgeMap(m) {
    const e = new Map();
    m.faces.forEach((f, fi) => f.v.forEach((a, k) => {
      const b = f.v[(k + 1) % f.v.length], kk = key(a, b);
      let r = e.get(kk);
      if (!r) e.set(kk, (r = { a: Math.min(a, b), b: Math.max(a, b), faces: [] }));
      r.faces.push(fi);
    }));
    return e;
  }
  /** Removes unused vertices and renumbers. Returns { mesh, map } where map[old] is the new index or -1. */
  function compact(m) {
    const used = new Uint8Array(m.pos.length);
    for (const f of m.faces) for (const v of f.v) used[v] = 1;
    const map = new Array(m.pos.length).fill(-1), pos = [];
    m.pos.forEach((p, i) => { if (used[i]) { map[i] = pos.length; pos.push(p); } });
    return { mesh: { pos, faces: m.faces.map((f) => ({ v: f.v.map((v) => map[v]), hide: f.hide })) }, map };
  }
  const faceNormal = (m, f) => unit(areaVec(m.pos, m.faces[f].v));
  const faceCentre = (m, f) => { const v = m.faces[f].v, c = [0, 0, 0]; for (const i of v) for (let k = 0; k < 3; k++) c[k] += m.pos[i][k] / v.length; return c; };
  /** The edge keys of one polygon. */
  const keysOf = (v) => v.map((a, k) => key(a, v[(k + 1) % v.length]));

  S.mesh = { key, areaVec, unit, dot, len, fromGeom, toGeom, bake, edgeMap, compact, faceNormal, faceCentre, keysOf, mergePairs };
})();
