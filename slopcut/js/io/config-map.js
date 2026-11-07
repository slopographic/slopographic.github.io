/* SlopCut: the 'project' config kind (app slopedit) as pure data. toData(p) writes the project's frame size, markers and
   tracks with their clips; fromData(data, resolve) turns a checked file back into tracks, clips and markers. Media is never
   in the file: a clip names its file by name and size, and resolve(file, kind) returns the bin id for it (see config.js).
   No DOM and no store, so the Node test runs this file unchanged. Schema and check() live here too. Exposes SE.configMap. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SE = (root.SE = root.SE || {});
  const F = root.SlopConfig.F;
  const CM = (SE.configMap = {});
  const EASES = ['linear', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic'];
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  const num = (x, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const ANIM_PROPS = [['x', 'x'], ['y', 'y'], ['scale', 'scale'], ['rot', 'rotation'], ['opacity', 'opacity']];

  const FILE = F.obj({
    name: F.str({ max: 200, required: true, desc: 'the file name; the file you add later is matched by this name' }),
    size: F.int({ min: 0, max: 1e12, required: true, desc: 'the file size in bytes' }),
  }, { desc: 'the media file a clip uses (video, audio and image clips only). Media is never in the file' });
  const KEY = F.obj({
    t: F.num({ min: 0, max: 86400, required: true, desc: 'seconds from the start of the clip' }),
    value: F.num({ min: -1e5, max: 1e5, required: true, desc: 'an offset for x, y and rotation; a multiplier for scale and opacity (1 is neutral)' }),
    ease: F.enum(EASES, { desc: 'easing of the segment that starts at this key' }),
  });
  const ANIM = F.obj({
    x: F.list(KEY, { desc: 'horizontal offset keys' }), y: F.list(KEY, { desc: 'vertical offset keys' }),
    scale: F.list(KEY, { desc: 'scale keys (multiplier)' }), rotation: F.list(KEY, { desc: 'rotation keys, degrees added' }),
    opacity: F.list(KEY, { desc: 'opacity keys (multiplier)' }),
  }, { desc: 'keyframes of the picture, in clip time' });
  const GAIN_KEY = F.obj({
    t: F.num({ min: 0, max: 86400, required: true, desc: 'seconds from the start of the clip' }),
    value: F.num({ min: 0, max: 4, required: true, desc: 'gain at this time, 1 is unchanged' }),
  });
  const EFFECTS = F.obj({
    brightness: F.num({ min: -100, max: 100, desc: 'brightness, 0 is unchanged' }),
    contrast: F.num({ min: -100, max: 100, desc: 'contrast, 0 is unchanged' }),
    saturation: F.num({ min: -100, max: 100, desc: 'saturation, 0 is unchanged' }),
    temperature: F.num({ min: -100, max: 100, desc: 'warm (positive) or cool (negative), 0 is unchanged' }),
  }, { desc: 'colour adjustments' });
  const FADES = F.obj({
    in: F.num({ min: 0, max: 86400, desc: 'picture fade in, seconds' }), out: F.num({ min: 0, max: 86400, desc: 'picture fade out, seconds' }),
    audioIn: F.num({ min: 0, max: 86400, desc: 'sound fade in, seconds' }), audioOut: F.num({ min: 0, max: 86400, desc: 'sound fade out, seconds' }),
  });
  const CLIP = F.obj({
    kind: F.enum(['video', 'audio', 'image', 'color'], { required: true, desc: 'video, audio and image use a file; color is a solid colour matte' }),
    name: F.str({ max: 120, desc: 'a label, optional' }),
    file: FILE,
    color: F.str({ max: 7, pattern: /^#[0-9a-fA-F]{6}$/, desc: 'colour matte as #rrggbb (colour clips only)' }),
    start: F.num({ min: 0, max: 86400, required: true, desc: 'where the clip starts on the timeline, seconds' }),
    in: F.num({ min: 0, max: 86400, required: true, desc: 'source time where the clip starts, seconds' }),
    out: F.num({ min: 0, max: 86400, required: true, desc: 'source time where the clip ends; must be later than in' }),
    speed: F.num({ min: 0.1, max: 16, desc: 'playback speed, default 1. Timeline length is (out - in) / speed' }),
    position: F.obj({
      x: F.num({ min: -1e5, max: 1e5, desc: 'horizontal offset in pixels from the centre' }),
      y: F.num({ min: -1e5, max: 1e5, desc: 'vertical offset in pixels from the centre' }),
    }),
    scale: F.num({ min: 0.01, max: 1000, desc: 'size, 1 is the fitted size' }),
    rotation: F.num({ min: -3600, max: 3600, desc: 'rotation in degrees' }),
    opacity: F.num({ min: 0, max: 1, desc: '0 to 1' }),
    keyframes: ANIM,
    effects: EFFECTS,
    gain: F.num({ min: 0, max: 4, desc: 'sound level, 1 is unchanged' }),
    gainKeys: F.list(GAIN_KEY, { desc: 'sound level keys over the clip' }),
    fades: FADES,
    link: F.str({ max: 40, desc: 'clips with the same text are one linked group (picture with its sound)' }),
  });
  const TRACK = F.obj({
    name: F.str({ max: 40, required: true, desc: 'unique in the file, e.g. V1 or A1' }),
    kind: F.enum(['video', 'audio'], { required: true }),
    mute: F.bool(), solo: F.bool(), lock: F.bool(), hide: F.bool(),
    clips: F.list(CLIP, { max: 2000, desc: 'the clips on this track, in any order' }),
  });
  const MARKER = F.obj({
    time: F.num({ min: 0, max: 86400, required: true, desc: 'seconds on the timeline' }),
    name: F.str({ max: 120, desc: 'the marker text' }),
  });

  CM.SCHEMA = {
    strict: true,
    fields: {
      dims: F.obj({
        width: F.int({ min: 16, max: 7680, required: true, desc: 'frame width in pixels' }),
        height: F.int({ min: 16, max: 4320, required: true, desc: 'frame height in pixels' }),
        fps: F.int({ min: 1, max: 120, required: true, desc: 'frames per second' }),
      }, { required: true, desc: 'the frame size and frame rate of the sequence' }),
      duration: F.num({ min: 0, max: 86400, desc: 'length in seconds, the end of the last clip. Written by Export; Import ignores it' }),
      markers: F.list(MARKER, { desc: 'markers on the ruler' }),
      tracks: F.list(TRACK, { min: 1, max: 50, required: true, desc: 'video tracks first (V1 is the bottom one), then audio tracks' }),
    },
  };

  /** Rules the schema cannot say. Runs only when the shape is right. Returns [{ path, message }]. */
  CM.check = function (d) {
    const out = [];
    const err = (path, message) => out.push({ path, message });
    const names = new Set();
    d.tracks.forEach((t, ti) => {
      const tp = `tracks[${ti}]`;
      if (names.has(t.name)) err(`${tp}.name`, `"${t.name}" is already the name of another track`);
      names.add(t.name);
      (t.clips || []).forEach((c, ci) => {
        const cp = `${tp}.clips[${ci}]`;
        if (!(c.out > c.in)) err(`${cp}.out`, 'must be later than in');
        if (c.kind === 'color') {
          if (!c.color) err(`${cp}.color`, 'a colour clip needs a colour');
          if (c.file) err(`${cp}.file`, 'a colour clip uses no file');
        } else if (!c.file) err(`${cp}.file`, `a ${c.kind} clip needs the file it uses`);
        if (c.kind === 'audio' && t.kind !== 'audio') err(`${cp}.kind`, 'audio clips go on an audio track');
        if (c.kind !== 'audio' && t.kind !== 'video') err(`${cp}.kind`, 'picture clips go on a video track');
      });
    });
    return out;
  };

  /** A plain copy of a clip's picture keys (rot becomes rotation). null when there are none. */
  function animOut(anim) {
    if (!anim) return null;
    const k = {};
    for (const [prop, key] of ANIM_PROPS) {
      const list = anim[prop];
      if (list && list.length) k[key] = list.map((x) => ({ t: r6(x.t), value: r6(x.value), ease: x.ease || 'linear' }));
    }
    return Object.keys(k).length ? k : null;
  }

  /** The project as file data, and how many clips were left out (titles and random effect layers are not in the format). */
  CM.toData = function (p) {
    const M = SE.model;
    const links = new Map();
    let skipped = 0;
    const clipOut = (c) => {
      if (c.kind !== 'video' && c.kind !== 'audio' && c.kind !== 'image' && c.kind !== 'color') { skipped++; return null; }
      const o = { kind: c.kind };
      if (c.name) o.name = c.name;
      if (c.kind === 'color') o.color = c.color;
      else {
        const m = M.media(p, c.media);
        if (!m) { skipped++; return null; }
        o.file = { name: m.name, size: m.size || 0 };
      }
      o.start = r6(c.start);
      o.in = r6(c.in);
      o.out = r6(c.in + c.dur * c.speed);
      if (c.speed !== 1) o.speed = r6(c.speed);
      o.position = { x: r6(c.x), y: r6(c.y) };
      o.scale = r6(c.scale);
      o.rotation = r6(c.rot);
      o.opacity = r6(c.opacity);
      const keys = animOut(c.anim);
      if (keys) o.keyframes = keys;
      const fx = {};
      if (c.bright) fx.brightness = r6(c.bright);
      if (c.contrast) fx.contrast = r6(c.contrast);
      if (c.sat) fx.saturation = r6(c.sat);
      if (c.temp) fx.temperature = r6(c.temp);
      if (Object.keys(fx).length) o.effects = fx;
      if (c.vol !== 1) o.gain = r6(c.vol);
      if (c.keys && c.keys.length) o.gainKeys = c.keys.map((k) => ({ t: r6(k.t), value: r6(k.v) }));
      const fd = {};
      if (c.fadeIn) fd.in = r6(c.fadeIn);
      if (c.fadeOut) fd.out = r6(c.fadeOut);
      if (c.afIn) fd.audioIn = r6(c.afIn);
      if (c.afOut) fd.audioOut = r6(c.afOut);
      if (Object.keys(fd).length) o.fades = fd;
      if (c.link) { if (!links.has(c.link)) links.set(c.link, 'L' + (links.size + 1)); o.link = links.get(c.link); }
      return o;
    };
    const tracks = p.tracks.map((t) => ({
      name: t.name, kind: t.kind,
      mute: !!t.mute, solo: !!t.solo, lock: !!t.lock, hide: !!t.hide,
      clips: M.clipsOn(p, t.id).map(clipOut).filter(Boolean),
    }));
    // the length of what the file holds (a title that is left out does not count)
    let end = 0;
    for (const t of tracks) for (const c of t.clips) end = Math.max(end, c.start + (c.out - c.in) / (c.speed || 1));
    const data = {
      dims: { width: p.w, height: p.h, fps: p.fps },
      duration: r6(end),
      markers: p.markers.map((m) => ({ time: r6(m.t), name: m.name || '' })),
      tracks,
    };
    return { data, skipped };
  };

  function clipIn(cd, trackId, resolve, links) {
    const M = SE.model;
    const speed = num(cd.speed, 1);
    const o = {
      kind: cd.kind, track: trackId, name: cd.name || '',
      media: cd.kind === 'color' ? null : resolve(cd.file, cd.kind),
      color: cd.color || M.CLIP.color,
      start: cd.start, in: cd.in, dur: (cd.out - cd.in) / speed, speed,
      x: cd.position ? cd.position.x : 0, y: cd.position ? cd.position.y : 0,
      scale: num(cd.scale, 1), rot: num(cd.rotation, 0), opacity: num(cd.opacity, 1),
      vol: num(cd.gain, 1),
      keys: cd.gainKeys ? cd.gainKeys.map((k) => ({ t: k.t, v: k.value })) : null,
      fadeIn: num(cd.fades && cd.fades.in), fadeOut: num(cd.fades && cd.fades.out),
      afIn: num(cd.fades && cd.fades.audioIn), afOut: num(cd.fades && cd.fades.audioOut),
      bright: num(cd.effects && cd.effects.brightness), contrast: num(cd.effects && cd.effects.contrast),
      sat: num(cd.effects && cd.effects.saturation), temp: num(cd.effects && cd.effects.temperature),
      anim: null,
    };
    if (cd.keyframes) {
      const a = {};
      for (const [prop, key] of ANIM_PROPS) if (cd.keyframes[key]) a[prop] = cd.keyframes[key].map((k) => ({ t: k.t, value: k.value, ease: k.ease || 'linear' }));
      o.anim = Object.keys(a).length ? a : null;
    }
    if (cd.link) {
      if (!links.has(cd.link)) links.set(cd.link, SE.util.uid('l'));
      o.link = links.get(cd.link);
    }
    return M.newClip(o);
  }

  /** A checked file's data as project parts. resolve(file, kind) gives the bin id for a file (existing or new).
   *  Returns { w, h, fps, tracks, clips, markers }; ids are new. Video tracks come first, as in every project. */
  CM.fromData = function (d, resolve) {
    const SEu = SE.util;
    const links = new Map();
    const tracks = [], clips = [];
    const ordered = d.tracks.map((t, i) => ({ t, i })).sort((a, b) => (a.t.kind === b.t.kind ? a.i - b.i : a.t.kind === 'video' ? -1 : 1));
    for (const { t: td } of ordered) {
      const t = { id: SEu.uid('t'), kind: td.kind, name: td.name, mute: !!td.mute, solo: !!td.solo, lock: !!td.lock, hide: !!td.hide };
      tracks.push(t);
      for (const cd of td.clips || []) clips.push(clipIn(cd, t.id, resolve, links));
    }
    return {
      w: d.dims.width, h: d.dims.height, fps: d.dims.fps, tracks, clips,
      markers: (d.markers || []).map((m) => ({ id: SEu.uid('k'), t: m.time, name: m.name || '', color: '#ffc94a' })),
    };
  };
})();
