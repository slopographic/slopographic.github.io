/* SlopCut: timeline editing operations. Pure functions over a project p (call them inside SE.change).
   Overwrite semantics like a pro NLE: a clip dropped or moved onto others cuts them away.
   Linked clips (a video and its audio) move, trim, split and delete together. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model;
  const E = SE.edit = {};
  const EPS = 1e-6;
  E.minDur = (p) => 1 / p.fps;
  const locked = (p, trackId) => { const t = M.track(p, trackId); return !t || t.lock; };

  /** Group = ids plus every clip linked to them. */
  E.group = function (p, ids) {
    const set = new Set(ids);
    for (const c of p.clips) if (set.has(c.id) && c.link) for (const x of p.clips) if (x.link === c.link) set.add(x.id);
    return set;
  };

  /* ---------------------------------------------------- primitive cuts */
  function cutKeys(keys, a, b, shift) {
    if (!keys || !keys.length) return null;
    const out = keys.filter((k) => k.t >= a - EPS && k.t <= b + EPS).map((k) => ({ t: U.round(k.t - shift, 4), v: k.v }));
    return out.length ? out : null;
  }
  /** Move the in edge to timeline time t (keeps the source frames under the rest of the clip). */
  E.setIn = function (c, t) {
    const d = t - c.start;
    c.in = Math.max(0, c.in + d * c.speed); c.start = t; c.dur -= d;
    c.keys = cutKeys(c.keys, d, Infinity, d);
  };
  E.setOut = function (c, t) { c.dur = t - c.start; if (c.keys) c.keys = cutKeys(c.keys, -Infinity, c.dur, 0); };
  /** Split one clip at t; returns the new right-hand clip (already added) or null. */
  E.splitClip = function (p, c, t, link) {
    const md = E.minDur(p) / 2;
    if (t <= c.start + md || t >= M.end(c) - md) return null;
    const r = JSON.parse(JSON.stringify(c));
    r.id = U.uid('c'); r.link = link === undefined ? c.link : link;
    E.setIn(r, t);
    E.setOut(c, t);
    c.fadeOut = 0; c.afOut = 0; r.fadeIn = 0; r.afIn = 0; r.trIn = null;
    p.clips.push(r);
    return r;
  };
  /** Clear [a, b) on a track (overwrite): trims, splits or removes clips not in skip. */
  E.clearRange = function (p, trackId, a, b, skip) {
    if (b - a < EPS) return;
    for (const c of p.clips.slice()) {
      if (c.track !== trackId || (skip && skip.has(c.id))) continue;
      const s = c.start, e = M.end(c);
      if (e <= a + EPS || s >= b - EPS) continue;
      if (s >= a - EPS && e <= b + EPS) p.clips.splice(p.clips.indexOf(c), 1);
      else if (s < a && e > b) { const r = E.splitClip(p, c, b, null); E.setOut(c, a); if (r) r.link = null; }
      else if (s < a) E.setOut(c, a);
      else E.setIn(c, b);
    }
  };

  /* ---------------------------------------------------- ripple shifting */
  /** Shift every clip that starts at or after pivot (unlocked tracks, not in skip) by delta.
   *  A negative delta is limited so nothing overlaps. Returns the delta applied. Markers follow. */
  E.rippleShift = function (p, pivot, delta, skip) {
    const moving = p.clips.filter((c) => !(skip && skip.has(c.id)) && c.start >= pivot - EPS && !locked(p, c.track));
    if (Math.abs(delta) < EPS) return 0;
    if (delta < 0) {
      for (const m of moving) {
        let limit = m.start; // can't go below 0
        for (const c of p.clips) if (c.track === m.track && !moving.includes(c) && !(skip && skip.has(c.id)) && M.end(c) <= m.start + EPS) limit = Math.min(limit, m.start - M.end(c));
        delta = Math.max(delta, -limit);
      }
    }
    for (const m of moving) m.start = U.round(m.start + delta, 6);
    for (const k of p.markers) if (k.t >= pivot - EPS) k.t = Math.max(0, k.t + delta);
    return delta;
  };

  /* ---------------------------------------------------- operations */
  /** Split at t: the given clips (and their links), or everything under t on unlocked tracks. Returns new ids. */
  E.split = function (p, t, ids) {
    const targets = ids && ids.length ? [...E.group(p, ids)].map((id) => M.clip(p, id)) : p.clips.filter((c) => t > c.start && t < M.end(c) && !locked(p, c.track));
    const links = new Map(), out = [];
    for (const c of targets) {
      if (!c || locked(p, c.track)) continue;
      let nl = null;
      if (c.link) { if (!links.has(c.link)) links.set(c.link, U.uid('l')); nl = links.get(c.link); }
      const r = E.splitClip(p, c, t, nl);
      if (r) out.push(r.id);
    }
    return out;
  };
  /** Delete clips (with their links). ripple closes the gaps they leave. */
  E.remove = function (p, ids, { ripple = false } = {}) {
    const g = E.group(p, ids);
    const gone = p.clips.filter((c) => g.has(c.id) && !locked(p, c.track));
    p.clips = p.clips.filter((c) => !gone.includes(c));
    if (ripple && gone.length) {
      const a = Math.min(...gone.map((c) => c.start)), b = Math.max(...gone.map(M.end));
      E.rippleShift(p, b, -(b - a));
    }
    return gone.length;
  };
  /** Move clips by dt seconds and dTrack lanes (within their kind). Overwrites what they land on. */
  E.move = function (p, ids, dt, dTrack = 0, primaryKind) {
    const g = E.group(p, ids), clips = p.clips.filter((c) => g.has(c.id));
    if (!clips.length || clips.some((c) => locked(p, c.track))) return false;
    dt = Math.max(dt, -Math.min(...clips.map((c) => c.start)));
    const kind = primaryKind || M.track(p, clips[0].track).kind;
    const lanes = { video: M.videoTracks(p), audio: M.audioTracks(p) };
    const dest = new Map();
    for (const c of clips) {
      const tk = M.track(p, c.track), list = lanes[tk.kind];
      let i = list.indexOf(tk) + (tk.kind === kind ? dTrack : 0);
      if (i < 0 || i >= list.length || list[i].lock) return false;
      if (c.kind === 'audio' && tk.kind !== 'audio') return false;
      dest.set(c, list[i].id);
    }
    for (const c of clips) { c.start = U.round(c.start + dt, 6); c.track = dest.get(c); }
    for (const c of clips) E.clearRange(p, c.track, c.start, M.end(c), g);
    return true;
  };
  /** Trim one edge ('in' | 'out') of a clip (and its links) to timeline time t. Returns the time applied. */
  E.trim = function (p, id, edge, t, { ripple = false } = {}) {
    const c0 = M.clip(p, id); if (!c0 || locked(p, c0.track)) return null;
    const g = E.group(p, [id]), grp = p.clips.filter((c) => g.has(c.id));
    const md = E.minDur(p);
    for (const c of grp) {
      if (edge === 'in') {
        const shift = t - c0.start; // same shift for every linked clip
        let lo = c.start - c.in / c.speed, hi = M.end(c) - md;
        lo = Math.max(lo, ripple ? -Infinity : 0);
        if (!ripple) for (const x of p.clips) if (x.track === c.track && !g.has(x.id) && M.end(x) <= c.start + EPS) lo = Math.max(lo, M.end(x));
        t = c0.start + U.clamp(shift, lo - c.start, hi - c.start);
      } else {
        const shift = t - M.end(c0);
        let hi = c.start + (M.srcLen(p, c) - c.in) / c.speed, lo = c.start + md;
        if (!ripple) for (const x of p.clips) if (x.track === c.track && !g.has(x.id) && x.start >= M.end(c) - EPS) hi = Math.min(hi, x.start);
        t = M.end(c0) + U.clamp(shift, lo - M.end(c), hi - M.end(c));
      }
    }
    if (edge === 'in') {
      const d = t - c0.start;
      if (Math.abs(d) < EPS) return t;
      if (!ripple) { for (const c of grp) E.setIn(c, c.start + d); return t; }
      const pivot = M.end(c0);
      for (const c of grp) { const s = c.start; E.setIn(c, s + d); c.start = s; }
      const applied = E.rippleShift(p, pivot, -d, g);
      if (Math.abs(applied + d) > EPS) for (const c of grp) c.dur += -d - applied; // partially blocked: keep it consistent
      return t;
    }
    const d = t - M.end(c0);
    if (Math.abs(d) < EPS) return t;
    const pivot = M.end(c0);
    if (ripple) {
      const applied = E.rippleShift(p, pivot, d, g);
      for (const c of grp) E.setOut(c, M.end(c) + applied);
      return pivot + applied;
    }
    for (const c of grp) E.setOut(c, M.end(c) + d);
    return t;
  };
  /** Change playback speed (keeps the in point; later clips ripple). */
  E.setSpeed = function (p, id, speed) {
    const c0 = M.clip(p, id); if (!c0) return;
    speed = U.clamp(speed, 0.1, 16);
    const g = E.group(p, [id]), grp = p.clips.filter((c) => g.has(c.id));
    const pivot = M.end(c0);
    let nd = c0.dur * c0.speed / speed;
    for (const c of grp) nd = Math.min(nd, (M.srcLen(p, c) - c.in) / speed);
    const applied = E.rippleShift(p, pivot - 1e-4, nd - c0.dur, g);
    const dur = Math.max(E.minDur(p), c0.dur + applied);   // once: c0 is in the group and changes in the loop
    for (const c of grp) { c.speed = speed; c.dur = dur; c.keys = null; }
  };
  /** Snap t to the nearest edit point within tol seconds. Returns { t, hit }. */
  E.snap = function (p, t, tol, skip, extra = []) {
    let best = t, bd = tol, hit = null;
    const test = (x, what) => { const d = Math.abs(x - t); if (d < bd) { bd = d; best = x; hit = what; } };
    test(0, 'start');
    for (const x of extra) test(x, 'playhead');
    for (const c of p.clips) if (!(skip && skip.has(c.id))) { test(c.start, 'clip'); test(M.end(c), 'clip'); }
    for (const k of p.markers) test(k.t, 'marker');
    return { t: best, hit };
  };
  /** Add a media item at start on a track (with a linked audio clip when it has sound). Returns new ids. */
  E.addMedia = function (p, meta, trackId, start) {
    let tk = M.track(p, trackId);
    const dur = meta.kind === 'image' ? 5 : meta.dur || 5;
    const out = [];
    if (meta.kind === 'audio' || tk.kind === 'audio') {
      if (tk.kind !== 'audio') tk = M.audioTracks(p)[0] || M.addTrack(p, 'audio');
      if (meta.kind === 'image' || (meta.kind === 'video' && !meta.hasAudio)) return out;
      const c = M.newClip({ kind: 'audio', media: meta.id, track: tk.id, start, dur });
      p.clips.push(c); out.push(c.id);
      E.clearRange(p, tk.id, c.start, M.end(c), new Set(out));
      return out;
    }
    const v = M.newClip({ kind: meta.kind, media: meta.id, track: tk.id, start, dur });
    p.clips.push(v); out.push(v.id);
    if (meta.kind === 'video' && meta.hasAudio) {
      const vi = M.videoTracks(p).indexOf(tk), auds = M.audioTracks(p);
      while (auds.length <= vi) auds.push(M.addTrack(p, 'audio'));
      const at = auds.slice(vi).find((t) => !t.lock) || M.addTrack(p, 'audio');
      const a = M.newClip({ kind: 'audio', media: meta.id, track: at.id, start, dur });
      v.link = a.link = U.uid('l');
      p.clips.push(a); out.push(a.id);
    }
    const g = new Set(out);
    for (const id of out) { const c = M.clip(p, id); E.clearRange(p, c.track, c.start, M.end(c), g); }
    return out;
  };
  /** Add a generated clip (title or colour matte). */
  E.addGenerated = function (p, kind, trackId, start, dur = 5, extra = {}) {
    const c = M.newClip(Object.assign({ kind, track: trackId, start, dur }, extra));
    p.clips.push(c);
    E.clearRange(p, trackId, c.start, M.end(c), new Set([c.id]));
    return c.id;
  };
  /** Set (or clear with type null) the transition into a clip. */
  E.setTransition = function (p, id, type, dur) {
    const c = M.clip(p, id); if (!c) return;
    if (!type) { c.trIn = null; return; }
    const prev = M.prevAdjacent(p, c);
    const max = Math.min(c.dur, prev ? prev.dur : c.dur);
    c.trIn = { type, dur: U.clamp(dur || 1, E.minDur(p), max) };
  };
  E.unlink = function (p, ids) { for (const id of E.group(p, ids)) M.clip(p, id).link = null; };
  E.link = function (p, ids) { const l = U.uid('l'); for (const id of ids) M.clip(p, id).link = l; };
})();
