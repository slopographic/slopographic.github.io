/* SlopFaces people: the groups of faces for one app ('gallery' or 'drive'), kept on this device. It reads the faces the
 * detector and recogniser stored (cache.js), keeps only those of the pictures as they are now (the stamp matches), and
 * holds the groups (groups.js) in the store's 'people' record. Every edit (merge, move, split, not this person, rename)
 * is undoable in this session. Nothing is uploaded and no one is identified: a group is faces that look alike.
 * Usage: var P = SlopFaces.peopleFor('gallery', { stampOf: (id) => currentStampOrNull }); await P.load(); P.list() ...
 * Classic script; adds to window.SlopFaces: peopleFor(), threshold(). */
(function (g) {
  'use strict';
  const F = (g.SlopFaces = g.SlopFaces || {});
  const DEFAULT_THRESHOLD = 0.4;
  const instances = new Map();

  /** The same-person threshold, a cosine distance: from Settings (Profile), clamped to 0.2 to 0.8. */
  F.threshold = function () {
    try {
      const P = g.SlopProfile;
      const v = Number(P ? P.get('faces', 'threshold', DEFAULT_THRESHOLD) : DEFAULT_THRESHOLD);
      return Number.isFinite(v) ? Math.min(0.8, Math.max(0.2, v)) : DEFAULT_THRESHOLD;
    } catch (e) { return DEFAULT_THRESHOLD; }
  };

  /** The people of one scope. adapter.stampOf(id) gives the picture's current stamp, or null when it is gone. */
  F.peopleFor = function (scope, adapter) {
    if (instances.has(scope)) return instances.get(scope);
    const listeners = new Set();
    let state = F.groups.empty(), faces = [], loaded = false, saving = Promise.resolve();
    const hist = F.groups.history();
    const emit = () => { for (const fn of [...listeners]) try { fn(); } catch (e) { console.error(e); } };
    const ref = (id, i) => scope + ':' + id + '#' + i;
    const save = () => { saving = saving.then(() => F.cache.people.put(scope, { state })).catch(() => {}); return saving; };

    /** The faces of the pictures as they are now: a result counts only while the picture's stamp is the one it was made for. */
    async function readFaces() {
      const rows = await F.cache.all(scope);
      const out = [];
      for (const [id, row] of rows) {
        const stamp = adapter.stampOf(id);
        if (stamp == null || row.stamp !== String(stamp) || row.model !== F.MODEL_ID) continue;
        (row.faces || []).forEach((f, i) => out.push({ ref: ref(id, i), id, index: i, box: { x: f.x, y: f.y, w: f.w, h: f.h, score: f.score }, kps: f.kps || null, emb: f.emb || null }));
      }
      return out.sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
    }
    /** Re-reads the faces, drops what is gone and groups the new faces. Saves when the groups changed. */
    async function refresh() {
      faces = await readFaces();
      const before = JSON.stringify(state);
      state = F.groups.cluster(F.groups.prune(state, faces.map((f) => f.ref)), faces, F.threshold());
      if (JSON.stringify(state) !== before) await save();
      loaded = true;
      emit();
      return P;
    }
    /** Applies an edit: the state before it goes on the undo history. */
    function edit(next) {
      if (next === state) return false;
      hist.push(state);
      state = next;
      save();
      emit();
      return true;
    }
    const byId = () => new Map(faces.map((f) => [f.ref, f]));

    const P = {
      scope,
      get loaded() { return loaded; },
      /** Reads the stored groups and the faces, then groups what is new. */
      async load() {
        try { const rec = await F.cache.people.get(scope); if (rec && rec.state) state = rec.state; } catch (e) { /* start empty */ }
        return refresh();
      },
      /** Looks at the stored faces again (after a scan, Find faces, or a picture changed). */
      refresh,
      /** Rebuilds the automatic groups at the current threshold; the person's own edits stay. */
      regroup() { const before = state; state = F.groups.regroup(state, faces, F.threshold()); if (state !== before) { save(); emit(); } return P; },
      /** All faces: [{ ref, id, index, box, kps, emb }] (any group). */
      faces: () => faces.slice(),
      /** The faces of one picture, in index order. */
      facesOf: (id) => faces.filter((f) => f.id === id),
      /** The groups: [{ id, name, refs, faces }], in the order they were made. */
      list() {
        const m = byId();
        return F.groups.list(state).map((x) => ({ id: x.id, name: x.name, refs: x.refs, faces: x.refs.map((r) => m.get(r)).filter(Boolean) }));
      },
      /** The groups of the picture ids given: the group ids with a face in them. */
      groupsOfPictures(ids) { const set = new Set(ids); return P.list().filter((x) => x.faces.some((f) => set.has(f.id))); },
      /** The faces not in any group. */
      ungrouped: () => faces.filter((f) => !state.assign[f.ref] && !state.out[f.ref]),
      /** The faces marked not-this-person. */
      rejected: () => faces.filter((f) => state.out[f.ref]),
      has: (id) => F.groups.has(state, id),
      name: (id) => F.groups.nameOf(state, id) || '',
      merge: (keep, drop, name) => edit(F.groups.merge(state, keep, drop, name)),
      move: (refs, to) => edit(F.groups.move(state, refs, to)),
      split(refs, name) { const r = F.groups.split(state, refs, name); edit(r.state); return r.id; },
      notThis: (refs) => edit(F.groups.notThis(state, refs)),
      rename: (id, name) => edit(F.groups.rename(state, id, name)),
      canUndo: () => hist.size > 0,
      /** Takes back the last edit. False when there is nothing to undo. */
      undo() {
        const prev = hist.undo();
        if (!prev) return false;
        state = prev;
        save();
        emit();
        return true;
      },
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      /** Tests and the page's own check: the raw state (groups, assign, out, manual). */
      state: () => JSON.parse(JSON.stringify(state)),
    };
    instances.set(scope, P);
    return P;
  };
})(typeof window !== 'undefined' ? window : globalThis);
