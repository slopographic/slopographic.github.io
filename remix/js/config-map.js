/* Reel Remix: the 'project' config kind (app remix) as pure data. toData(st) writes the export frame size, the bin's clips
   (by file name and size; media is never in the file), the plan options, the layout lane, the locks and the keyframes.
   toState(d, items) turns a checked file into state values; resolveItems(clips, bin) reuses the loaded clips that match
   by name and makes 'missing' placeholders for the rest. No DOM, no store: the Node test runs this file unchanged.
   Schema and check() live here too. Exposes window.RM.config. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const RM = (root.RM = root.RM || {});
  const SV = root.SlopVideo, F = root.SlopConfig.F;
  const CM = (RM.config = RM.config || {});
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  let seq = 0;

  const EASES = ['linear', 'easeIn', 'easeOut', 'easeInOut'];
  const FILE = F.obj({
    name: F.str({ max: 200, required: true, desc: 'the file name; a file you add later is matched by this name' }),
    size: F.int({ min: 0, max: 1e12, required: true, desc: 'the file size in bytes' }),
  }, { desc: 'a media file. Media is never in the file' });
  const KEY = F.obj({
    t: F.num({ min: 0, max: 600, required: true, desc: 'seconds from the start of the slot' }),
    x: F.num({ min: -2, max: 2, desc: 'horizontal offset as a fraction of the cell, 0 is centred' }),
    y: F.num({ min: -2, max: 2, desc: 'vertical offset as a fraction of the cell, 0 is centred' }),
    scale: F.num({ min: 0.1, max: 4, desc: 'size, 1 is natural' }),
    rot: F.num({ min: -720, max: 720, desc: 'rotation in degrees' }),
    opacity: F.num({ min: 0, max: 1, desc: '0 to 1' }),
    ease: F.enum(EASES, { desc: 'easing of the segment that starts at this key' }),
  });
  const PLAN = F.obj({
    target: F.num({ min: 1, max: 600, required: true, desc: 'target length in seconds' }),
    pace: F.enum(SV.random.PACES.map((p) => p[0]), { required: true, desc: 'cut length: fast, medium or slow' }),
    seed: F.str({ max: 8, pattern: /^[0-9a-f]{8}$/, required: true, desc: 'the seed, 8 lowercase hex digits; the same seed and options give the same edit' }),
    base: F.str({ max: 30, pattern: /^[a-z0-9-]+$/, required: true, desc: 'the layout: none, a template id (e.g. single, split-h) or a grid id such as grid-2x2' }),
    switches: F.bool({ desc: 'true: draw layout switch points at random over the layouts list' }),
    layouts: F.list(F.str({ max: 30, pattern: /^[a-z0-9-]+$/ }), { max: 20, desc: 'the grids the random layouts may use, e.g. grid-1x2' }),
    fill: F.enum(SV.orient.FILLS, { required: true, desc: 'how a clip fills its cell' }),
    timing: F.enum(SV.timing.MODES.map((m) => m[0]), { required: true, desc: 'same, stagger or random: how slots start and end' }),
    video: F.enum(['through', 'random'], { required: true, desc: 'through: from the clip start; random: from a random point' }),
    min: F.num({ min: 0.1, max: 600, desc: 'shortest slot length for random timing, seconds' }),
    max: F.num({ min: 0.1, max: 600, desc: 'longest slot length for random timing, seconds' }),
    stagger: F.num({ min: 0, max: 600, desc: 'the largest start offset for stagger, seconds' }),
    effect: F.obj({
      kind: F.enum(SV.effects.KINDS.map((k) => k[0]), { desc: 'none, random, or one effect for all picks' }),
      intensity: F.num({ min: 0, max: 1, desc: 'strength, 0 to 1' }),
      change: F.enum(SV.effects.CHANGE.map((c) => c[0]), { desc: 'cut: a new pick at every cut; reel: one pick for the whole reel' }),
    }, { desc: 'the effect layer' }),
    audio: F.obj({
      mode: F.enum(SV.audio.MODES.map((m) => m[0]), { required: true, desc: 'off, original (each clip keeps its sound) or music (one track under the reel)' }),
      source: F.enum(['random', 'clip', 'file'], { required: true, desc: 'music source: random (seeded, a clip sound), clip (the clip named in clip), or file' }),
      clip: F.str({ max: 200, desc: 'name of the clip whose sound is the music (source clip)' }),
      file: FILE,
    }, { desc: 'the reel sound' }),
  });

  CM.SCHEMA = {
    strict: true,
    fields: {
      output: F.obj({
        width: F.int({ min: 16, max: 7680, required: true, desc: 'export width in pixels' }),
        height: F.int({ min: 16, max: 4320, required: true, desc: 'export height in pixels' }),
      }, { required: true, desc: 'the export frame size' }),
      clips: F.list(F.obj({
        file: FILE,
        kind: F.enum(['video', 'image'], { required: true, desc: 'video clip or photo' }),
        dur: F.num({ min: 0.1, max: 86400, desc: 'length in seconds (videos only)' }),
        w: F.int({ min: 1, max: 20000, desc: 'width in pixels, optional' }),
        h: F.int({ min: 1, max: 20000, desc: 'height in pixels, optional' }),
      }), { max: 200, desc: 'the bin: clips and photos in order; the plan draws from them' }),
      plan: PLAN,
      lane: F.list(F.obj({
        start: F.num({ min: 0, max: 86400, required: true, desc: 'seconds where the layout switches' }),
        layout: F.str({ max: 30, pattern: /^[a-z0-9-]+$/, required: true, desc: 'layout id from the list of templates and grids' }),
      }), { max: 200, desc: 'layout switches over time (used when switches is false)' }),
      locks: F.list(F.obj({
        cut: F.int({ min: 0, max: 10000, required: true, desc: 'cut number, from 0' }),
        slot: F.int({ min: 0, max: 50, required: true, desc: 'slot number, from 0' }),
        clip: F.int({ min: 0, max: 199, required: true, desc: 'index of the clip in clips, from 0' }),
        in: F.num({ min: 0, max: 86400, desc: 'the clip time the slot starts at' }),
        fill: F.enum(SV.orient.FILLS, { desc: 'the fill of the locked slot' }),
      }), { max: 500, desc: 'slots kept through Remix and Reshuffle' }),
      keys: F.list(F.obj({
        cut: F.int({ min: 0, max: 10000, required: true, desc: 'cut number, from 0' }),
        slot: F.int({ min: 0, max: 50, required: true, desc: 'slot number, from 0' }),
        keys: F.list(KEY, { max: 100, desc: 'poses over the slot' }),
      }), { max: 500, desc: 'keyframes of slots' }),
    },
  };

  /** Rules the schema cannot say. Runs only when the shape is right. */
  CM.check = function (d) {
    const out = [];
    const err = (path, message) => out.push({ path, message });
    d.clips.forEach((c, i) => {
      if (c.kind === 'video' && !(c.dur > 0)) err(`clips[${i}].dur`, 'a video clip needs its length');
      if (c.kind === 'image' && c.dur !== undefined) err(`clips[${i}].dur`, 'a photo has no length');
    });
    if (d.plan.min !== undefined && d.plan.max !== undefined && d.plan.min > d.plan.max) err('plan.max', 'must not be less than min');
    d.locks.forEach((l, i) => { if (l.clip >= d.clips.length) err(`locks[${i}].clip`, 'no clip has this index'); });
    return out;
  };

  const fileSize = (m) => (m.file ? m.file.size : m.size || 0);

  /** The state as file data. st is RM.state; out is the export size { w, h }. */
  CM.toData = function (st, out) {
    const idx = new Map(st.items.map((m, i) => [m.id, i]));
    const clips = st.items.map((m) => {
      const o = { file: { name: m.name, size: fileSize(m) }, kind: m.kind };
      if (m.kind === 'video') o.dur = r6(Math.max(0.1, m.dur));
      if (m.w) o.w = m.w;
      if (m.h) o.h = m.h;
      return o;
    });
    const music = st.music ? { name: st.music.name, size: st.music.size || 0 } : st.pendingMusic || null;
    const src = st.audioTrack === 'random' ? 'random' : st.audioTrack === 'file' ? 'file' : 'clip';
    const audio = { mode: st.audioMode, source: src };
    if (src === 'clip') { const m = st.items.find((x) => x.id === st.audioTrack); if (m) audio.clip = m.name; else audio.source = 'random'; }
    if (src === 'file' && music) audio.file = music;
    const plan = {
      target: st.target, pace: st.pace, seed: SV.seed.hex(st.seed), base: st.base, switches: !!st.random, layouts: st.grids.slice(),
      fill: st.fill, timing: st.timing, video: st.video, min: st.min, max: st.max, stagger: st.stagger,
      effect: { kind: st.effect.kind, intensity: r6(st.effect.intensity), change: st.effect.change }, audio,
    };
    return {
      output: { width: out.w, height: out.h },
      clips,
      plan,
      lane: st.lane.map((s) => ({ start: r6(s.start), layout: s.layout })),
      locks: st.locks.filter((l) => idx.has(l.media)).map((l) => ({ cut: l.cut, slot: l.slot, clip: idx.get(l.media), in: r6(l.in || 0), fill: l.fill || 'auto' })),
      keys: st.keys.map((e) => ({ cut: e.cut, slot: e.slot, keys: e.keys.map((k) => {
        const o = { t: r6(k.t) };
        for (const f of ['x', 'y', 'scale', 'rot', 'opacity']) if (k[f] !== undefined) o[f] = r6(k[f]);
        o.ease = k.ease || 'linear';
        return o;
      }) })),
    };
  };

  /** Bin items for the clips of a file: a loaded clip with the same name is reused; the rest are 'missing' placeholders. */
  CM.resolveItems = function (clips, bin) {
    const used = new Set();
    return clips.map((c) => {
      const same = (m) => m.name === c.file.name && !used.has(m);
      const found = bin.find((m) => same(m) && fileSize(m) === c.file.size) || bin.find(same);
      if (found) { used.add(found); return found; }
      seq++;
      return {
        id: 'cfg' + Date.now().toString(36) + seq, name: c.file.name, kind: c.kind, size: c.file.size,
        dur: c.kind === 'video' ? c.dur : Infinity, w: c.w || 0, h: c.h || 0, url: null, el: null, file: null, missing: true,
      };
    });
  };

  /** The state values a checked file gives. items is the bin from resolveItems; the caller assigns them. */
  CM.toState = function (d, items) {
    const p = d.plan, A = p.audio;
    const pr = SV.presets.LIST.find((x) => x.w === d.output.width && x.h === d.output.height);
    const seed = parseInt(p.seed, 16) >>> 0;
    const byName = (name) => items.find((m) => m.name === name) || null;
    let audioTrack = 'random', pendingMusic = null;
    if (A.source === 'clip') { const m = byName(A.clip); audioTrack = m ? m.id : 'random'; }
    if (A.source === 'file') { audioTrack = 'file'; pendingMusic = A.file || null; }
    return {
      items,
      preset: pr ? pr.id : SV.presets.CUSTOM,
      custom: { w: d.output.width, h: d.output.height },
      target: p.target, pace: p.pace, seed, base: p.base, random: p.switches, grids: p.layouts.slice(),
      fill: p.fill, timing: p.timing, video: p.video, min: p.min !== undefined ? p.min : 1, max: p.max !== undefined ? p.max : 3,
      stagger: p.stagger !== undefined ? p.stagger : 1,
      effect: SV.effects.norm(Object.assign({}, p.effect || {})),
      audioMode: A.mode, audioTrack, music: null, pendingMusic,
      lane: d.lane.map((s) => ({ start: s.start, layout: s.layout })),
      locks: d.locks.filter((l) => items[l.clip]).map((l) => ({ cut: l.cut, slot: l.slot, media: items[l.clip].id, in: l.in || 0, fill: l.fill || 'auto' })),
      keys: d.keys.map((e) => ({ cut: e.cut, slot: e.slot, keys: e.keys.map((k) => Object.assign({}, k)) })),
    };
  };
})();
