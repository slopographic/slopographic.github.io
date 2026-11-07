/* Reel Remix: export as a command, a whole reel in one call (remix_from_spec), Send to SlopCut, and what the page shares
   with the assistant (SlopCmd.provide: state and checkpoint). Export runs one of two ways: 'record', the page's own
   real-time export (export.js), or 'slopcut', SlopCut's frame-exact WebCodecs render in its hidden copy (the same plan
   from the same options: slopcut/js/ai/host.js and its random_edit command). Results go to Slop Drive. */
(function () {
  'use strict';
  const RM = window.RM, AI = RM.ai, A = () => window.SlopCmdArgs;
  const EXPORT_ARGS = [{ name: 'engine', type: 'enum', values: ['record', 'slopcut'], default: 'slopcut', description: 'slopcut: frame-exact and faster than real time; record: plays it in real time with the music' },
    { name: 'format', type: 'enum', values: ['mp4', 'webm'], default: 'mp4', description: 'slopcut engine only' }, { name: 'name', type: 'string', maxLength: 120 },
    { name: 'save_to_drive', type: 'boolean', default: true }, { name: 'download', type: 'boolean', default: false }];

  async function viaSlopCut(o, ctx) {
    const { runInHost } = await import(new URL('../shared/macros/frame.js', document.baseURI).href);
    const items = RM.media(), size = RM.size();
    const steps = [{ cmd: 'cut.randomEdit', args: { width: size.w, height: size.h, options: JSON.parse(JSON.stringify(RM.options())) }, title: 'Random edit' }];
    const r = await runInHost({ app: 'slopedit', url: 'slopcut/?macro-host=1' }, items[0].file, steps, { media: items.slice(1).map((m) => m.file), place: false, format: o.format, width: size.w, height: size.h },
      { signal: ctx.signal, progress: (f) => RM.say('Rendering in SlopCut: ' + Math.round((f || 0) * 100) + '%'), timeout: 60 * 60 * 1000 });
    return { blob: r.blob, name: 'remix-' + RM.state.plan.seedHex + '.' + r.kind };
  }
  function viaRecord(ctx) {
    const watch = setInterval(() => { if (ctx.signal && ctx.signal.aborted && RM.exporter.stop) RM.exporter.stop(); }, 200);
    return RM.exporter.run({ save: false, say: RM.say }).finally(() => clearInterval(watch));
  }
  /** Export the plan; resolves { file, name, size, stopped }. */
  AI.exportReel = async function (o, ctx = {}) {
    if (!RM.state.plan) RM.remixNow();
    if (!RM.state.plan) throw new Error('Add clips or photos and remix first.');
    if (o.engine === 'record' && !RM.exporter.supported()) throw new Error('This browser cannot record here: use engine slopcut.');
    const out = o.engine === 'record' ? await viaRecord(ctx) : await viaSlopCut(o, ctx);
    if (!out) throw new Error('Nothing was exported.');
    if (ctx.signal && ctx.signal.aborted) throw new Error('The export was cancelled.');
    const name = o.name ? String(o.name).replace(/[\\/:*?"<>|]+/g, '-').replace(/\.(mp4|webm)$/i, '') + out.name.slice(out.name.lastIndexOf('.')) : out.name;
    const res = { name, size: out.blob.size, stopped: !!out.stopped };
    if (o.save_to_drive !== false && window.SlopHub) { res.file = await SlopHub.put(out.blob, { name, from: 'remix' }); res.saved = 'Slop Drive'; }
    if (o.download || !res.file) { window.SlopUI.download(out.blob, name); res.downloaded = true; }
    RM.say('Exported ' + name + (res.file ? ' to Slop Drive.' : '.'));
    return res;
  };

  /** A spec: { sources: [Slop Drive ids or names], replace?, …plan options (AI.OPTION_ARGS), export?: { engine, format, name, save_to_drive } }. */
  AI.checkSpec = function (raw) {
    let s = raw;
    if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { return { ok: false, errors: ['The spec is not valid JSON: ' + e.message] }; } }
    if (!s || typeof s !== 'object' || Array.isArray(s)) return { ok: false, errors: ['The spec must be an object.'] };
    const sources = [].concat(s.sources || s.clips || []).map(String).filter((x) => x.trim()).slice(0, 200);
    const opt = A().validate(AI.OPTION_ARGS, Object.assign({}, s, { sources: undefined, clips: undefined, export: undefined, replace: undefined }));
    const ex = s.export ? A().validate(EXPORT_ARGS, s.export === true ? {} : s.export) : null;
    const errors = opt.errors.concat(ex ? ex.errors : []);
    if (!sources.length && !RM.media().length) errors.push('sources: name the Slop Drive videos and photos (ids or names)');
    return { ok: !errors.length, errors, notes: opt.notes.concat(ex ? ex.notes : []), sources, options: opt.args, exportAs: ex && ex.args, replace: s.replace !== false };
  };

  SlopCmd.register([
    { id: 'remix.ai.export', tool: 'export_reel', title: 'Export the reel to Slop Drive…', args: EXPORT_ARGS,
      description: 'Render the planned reel to a video file and save it to Slop Drive (and/or download it). Long reels take a while; Stop cancels.', run: (a, ctx) => AI.exportReel(a, ctx) },
    { id: 'remix.ai.send', tool: 'send_to_slopcut', title: 'Send the reel to SlopCut', args: [],
      description: 'Store the clips and the plan in Slop Drive and open SlopCut on them, to edit the reel further there.', run: async () => { const id = await RM.sendToSlopCut(); if (!id) throw new Error('Nothing to send.'); return `Opened in SlopCut (manifest ${id}).`; } },
    { id: 'remix.ai.spec', tool: 'remix_from_spec', title: 'Remix from a spec…', ok: 'Remix',
      description: 'A whole reel in one call: { "sources": [Slop Drive file ids or names], "target": 15, "pace": "fast", "aspect": "phone", "layout": "none", "audio": "music", "effect": "random", "seed": "1a2b3c4d", "export": { "engine": "slopcut", "save_to_drive": true } }. The bin is replaced by the sources (replace: false adds them); every option of set_options can be given.',
      args: [{ name: 'spec', type: 'json', required: true, maxLength: 100000, schema: { type: 'object', properties: { sources: { type: 'array', items: { type: 'string' } }, export: { type: 'object' } }, required: ['sources'] } }],
      run: async (a, ctx) => {
        const v = AI.checkSpec(a.spec);
        if (!v.ok) throw new Error('The spec has problems: ' + v.errors.join('; '));
        if (v.replace && v.sources.length) for (const m of RM.state.items.slice()) RM.removeItem(m.id);
        for (const q of v.sources) await AI.fromDrive(q);
        AI.set(v.options);
        const p = RM.remixNow();
        if (!p) throw new Error('Nothing usable to plan from these sources.');
        const out = { total: Math.round(p.total * 100) / 100, cuts: p.cuts.length, seed: p.seedHex, notes: v.notes };
        if (v.exportAs) out.export = await AI.exportReel(v.exportAs, ctx);
        return out;
      } },
  ].map((c) => SlopCmdForm.wrap(Object.assign({ group: 'Reel Remix' }, c))));

  const KEEP = ['target', 'pace', 'preset', 'custom', 'base', 'random', 'grids', 'lane', 'seed', 'fill', 'timing', 'video', 'min', 'max', 'stagger', 'locks', 'audioMode', 'audioTrack', 'photo', 'clipVideo', 'overrides', 'keys', 'effect'];
  SlopCmd.provide({
    state: () => AI.summary(),
    checkpoint: () => {
      const st = RM.state, snap = JSON.parse(JSON.stringify(KEEP.reduce((o, k) => Object.assign(o, { [k]: st[k] }), {}))), plan = st.plan;
      return () => { Object.assign(st, JSON.parse(JSON.stringify(snap))); st.plan = plan; RM.syncUI(); };
    },
  });
})();
