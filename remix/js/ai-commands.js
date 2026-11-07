/* Reel Remix: every operation as a SlopCmd command with arguments (the tools of the Slop AI panel, WebMCP and the Claude
   Code bridge, through shared/ai/cmdtools.js; Ctrl+K opens a form, shared/commands/argform.js). Each one changes the
   state the page already has (core.js RM.state) and plans with RM.remixNow, so the page shows what the AI did. The
   one-call remix_from_spec and the export are in ai-spec.js. new_reel starts over. Exposes RM.ai (set, items, summary). */
(function () {
  'use strict';
  const RM = window.RM, SV = window.SlopVideo, S = SV.seed, FX = SV.effects;
  const $ = (id) => document.getElementById(id);
  const AI = (RM.ai = {});
  const LAYOUTS = ['none', 'random'].concat(SV.templates.list.map((t) => t.id), RM.GRIDS);
  const num = (x, d = 2) => (isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

  /** The plan options a command may set, as args (also the spec's fields). */
  AI.OPTION_ARGS = [
    { name: 'target', type: 'number', min: 1, max: 600, description: 'length in seconds' }, { name: 'pace', type: 'enum', values: SV.random.PACES.map((p) => p[0]) },
    { name: 'aspect', type: 'enum', values: SV.presets.LIST.map((p) => p.id).concat(['9:16', '16:9', '1:1', '4:5']), description: 'export frame: phone, square, landscape, 4k, portrait (or 9:16…)' },
    { name: 'width', type: 'number', min: 16, max: 7680, integer: true, description: 'custom width (with height)' }, { name: 'height', type: 'number', min: 16, max: 4320, integer: true },
    { name: 'layout', type: 'enum', values: LAYOUTS, description: 'none (one clip after another), random (a grid), or a template or grid id' },
    { name: 'switches', type: 'boolean', description: 'switch layouts at random points' }, { name: 'grids', type: 'string', maxLength: 200, description: 'grids the random layouts use, comma list of ' + RM.GRIDS.join(', ') },
    { name: 'fill', type: 'enum', values: SV.orient.FILLS }, { name: 'timing', type: 'enum', values: SV.timing.MODES.map((m) => m[0]) }, { name: 'video', type: 'enum', values: ['through', 'random'], description: 'video in cells: from the start or a random point' },
    { name: 'min', type: 'number', min: 0.1, max: 600 }, { name: 'max', type: 'number', min: 0.1, max: 600 }, { name: 'stagger', type: 'number', min: 0, max: 60 },
    { name: 'audio', type: 'enum', values: SV.audio.MODES.map((m) => m[0]), description: 'off, original (each clip\'s sound) or music' }, { name: 'music', type: 'string', maxLength: 60, description: 'music: a bin video id, or random' },
    { name: 'effect', type: 'enum', values: FX.KINDS.map((k) => k[0]) }, { name: 'intensity', type: 'number', min: 0, max: 1 }, { name: 'effect_change', type: 'enum', values: FX.CHANGE.map((c) => c[0]) },
    { name: 'photo_show', type: 'enum', values: SV.clipset.SHOW.map((x) => x[0]) }, { name: 'photo_seconds', type: 'number', min: 0.2, max: 60 },
    { name: 'photo_enter', type: 'enum', values: SV.clipset.EDGE.map((x) => x[0]) }, { name: 'photo_exit', type: 'enum', values: SV.clipset.EDGE.map((x) => x[0]) },
    { name: 'seed', type: 'string', maxLength: 40, description: '8 hex digits or any text; the same seed and clips give the same edit' }];

  /** Set plan options on the state and on the controls (the page reads its controls when it plans). */
  AI.set = function (a) {
    const st = RM.state;
    for (const k of ['target', 'pace', 'fill', 'timing', 'video', 'min', 'max', 'stagger']) if (a[k] != null) st[k] = a[k];
    if (a.width && a.height) { st.preset = SV.presets.CUSTOM; st.custom = SV.presets.clamp(a.width, a.height); }
    else if (a.aspect) st.preset = SV.presets.get(a.aspect) ? a.aspect : (SV.presets.byAspect(a.aspect) || { id: st.preset }).id;
    if (a.layout) st.base = a.layout;
    if (a.switches != null) st.random = a.switches;
    if (a.grids) { const g = String(a.grids).split(/[\s,]+/).filter((x) => RM.GRIDS.includes(x)); if (g.length) st.grids = g; }
    if (a.audio) st.audioMode = a.audio;
    if (a.music) st.audioTrack = a.music;
    if (a.effect || a.intensity != null || a.effect_change) RM.setEffect(Object.assign({}, a.effect ? { kind: a.effect } : {}, a.intensity != null ? { intensity: a.intensity } : {}, a.effect_change ? { change: a.effect_change } : {}));
    if (a.photo_show) st.photo.show = a.photo_show;
    if (a.photo_seconds != null) st.photo.sec = a.photo_seconds;
    if (a.photo_enter) st.photo.enter = a.photo_enter;
    if (a.photo_exit) st.photo.exit = a.photo_exit;
    if (a.seed) st.seed = S.parse(a.seed);
    RM.syncUI();
    for (const [id, v] of [['rm-psec', st.photo.sec], ['rm-pshow', st.photo.show], ['rm-penter', st.photo.enter], ['rm-pexit', st.photo.exit]]) if ($(id) && v != null) $(id).value = String(v);
    for (const g of RM.GRIDS) if ($('rm-g-' + g)) $('rm-g-' + g).checked = st.grids.includes(g);
  };
  AI.items = () => RM.state.items.map((m) => ({ id: m.id, name: m.name, kind: m.kind, dur: m.kind === 'video' ? num(m.dur) : null, width: m.w, height: m.h, missing: !!m.missing }));
  AI.summary = function () {
    const st = RM.state, plan = st.plan, size = RM.size();
    return {
      clips: AI.items(), options: { target: st.target, pace: st.pace, size: size.w + 'x' + size.h, layout: st.base, switches: st.random, fill: st.fill, timing: st.timing, audio: st.audioMode, effect: st.effect, seed: S.hex(st.seed) },
      plan: plan ? { total: num(plan.total), seed: plan.seedHex, cuts: plan.cuts.slice(0, 80).map((beat, i) => ({ cut: i, start: num(beat[0].start), dur: num(beat[0].dur), slots: beat.map((x) => ({ slot: x.slot, clip: x.media, in: num(x.in), fill: x.fill || 'auto' })) })) } : null,
      layouts: LAYOUTS,
    };
  };
  const plan = () => { const p = RM.remixNow(); if (!p) throw new Error(RM.media().length ? 'Nothing usable to plan.' : 'Add clips or photos first (add_from_drive).'); return p; };
  const said = (p, verb) => `${verb}: ${num(p.total)} s, ${p.cuts.length} cuts, seed ${p.seedHex}.`;
  const cutOf = (i) => { const p = RM.state.plan; if (!p || !p.cuts[i]) throw new Error(`There is no cut ${i} (the plan has ${p ? p.cuts.length : 0}; they count from 0).`); return p.cuts[i]; };
  const redraw = () => { if (RM.renderPlan) RM.renderPlan(); };
  /** A Slop Drive file by id or name (or part of it): shared/commands/sources.js. */
  const driveFile = async (q) => (await window.SlopCmd.sources()).driveAsFile(q);
  async function addFile(file) {
    if (!(await RM.addFiles([file]))) throw new Error(`${file.name} is not a picture or video this browser can read.`);
    RM.syncUI();
    return RM.state.items[RM.state.items.length - 1];
  }
  AI.fromDrive = async (q) => addFile(await driveFile(q));

  /** A new reel: the bin emptied, the options back to their defaults (Reset all), no music file, a new seed; the frame stays.
   *  The sources are looked up before anything goes, so a missing one changes nothing. */
  async function newReel(a) {
    const st = RM.state, sources = [].concat(a.sources || []).map(String).filter((x) => x.trim());
    const files = [];
    for (const q of sources) files.push(await driveFile(q));
    for (const m of st.items.slice()) RM.removeItem(m.id);
    if (st.music) { URL.revokeObjectURL(st.music.url); st.music = null; }
    RM.resetAll();
    Object.assign(st, { plan: null, overrides: {}, pending: [], seed: S.make() });
    for (const f of files) await addFile(f);
    AI.set(Object.assign({}, a, { sources: undefined }));
    return RM.media().length ? said(plan(), `New reel with ${st.items.length} clip(s), planned`) : 'New reel: the bin is empty. Add clips (add_from_drive), then remix.';
  }

  const C = (list) => SlopCmd.register(list.map((c) => SlopCmdForm.wrap(Object.assign({ group: 'Reel Remix' }, c))));
  C([
    { id: 'remix.ai.state', tool: 'remix_state', title: 'Show the remix plan', readOnly: true, args: [], description: 'The clips in the bin (ids), the options and the plan: each cut with its start, length and the clip in each slot.', run: () => AI.summary() },
    { id: 'remix.ai.new', tool: 'new_reel', title: 'Start a new reel…', destructive: true,
      args: [{ name: 'sources', type: 'array', maxItems: 200, items: { type: 'string' }, description: 'Slop Drive ids or names of the videos and photos for the new bin' }].concat(AI.OPTION_ARGS),
      description: 'Start over: empty the bin, put every option back to its default and draw a new seed (the frame stays), then add the Slop Drive sources, set any options given and plan the edit.', run: newReel },
    { id: 'remix.ai.add', tool: 'add_from_drive', title: 'Add a clip from Slop Drive…', args: [{ name: 'source', type: 'string', required: true, maxLength: 200, description: 'Slop Drive file id or name' }],
      description: 'Add a video or photo from Slop Drive to the bin.', run: async (a) => { const it = await AI.fromDrive(a.source); return `Added ${it.name} as ${it.id}.`; } },
    { id: 'remix.ai.remove', tool: 'remove_clip', title: 'Remove a clip from the bin…', destructive: true, args: [{ name: 'clip', type: 'string', required: true, maxLength: 40 }],
      description: 'Take a clip out of the bin (the next remix plans without it).', run: (a) => { const it = RM.state.items.find((m) => m.id === a.clip || m.name === a.clip); if (!it) throw new Error(`No clip ${a.clip}.`); RM.removeItem(it.id); RM.syncUI(); return `Removed ${it.name}.`; } },
    { id: 'remix.ai.options', tool: 'set_options', title: 'Set remix options…', args: AI.OPTION_ARGS,
      description: 'Set any of the plan options (length, pace, frame, layout or template, layout switches, fill, timing, sound, effect layer, photo timing, seed), then plan the edit again.',
      run: (a) => { AI.set(a); return RM.media().length ? said(plan(), 'Planned') : 'Options set. Add clips, then remix.'; } },
    { id: 'remix.ai.remix', tool: 'remix', title: 'Remix with a seed…', args: [{ name: 'seed', type: 'string', maxLength: 40, description: 'a seed (default the one shown); new for a fresh one' }],
      description: 'Plan the edit with the current options (the same seed gives the same edit; seed "new" draws a new one).',
      run: (a) => { if (a.seed === 'new') RM.state.seed = S.make(); else if (a.seed) RM.state.seed = S.parse(a.seed); RM.syncUI(); return said(plan(), 'Remixed'); } },
    { id: 'remix.ai.fill', tool: 'set_cut_fill', title: 'Fill of one cut…', args: [{ name: 'cut', type: 'number', min: 0, max: 9999, integer: true, required: true }, { name: 'fill', type: 'enum', values: SV.orient.FILLS, required: true }],
      description: 'How the clips of one cut fill their cells (cuts count from 0).', run: (a) => { cutOf(a.cut); RM.setCutFill(a.cut, a.fill); redraw(); return `Cut ${a.cut}: ${a.fill}.`; } },
    { id: 'remix.ai.replace', tool: 'replace_slot', title: 'Put a clip in a slot…', args: [{ name: 'cut', type: 'number', min: 0, max: 9999, integer: true, required: true }, { name: 'slot', type: 'number', min: 0, max: 15, integer: true, default: 0 }, { name: 'clip', type: 'string', required: true, maxLength: 40 }],
      description: 'Show a bin clip in one slot of one cut (until the next remix).', run: (a) => { cutOf(a.cut); if (!RM.replaceSlot(a.cut, a.slot, a.clip)) throw new Error('That slot or clip does not exist.'); redraw(); return `Cut ${a.cut} slot ${a.slot}: ${a.clip}.`; } },
    { id: 'remix.ai.swap', tool: 'swap_slots', title: 'Swap two slots…', args: [{ name: 'cut', type: 'number', min: 0, max: 9999, integer: true, required: true }, { name: 'a', type: 'number', min: 0, max: 15, integer: true, required: true }, { name: 'b', type: 'number', min: 0, max: 15, integer: true, required: true }],
      description: 'Swap the clips of two slots in one cut.', run: (a) => { cutOf(a.cut); if (RM.swapSlots(a.cut, a.a, a.b) === false) throw new Error('Those slots cannot swap.'); redraw(); return `Swapped slots ${a.a} and ${a.b} of cut ${a.cut}.`; } },
    { id: 'remix.ai.moveCut', tool: 'move_cut', title: 'Move a cut…', args: [{ name: 'from', type: 'number', min: 0, max: 9999, integer: true, required: true }, { name: 'to', type: 'number', min: 0, max: 9999, integer: true, required: true }],
      description: 'Reorder cuts (only within a layout span with the same slot count).', run: (a) => { cutOf(a.from); cutOf(a.to); if (RM.moveCut(a.from, a.to) === false) throw new Error('These cuts cannot change places (another layout span or slot count).'); redraw(); return `Moved cut ${a.from} to ${a.to}.`; } },
    { id: 'remix.ai.lock', tool: 'lock_cut', title: 'Lock or unlock a cut…', args: [{ name: 'cut', type: 'number', min: 0, max: 9999, integer: true, required: true }, { name: 'slot', type: 'number', min: -1, max: 15, integer: true, default: -1, description: '-1 = every slot' }],
      description: 'Locked slots keep their clip through remix and reshuffle.', run: (a) => { cutOf(a.cut); (a.slot < 0 ? RM.toggleCutLock(a.cut) : RM.toggleLock(a.cut, a.slot)); redraw(); return `Toggled the lock of cut ${a.cut}${a.slot < 0 ? '' : ' slot ' + a.slot}.`; } },
    { id: 'remix.ai.reset', tool: 'reset_options', title: 'Reset all remix options', destructive: true, args: [], description: 'Every plan option back to its default (clips, frame and seed stay), then plan again.',
      run: () => { RM.resetAll(); RM.syncUI(); return RM.state.plan ? said(RM.state.plan, 'Reset and planned') : 'Reset.'; } },
  ]);
})();
