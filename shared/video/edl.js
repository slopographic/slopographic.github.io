/* Shared video core (window.SlopVideo.edl): the edit decision list (EDL) a model or a workflow hands to SlopCut in one
   call, and the small pure maths the AI commands share (reframe to another aspect, music ducking, caption cues).
   Pure: no DOM. Loaded after presets.js (aspect sizes). Node tests run it in a vm context.

   An edit list (JSON, an object or its text):
     { name?, aspect?: '16:9' | '9:16' | '1:1' | '4:5', width?, height?, fps?: 24–60, background?,
       clips: [{ source, in?, out? | dur?, start?, track?: 1–8, speed?: 0.1–16, volume?: 0–2, mute?, fadeIn?, fadeOut?,
                 transition?: type | { type, dur } (into this clip), x?, y?, scale? }],
       titles?: [{ text, start, dur?, style?, font?, size?, color?, position?, animation?, exit?, background? }],
       captions?: { srt? | source? | cues?: [{ start, end, text }], size?, color?, position?, background? },
       music?: { source, start?, in?, volume?, duck?: true | false | level 0–1, fadeIn?, fadeOut? },
       markers?: [{ t, name? }], reframe?: { aspect, focus?: 0–1 } }
   source: a SlopCut media id or name, or a Slop Drive file id or name (imported on the way). Clips without start follow
   the previous clip on their track. Times are seconds.
     validate(raw, { transitions, fonts }) → { ok, edl, errors: [text], notes: [text] }   (the normalised list)
     cover(src, frame, focus) → { scale, x, y }   the clip transform that fills frame (cover, not letterbox) with the
                                                   focus point (0–1 of the source, default the centre) kept in view
     corner(frame, which, scale, margin) → { x, y, scale }   picture-in-picture: tl tr bl br c, margin a fraction
     duckKeys(music, speech, { level, ramp }) → [{ t, v }]  volume keys (clip time) that dip under the speech spans
     cuesOf(list) → [{ start, end, text }] in seconds, sorted, empty text dropped (Whisper segments or parsed SRT in ms) */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const MAX_ITEMS = 300;
  const POSITIONS = ['top', 'center', 'bottom', 'lower-third'];
  const ANIMS = ['none', 'fade', 'slide', 'pop', 'type', 'rise'];
  const ASPECTS = ['16:9', '9:16', '1:1', '4:5'];
  const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const str = (v, n = 500) => (v == null ? '' : String(v)).slice(0, n);
  const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  function reader(errors, notes) {
    /** A number field: undefined when missing, clamped with a note, an error when it cannot be read. */
    return function field(o, key, where, lo, hi, def) {
      if (o[key] === undefined || o[key] === null || o[key] === '') return def;
      const n = num(o[key]);
      if (!Number.isFinite(n)) { errors.push(`${where}: ${key} must be a number`); return def; }
      const c = clamp(n, lo, hi);
      if (c !== n) notes.push(`${where}: ${key} ${n} was changed to ${c}`);
      return c;
    };
  }
  function pick(list, v, where, key, errors, def) {
    if (v === undefined || v === null || v === '') return def;
    const s = String(v).trim().toLowerCase(), hit = list.find((x) => String(x).toLowerCase() === s);
    if (hit === undefined) { errors.push(`${where}: ${key} must be one of ${list.join(', ')}`); return def; }
    return hit;
  }
  function known(o, keys, where, notes) {
    const extra = Object.keys(o).filter((k) => !keys.includes(k));
    if (extra.length) notes.push(`${where}: ignored ${extra.join(', ')}`);
  }

  function validate(raw, opts = {}) {
    const errors = [], notes = [], field = reader(errors, notes);
    const transitions = opts.transitions || ['cross'];
    let o = raw;
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { return { ok: false, edl: null, errors: ['The edit list is not valid JSON: ' + e.message], notes }; } }
    if (Array.isArray(o)) o = { clips: o };
    if (!plain(o)) return { ok: false, edl: null, errors: ['The edit list must be an object with a clips list.'], notes };
    known(o, ['name', 'aspect', 'width', 'height', 'fps', 'background', 'clips', 'titles', 'captions', 'music', 'markers', 'reframe', 'kind', 'v'], 'edit list', notes);
    const edl = { name: str(o.name, 120) || 'Edit', clips: [], titles: [], captions: null, music: null, markers: [], reframe: null };
    edl.aspect = pick(ASPECTS, o.aspect, 'edit list', 'aspect', errors, null);
    const w = field(o, 'width', 'edit list', 16, 7680), h = field(o, 'height', 'edit list', 16, 4320);
    if (w && h) { edl.width = Math.round(w / 2) * 2; edl.height = Math.round(h / 2) * 2; }
    else if (w || h) errors.push('edit list: give both width and height, or an aspect');
    edl.fps = field(o, 'fps', 'edit list', 1, 60);
    if (o.background != null) edl.background = str(o.background, 20);
    const clips = Array.isArray(o.clips) ? o.clips : [];
    if (!clips.length && !(Array.isArray(o.titles) && o.titles.length)) errors.push('edit list: clips must list at least one clip (or titles at least one title)');
    if (clips.length > MAX_ITEMS) errors.push(`edit list: at most ${MAX_ITEMS} clips`);
    clips.slice(0, MAX_ITEMS).forEach((c, i) => {
      const where = `clip ${i + 1}`;
      if (typeof c === 'string') c = { source: c };
      if (!plain(c)) { errors.push(`${where}: must be an object with a source`); return; }
      known(c, ['source', 'in', 'out', 'dur', 'start', 'track', 'speed', 'volume', 'mute', 'fadeIn', 'fadeOut', 'transition', 'x', 'y', 'scale', 'name'], where, notes);
      const source = str(c.source, 200).trim();
      if (!source) { errors.push(`${where}: source is missing (a media id, a Slop Drive file id or a file name)`); return; }
      const x = { source, in: field(c, 'in', where, 0, 86400, 0), track: Math.round(field(c, 'track', where, 1, 8, 1)) };
      const out = field(c, 'out', where, 0, 86400), dur = field(c, 'dur', where, 0.04, 86400);
      if (out !== undefined) { if (out <= x.in) errors.push(`${where}: out (${out}) must be after in (${x.in})`); else x.dur = out - x.in; }
      else if (dur !== undefined) x.dur = dur;
      x.start = field(c, 'start', where, 0, 86400);
      x.speed = field(c, 'speed', where, 0.1, 16, 1);
      if (x.dur !== undefined) x.dur = x.dur / x.speed;   // timeline length: the source span played at that speed
      x.volume = field(c, 'volume', where, 0, 2, 1);
      x.mute = c.mute === true || c.mute === 'true';
      x.fadeIn = field(c, 'fadeIn', where, 0, 30, 0); x.fadeOut = field(c, 'fadeOut', where, 0, 30, 0);
      for (const k of ['x', 'y']) if (c[k] !== undefined) x[k] = field(c, k, where, -10000, 10000);
      if (c.scale !== undefined) x.scale = field(c, 'scale', where, 0.05, 10);
      if (c.transition) {
        const t = typeof c.transition === 'string' ? { type: c.transition } : plain(c.transition) ? c.transition : {};
        const type = pick(transitions, t.type, where, 'transition', errors, null);
        if (type) x.transition = { type, dur: field(t, 'dur', where, 0.1, 3, 0.5) };
        if (i === 0 && type) notes.push(`${where}: a transition into the first clip fades it in from the background`);
      }
      edl.clips.push(x);
    });
    const titles = Array.isArray(o.titles) ? o.titles : [];
    titles.slice(0, MAX_ITEMS).forEach((t, i) => {
      const where = `title ${i + 1}`;
      if (!plain(t)) { errors.push(`${where}: must be an object with text and start`); return; }
      known(t, ['text', 'start', 'dur', 'style', 'font', 'size', 'color', 'position', 'animation', 'exit', 'background', 'x', 'y', 'track'], where, notes);
      const text = str(t.text, 500);
      if (!text.trim()) { errors.push(`${where}: text is missing`); return; }
      const start = field(t, 'start', where, 0, 86400);
      if (start === undefined) { errors.push(`${where}: start is missing (seconds)`); return; }
      const x = { text, start, dur: field(t, 'dur', where, 0.2, 3600, 3) };
      if (t.style != null) x.style = str(t.style, 40);
      if (t.font != null) { x.font = str(t.font, 60); if (opts.fonts && !opts.fonts.includes(x.font)) notes.push(`${where}: font ${x.font} may not be available; the browser picks a fallback`); }
      x.size = field(t, 'size', where, 0.01, 0.5);   // a fraction of the frame height
      if (t.color != null) x.color = str(t.color, 20);
      if (t.background != null) x.background = str(t.background, 20);
      x.position = pick(POSITIONS, t.position, where, 'position', errors, undefined);
      x.animation = pick(ANIMS, t.animation, where, 'animation', errors, undefined);
      x.exit = pick(['same'].concat(ANIMS.filter((a) => a !== 'type')), t.exit, where, 'exit', errors, undefined);
      for (const k of ['x', 'y']) if (t[k] !== undefined) x[k] = field(t, k, where, -1, 1);   // a fraction of the frame from the centre
      for (const k of Object.keys(x)) if (x[k] === undefined) delete x[k];
      edl.titles.push(x);
    });
    if (o.captions != null) {
      const c = plain(o.captions) ? o.captions : typeof o.captions === 'string' ? { srt: o.captions } : null;
      if (!c) errors.push('captions: must be an object with srt, source or cues');
      else {
        const x = {};
        if (typeof c.srt === 'string' && c.srt.trim()) x.srt = c.srt.slice(0, 500000);
        else if (Array.isArray(c.cues)) x.cues = cuesOf(c.cues.slice(0, 5000));
        else if (c.source) x.source = str(c.source, 200);
        else errors.push('captions: give srt (the subtitle text), source (a Slop Drive .srt or .vtt) or cues');
        x.size = field(c, 'size', 'captions', 0.01, 0.2, 0.045);
        x.position = pick(POSITIONS, c.position, 'captions', 'position', errors, 'bottom');
        if (c.color != null) x.color = str(c.color, 20);
        if (c.background != null) x.background = str(c.background, 20);
        edl.captions = x;
      }
    }
    if (o.music != null) {
      const m = plain(o.music) ? o.music : typeof o.music === 'string' ? { source: o.music } : {};
      if (!str(m.source).trim()) errors.push('music: source is missing');
      else {
        const duck = m.duck === false || m.duck === 'false' ? false : m.duck === undefined || m.duck === true || m.duck === 'true' ? 0.3 : field(m, 'duck', 'music', 0, 1, 0.3);
        edl.music = { source: str(m.source, 200).trim(), start: field(m, 'start', 'music', 0, 86400, 0), in: field(m, 'in', 'music', 0, 86400, 0),
          volume: field(m, 'volume', 'music', 0, 2, 0.6), duck, fadeIn: field(m, 'fadeIn', 'music', 0, 30, 1), fadeOut: field(m, 'fadeOut', 'music', 0, 30, 2) };
      }
    }
    for (const [i, k] of (Array.isArray(o.markers) ? o.markers : []).slice(0, MAX_ITEMS).entries()) {
      const t = plain(k) ? field(k, 't', `marker ${i + 1}`, 0, 86400) : num(k);
      if (Number.isFinite(t)) edl.markers.push({ t, name: plain(k) ? str(k.name, 80) : '' });
    }
    if (o.reframe != null) {
      const r = plain(o.reframe) ? o.reframe : { aspect: o.reframe };
      const aspect = pick(ASPECTS, r.aspect, 'reframe', 'aspect', errors, null);
      if (aspect) edl.reframe = { aspect, focus: field(r, 'focus', 'reframe', 0, 1, 0.5) };
    }
    return { ok: !errors.length, edl: errors.length ? null : edl, errors, notes };
  }

  /** The transform (SlopCut clip x, y in project pixels from the centre, scale over the fitted size) that covers the frame. */
  function cover(src, frame, focus = {}) {
    const fit = Math.min(frame.w / src.w, frame.h / src.h), fill = Math.max(frame.w / src.w, frame.h / src.h);
    const scale = fill / fit, w = src.w * fill, h = src.h * fill;
    const fx = clamp(focus.x == null ? 0.5 : focus.x, 0, 1), fy = clamp(focus.y == null ? 0.5 : focus.y, 0, 1);
    // move so the focus point is as near the centre as the picture allows (it never shows an edge)
    const x = clamp((0.5 - fx) * w, -(w - frame.w) / 2, (w - frame.w) / 2), y = clamp((0.5 - fy) * h, -(h - frame.h) / 2, (h - frame.h) / 2);
    return { scale: Math.round(scale * 10000) / 10000, x: Math.round(x), y: Math.round(y) };
  }
  /** Picture in picture: a clip scaled to `scale` of the frame, in a corner with a margin (fraction of the shorter side). */
  function corner(frame, which = 'br', scale = 0.33, margin = 0.04) {
    const m = Math.min(frame.w, frame.h) * margin, hw = (frame.w * scale) / 2, hh = (frame.h * scale) / 2;
    const ax = /l$/.test(which) ? -1 : /r$/.test(which) ? 1 : 0, ay = /^t/.test(which) ? -1 : /^b/.test(which) ? 1 : 0;
    return { scale, x: Math.round(ax * (frame.w / 2 - hw - m)), y: Math.round(ay * (frame.h / 2 - hh - m)) };
  }
  /** Volume keys for a music clip ({ start, dur }) that dip to `level` under each speech span ({ a, b } timeline seconds). */
  function duckKeys(music, speech, { level = 0.3, ramp = 0.25 } = {}) {
    const a0 = music.start, a1 = music.start + music.dur, spans = [];
    for (const s of [...speech].sort((x, y) => x.a - y.a)) {
      const a = Math.max(a0, s.a), b = Math.min(a1, s.b);
      if (b - a < 0.05) continue;
      const last = spans[spans.length - 1];
      if (last && a - last.b < ramp * 2 + 0.1) last.b = Math.max(last.b, b); else spans.push({ a, b });
    }
    const keys = [], r = (v) => Math.round(v * 1000) / 1000;
    for (const s of spans) {
      const u0 = s.a - a0, u1 = s.b - a0;
      if (u0 - ramp > 0) keys.push({ t: r(u0 - ramp), v: 1 });
      keys.push({ t: r(Math.max(0, u0)), v: level }, { t: r(u1), v: level });
      if (u1 + ramp < music.dur) keys.push({ t: r(u1 + ramp), v: 1 });
    }
    return keys;
  }
  /** Cues in seconds from Whisper segments ({ start, end } s) or parsed subtitles ({ start, end } ms, as ms: true). */
  function cuesOf(list, { ms = false } = {}) {
    const k = ms ? 1000 : 1;
    return (list || []).map((c) => ({ start: num(c.start) / k, end: num(c.end) / k, text: String((c && c.text) || '').trim() }))
      .filter((c) => c.text && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start).sort((a, b) => a.start - b.start);
  }

  SV.edl = { validate, cover, corner, duckKeys, cuesOf, POSITIONS, ANIMS, ASPECTS, MAX_ITEMS };
})();
