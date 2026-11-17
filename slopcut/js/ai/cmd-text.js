/* SlopCut commands with arguments (SE.ai): transitions, titles and text, captions (from SRT/VTT text, a Slop Drive
   subtitle file, or Slop Transcribe's engine on a clip), graphics, the random effect layer, markers and the in/out
   range. Titles are the app's own title clips (render/text.js) and presets (ui/effects.js). */
(function () {
  'use strict';
  const SE = window.SE, M = SE.model, E = SE.edit, AI = SE.ai, U = SE.util, SV = window.SlopVideo, FX = SE.effectsPanel;
  const TYPES = M.TRANSITIONS.map((t) => t[0]);
  const STYLES = FX.TITLES.map((t) => t[0]);
  const POS = { top: -0.36, center: 0, bottom: 0.38, 'lower-third': 0.3 };
  const TEXT_ARGS = [
    { name: 'text', type: 'string', maxLength: 500, description: 'the words; \\n for a new line' },
    { name: 'style', type: 'enum', values: STYLES, description: 'a title preset to start from' },
    { name: 'font', type: 'string', maxLength: 60, description: 'font family, e.g. ' + M.FONTS.slice(0, 5).join(', ') },
    { name: 'size', type: 'number', min: 0.01, max: 0.5, description: 'text height as a fraction of the frame height (0.05 = small, 0.12 = headline)' },
    { name: 'color', type: 'color' }, { name: 'background', type: 'string', maxLength: 20, description: 'box colour behind the text, e.g. #000000b0, or "none"' },
    { name: 'outline', type: 'number', min: 0, max: 40, description: 'outline width in px' },
    { name: 'position', type: 'enum', values: SV.edl.POSITIONS, description: 'where on the frame' },
    { name: 'x', type: 'number', min: -1, max: 1, description: 'fine offset from the centre, fraction of the width' },
    { name: 'y', type: 'number', min: -1, max: 1, description: 'fine offset from the centre, fraction of the height (overrides position)' },
    { name: 'animation', type: 'enum', values: SE.text.ANIMS.map((a) => a[0]), description: 'how it comes in' },
    { name: 'exit', type: 'enum', values: SE.text.OUTS.map((a) => a[0]), description: 'how it leaves' },
    { name: 'align', type: 'enum', values: ['left', 'center', 'right'] }, { name: 'bold', type: 'boolean' }, { name: 'italic', type: 'boolean' }];

  /** Title fields from command (or edit list) arguments, over a preset. p: the project (sizes are fractions of its height). */
  AI.titleOf = function (p, a, base) {
    const pre = a.style ? FX.TITLES.find((t) => t[0].toLowerCase() === String(a.style).toLowerCase()) : null;
    const out = base ? { text: Object.assign({}, base.text), x: base.x, y: base.y } : { text: {}, x: 0, y: 0 };
    if (pre) { const r = FX.titlePreset(pre); Object.assign(out.text, r.text); out.x = r.x; out.y = r.y; }
    const tx = out.text;
    if (a.text != null) tx.str = String(a.text).replace(/\\n/g, '\n');
    if (a.font) tx.font = a.font;
    if (a.size != null) tx.size = Math.max(4, Math.round(a.size * p.h));
    if (a.color) tx.color = a.color;
    if (a.background != null) tx.bg = /^(none|transparent|)$/i.test(a.background) ? '' : a.background;
    if (a.outline != null) { tx.strokeW = a.outline; if (a.outline && !tx.stroke) tx.stroke = '#000000'; }
    for (const k of ['align', 'bold', 'italic']) if (a[k] != null) tx[k] = a[k];
    if (a.animation) tx.anim = a.animation;
    if (a.exit) tx.out = a.exit;
    if (a.position) out.y = Math.round(POS[a.position] * p.h);
    if (a.y != null) out.y = Math.round(a.y * p.h);
    if (a.x != null) out.x = Math.round(a.x * p.w);
    return out;
  };
  /** A video track free over [t, t + dur) above V1 (titles go over the pictures); added when none is. */
  AI.freeTrack = function (p, t, dur, min = 1) {
    const vt = M.videoTracks(p).filter((x) => !x.lock);
    const tk = vt.slice(min).find((x) => !p.clips.some((c) => c.track === x.id && c.start < t + dur - 1e-6 && M.end(c) > t + 1e-6));
    return (tk || M.addTrack(p, 'video')).id;
  };
  AI.addTitle = function (p, a) {
    const t = AI.frame(a.start), dur = Math.max(0.2, a.duration || a.dur || 3), f = AI.titleOf(p, Object.assign({ style: a.style || 'Headline' }, a));
    const track = a.track ? AI.track(p, a.track) : AI.freeTrack(p, t, dur);
    return E.addGenerated(p, 'title', track, t, dur, { text: f.text, x: f.x, y: f.y });
  };

  /** Caption cues: SRT/VTT text, a Slop Drive subtitle file, or the Slop Transcribe engine on a clip's media. */
  AI.cues = async function (a, ctx) {
    if (a.srt) { const S = await import(new URL('../convert/js/core/subtitles.js', document.baseURI).href); return SV.edl.cuesOf(S.parseSubs(a.srt), { ms: true }); }
    if (a.source) { const rec = await AI.driveRecord(a.source); return AI.cues({ srt: await rec.blob.text() }, ctx); }
    if (a.transcribe === 'timeline') {   // the edit's own mixed sound, so the cues are in timeline time
      const p = SE.doc, dur = M.duration(p);
      if (!SE.audiomix.hasAudio(p, 0, dur)) throw new Error('The edit has no sound to transcribe.');
      const speech = await import(new URL('../shared/ops/speech.js', document.baseURI).href);
      return SV.edl.cuesOf(await speech.transcribe(AI.wav(await SE.audiomix.render(p, 0, dur, 16000)), { language: a.language || 'auto', signal: ctx.signal, progress: ctx.progress }));
    }
    if (a.transcribe) {
      const c = AI.clip(a.transcribe), item = SE.media.get(c.media);
      if (!item) throw new Error('That clip has no media to transcribe.');
      const speech = await import(new URL('../shared/ops/speech.js', document.baseURI).href);
      const segs = await speech.transcribe(item.blob, { language: a.language || 'auto', signal: ctx.signal, progress: ctx.progress });
      const shift = c.start - c.in / c.speed;   // source time to timeline time
      return SV.edl.cuesOf(segs).map((s) => ({ start: s.start / c.speed + shift, end: s.end / c.speed + shift, text: s.text })).filter((s) => s.end > c.start && s.start < M.end(c));
    }
    throw new Error('Give srt (subtitle text), source (a Slop Drive .srt or .vtt file) or transcribe (a clip id).');
  };
  /** A mono 16-bit WAV of an AudioBuffer (the speech engine decodes it like any file). */
  AI.wav = function (buf) {
    const n = buf.length, ch = buf.numberOfChannels, out = new DataView(new ArrayBuffer(44 + n * 2)), w = (o, t) => [...t].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 2, true);
    const data = [...Array(ch)].map((_, i) => buf.getChannelData(i));
    for (let i = 0; i < n; i++) { let v = 0; for (const d of data) v += d[i]; out.setInt16(44 + i * 2, U.clamp(v / ch, -1, 1) * 32767, true); }
    return new Blob([out.buffer], { type: 'audio/wav' });
  };
  AI.addCaptions = function (p, cues, a = {}) {
    const track = AI.freeTrack(p, cues[0].start, cues[cues.length - 1].end - cues[0].start), ids = [];
    for (const q of cues) {
      const f = AI.titleOf(p, { style: 'Caption', text: q.text, size: a.size || 0.045, position: a.position || 'bottom', color: a.color, background: a.background, animation: 'none', exit: 'none' });
      const start = AI.frame(q.start), dur = Math.max(1 / p.fps, AI.frame(q.end) - start);
      const c = M.newClip({ kind: 'title', track, start, dur, text: f.text, x: f.x, y: f.y, name: 'Caption' });
      p.clips.push(c); ids.push(c.id);
    }
    return { track, ids };
  };

  AI.def([
    { id: 'cut.transition', tool: 'add_transition', title: 'Add a transition…', group: 'Transitions', prefill: () => ({ clip: SE.app.primary() ? SE.app.primary().id : 'selected', type: 'cross' }),
      description: 'A transition into a clip from the clip that ends where it starts on the same track (a cut). "none" removes it. Types: ' + TYPES.join(', ') + '.',
      args: [{ name: 'clip', type: 'string', maxLength: 60, default: 'selected', description: 'the incoming clip (the one after the cut)' },
        { name: 'type', type: 'enum', values: TYPES.concat(['none']), default: 'cross' }, { name: 'duration', type: 'number', min: 0.1, max: 3, default: 0.5, description: 'seconds' }],
      run: (a) => {
        let c = AI.clip(a.clip);
        if (c.kind === 'audio') c = M.linked(SE.doc, c).find((x) => x.kind !== 'audio') || c;
        const id = c.id, prev = M.prevAdjacent(SE.doc, c);
        SE.change(a.type === 'none' ? 'Remove transition' : 'Add transition', (p) => E.setTransition(p, id, a.type === 'none' ? null : a.type, a.duration));
        return a.type === 'none' ? `Removed the transition into ${id}.` : `${a.type} transition (${a.duration} s) into ${id}` + (prev ? ` from ${prev.id}.` : ' (no clip before it: it fades in from the background).');
      } },
    { id: 'cut.title', tool: 'add_title', title: 'Add a title…', group: 'Timeline', prefill: () => ({ start: AI.t(AI.now()), text: 'Title' }),
      description: 'A text overlay (title clip) over the pictures from start for duration seconds, on a free track above V1. Styles: ' + STYLES.join(', ') + '.',
      args: [{ name: 'start', type: 'number', min: 0, max: 86400, required: true, description: 'timeline seconds' }, { name: 'duration', type: 'number', min: 0.2, max: 3600, default: 3 },
        ...TEXT_ARGS.map((x) => (x.name === 'text' ? Object.assign({}, x, { required: true }) : x)), { name: 'track', type: 'string', maxLength: 10, description: 'V2, V3… (default: the first free one)' }],
      run: (a) => SE.change('Add title', (p) => { const id = AI.addTitle(p, a); SE.app.select([id]); return `Added title ${id} on ${AI.trackName(p, M.clip(p, id).track)} at ${AI.t(M.clip(p, id).start)} s.`; }) },
    { id: 'cut.editTitle', tool: 'edit_title', title: 'Edit a title…', group: 'Clip', prefill: () => ({ clip: SE.app.primary() ? SE.app.primary().id : 'selected' }),
      description: 'Change a title clip: its words, font, size, colour, box, position and animation. Only the fields given change.',
      args: [{ name: 'clip', type: 'string', maxLength: 60, default: 'selected' }].concat(TEXT_ARGS),
      run: (a) => {
        const c = AI.clip(a.clip); if (c.kind !== 'title') throw new Error(`${c.id} is not a title.`);
        return SE.change('Edit title', (p) => { const x = M.clip(p, c.id), f = AI.titleOf(p, a, { text: x.text, x: x.x, y: x.y }); Object.assign(x, { text: f.text, x: f.x, y: f.y }); return `Edited title ${c.id}.`; });
      } },
    { id: 'cut.captions', tool: 'add_captions', title: 'Add captions…', group: 'Timeline',
      description: 'Captions as caption title clips on their own track, at the right times: from srt (SRT or WebVTT text), source (a Slop Drive .srt/.vtt), or transcribe (a clip id: its sound is read on this device by Slop Transcribe\'s Whisper engine; the first time the speech model, about 40 MB, is downloaded after a question).',
      args: [{ name: 'srt', type: 'string', maxLength: 500000, description: 'subtitle text' }, { name: 'source', type: 'string', maxLength: 200, description: 'Slop Drive subtitle file id or name' },
        { name: 'transcribe', type: 'string', maxLength: 60, description: 'a clip id to transcribe, or "timeline" for the whole edit\'s sound' }, { name: 'language', type: 'string', maxLength: 20, default: 'auto', description: 'auto or a code like en, sv' },
        { name: 'size', type: 'number', min: 0.01, max: 0.2, default: 0.045 }, { name: 'position', type: 'enum', values: SV.edl.POSITIONS, default: 'bottom' },
        { name: 'color', type: 'color' }, { name: 'background', type: 'string', maxLength: 20 }],
      run: async (a, ctx) => {
        const job = a.transcribe ? AI.job('Transcribing', ctx) : null;
        try {
          const cues = await AI.cues(a, { signal: ctx.signal, progress: job ? (f, m) => job.set(f, m) : null });
          if (!cues.length) throw new Error('There were no captions to add.');
          return SE.change('Add captions', (p) => { const r = AI.addCaptions(p, cues, a); return `Added ${r.ids.length} captions on ${AI.trackName(p, r.track)}, ${AI.t(cues[0].start)}–${AI.t(cues[cues.length - 1].end)} s.`; });
        } finally { if (job) job.close(); }
      } },
    { id: 'cut.graphic', tool: 'add_graphic', title: 'Add a graphic…', group: 'Timeline', prefill: () => ({ start: AI.t(AI.now()) }),
      description: 'An animated graphic (arrow, circle, box, underline, counter, check, bubble, star) over the pictures.',
      args: [{ name: 'shape', type: 'enum', values: (window.SlopGraphics ? SlopGraphics.list().map((g) => g.id) : ['check']), default: 'check' },
        { name: 'start', type: 'number', min: 0, max: 86400, required: true }, { name: 'duration', type: 'number', min: 0.2, max: 600, default: 3 },
        { name: 'color', type: 'color', default: '#d4ff3a' }, { name: 'size', type: 'number', min: 0.05, max: 1, default: 0.3, description: 'fraction of the frame height' },
        { name: 'motion', type: 'enum', values: ['draw', 'pulse', 'bounce', 'pop', 'none'], default: 'draw' }, { name: 'x', type: 'number', min: -1, max: 1, default: 0 }, { name: 'y', type: 'number', min: -1, max: 1, default: 0 }],
      run: (a) => SE.change('Add graphic', (p) => { const t = AI.frame(a.start); const id = E.addGenerated(p, 'graphic', AI.freeTrack(p, t, a.duration), t, a.duration, { gfx: { id: a.shape, color: a.color, size: a.size, anim: a.motion, value: 100 }, x: Math.round(a.x * p.w), y: Math.round(a.y * p.h) }); return `Added graphic ${id}.`; }) },
    { id: 'cut.effectLayer', tool: 'add_effect_layer', title: 'Add an effect layer…', group: 'Timeline', prefill: () => ({ start: AI.t(AI.now()) }),
      description: 'A random effect layer (grain, colour shift, glitch, zoom pulse, vignette) over the tracks below it, from start for duration.',
      args: [{ name: 'start', type: 'number', min: 0, max: 86400, required: true }, { name: 'duration', type: 'number', min: 0.2, max: 3600, default: 5 },
        { name: 'effects', type: 'string', maxLength: 80, default: M.FX_DEFAULT.types.join(','), description: 'comma list of ' + M.FX_DEFAULT.types.join(', ') },
        { name: 'intensity', type: 'number', min: 0, max: 1, default: 0.6 }, { name: 'every', type: 'number', min: 0, max: 60, default: 1, description: 'seconds between changes (0 = one effect)' },
        { name: 'seed', type: 'number', min: 1, max: 4294967295, integer: true }],
      run: (a) => {
        const types = String(a.effects).split(/[\s,]+/).filter((x) => M.FX_DEFAULT.types.includes(x));
        if (!types.length) throw new Error('Name at least one of: ' + M.FX_DEFAULT.types.join(', '));
        return SE.change('Add effect layer', (p) => { const t = AI.frame(a.start); const id = E.addGenerated(p, 'effect', AI.freeTrack(p, t, a.duration), t, a.duration, { name: 'Random effect', fx: { seed: a.seed || SV.seed.make(), every: a.every, intensity: a.intensity, types } }); return `Added effect layer ${id}.`; });
      } },
    { id: 'cut.marker', tool: 'add_marker', title: 'Add a marker…', group: 'Timeline', prefill: () => ({ time: AI.t(AI.now()) }),
      description: 'A named marker on the timeline.', args: [{ name: 'time', type: 'number', min: 0, max: 86400, required: true }, { name: 'name', type: 'string', maxLength: 80 }, { name: 'color', type: 'color', default: '#ffc94a' }],
      run: (a) => SE.change('Add marker', (p) => { const k = { id: U.uid('k'), t: AI.frame(a.time), name: a.name || 'Marker ' + (p.markers.length + 1), color: a.color }; p.markers.push(k); p.markers.sort((x, y) => x.t - y.t); return `Added marker ${k.id} at ${k.t} s.`; }) },
    { id: 'cut.inOut', tool: 'set_in_out', title: 'Set the in and out range…', group: 'Playback', prefill: () => ({ in: SE.doc.io ? SE.doc.io.in : 0, out: SE.doc.io ? SE.doc.io.out : AI.t(M.duration(SE.doc)) }),
      description: 'The in/out range (what export_video with range "io" renders). clear removes it.',
      args: [{ name: 'in', type: 'number', min: 0, max: 86400 }, { name: 'out', type: 'number', min: 0, max: 86400 }, { name: 'clear', type: 'boolean', default: false }],
      run: (a) => SE.change('In and out', (p) => {
        if (a.clear) { p.io = null; return 'Cleared the in/out range.'; }
        if (a.in != null && a.out != null && a.out <= a.in) throw new Error('out must be after in.');
        p.io = { in: a.in != null ? AI.frame(a.in) : (p.io && p.io.in) || 0, out: a.out != null ? AI.frame(a.out) : p.io && p.io.out != null ? p.io.out : null };
        return `In ${p.io.in} s, out ${p.io.out == null ? 'the end' : p.io.out + ' s'}.`;
      }) },
  ]);
})();
