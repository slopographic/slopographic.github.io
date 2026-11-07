/* SlopFaces groups: the people. Faces are grouped by their embeddings (recognize.js): a face joins the nearest group
 * whose centroid is within the cosine distance threshold, otherwise it starts a new group. The result is a plain state
 *   { groups: [{ id, name }], assign: { ref: groupId }, out: { ref: true }, seq }
 * where ref names one face ('<scope>:<picture id>#<index>'). out marks a face the person said is NOT in its group; it is
 * never grouped again by itself. manual marks the faces the person placed (move, split, merge, not-this-person); a
 * regroup leaves them alone. Every function here is pure: it returns a new state and does not touch the page, the
 * store or the clock, so the same faces and the same state always give the same groups. Merge, move, split and
 * not-this-person are the edits; history() keeps the states so each edit can be undone. Classic script; adds to
 * window.SlopFaces.groups. */
(function (g) {
  'use strict';
  const F = (g.SlopFaces = g.SlopFaces || {});
  const G = (F.groups = F.groups || {});
  const HISTORY_MAX = 50;

  G.empty = () => ({ groups: [], assign: {}, out: {}, manual: {}, seq: 0 });
  const copy = (s) => ({ groups: s.groups.map((x) => ({ id: x.id, name: x.name })), assign: Object.assign({}, s.assign), out: Object.assign({}, s.out), manual: Object.assign({}, s.manual || {}), seq: s.seq || 0 });
  const nameOf = (s, id) => { const x = s.groups.find((q) => q.id === id); return x ? x.name : null; };
  G.has = (s, id) => s.groups.some((q) => q.id === id);

  /** Drops empty groups (keeping `keep`), and the assignments of faces that no longer exist (refs not in `live`). */
  function tidy(s, live) {
    if (live) for (const r of Object.keys(s.assign)) if (!live.has(r)) delete s.assign[r];
    if (live) for (const r of Object.keys(s.out)) if (!live.has(r)) delete s.out[r];
    if (live) for (const r of Object.keys(s.manual)) if (!live.has(r)) delete s.manual[r];
    const used = new Set(Object.values(s.assign));
    s.groups = s.groups.filter((x) => used.has(x.id));
    return s;
  }
  /** Keeps a state in step with the faces that exist now: removes what is gone. Pass the set of live refs. */
  G.prune = (s, refs) => tidy(copy(s), new Set(refs));

  /** Unit-length mean of the embeddings of some faces (null when none has one). */
  function centroid(vecs) {
    if (!vecs.length) return null;
    const n = vecs[0].length, c = new Array(n).fill(0);
    for (const v of vecs) for (let i = 0; i < n; i++) c[i] += v[i];
    const norm = Math.sqrt(c.reduce((t, x) => t + x * x, 0)) || 1;
    return c.map((x) => x / norm);
  }
  /** Nearest candidate within the threshold: { id, d } or null. Ties go to the earlier candidate. */
  function nearest(cands, vec, threshold) {
    let best = null;
    for (const c of cands) {
      const d = F.cosineDistance(c.cen, vec);
      if (d <= threshold && (!best || d < best.d)) best = { id: c.id, d };
    }
    return best;
  }

  /** Groups the faces that have no group yet. faces: [{ ref, emb }] in any order (they are sorted by ref first, so the
   * result does not depend on the order the pictures were checked in). Faces already in a group keep it; faces marked
   * out stay out. threshold: the cosine distance a face may be from a group's centroid to join it. Returns a new state. */
  G.cluster = function (state, faces, threshold = 0.4) {
    const s = copy(state);
    const withEmb = faces.filter((f) => f && f.emb && f.emb.length).slice().sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
    const emb = new Map(withEmb.map((f) => [f.ref, f.emb]));
    tidy(s, new Set(faces.map((f) => f.ref)));
    // Centroids of the groups as they are now.
    const byGroup = new Map(s.groups.map((x) => [x.id, []]));
    for (const [r, gid] of Object.entries(s.assign)) if (emb.has(r) && byGroup.has(gid)) byGroup.get(gid).push(emb.get(r));
    let cands = s.groups.map((x) => ({ id: x.id, cen: centroid(byGroup.get(x.id)) })).filter((c) => c.cen);
    const pending = [];
    for (const f of withEmb) {
      if (s.assign[f.ref] || s.out[f.ref]) continue;
      const hit = nearest(cands, f.emb, threshold);
      if (hit) { s.assign[f.ref] = hit.id; byGroup.get(hit.id).push(f.emb); const c = cands.find((x) => x.id === hit.id); c.cen = centroid(byGroup.get(hit.id)); }
      else pending.push(f);
    }
    // Faces with no group near them start groups, in order; a later face joins a group started earlier in this pass.
    for (const f of pending) {
      const hit = nearest(cands, f.emb, threshold);
      if (hit) { s.assign[f.ref] = hit.id; byGroup.get(hit.id).push(f.emb); const c = cands.find((x) => x.id === hit.id); c.cen = centroid(byGroup.get(hit.id)); continue; }
      s.seq += 1;
      const id = 'p' + s.seq;
      s.groups.push({ id, name: '' });
      byGroup.set(id, [f.emb]);
      cands.push({ id, cen: centroid([f.emb]) });
      s.assign[f.ref] = id;
    }
    return s;
  };

  /** Regroup: the automatic groups are rebuilt from the embeddings at this threshold. Faces that were moved, split, merged
   * or marked not-this-person keep their place (manual). Returns a new state. */
  G.regroup = function (s, faces, threshold = 0.4) {
    const t = copy(s);
    for (const r of Object.keys(t.assign)) if (!t.manual[r]) delete t.assign[r];
    return G.cluster(tidy(t), faces, threshold);
  };

  /** Members of a group, in ref order. */
  G.members = (s, id) => Object.keys(s.assign).filter((r) => s.assign[r] === id).sort();
  /** The groups in order, with their faces: [{ id, name, refs }]. Groups without faces are not listed. */
  G.list = (s) => s.groups.map((x) => ({ id: x.id, name: x.name, refs: G.members(s, x.id) })).filter((x) => x.refs.length);

  /** Merge: every face of `drop` goes to `keep`, and `drop` is gone. name (optional) becomes keep's name. The faces of
   * both groups are marked manual, so a regroup keeps the merge. */
  G.merge = function (s, keep, drop, name) {
    if (keep === drop || !G.has(s, keep) || !G.has(s, drop)) return s;
    const t = copy(s);
    for (const r of Object.keys(t.assign)) if (t.assign[r] === drop || t.assign[r] === keep) t.manual[r] = true;
    for (const r of Object.keys(t.assign)) if (t.assign[r] === drop) t.assign[r] = keep;
    if (typeof name === 'string') t.groups.find((x) => x.id === keep).name = name.trim();
    t.groups = t.groups.filter((x) => x.id !== drop);
    return t;
  };
  /** Move: the faces (refs) go to group `to`. A face that was marked not-this-person is put back. */
  G.move = function (s, refs, to) {
    if (!G.has(s, to)) return s;
    const t = copy(s);
    for (const r of refs) { delete t.out[r]; t.assign[r] = to; t.manual[r] = true; }
    return tidy(t);
  };
  /** Split: the faces (refs) go to a new group, named (optional). Returns { state, id }. */
  G.split = function (s, refs, name = '') {
    const t = copy(s);
    t.seq += 1;
    const id = 'p' + t.seq;
    t.groups.push({ id, name: String(name || '').trim() });
    for (const r of refs) { delete t.out[r]; t.assign[r] = id; t.manual[r] = true; }
    return { state: tidy(t), id };
  };
  /** Not this person: the faces leave their group and are not grouped again by themselves. */
  G.notThis = function (s, refs) {
    const t = copy(s);
    for (const r of refs) { delete t.assign[r]; t.out[r] = true; t.manual[r] = true; }
    return tidy(t);
  };
  /** Renames a group. */
  G.rename = function (s, id, name) {
    if (!G.has(s, id)) return s;
    const t = copy(s);
    t.groups.find((x) => x.id === id).name = String(name || '').trim();
    return t;
  };

  /** The undo history: push the state before each edit; undo() returns the state to go back to (or null). */
  G.history = function () {
    const stack = [];
    return {
      push(s) { stack.push(s); if (stack.length > HISTORY_MAX) stack.shift(); },
      undo() { return stack.length ? stack.pop() : null; },
      get size() { return stack.length; },
      clear() { stack.length = 0; },
    };
  };
  G.nameOf = nameOf;
})(typeof window !== 'undefined' ? window : globalThis);
