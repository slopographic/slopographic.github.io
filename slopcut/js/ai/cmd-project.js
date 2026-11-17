/* SlopCut commands with arguments (SE.ai): the project. New project, sequence settings, import from Slop Drive, reframe
   to another aspect (cover the frame around a focus point), and music with ducking under the other sound (volume
   keyframes on the music clip, which the mixer already plays: render/audiomix.js). */
(function () {
  'use strict';
  const SE = window.SE, M = SE.model, E = SE.edit, AI = SE.ai, SV = window.SlopVideo;
  const ASPECTS = SV.edl.ASPECTS;
  const sizeOf = (a) => {
    if (a.width && a.height) return SV.presets.clamp(a.width, a.height);
    return a.aspect ? SV.presets.aspectSize(a.aspect) : null;
  };

  /** Reframe the project to a new frame size: picture clips cover it around the focus, titles keep their place. */
  AI.reframe = function (p, size, { focusX = 0.5, focusY = 0.5, ids = null } = {}) {
    const ow = p.w, oh = p.h, k = Math.min(size.w / ow, size.h / oh);
    p.w = size.w; p.h = size.h;
    let n = 0;
    for (const c of p.clips) {
      if (ids && !ids.includes(c.id)) continue;
      if (c.kind === 'title' || c.kind === 'graphic') {
        c.x = Math.round((c.x * size.w) / ow); c.y = Math.round((c.y * size.h) / oh);
        if (c.text) c.text = Object.assign({}, c.text, { size: Math.max(4, Math.round(c.text.size * k)) });
        continue;
      }
      if ((c.kind !== 'video' && c.kind !== 'image') || !c.media) continue;
      const m = M.media(p, c.media);
      if (!m || !m.w || !m.h) continue;
      Object.assign(c, SV.edl.cover({ w: m.w, h: m.h }, size, { x: focusX, y: focusY }));
      n++;
    }
    return n;
  };
  /** A new frame size of the same edit (an export size): positions and text sizes follow, pictures keep their fit. */
  AI.resize = function (p, size) {
    const kx = size.w / p.w, ky = size.h / p.h, k = Math.min(kx, ky);
    for (const c of p.clips) {
      c.x = Math.round(c.x * kx); c.y = Math.round(c.y * ky);
      if (c.text) c.text = Object.assign({}, c.text, { size: Math.max(4, Math.round(c.text.size * k)), strokeW: c.text.strokeW ? Math.max(1, Math.round(c.text.strokeW * k)) : 0 });
    }
    p.w = size.w; p.h = size.h;
  };
  /** Speech spans for ducking: every audible audio clip that is not one of the music clips. */
  AI.speechSpans = function (p, skip) {
    return p.clips.filter((c) => c.kind === 'audio' && !skip.has(c.id) && c.vol > 0.01 && M.trackLive(p, M.track(p, c.track))).map((c) => ({ a: c.start, b: M.end(c) }));
  };
  AI.addMusic = function (p, meta, a) {
    const used = new Set(p.clips.filter((c) => c.kind === 'audio').map((c) => c.track));
    const track = a.track ? AI.track(p, a.track, 'audio') : (M.audioTracks(p).find((t) => !used.has(t.id) && !t.lock) || M.addTrack(p, 'audio')).id;
    const start = AI.frame(a.start || 0), len = isFinite(meta.dur) ? meta.dur : 0;
    const want = a.duration || Math.max(0, M.duration(p) - start) || len;
    const c = M.newClip({ kind: 'audio', media: meta.id, track, start, in: Math.min(a.in || 0, len), dur: Math.max(1 / p.fps, Math.min(want, len - (a.in || 0))), vol: a.volume, afIn: a.fade_in || 0, afOut: a.fade_out || 0, name: meta.name });
    p.clips.push(c);
    E.clearRange(p, track, c.start, M.end(c), new Set([c.id]));
    if (a.duck !== false && a.duck != null) {
      const keys = SV.edl.duckKeys({ start: c.start, dur: c.dur }, AI.speechSpans(p, new Set([c.id])), { level: typeof a.duck === 'number' ? a.duck : 0.3 });
      c.keys = keys.length ? keys : null;
    }
    return c;
  };

  AI.def([
    { id: 'cut.newProject', tool: 'new_project', title: 'New project with a size…', group: 'File', destructive: true, prefill: () => ({ aspect: '16:9' }),
      description: 'Start an empty project (the open one is replaced: save it first). aspect picks a standard size (16:9 1920×1080, 9:16 1080×1920, 1:1 1080×1080, 4:5 1080×1350), or give width and height.',
      args: [{ name: 'aspect', type: 'enum', values: ASPECTS, default: '16:9' }, { name: 'width', type: 'number', min: 16, max: 7680, integer: true }, { name: 'height', type: 'number', min: 16, max: 4320, integer: true },
        { name: 'fps', type: 'number', min: 1, max: 60, integer: true, default: 30, description: 'frames per second (24, 25, 30, 60…)' }, { name: 'name', type: 'string', maxLength: 120, default: 'Untitled project' }],
      run: async (a) => {
        await SE.session.newProject(false);
        const s = sizeOf(a);
        SE.setDoc(M.newProject({ name: a.name, w: s.w, h: s.h, fps: Number(a.fps) }));
        SE.emit('settings', {});
        return `New project "${a.name}", ${s.w}×${s.h}, ${a.fps} fps.`;
      } },
    { id: 'cut.sequence', tool: 'set_sequence', title: 'Sequence size and frame rate…', group: 'Timeline', prefill: () => ({ width: SE.doc.w, height: SE.doc.h, fps: SE.doc.fps }),
      description: 'Change the frame size, frame rate or background colour without moving the clips (reframe also refits the pictures).',
      args: [{ name: 'aspect', type: 'enum', values: ASPECTS }, { name: 'width', type: 'number', min: 16, max: 7680, integer: true }, { name: 'height', type: 'number', min: 16, max: 4320, integer: true },
        { name: 'fps', type: 'number', min: 1, max: 60, integer: true, description: 'frames per second' }, { name: 'background', type: 'color' }, { name: 'name', type: 'string', maxLength: 120 }],
      run: (a) => {
        const s = sizeOf(a), o = {};
        if (s) Object.assign(o, { w: s.w, h: s.h });
        if (a.fps) o.fps = Number(a.fps);
        if (a.background) o.bg = a.background;
        if (a.name) o.name = a.name;
        SE.settings.apply(o);
        return `Sequence ${SE.doc.w}×${SE.doc.h}, ${SE.doc.fps} fps.`;
      } },
    { id: 'cut.import', tool: 'import_media', title: 'Import from Slop Drive by name…', group: 'File',
      description: 'Bring a Slop Drive file (video, sound or picture; id or name) into the bin and return its media id, length, size and whether it has sound. timeline: also add it at the end of V1 (or A1).',
      args: [{ name: 'source', type: 'string', required: true, maxLength: 200, description: 'Slop Drive file id or name' }, { name: 'timeline', type: 'boolean', default: false }],
      run: async (a) => {
        const m = await AI.media(a.source);
        if (a.timeline) SE.app.appendToTimeline([m]);
        return { media: m.id, name: m.name, kind: m.kind, dur: isFinite(m.dur) ? AI.t(m.dur) : null, width: m.w, height: m.h, sound: !!m.hasAudio, onTimeline: !!a.timeline };
      } },
    { id: 'cut.reframe', tool: 'reframe', title: 'Reframe to another aspect…', group: 'Timeline', prefill: () => ({ aspect: SE.doc.w > SE.doc.h ? '9:16' : '16:9' }),
      description: 'Change the frame to another aspect (e.g. 16:9 → 9:16 for a vertical reel): the picture clips are scaled to fill the new frame (cropping the sides), kept around the focus point (0 = left/top, 0.5 = centre, 1 = right/bottom). Titles keep their place.',
      args: [{ name: 'aspect', type: 'enum', values: ASPECTS, default: '9:16' }, { name: 'width', type: 'number', min: 16, max: 7680, integer: true }, { name: 'height', type: 'number', min: 16, max: 4320, integer: true },
        { name: 'focus_x', type: 'number', min: 0, max: 1, default: 0.5 }, { name: 'focus_y', type: 'number', min: 0, max: 1, default: 0.5 },
        { name: 'clips', type: 'string', maxLength: 4000, default: 'all', description: 'clip ids to refit, or "all"' }],
      run: (a) => {
        const s = sizeOf(a), ids = a.clips === 'all' ? null : AI.clips(a.clips);
        const n = SE.change('Reframe', (p) => AI.reframe(p, s, { focusX: a.focus_x, focusY: a.focus_y, ids }));
        SE.emit('settings', {});
        return `Reframed to ${s.w}×${s.h}; ${n} picture clip${n === 1 ? '' : 's'} fill the frame.`;
      } },
    { id: 'cut.music', tool: 'add_music', title: 'Add music with ducking…', group: 'Timeline',
      description: 'Put a sound file (bin media or Slop Drive id or name) under the edit on a free sound track, from start to the end of the edit (or for duration). duck lowers it to that level (0–1) while other sound plays, with short ramps; false keeps it level.',
      args: [{ name: 'media', type: 'string', required: true, maxLength: 200 }, { name: 'start', type: 'number', min: 0, max: 86400, default: 0 }, { name: 'in', type: 'number', min: 0, max: 86400, default: 0 },
        { name: 'duration', type: 'number', min: 0.1, max: 86400 }, { name: 'volume', type: 'number', min: 0, max: 2, default: 0.6 },
        { name: 'duck', type: 'number', min: 0, max: 1, default: 0.3, description: 'level under other sound; 1 = no ducking' },
        { name: 'fade_in', type: 'number', min: 0, max: 30, default: 1 }, { name: 'fade_out', type: 'number', min: 0, max: 30, default: 2 }, { name: 'track', type: 'string', maxLength: 10 }],
      run: async (a) => {
        const meta = await AI.media(a.media);
        if (!meta.hasAudio) throw new Error(`${meta.name} has no sound.`);
        return SE.change('Add music', (p) => { const c = AI.addMusic(p, meta, Object.assign({}, a, { duck: a.duck >= 1 ? false : a.duck })); return `Added ${meta.name} as ${c.id} on ${AI.trackName(p, c.track)}, ${AI.t(c.start)}–${AI.t(M.end(c))} s` + (c.keys ? `, ducked under ${c.keys.length / 4 | 0 || 1} spans of other sound.` : '.'); });
      } },
    { id: 'cut.randomEdit', tool: 'random_edit', title: 'Random edit with options…', group: 'Sequence', prefill: () => ({ aspect: '9:16' }),
      description: 'Reel Remix\'s random edit (the same plan, shared/video): cut the bin\'s videos and pictures into an edit of the target length at a pace, in a layout, from a seed (the same seed and media give the same edit). It replaces the timeline (one undo step).',
      args: [{ name: 'target', type: 'number', min: 1, max: 600, default: 30, description: 'seconds' }, { name: 'pace', type: 'enum', values: SV.random.PACES.map((x) => x[0]), default: 'medium' },
        { name: 'aspect', type: 'enum', values: ASPECTS, default: '9:16' }, { name: 'width', type: 'number', min: 16, max: 7680, integer: true }, { name: 'height', type: 'number', min: 16, max: 4320, integer: true },
        { name: 'layout', type: 'string', maxLength: 30, default: 'none', description: 'none, random, a template id (single, split-h, pip, reel…) or a grid (grid-2x2)' },
        { name: 'switches', type: 'boolean', default: false, description: 'switch layouts at random points' }, { name: 'seed', type: 'string', maxLength: 40, description: '8 hex digits or any text' },
        { name: 'media', type: 'string', maxLength: 4000, default: 'all', description: 'bin media ids (comma list) or all' },
        { name: 'options', type: 'json', maxLength: 100000, description: 'Reel Remix\'s whole plan options (its manifest\'s remix object): used as given, over the fields above' }],
      run: (a) => {
        const pool = a.media === 'all' ? SE.doc.media.filter((m) => SE.media.ready(m.id)) : String(a.media).split(/[\s,]+/).map((id) => SE.doc.media.find((m) => m.id === id || m.name === id)).filter(Boolean);
        const size = sizeOf(a), tpl = a.layout === 'none' ? null : a.layout;
        const o = Object.assign({ target: a.target, pace: a.pace, aspect: a.aspect, size, tpl, switches: a.switches, seed: a.seed ? SV.seed.parse(a.seed) : undefined }, a.options || {});
        const plan = SE.random.plan(o, pool);
        if (!plan) throw new Error('There are no usable videos or pictures in the bin: import some first.');
        SE.change('Random edit', (p) => SE.random.build(p, plan));
        SE.emit('settings', {});
        return `Random edit: ${plan.cuts.length} cuts, ${AI.t(plan.total)} s, seed ${plan.seedHex}.`;
      } },
  ]);
})();
