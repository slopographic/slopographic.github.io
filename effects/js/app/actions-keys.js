// Slop Effects actions for keyframes, copy and paste of keys, easing, animate in and out, and Random motion. Copy and paste
// keep the payload in this tab and also put it in the shared buffer (SlopBuffer), so another Slopographic tab can paste
// it. Classic script: window.SlopEffects.actionsKeys. Used with actions.js (create(S, ui) there).
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const K = () => ns.keys;
  const C = () => ns.core, T = (k, v) => ns.defs.t(k, v);

  /** Builds the key actions for a state and the base actions (see actions.js). */
  function create(S, base) {
    let clip = null; // the payload copied in this tab

    /** Keys to act on: the selected keys, or none. */
    const selected = () => S.sel.keys.slice();

    function copy() {
      const refs = selected();
      const { payload, count } = K().copyKeys(S.doc, refs);
      if (!payload) { base.toast(T('effects.keys.select_copy')); return 0; }
      clip = payload;
      if (g.SlopBuffer && g.SlopBuffer.put) {
        g.SlopBuffer.put({ kind: 'clip', source: 'effects', formats: { 'text/plain': JSON.stringify(payload) } }, { system: false }).catch(() => {});
      }
      base.toast(T('effects.keys.copied', { n: count }));
      return count;
    }

    /** The payload to paste: this tab's copy first, else the shared buffer when it came from this app. */
    function clipboardPayload() {
      if (clip) return clip;
      const rec = g.SlopBuffer && g.SlopBuffer.get && g.SlopBuffer.get();
      if (rec && rec.source === 'effects' && rec.formats && rec.formats['text/plain']) {
        try { return JSON.parse(rec.formats['text/plain']); } catch (e) { return null; }
      }
      return null;
    }

    /** Pastes keys with their first key at the playhead, on the selected layer. */
    function paste() {
      const id = S.sel.layer;
      const payload = clipboardPayload();
      if (!id) { base.toast(T('effects.keys.select_layer_paste')); return; }
      if (!payload) { base.toast(T('effects.keys.nothing')); return; }
      let res = null;
      try {
        S.edit(T('effects.undo.paste_keys'), (d) => { res = K().pasteKeys(d, id, payload, S.playhead); return res.doc; });
      } catch (e) { base.toast(e.message); return; }
      if (res) base.toast(res.skipped ? T('effects.keys.pasted_skipped', { n: res.count, skipped: res.skipped }) : T('effects.keys.pasted', { n: res.count }));
    }

    /** Sets the ease of the selected key (one key) to a name, or to [x1, y1, x2, y2]. */
    function setEase(ease) {
      const k = S.sel.keys[0];
      if (!k) { base.toast(T('effects.keys.select_key')); return; }
      S.edit(T('effects.undo.set_ease'), (d) => K().setEase(d, k.layer, k.prop, k.t, ease));
    }

    /** Sets the ease of every selected key to a name. */
    function setEaseAll(ease) {
      if (!S.sel.keys.length) return;
      const refs = selected();
      S.edit(T('effects.undo.set_ease'), (d) => refs.reduce((acc, k) => K().setEase(acc, k.layer, k.prop, k.t, ease), d));
    }

    /** Moves the selected keys by a number of frames (the Alt+arrow nudge). */
    function nudge(frames) {
      if (!S.sel.keys.length) return;
      const dt = frames / S.doc.comp.fps;
      const refs = selected();
      S.edit(T('effects.undo.move_keys'), (d) => K().moveKeys(d, refs, dt));
      S.select({ keys: refs.map((r) => ({ ...r, t: C().snap(S.doc.comp, r.t + dt) })) });
    }

    /** Animate in or out with a preset on the selected layer. */
    function animate(dir, preset, layerId = S.sel.layer) {
      if (!layerId) { base.toast(T('effects.keys.select_layer')); return; }
      try { S.edit(T(dir === 'in' ? 'effects.motion.in' : 'effects.motion.out'), (d) => ns.motion.animate(d, layerId, dir, preset)); } catch (e) { base.toast(e.message); }
    }

    /** Random motion on the selected layer, with a seed, the properties and the bounds (see motion.randomMotion). */
    function randomMotion(opts, layerId = S.sel.layer) {
      if (!layerId) { base.toast(T('effects.keys.select_layer')); return; }
      try { S.edit(T('effects.motion.random'), (d) => ns.motion.randomMotion(d, layerId, opts)); } catch (e) { base.toast(e.message); }
    }

    /** Begins a live drag of the selected keys (see state.live). */
    function dragKeys(delta, refs) {
      S.live((d) => K().moveKeys(d, refs, delta));
    }

    return { copy, paste, setEase, setEaseAll, nudge, animate, randomMotion, dragKeys, clipboardPayload, selected };
  }

  ns.actionsKeys = { create };
})(typeof window !== 'undefined' ? window : globalThis);
