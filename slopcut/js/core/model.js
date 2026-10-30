/* SlopCut: the project model. Plain JSON (no blobs) so it can be snapshotted for undo and autosaved.
   Project { v, name, w, h, fps, bg, tracks[], clips[], markers[], media[] (metadata only),
             layout (template slots, see layout.js), random (record of the last random edit) }
   Track   { id, kind: 'video'|'audio', name, mute, solo, lock, hide }
   Clip    { id, track, kind: 'video'|'audio'|'image'|'title'|'color'|'effect'|'graphic', media, start, dur, in, speed, link, anim, fx, gfx, … }
   gfx: { id, color, size, anim, value } for graphics (shared/graphics); text.out: how a title leaves ('same' when missing).
   anim: keyframes { x|y|scale|rot|opacity: [{ t, value, ease }] } (see core/anim.js); fx: random effect settings (core/fx-random.js).
   Times are seconds on the timeline (start, dur) or in the source (in). Video tracks draw V1 first (bottom). */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util;
  const M = SE.model = {};

  M.CLIP = {
    kind: 'video', media: null, name: '', start: 0, dur: 5, in: 0, speed: 1, link: null,
    x: 0, y: 0, scale: 1, rot: 0, opacity: 1, cropL: 0, cropT: 0, cropR: 0, cropB: 0,
    bright: 0, contrast: 0, sat: 0, temp: 0, fadeIn: 0, fadeOut: 0, trIn: null,
    vol: 1, keys: null, afIn: 0, afOut: 0, color: '#1b1b22', text: null,
    anim: null, fx: null, mask: null
  };
  /** Random effect layer defaults (kind 'effect'). Reset restores these; a new layer gets a random seed. */
  M.FX_DEFAULT = { seed: 1, every: 1, intensity: 0.6, types: ['grain', 'colour', 'glitch', 'zoom', 'vignette'] };
  M.fxDefault = () => Object.assign({}, M.FX_DEFAULT, { types: M.FX_DEFAULT.types.slice() });
  M.TEXT = { str: 'Title', font: 'Archivo', size: 96, color: '#ffffff', stroke: '#000000', strokeW: 0, bold: true, italic: false, align: 'center', bg: '', anim: 'fade', out: 'fade', shadow: true };
  /** Transition library (core/transitions in render/transitions.js gives the motion). Ids are stored in projects. */
  M.TRANSITIONS = [['cross', 'Cross dissolve'], ['blur', 'Blur dissolve'], ['black', 'Dip to black'], ['white', 'Dip to white'], ['wipe', 'Wipe right'], ['wipe-left', 'Wipe left'], ['wipe-up', 'Wipe up'], ['wipe-down', 'Wipe down'], ['slide', 'Slide'], ['push', 'Push'], ['zoom-in', 'Zoom in'], ['zoom-out', 'Zoom out'], ['spin', 'Spin'], ['glitch', 'Glitch']];
  /** Graphic clip defaults (kind 'graphic'): shape id, colour, size (fraction of the frame height), motion, counter target. */
  M.GFX_DEFAULT = { id: 'check', color: '#d4ff3a', size: 0.3, anim: 'draw', value: 100 };
  M.FONTS = ['Archivo', 'Inter Tight', 'JetBrains Mono', 'Instrument Serif', 'Caveat', 'Dancing Script', 'Great Vibes', 'Georgia', 'Impact', 'Arial', 'Times New Roman', 'Courier New'];
  // sequence sizes [['WxH', label]]: shared/video presets, read each time so the labels follow the language
  Object.defineProperty(M, 'PRESETS', { enumerable: true, get: () => window.SlopVideo.presets.LIST.map((x) => [x.w + 'x' + x.h, x.name]) });

  M.newProject = function (o = {}) {
    const p = { v: 1, name: o.name || 'Untitled project', w: o.w || 1920, h: o.h || 1080, fps: o.fps || 30, bg: '#000000', tracks: [], clips: [], markers: [], media: [], io: null, layout: null, random: null, segments: [] };
    M.addTrack(p, 'video'); M.addTrack(p, 'video'); M.addTrack(p, 'audio'); M.addTrack(p, 'audio');
    return p;
  };
  M.addTrack = function (p, kind) {
    const same = p.tracks.filter((t) => t.kind === kind);
    const t = { id: U.uid('t'), kind, name: (kind === 'video' ? 'V' : 'A') + (same.length + 1), mute: false, solo: false, lock: false, hide: false };
    // keep video tracks before audio tracks in the array
    if (kind === 'video') { const i = p.tracks.findIndex((x) => x.kind === 'audio'); p.tracks.splice(i < 0 ? p.tracks.length : i, 0, t); } else p.tracks.push(t);
    return t;
  };
  M.newClip = function (o) {
    const c = Object.assign({}, M.CLIP, o, { id: o.id || U.uid('c') });
    if (c.kind === 'title') c.text = Object.assign({}, M.TEXT, o.text || {});
    if (c.kind === 'effect' && !c.fx) c.fx = M.fxDefault();
    if (c.kind === 'graphic') c.gfx = Object.assign({}, M.GFX_DEFAULT, c.gfx || {});
    c.mask = SE.mask ? SE.mask.clean(c.mask) : c.mask; // clip mask (core/mask.js), sanitised on load
    return c;
  };

  /* ------------------------------------------------------------ queries */
  M.track = (p, id) => p.tracks.find((t) => t.id === id);
  M.clip = (p, id) => p.clips.find((c) => c.id === id);
  M.media = (p, id) => p.media.find((m) => m.id === id);
  M.end = (c) => c.start + c.dur;
  M.videoTracks = (p) => p.tracks.filter((t) => t.kind === 'video');
  M.audioTracks = (p) => p.tracks.filter((t) => t.kind === 'audio');
  /** Tracks in the order they are shown, top to bottom: V(n)…V1, A1…A(n). */
  M.displayTracks = (p) => M.videoTracks(p).reverse().concat(M.audioTracks(p));
  M.clipsOn = (p, trackId) => p.clips.filter((c) => c.track === trackId).sort((a, b) => a.start - b.start);
  M.duration = (p) => p.clips.reduce((m, c) => Math.max(m, M.end(c)), 0);
  /** Source time inside the media for timeline time t. */
  M.srcAt = (c, t) => c.in + (t - c.start) * c.speed;
  /** How much source the media has (Infinity for stills, titles and mattes). */
  M.srcLen = function (p, c) {
    if (!c.media || c.kind === 'image') return Infinity;
    const m = M.media(p, c.media);
    return m && isFinite(m.dur) ? m.dur : Infinity;
  };
  M.isVisual = (c) => c.kind !== 'audio';
  M.linked = (p, c) => (c.link ? p.clips.filter((x) => x.link === c.link) : [c]);
  /** Clips (visual) at time t on a track; with transitions there can be two. */
  M.clipAt = (p, trackId, t) => p.clips.find((c) => c.track === trackId && t >= c.start && t < M.end(c));
  /** The clip that ends exactly where c starts on the same track (for transitions). */
  M.prevAdjacent = (p, c) => p.clips.find((x) => x.track === c.track && x !== c && Math.abs(M.end(x) - c.start) < 1e-4);
  M.nextAdjacent = (p, c) => p.clips.find((x) => x.track === c.track && x !== c && Math.abs(x.start - M.end(c)) < 1e-4);
  /** Is a track heard/seen given mute/solo/hide? */
  M.trackLive = function (p, t) {
    if (t.kind === 'video') return !t.hide;
    if (t.mute) return false;
    const solo = p.tracks.some((x) => x.kind === 'audio' && x.solo);
    return !solo || t.solo;
  };
  /** Volume envelope of an audio clip at clip-relative time u (keyframes × fades). */
  M.gainAt = function (c, u) {
    let g = c.vol;
    const k = c.keys;
    if (k && k.length) {
      if (u <= k[0].t) g *= k[0].v;
      else if (u >= k[k.length - 1].t) g *= k[k.length - 1].v;
      else for (let i = 1; i < k.length; i++) if (u <= k[i].t) { const a = k[i - 1], b = k[i]; g *= U.lerp(a.v, b.v, (u - a.t) / Math.max(1e-6, b.t - a.t)); break; }
    }
    if (c.afIn > 0 && u < c.afIn) g *= Math.max(0, u / c.afIn);
    if (c.afOut > 0 && u > c.dur - c.afOut) g *= Math.max(0, (c.dur - u) / c.afOut);
    return g;
  };
  /** Opacity multiplier from clip fades at clip-relative time u. */
  M.fadeAt = function (c, u) {
    let a = 1;
    if (c.fadeIn > 0 && u < c.fadeIn) a *= Math.max(0, u / c.fadeIn);
    if (c.fadeOut > 0 && u > c.dur - c.fadeOut) a *= Math.max(0, (c.dur - u) / c.fadeOut);
    return a;
  };
  M.label = function (p, c) {
    if (c.kind === 'title') return (c.text && c.text.str) || U.t('slopedit.core.title');
    if (c.kind === 'color') return U.t('slopedit.core.matte');
    if (c.kind === 'effect') return c.name || U.t('slopedit.fx.random_effect');
    if (c.kind === 'graphic') return c.name || U.t('slopedit.gfx.graphic');
    const m = c.media && M.media(p, c.media);
    return c.name || (m ? m.name : U.t('slopedit.core.clip'));
  };

  /** Strip runtime-only fields and clone (for history and autosave). */
  M.snapshot = (p) => JSON.parse(JSON.stringify(p));
  /** Upgrade/validate a loaded project; unknown fields are kept. */
  M.normalize = function (p) {
    if (!p || !Array.isArray(p.tracks) || !Array.isArray(p.clips)) throw new Error('Not a SlopCut project');
    const out = Object.assign(M.newProject(), p);
    out.markers = p.markers || []; out.media = p.media || [];
    out.clips = p.clips.map((c) => M.newClip(Object.assign({}, c)));
    for (const t of out.tracks) Object.assign(t, Object.assign({ mute: false, solo: false, lock: false, hide: false }, t));
    return out;
  };
})();
