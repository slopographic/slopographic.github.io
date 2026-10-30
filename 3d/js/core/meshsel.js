/* Slop 3D mesh element selection (pure). A selection is { mode, ids } where mode is 'vertex' | 'edge' | 'face' and ids
 * is a Set of vertex indices, edge keys ('a-b', a < b) or face indices. Only visible (not hidden) faces take part.
 * Picks take screen points: pts[v] = [x, y] in pixels, or null when the vertex is behind the camera.
 * Sets window.Slop3D.meshsel. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const MH = S.mesh;
  const MODES = ['vertex', 'edge', 'face'];
  const empty = (mode = 'vertex') => ({ mode, ids: new Set() });
  const parseKey = (k) => k.split('-').map(Number);

  /** Every visible element of a mode (vertex indices, edge keys or face indices). */
  function elements(m, mode) {
    const out = new Set();
    m.faces.forEach((f, fi) => {
      if (f.hide) return;
      if (mode === 'face') out.add(fi);
      else if (mode === 'vertex') f.v.forEach((v) => out.add(v));
      else MH.keysOf(f.v).forEach((k) => out.add(k));
    });
    return out;
  }
  /** The vertex indices behind a selection (a face or edge brings its corners). */
  function vertsOf(m, sel) {
    const out = new Set();
    if (sel.mode === 'vertex') for (const v of sel.ids) out.add(v);
    else if (sel.mode === 'edge') for (const k of sel.ids) parseKey(k).forEach((v) => out.add(v));
    else for (const f of sel.ids) if (m.faces[f]) m.faces[f].v.forEach((v) => out.add(v));
    return out;
  }
  /** The selection's elements as a mode of its own (select all, invert). */
  const selectAll = (m, mode) => ({ mode, ids: elements(m, mode) });
  function invert(m, sel) {
    const all = elements(m, sel.mode), ids = new Set();
    for (const x of all) if (!sel.ids.has(x)) ids.add(x);
    return { mode: sel.mode, ids };
  }
  /** Converts a selection to another mode. Finer-to-coarser takes every element touched; coarser-to-finer takes
   * every element whose parts are all selected (Blender's rule). */
  function convert(m, sel, to) {
    const from = sel.mode, ids = new Set();
    if (from === to) return { mode: to, ids: new Set(sel.ids) };
    if (to === 'vertex') { vertsOf(m, sel).forEach((v) => ids.add(v)); return { mode: to, ids }; }
    if (to === 'edge') {
      if (from === 'face') {
        for (const f of sel.ids) if (m.faces[f]) MH.keysOf(m.faces[f].v).forEach((k) => ids.add(k));
      } else {
        for (const [k, e] of MH.edgeMap(m)) if (e.faces.some((f) => !m.faces[f].hide) && sel.ids.has(e.a) && sel.ids.has(e.b)) ids.add(k);
      }
      return { mode: to, ids };
    }
    m.faces.forEach((f, fi) => {   // to face
      if (f.hide) return;
      const parts = from === 'vertex' ? f.v : MH.keysOf(f.v);
      if (parts.length && parts.every((p) => sel.ids.has(p))) ids.add(fi);
    });
    return { mode: to, ids };
  }
  /** The edge loop through an edge: walks across quads, straight through each one's opposite edge, both ways. */
  function loop(m, startKey) {
    const em = MH.edgeMap(m), out = new Set([startKey]), start = em.get(startKey);
    if (!start) return out;
    const vis = (f) => !m.faces[f].hide;
    for (const f0 of start.faces.filter(vis)) {
      let ek = startKey, face = f0;
      for (let guard = 0; guard < m.faces.length + 2; guard++) {
        const v = m.faces[face].v;
        if (v.length !== 4) break;
        const i = MH.keysOf(v).indexOf(ek);
        if (i < 0) break;
        const next = MH.key(v[(i + 2) % 4], v[(i + 3) % 4]);
        if (next === startKey) break;
        out.add(next);
        const other = (em.get(next) || { faces: [] }).faces.filter((f) => vis(f) && f !== face);
        if (!other.length) break;
        ek = next; face = other[0];
      }
    }
    return out;
  }
  /** Nearest vertex within r pixels among ids, or null. */
  function nearestVertex(pts, ids, x, y, r) {
    let best = null, bd = r * r;
    for (const v of ids) {
      const p = pts[v];
      if (!p) continue;
      const d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
      if (d <= bd) { bd = d; best = v; }
    }
    return best;
  }
  /** Distance from point to segment, squared. */
  function segDist2(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
  }
  /** Nearest edge key within r pixels, or null. */
  function nearestEdge(pts, keys, x, y, r) {
    let best = null, bd = r * r;
    for (const k of keys) {
      const [a, b] = parseKey(k);
      if (!pts[a] || !pts[b]) continue;
      const d = segDist2([x, y], pts[a], pts[b]);
      if (d <= bd) { bd = d; best = k; }
    }
    return best;
  }
  /** Nearest face by its centre (screen) within r pixels; used when the picker has no triangle hit. */
  function nearestFaceCentre(m, pts, x, y, r) {
    let best = null, bd = r * r;
    m.faces.forEach((f, fi) => {
      if (f.hide) return;
      const c = [0, 0];
      let n = 0;
      for (const v of f.v) if (pts[v]) { c[0] += pts[v][0]; c[1] += pts[v][1]; n++; }
      if (!n) return;
      const d = (c[0] / n - x) ** 2 + (c[1] / n - y) ** 2;
      if (d <= bd) { bd = d; best = fi; }
    });
    return best;
  }
  /** The elements of one mode whose screen position lies in box { x0, y0, x1, y1 } (x0 < x1, y0 < y1). */
  function inBox(m, mode, pts, box) {
    const inside = (p) => !!p && p[0] >= box.x0 && p[0] <= box.x1 && p[1] >= box.y0 && p[1] <= box.y1;
    const out = new Set();
    if (mode === 'vertex') { for (const v of elements(m, 'vertex')) if (inside(pts[v])) out.add(v); }
    else if (mode === 'edge') { for (const k of elements(m, 'edge')) { const [a, b] = parseKey(k); if (inside(pts[a]) && inside(pts[b])) out.add(k); } }
    else {
      m.faces.forEach((f, fi) => {
        if (f.hide) return;
        const c = [0, 0];
        let n = 0;
        for (const v of f.v) if (pts[v]) { c[0] += pts[v][0]; c[1] += pts[v][1]; n++; }
        if (n && inside([c[0] / n, c[1] / n])) out.add(fi);
      });
    }
    return out;
  }

  S.meshsel = { MODES, empty, parseKey, elements, vertsOf, selectAll, invert, convert, loop, nearestVertex, nearestEdge, nearestFaceCentre, inBox };
})();
