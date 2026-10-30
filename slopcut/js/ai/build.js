/* SlopCut: a whole edit in one call. build_from_edit_list takes an edit decision list (shared/video/edl.js validates
   it: clips with sources and in/out, titles, transitions, captions, music with ducking, markers, reframe), imports the
   sources it names from Slop Drive, and writes the edit into the project as one undo step, through the same core as the
   single commands (core/edit.js, js/ai/cmd-*.js). SE.ai.build(edl, ctx) is the same for the hidden host (js/ai/host.js). */
(function () {
  'use strict';
  const SE = window.SE, M = SE.model, E = SE.edit, AI = SE.ai, SV = window.SlopVideo;
  const opts = () => ({ transitions: M.TRANSITIONS.map((t) => t[0]), fonts: M.FONTS });

  function place(p, x, meta) {
    const audioOnly = meta.kind === 'audio';
    const track = AI.track(p, (audioOnly ? 'A' : 'V') + x.track);
    const start = x.start != null ? AI.frame(x.start) : M.clipsOn(p, track).reduce((m, c) => Math.max(m, M.end(c)), 0);
    const ids = E.addMedia(p, meta, track, start);
    if (!ids.length) throw new Error(`${meta.name} could not go on ${AI.trackName(p, track)}.`);
    const len = isFinite(meta.dur) ? meta.dur : Infinity, inn = Math.min(x.in, isFinite(len) ? Math.max(0, len - 0.05) : x.in);
    const dur = x.dur != null ? x.dur : isFinite(len) ? (len - inn) / x.speed : 5;
    const avail = isFinite(len) ? (len - inn) / x.speed : Infinity;
    for (const id of ids) {
      const c = M.clip(p, id);
      Object.assign(c, { in: inn, speed: x.speed, dur: Math.max(1 / p.fps, Math.min(dur, avail)) });
      if (c.kind === 'audio') Object.assign(c, { vol: x.mute ? 0 : x.volume, afIn: x.fadeIn, afOut: x.fadeOut });
      else { Object.assign(c, { fadeIn: x.fadeIn, fadeOut: x.fadeOut }); for (const k of ['x', 'y', 'scale']) if (x[k] != null) c[k] = x[k]; }
    }
    const g = new Set(ids);
    for (const id of ids) { const c = M.clip(p, id); E.clearRange(p, c.track, c.start, M.end(c), g); }
    return ids;
  }

  /** Validate, import, and write. Resolves a summary { duration, clips, titles, captions, music, notes }. */
  AI.build = async function (raw, ctx = {}, { replace = true } = {}) {
    const v = SV.edl.validate(raw, opts());
    if (!v.ok) throw new Error('The edit list has problems: ' + v.errors.slice(0, 8).join('; ') + (v.errors.length > 8 ? ` (and ${v.errors.length - 8} more)` : ''));
    const edl = v.edl, metas = new Map();
    const want = edl.clips.map((c) => c.source).concat(edl.music ? [edl.music.source] : []);
    for (let i = 0; i < want.length; i++) {
      if (ctx.signal && ctx.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (!metas.has(want[i])) metas.set(want[i], await AI.media(want[i]));
      if (ctx.progress) ctx.progress((i + 1) / want.length / 2, `Reading ${metas.get(want[i]).name}`);
    }
    const cues = edl.captions ? await AI.cues(edl.captions, ctx) : null;
    const out = { clips: [], titles: [], captions: 0, music: null, notes: v.notes };
    SE.change('Build from edit list', (p) => {
      if (replace) { p.clips = []; p.markers = []; p.io = null; p.layout = null; p.segments = []; }
      p.name = edl.name || p.name;
      const size = edl.width ? { w: edl.width, h: edl.height } : edl.aspect ? SV.presets.aspectSize(edl.aspect) : null;
      if (size) { p.w = size.w; p.h = size.h; }
      if (edl.fps) p.fps = Math.round(edl.fps);
      if (edl.background) p.bg = edl.background;
      const firsts = [];
      for (const x of edl.clips) { const ids = place(p, x, metas.get(x.source)); out.clips.push(ids[0]); firsts.push([ids.map((id) => M.clip(p, id)).find((c) => c.kind !== 'audio') || M.clip(p, ids[0]), x]); }
      for (const [c, x] of firsts) if (x.transition && c.kind !== 'audio') E.setTransition(p, c.id, x.transition.type, x.transition.dur);
      if (edl.reframe) AI.reframe(p, SV.presets.aspectSize(edl.reframe.aspect), { focusX: edl.reframe.focus });
      for (const t of edl.titles) out.titles.push(AI.addTitle(p, Object.assign({}, t, { duration: t.dur })));
      if (cues && cues.length) out.captions = AI.addCaptions(p, cues, edl.captions).ids.length;
      if (edl.music) { const m = edl.music; const c = AI.addMusic(p, metas.get(m.source), { start: m.start, in: m.in, volume: m.volume, duck: m.duck === false ? false : m.duck, fade_in: m.fadeIn, fade_out: m.fadeOut }); out.music = c.id; }
      for (const k of edl.markers) p.markers.push({ id: SE.util.uid('k'), t: AI.frame(k.t), name: k.name || 'Marker ' + (p.markers.length + 1), color: '#ffc94a' });
      p.markers.sort((a, b) => a.t - b.t);
      out.duration = AI.t(M.duration(p));
      out.size = { width: p.w, height: p.h, fps: p.fps };
    });
    SE.emit('settings', {});
    SE.app.select([]);
    return out;
  };

  const EDL_SCHEMA = { type: 'object', description: 'the edit decision list', properties: {
    name: { type: 'string' }, aspect: { type: 'string', enum: SV.edl.ASPECTS }, width: { type: 'integer' }, height: { type: 'integer' }, fps: { type: 'number' },
    clips: { type: 'array', items: { type: 'object', properties: { source: { type: 'string', description: 'Slop Drive file id or name, or bin media id' }, in: { type: 'number' }, out: { type: 'number' }, dur: { type: 'number' }, start: { type: 'number' }, track: { type: 'integer' },
      speed: { type: 'number' }, volume: { type: 'number' }, mute: { type: 'boolean' }, fadeIn: { type: 'number' }, fadeOut: { type: 'number' }, transition: { type: 'object', properties: { type: { type: 'string', enum: M.TRANSITIONS.map((t) => t[0]) }, dur: { type: 'number' } } } }, required: ['source'] } },
    titles: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, start: { type: 'number' }, dur: { type: 'number' }, style: { type: 'string' }, font: { type: 'string' }, size: { type: 'number' }, color: { type: 'string' }, position: { type: 'string', enum: SV.edl.POSITIONS }, animation: { type: 'string' }, exit: { type: 'string' }, background: { type: 'string' } }, required: ['text', 'start'] } },
    captions: { type: 'object', properties: { srt: { type: 'string' }, source: { type: 'string' }, size: { type: 'number' }, position: { type: 'string' } } },
    music: { type: 'object', properties: { source: { type: 'string' }, start: { type: 'number' }, volume: { type: 'number' }, duck: { type: ['boolean', 'number'] }, fadeIn: { type: 'number' }, fadeOut: { type: 'number' } }, required: ['source'] },
    markers: { type: 'array', items: { type: 'object', properties: { t: { type: 'number' }, name: { type: 'string' } } } },
    reframe: { type: 'object', properties: { aspect: { type: 'string', enum: SV.edl.ASPECTS }, focus: { type: 'number' } } } }, required: ['clips'] };
  const EXAMPLE = '{"aspect":"16:9","clips":[{"source":"a.mp4","in":0,"out":4},{"source":"b.mp4","in":2,"out":6,"transition":{"type":"cross","dur":0.5}}],"titles":[{"text":"Hello","start":0.5,"dur":2}],"music":{"source":"song.mp3","duck":0.3}}';

  AI.def([
    { id: 'cut.build', tool: 'build_from_edit_list', title: 'Build from an edit list…', group: 'Sequence', ok: 'Build',
      description: 'Make a whole edit in one call from an edit decision list (JSON): clips (source = Slop Drive file id or name or bin media id, in/out in source seconds, optional track, start, speed, volume, fades, transition into the clip), titles (text, start, dur, style, font, size as a fraction of the height, colour, position top/center/bottom/lower-third, animation), captions (srt text or a Slop Drive subtitle file), music (source, volume, duck level), markers, aspect or width/height, reframe { aspect, focus }. Clips without start follow each other on their track. It replaces the timeline (one undo step). Example: ' + EXAMPLE,
      args: [{ name: 'edit_list', type: 'json', required: true, maxLength: 600000, schema: EDL_SCHEMA }, { name: 'replace', type: 'boolean', default: true, description: 'replace the timeline (false adds to it)' }],
      run: async (a, ctx) => {
        const job = AI.job('Building the edit', ctx);
        try { return await AI.build(a.edit_list, { signal: ctx.signal, progress: (f, m) => job.set(f, m) }, { replace: a.replace }); } finally { job.close(); }
      } },
    { id: 'cut.validateEdl', tool: 'check_edit_list', title: 'Check an edit list…', group: 'Sequence', readOnly: true, macro: false,
      description: 'Check an edit list without changing anything: the problems and notes, and the list as it would be built.',
      args: [{ name: 'edit_list', type: 'json', required: true, maxLength: 600000, schema: EDL_SCHEMA }],
      run: (a) => SV.edl.validate(a.edit_list, opts()) },
  ]);
})();
