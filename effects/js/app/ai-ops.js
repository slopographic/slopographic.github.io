// Slop Effects for the assistant: the helpers behind the AI commands (ai-commands.js). Finding a layer or an effect by
// id or name, the small JSON state the assistant reads, the checkpoint for "Undo all AI changes", media from Slop Drive
// by id or name, and a render saved to Slop Drive with progress in the status line and a stop through an AbortSignal.
// Every edit goes through the store's edit(), so each command is one undo step. Classic script: window.SlopEffects.aiOps.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const r2 = (n) => Math.round(n * 100) / 100;

  /** Builds the helpers for the app's parts. ctx: { S, act, io }. */
  function create(ctx) {
    const { S } = ctx;
    const C = () => ns.core;

    /** The layer named by an id ('l3'), a name (any case) or a stack index ('0' is the top); the selected one when empty. */
    function layer(ref) {
      const list = S.doc.layers;
      if (ref == null || ref === '') {
        const sel = list.find((l) => l.id === S.sel.layer);
        if (sel) return sel;
        if (list.length === 1) return list[0];
        throw new Error(list.length ? 'Say which layer (its id or name; app_state lists them) or select one first' : 'There are no layers yet. Add one first');
      }
      const s = String(ref).trim(), low = s.toLowerCase();
      const hit = list.find((l) => l.id === s) || list.find((l) => l.name.toLowerCase() === low)
        || (/^\d+$/.test(s) ? list[Number(s)] : null) || list.find((l) => l.name.toLowerCase().startsWith(low));
      if (!hit) throw new Error(`No layer "${s}". The layers are: ${list.map((l) => `${l.id} (${l.name})`).join(', ') || 'none'}`);
      return hit;
    }

    /** An effect of a layer by id ('e2') or kind ('glow'); the selected or last one when empty. */
    function effect(L, ref) {
      if (!L.effects.length) throw new Error(`“${L.name}” has no effects. Use add_effect first`);
      if (ref == null || ref === '') return L.effects.find((f) => f.id === S.sel.fx) || L.effects[L.effects.length - 1];
      const s = String(ref).trim().toLowerCase();
      const hit = L.effects.find((f) => f.id === s) || L.effects.slice().reverse().find((f) => f.kind === s);
      if (!hit) throw new Error(`“${L.name}” has no effect "${ref}". It has: ${L.effects.map((f) => `${f.id} (${f.kind})`).join(', ')}`);
      return hit;
    }

    /** A time in seconds, inside the composition and on a frame; the playhead when not given. */
    function time(t) {
      const comp = S.doc.comp;
      return C().snap(comp, Math.min(comp.duration, Math.max(0, Number.isFinite(t) ? t : S.playhead)));
    }

    /** The value to write for a property: a point from x and y (the missing one from the current value), else value. */
    function valueFor(L, prop, a, t) {
      const now = ns.values.valuesAt(S.doc, L, t)[prop];
      if (Array.isArray(now)) {
        if (a.x == null && a.y == null && a.value == null) throw new Error(`Give x and/or y for ${prop}`);
        if (a.x == null && a.y == null) return [a.value, a.value];
        return [a.x != null ? a.x : now[0], a.y != null ? a.y : now[1]];
      }
      const v = a.value != null ? a.value : a.x;
      if (v == null) throw new Error(`Give a value for ${prop}`);
      return v;
    }
    const show = (v) => (Array.isArray(v) ? `${r2(v[0])}, ${r2(v[1])}` : String(r2(v)));

    /** The small summary the assistant reads first. */
    function state() {
      const d = S.doc, tracks = d.tl.tracks || {};
      return {
        app: 'Slop Effects', project: d.name, file: S.file.driveId ? { driveId: S.file.driveId } : null,
        comp: Object.assign({}, d.comp), playhead: r2(S.playhead), range: S.range, selected: { layer: S.sel.layer, effect: S.sel.fx },
        layers: d.layers.map((l, i) => {
          const t = tracks[l.id] || {}, keys = {};
          for (const p of Object.keys(t)) keys[p] = (t[p] || []).length;
          const src = l.type === 'text' ? { text: l.source.text, font: l.source.font, size: l.source.size, color: l.source.color }
            : l.type === 'solid' ? { color: l.source.color } : l.type === 'shape' ? { shape: l.source.shape, fill: l.source.fill } : l.source.mediaId ? { media: l.source.mediaId } : {};
          return { id: l.id, index: i, name: l.name, type: l.type, hidden: l.hidden, parent: l.parent, source: src,
            base: { position: l.base.position.map(r2), scale: l.base.scale.map(r2), rotation: r2(l.base.rotation), opacity: r2(l.base.opacity) },
            effects: l.effects.map((f) => ({ id: f.id, kind: f.kind, on: f.on, params: f.params })), keys };
        }),
        media: d.media.map((m) => ({ id: m.id, name: m.name, kind: m.kind, driveId: m.driveId || '' })),
        effectKinds: ns.defs.EFFECT_KINDS, renderFormats: ns.render.formats().map((f) => f.id),
      };
    }

    /** "Undo all AI changes": back to this document, through the undo stack when it is there. */
    function checkpoint() {
      const mark = S.doc;
      return () => {
        let n = 0;
        while (S.doc !== mark && S.canUndo() && n++ < ns.history.LIMIT) S.undo();
        if (S.doc !== mark) S.replace(mark, 'Undo AI changes');
      };
    }

    /** A Slop Drive file by id, or the newest image or video whose name contains the text. */
    async function driveFile(id, name) {
      const H = g.SlopHub;
      if (!H) throw new Error('Slop Drive is not available on this page');
      if (id) {
        const full = await H.get(id);
        if (!full || !full.blob || full.trashedAt) throw new Error(`No file with id "${id}" in Slop Drive`);
        return full;
      }
      if (!name) throw new Error('Give the Slop Drive file id or a part of its name');
      const low = String(name).toLowerCase();
      const hit = (await H.list({ accept: ['image/*', 'video/*'] })).find((r) => String(r.name).toLowerCase().includes(low)); // intake-ok: an AI command looks a Drive file up by name (a lookup; the person's picker is SlopIntake.fromDrive)
      if (!hit) throw new Error(`No image or video named like "${name}" in Slop Drive`);
      return H.get(hit.id);
    }

    /** Adds a Drive image or video as a layer (the same path as Add from Slop Drive). */
    async function addMedia(a) {
      const full = await driveFile(a.drive_id, a.name);
      const kind = ns.media.kindOf(full.type || full.blob.type);
      if (!kind) throw new Error(`${full.name} is not an image or video`);
      const entry = await ns.media.add({ id: ctx.act.nextMediaId(), name: full.name, size: full.size, kind, driveId: full.id }, full.blob);
      const id = ctx.act.addMediaLayer(entry);
      return `Added ${kind} “${full.name}” as layer ${id}.`;
    }

    /** The status line at the bottom of the page (null text hides it). */
    function status(text) {
      const el = document.getElementById('fx-status');
      if (!el) return;
      el.textContent = text || '';
      el.classList.toggle('is-on', !!text);
    }

    /** Renders the document as it is now and saves it to Slop Drive (or downloads it). opts: { signal, onProgress }. */
    async function render(a, opts = {}) {
      const fmts = ns.render.formats().map((f) => f.id);
      if (!fmts.includes(a.format)) throw new Error(`This browser cannot render ${a.format}. It can render: ${fmts.join(', ')}`);
      if (a.range === 'range' && !S.range) throw new Error('There is no play range. Set In and Out, or render the whole composition');
      const doc = S.doc, signal = opts.signal;
      const safe = String(a.name || doc.name || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Untitled';
      const name = a.format === 'png' ? `${safe}-frames.zip` : `${safe}.${a.format}`;
      const r = { media: ns.media, range: a.range === 'range' ? { in: S.range.in, out: S.range.out } : null, cancel: () => !!(signal && signal.aborted),
        onProgress: (f) => { status(`Rendering ${name}: ${Math.round(f * 100)}%`); if (opts.onProgress) opts.onProgress(f); } };
      status(`Rendering ${name}…`);
      let blob;
      try {
        blob = a.format === 'png' ? await ns.render.renderPng(doc, r) : await ns.render.renderVideo(doc, Object.assign({}, r, { format: a.format }));
      } catch (e) {
        status(null);
        throw new Error(e.message === 'cancelled' ? 'The render was stopped' : `The render failed: ${e.message}`);
      }
      status(null);
      const mb = (blob.size / 1048576).toFixed(2);
      if (a.save === 'download') { ns.render.download(blob, name); return `Rendered ${name} (${mb} MB) and downloaded it.`; }
      const folderId = await g.SlopHub.appFolderId('effects');
      const id = await g.SlopHub.put(blob, { name, from: 'effects', app: 'effects', folderId: folderId || null, meta: { kind: 'effects-render' } });
      return `Rendered ${name} (${mb} MB) and saved it to Slop Drive (id ${id}).`;
    }

    return { layer, effect, time, valueFor, show, state, checkpoint, driveFile, addMedia, status, render };
  }

  ns.aiOps = { create };
})(typeof window !== 'undefined' ? window : globalThis);
