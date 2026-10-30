/* Slop 3D mesh edit operations (pure). Each takes a working mesh (mesh.js) and a selection (meshsel.js) and returns
 * { mesh, sel } with the new selection, or null when there is nothing to do, or { error, code } when refused (the app
 * shows the code's words, 3d/i18n). The input is
 * never changed. Vertices nobody uses any more are removed before returning, and the selection follows them.
 * Sets window.Slop3D.meshops. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const MH = S.mesh, SEL = S.meshsel;
  const visibleFaces = (m, sel) => [...sel.ids].filter((f) => m.faces[f] && !m.faces[f].hide);

  /** Compacts the mesh and carries the selection's vertex and edge ids across. */
  function finish(m, sel) {
    const c = MH.compact(m), ids = new Set();
    for (const x of sel.ids) {
      if (sel.mode === 'vertex') { if (c.map[x] >= 0) ids.add(c.map[x]); }
      else if (sel.mode === 'edge') { const [a, b] = SEL.parseKey(x); if (c.map[a] >= 0 && c.map[b] >= 0) ids.add(MH.key(c.map[a], c.map[b])); }
      else ids.add(x);
    }
    return { mesh: c.mesh, sel: { mode: sel.mode, ids } };
  }
  /** Mean of the vertices in a list (a new array). */
  const meanOf = (pos, list) => { const c = [0, 0, 0]; for (const v of list) for (let k = 0; k < 3; k++) c[k] += pos[v][k] / list.length; return c; };

  /** Extrude the selected faces: the region gets new copies of its vertices, moved by dist along the region's average
   * normal, and a side quad closes every edge on the region's boundary. Selection stays on the moved faces. */
  function extrude(m, sel, dist = 0) {
    const F = visibleFaces(m, sel);
    if (!F.length) return null;
    const dirs = new Set(), n = [0, 0, 0];
    for (const f of F) {
      const v = m.faces[f].v;
      v.forEach((a, k) => dirs.add(a + '>' + v[(k + 1) % v.length]));
      const a = MH.areaVec(m.pos, v);
      for (let k = 0; k < 3; k++) n[k] += a[k];
    }
    const nrm = MH.unit(n), pos = m.pos.map((p) => p.slice()), copy = new Map();
    for (const f of F) for (const v of m.faces[f].v) {
      if (copy.has(v)) continue;
      copy.set(v, pos.length);
      pos.push(m.pos[v].map((c, k) => c + nrm[k] * dist));
    }
    const faces = m.faces.map((f) => ({ v: f.v.slice(), hide: f.hide }));
    for (const f of F) faces[f].v = faces[f].v.map((v) => copy.get(v));
    for (const f of F) {
      const v = m.faces[f].v;
      v.forEach((a, k) => {
        const b = v[(k + 1) % v.length];
        if (!dirs.has(b + '>' + a)) faces.push({ v: [a, b, copy.get(b), copy.get(a)], hide: false });
      });
    }
    return finish({ pos, faces }, { mode: 'face', ids: new Set(F) });
  }

  /** Deletes what the selection touches: vertices and edges take the faces that use them, faces go. Hidden faces stay. */
  function remove(m, sel) {
    let kill;
    if (sel.mode === 'face') kill = (fi) => sel.ids.has(fi);
    else if (sel.mode === 'vertex') kill = (fi) => m.faces[fi].v.some((v) => sel.ids.has(v));
    else kill = (fi) => MH.keysOf(m.faces[fi].v).some((k) => sel.ids.has(k));
    const keep = m.faces.map((f, fi) => f.hide || !kill(fi));
    if (!keep.some(Boolean)) return { error: 'That would delete every face. Delete the object instead.', code: 'delete_all' }; // i18n-ignore: the app shows the code's words (3d/i18n)
    if (keep.every(Boolean)) return null;
    const faces = m.faces.filter((f, fi) => keep[fi]).map((f) => ({ v: f.v.slice(), hide: f.hide }));
    return finish({ pos: m.pos, faces }, { mode: sel.mode, ids: new Set() });
  }

  /** Subdivides each selected face once into quads: a centre point plus the midpoints of its edges. Neighbours that
   * share an edge get that midpoint too, so nothing cracks. The new quads are selected. */
  function subdivide(m, sel) {
    const F = new Set(visibleFaces(m, sel));
    if (!F.size) return null;
    const pos = m.pos.map((p) => p.slice()), mid = new Map();
    for (const f of F) MH.keysOf(m.faces[f].v).forEach((k) => {
      if (mid.has(k)) return;
      const [a, b] = SEL.parseKey(k);
      mid.set(k, pos.length);
      pos.push([0, 1, 2].map((c) => (pos[a][c] + pos[b][c]) / 2));
    });
    const out = [], ids = new Set();
    m.faces.forEach((f, fi) => {
      const v = f.v, n = v.length;
      if (F.has(fi)) {
        const ci = pos.length;
        pos.push(meanOf(pos, v));
        for (let k = 0; k < n; k++) {
          ids.add(out.length);
          out.push({ v: [v[k], mid.get(MH.key(v[k], v[(k + 1) % n])), ci, mid.get(MH.key(v[(k - 1 + n) % n], v[k]))], hide: f.hide });
        }
        return;
      }
      const grown = [];
      for (let k = 0; k < n; k++) {
        grown.push(v[k]);
        const mk = mid.get(MH.key(v[k], v[(k + 1) % n]));
        if (mk !== undefined) grown.push(mk);
      }
      out.push({ v: grown, hide: f.hide });
    });
    return finish({ pos, faces: out }, { mode: 'face', ids });
  }

  /** Collapses each group of vertices to one point at the group's centre. Faces that lose a corner shrink. */
  function collapse(m, groups, sel) {
    const pos = m.pos.map((p) => p.slice()), rep = new Map();
    for (const g of groups) {
      if (g.length < 2) continue;
      pos[g[0]] = meanOf(m.pos, g);
      for (const v of g) rep.set(v, g[0]);
    }
    if (!rep.size) return null;
    const map = (v) => (rep.has(v) ? rep.get(v) : v);
    const faces = [];
    for (const f of m.faces) {
      const v = [];
      for (const x of f.v) { const y = map(x); if (v[v.length - 1] !== y) v.push(y); }
      while (v.length > 1 && v[0] === v[v.length - 1]) v.pop();
      if (v.length >= 3) faces.push({ v, hide: f.hide });
    }
    if (!faces.length) return { error: 'That merge would delete every face. Merge fewer vertices.', code: 'merge_all' }; // i18n-ignore: the app shows the code's words (3d/i18n)
    const ids = new Set([...sel.ids].map(map));
    return finish({ pos, faces }, { mode: 'vertex', ids });
  }
  /** Merge the selected vertices at their centre (M). */
  function mergeCentre(m, sel) {
    const V = [...SEL.vertsOf(m, sel)];
    return V.length < 2 ? null : collapse(m, [V], { mode: 'vertex', ids: new Set(V) });
  }
  /** Merge selected vertices that lie closer than tol to each other (clusters of any size). */
  function mergeByDistance(m, sel, tol) {
    const V = [...SEL.vertsOf(m, sel)], parent = new Map();
    const find = (v) => { while (parent.get(v) !== v) v = parent.get(v); return v; };
    V.forEach((v) => parent.set(v, v));
    for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
      const a = V[i], b = V[j];
      if (MH.len([m.pos[a][0] - m.pos[b][0], m.pos[a][1] - m.pos[b][1], m.pos[a][2] - m.pos[b][2]]) < tol) parent.set(find(b), find(a));
    }
    const groups = new Map();
    for (const v of V) { const r = find(v); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(v); }
    return collapse(m, [...groups.values()], { mode: 'vertex', ids: new Set(V) });
  }
  /** Reverses the winding of the selected faces (their normals flip). */
  function flip(m, sel) {
    const F = new Set(visibleFaces(m, sel));
    if (!F.size) return null;
    const faces = m.faces.map((f, fi) => ({ v: F.has(fi) ? f.v.slice().reverse() : f.v.slice(), hide: f.hide }));
    return finish({ pos: m.pos, faces }, { mode: 'face', ids: F });
  }
  /** A face from a single closed loop of selected vertices or edges, wound to match the faces beside it. */
  function fill(m, sel) {
    let edges;
    if (sel.mode === 'edge') edges = [...sel.ids];
    else if (sel.mode === 'vertex') {
      const V = sel.ids;
      edges = [...MH.edgeMap(m).keys()].filter((k) => { const [a, b] = SEL.parseKey(k); return V.has(a) && V.has(b); });
    } else return null;
    const adj = new Map(), link = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
    for (const k of edges) { const [a, b] = SEL.parseKey(k); link(a, b); link(b, a); }
    if (adj.size < 3 || [...adj.values()].some((l) => l.length !== 2)) return { error: 'Fill needs one closed loop of edges or vertices.', code: 'fill_loop' }; // i18n-ignore: the app shows the code's words (3d/i18n)
    const start = adj.keys().next().value, cyc = [start];
    let prev = -1, cur = start;
    for (;;) {
      const nx = adj.get(cur)[0] === prev ? adj.get(cur)[1] : adj.get(cur)[0];
      if (nx === start) break;
      if (cyc.length > adj.size) return { error: 'Fill needs one closed loop of edges or vertices.', code: 'fill_loop' }; // i18n-ignore: the app shows the code's words (3d/i18n)
      cyc.push(nx);
      prev = cur;
      cur = nx;
    }
    if (cyc.length !== adj.size) return { error: 'Fill needs one closed loop of edges or vertices.', code: 'fill_loop' }; // i18n-ignore: the app shows the code's words (3d/i18n)
    // Orientation: a neighbour already walks each shared edge one way, so the new face walks it the other way.
    const em = MH.edgeMap(m);
    let same = 0, opp = 0;
    cyc.forEach((x, i) => {
      const y = cyc[(i + 1) % cyc.length];
      for (const f of (em.get(MH.key(x, y)) || { faces: [] }).faces) {
        if (m.faces[f].hide) continue;
        const v = m.faces[f].v;
        v.forEach((a, k) => {
          const b = v[(k + 1) % v.length];
          if (a === x && b === y) same++;
          else if (a === y && b === x) opp++;
        });
      }
    });
    const loopV = same > opp ? cyc.slice().reverse() : cyc;
    const faces = m.faces.map((f) => ({ v: f.v.slice(), hide: f.hide }));
    faces.push({ v: loopV, hide: false });
    return finish({ pos: m.pos, faces }, { mode: 'face', ids: new Set([faces.length - 1]) });
  }
  /** Hides the faces the selection touches (faces hidden in place, so their ids stay). */
  function hide(m, sel) {
    const faces = m.faces.map((f, fi) => {
      let hit = false;
      if (!f.hide) {
        if (sel.mode === 'face') hit = sel.ids.has(fi);
        else if (sel.mode === 'vertex') hit = f.v.some((v) => sel.ids.has(v));
        else hit = MH.keysOf(f.v).some((k) => sel.ids.has(k));
      }
      return { v: f.v.slice(), hide: f.hide || hit };
    });
    if (faces.every((f, i) => f.hide === m.faces[i].hide)) return null;
    return finish({ pos: m.pos, faces }, { mode: sel.mode, ids: new Set() });
  }
  /** Shows every hidden face again and selects them. */
  function reveal(m) {
    const shown = new Set();
    const faces = m.faces.map((f, fi) => { if (f.hide) shown.add(fi); return { v: f.v.slice(), hide: false }; });
    if (!shown.size) return null;
    return finish({ pos: m.pos, faces }, { mode: 'face', ids: shown });
  }

  S.meshops = { extrude, remove, subdivide, mergeCentre, mergeByDistance, flip, fill, hide, reveal, finish };
})();
