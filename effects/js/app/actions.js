// Slop Effects actions for layers, the composition, media and effects. Each action calls the model (ns.layers, ns.core)
// through the state's edit(), so it is one undo step, and then keeps the selection on the right thing. The UI and the
// command palette call these; nothing here touches the DOM except toast() through the ui hook. Classic script:
// window.SlopEffects.actions.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const L = () => ns.layers;
  const C = () => ns.core;
  const K = () => ns.keys;
  const V = () => ns.values;
  const M = () => ns.media, T = (k, v) => ns.defs.t(k, v);

  /** Builds the actions for a state. ui: { toast(msg), dialog? } (the UI supplies it; tests pass a stub). */
  function create(S, ui = {}) {
    const toast = (m) => { if (ui.toast) ui.toast(m); };
    const sel = () => S.doc.layers.find((l) => l.id === S.sel.layer) || null;
    const isKeyed = (doc, layer, prop) => !!(doc.tl.tracks[layer] && doc.tl.tracks[layer][prop]);
    /** The value of a property at the playhead (a keyed value, else the base). */
    const valueNow = (layerId, prop) => {
      const layer = C().findLayer(S.doc, layerId);
      return V().valuesAt(S.doc, layer, S.playhead)[prop];
    };

    /**
     * Sets a layer property from the panel. When the property has keys, the value is keyed at the playhead (AE style);
     * otherwise it is the static base. prop: a layer property, or 'fx.<effect>.<param>'.
     */
    function setValue(prop, value, layerId = S.sel.layer) {
      if (!layerId) return;
      const fx = /^fx\.(e[0-9]+)\.([a-z]+)$/.exec(prop);
      if (fx) {
        if (isKeyed(S.doc, layerId, prop)) S.edit(T('effects.undo.set_key'), (d) => K().setKeyAt(d, layerId, prop, S.playhead, value));
        else S.edit(T('effects.undo.set_effect'), (d) => L().setEffectParam(d, layerId, fx[1], fx[2], value));
        return;
      }
      if (isKeyed(S.doc, layerId, prop)) S.edit(T('effects.undo.set_key'), (d) => K().setKeyAt(d, layerId, prop, S.playhead, value));
      else S.edit(T('effects.undo.set_prop', { prop: ns.defs.word('prop', prop, prop).toLowerCase() }), (d) => L().setBase(d, layerId, prop, value));
    }

    /** The stopwatch: keys a property at the playhead, or removes all its keys when it has some. */
    function toggleKeyed(prop, layerId = S.sel.layer) {
      if (!layerId) return;
      if (isKeyed(S.doc, layerId, prop)) { S.edit(T('effects.undo.unkey'), (d) => K().clearTrack(d, layerId, prop)); return; }
      const fx = /^fx\.(e[0-9]+)\.([a-z]+)$/.exec(prop);
      let now;
      if (fx) {
        const layer = C().findLayer(S.doc, layerId);
        now = V().valuesAt(S.doc, layer, S.playhead).fx[fx[1]][fx[2]];
      } else now = valueNow(layerId, prop);
      S.edit(T('effects.undo.add_key'), (d) => K().setKeyAt(d, layerId, prop, S.playhead, Array.isArray(now) ? now.slice() : now));
    }

    function addLayer(type, opts = {}) {
      let id = null;
      const at = S.sel.layer ? S.doc.layers.findIndex((l) => l.id === S.sel.layer) : -1;
      const index = at >= 0 ? at : 0;
      S.edit(T('effects.undo.add', { what: ns.defs.word('type', type, type).toLowerCase() }), (d) => { const r = L().addLayer(d, type, { ...opts, index }); id = r.id; return r.doc; });
      if (id) S.select({ layer: id, keys: [], fx: null });
      return id;
    }

    function removeLayer() {
      const id = S.sel.layer;
      if (!id) return;
      S.edit(T('effects.undo.delete_layer'), (d) => L().removeLayer(d, id));
      S.select({ layer: null, keys: [], fx: null });
    }

    function duplicateLayer() {
      const id = S.sel.layer;
      if (!id) return;
      let nid = null;
      S.edit(T('effects.cmd.dup'), (d) => { const r = L().duplicateLayer(d, id); nid = r.id; return r.doc; });
      if (nid) S.select({ layer: nid, keys: [], fx: null });
    }

    function moveLayer(delta) {
      const id = S.sel.layer;
      if (id) S.edit(T('effects.undo.move_layer'), (d) => L().moveLayer(d, id, delta));
    }

    function setParent(parentId, layerId = S.sel.layer) {
      try { S.edit(T('effects.props.parent_layer'), (d) => L().setParent(d, layerId, parentId || null)); } catch (e) { toast(e.message); }
    }

    function setComp(patch) {
      S.edit(T('effects.app.comp'), (d) => {
        const comp = C().normComp({ ...d.comp, ...patch });
        const next = C().clone(d);
        next.comp = comp;
        next.tl = { ...next.tl, duration: comp.duration };
        return next;
      });
    }

    function renameProject(name) {
      S.edit(T('effects.undo.rename_project'), (d) => ({ ...C().clone(d), name: String(name || 'Untitled').slice(0, 120) || 'Untitled' })); // i18n-ignore: the project's own name
    }

    /** Adds an image or video layer for a bin entry (and its media record), fitted to the composition when larger. One step. */
    function addMediaLayer(entry) {
      const comp = S.doc.comp;
      const fit = entry.w && entry.h ? Math.min(1, comp.width / entry.w, comp.height / entry.h) : 1;
      const s = Math.round(fit * 10000) / 100;
      const type = entry.kind === 'video' ? 'video' : 'image';
      let id = null;
      const at = S.sel.layer ? S.doc.layers.findIndex((l) => l.id === S.sel.layer) : -1;
      S.edit(T('effects.undo.add', { what: ns.defs.word('type', type, type).toLowerCase() }), (d) => {
        const withMedia = L().addMedia(d, M().info(entry));
        const r = L().addLayer(withMedia, type, { mediaId: entry.id, w: entry.w, h: entry.h, dur: entry.dur, base: { scale: [s, s] }, index: Math.max(0, at) });
        id = r.id;
        return r.doc;
      });
      if (id) S.select({ layer: id, keys: [], fx: null });
      return id;
    }

    /** The next media id for this document (m1, m2, ...). */
    function nextMediaId() {
      const n = S.doc.media.reduce((max, m) => Math.max(max, parseInt(String(m.id).replace(/\D/g, ''), 10) || 0), 0);
      return 'm' + (n + 1);
    }

    function addEffect(kind) {
      const id = S.sel.layer;
      if (!id) return;
      let fid = null;
      S.edit(T('effects.undo.add_effect'), (d) => { const r = L().addEffect(d, id, kind); fid = r.id; return r.doc; });
      if (fid) S.select({ fx: fid });
    }

    function removeEffect(fxId) {
      const id = S.sel.layer;
      if (id) S.edit(T('effects.undo.remove_effect'), (d) => L().removeEffect(d, id, fxId));
      if (S.sel.fx === fxId) S.select({ fx: null });
    }

    function moveEffect(fxId, delta) {
      const id = S.sel.layer;
      if (id) S.edit(T('effects.undo.move_effect'), (d) => L().moveEffect(d, id, fxId, delta));
    }

    function setEffectOn(fxId, on) {
      const id = S.sel.layer;
      if (id) S.edit(T(on ? 'effects.undo.enable_effect' : 'effects.undo.disable_effect'), (d) => L().setEffectOn(d, id, fxId, on));
    }

    /** Deletes the selected keys, or the selected layer when no keys are selected. */
    function deleteSelection() {
      const keysSel = S.sel.keys;
      if (keysSel.length) {
        S.edit(T('effects.undo.delete_keys'), (d) => keysSel.reduce((acc, k) => K().deleteKeyAt(acc, k.layer, k.prop, k.t), d));
        S.select({ keys: [] });
        return;
      }
      removeLayer();
    }

    return {
      toast, sel, isKeyed, valueNow, setValue, toggleKeyed, addLayer, removeLayer, duplicateLayer, moveLayer, setParent,
      setComp, renameProject, addMediaLayer, nextMediaId, addEffect, removeEffect, moveEffect, setEffectOn, deleteSelection,
    };
  }

  ns.actions = { create };
})(typeof window !== 'undefined' ? window : globalThis);
