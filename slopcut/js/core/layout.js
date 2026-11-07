/* SlopCut: layouts on the project. The geometry and templates come from shared/video (SlopVideo.layout,
   .templates, .presets). Here: the project operations. p.layout = { tpl, start, dur, slots[] } where slot i
   holds a clip id (or null). Slot i lives on video track V(i+1) (its linked audio on A(i+1)), all starting at
   layout.start and lasting layout.dur (or less when the source is shorter). Pure functions over a project p;
   call them inside SE.change. Changing the template keeps the clips and re-flows them. */
(function () {
  'use strict';
  const SE = window.SE, SV = window.SlopVideo, M = SE.model, E = SE.edit, T = SV.templates, S = SV.slots;
  const L = SE.layout = {};
  SE.templates = SV.templates; SE.seed = SV.seed; // the shared modules, under their old names

  /** Transform (x, y, scale) that fits a clip's picture inside a region of the sequence frame. */
  L.fit = function (p, c, r) {
    const m = c.media && M.media(p, c.media);
    return SV.layout.fit({ w: p.w, h: p.h }, m ? { w: m.w, h: m.h } : null, r); // mattes and titles are frame sized
  };
  /** Make sure video (or audio) track i exists; returns it. */
  L.ensureTrack = function (p, kind, i) {
    const list = () => (kind === 'video' ? M.videoTracks(p) : M.audioTracks(p));
    while (list().length <= i) M.addTrack(p, kind);
    return list()[i];
  };
  L.setAspect = function (p, name) {
    const s = SV.presets.aspectSize(name);
    if (s) { p.w = s.w; p.h = s.h; }
  };
  /** Clip ids of a clip's group (itself plus linked audio/video). */
  const groupOf = (p, id) => { const g = E.group(p, [id]); return p.clips.filter((c) => g.has(c.id)); };

  /** Pass 1 of a re-flow: put slot clip id into slot i (track, start, length, transform). Returns its group. */
  function move(p, id, i, lay) {
    const c0 = M.clip(p, id), tpl = T.get(lay.tpl), r = T.region(tpl, i);
    if (!c0) return null;
    const grp = groupOf(p, id);
    let d = lay.dur;
    if (c0.media && c0.kind !== 'color' && c0.kind !== 'title') {
      const len = M.srcLen(p, c0);
      if (isFinite(len)) d = Math.min(d, (len - c0.in) / c0.speed);
    }
    d = Math.max(E.minDur(p), d);
    const vt = L.ensureTrack(p, 'video', i);
    for (const c of grp) {
      c.track = c.kind === 'audio' ? L.ensureTrack(p, 'audio', i).id : vt.id;
      c.start = lay.start;
      E.setOut(c, lay.start + d);
    }
    if (r && c0.kind !== 'audio') Object.assign(c0, L.fit(p, c0, r));
    return grp;
  }
  /** Re-flow every slot of the layout to its track, time and transform. Clips that are not in a slot are kept. */
  L.reflow = function (p) {
    const lay = p.layout;
    if (!lay || !T.get(lay.tpl)) return;
    for (let i = 0; i < lay.slots.length; i++) L.ensureTrack(p, 'video', i); // one track row per slot, even when empty
    const placed = [], all = new Set();
    lay.slots.forEach((id, i) => {
      if (!id || i >= T.get(lay.tpl).slots.length) return;
      const grp = move(p, id, i, lay);
      if (grp) { placed.push({ grp, id }); for (const c of grp) all.add(c.id); }
    });
    // Pass 2 only after every slot has moved, so a swap never overwrites a clip that has yet to move.
    for (const { grp } of placed) for (const c of grp) E.clearRange(p, c.track, c.start, M.end(c), all);
  };
  /** Apply a template to clips (in order) as a new layout. Returns how many clips were placed. */
  L.apply = function (p, tplId, clipIds, opts = {}) {
    const tpl = T.get(tplId);
    if (!tpl) return 0;
    const used = clipIds.map((id) => M.clip(p, id)).filter((c) => c && c.kind !== 'audio').slice(0, tpl.slots.length);
    if (!used.length) return 0;
    if (tpl.aspect) L.setAspect(p, tpl.aspect);
    const start = Math.min(...used.map((c) => c.start));
    let dur = Math.min(...used.map((c) => c.dur));
    if (opts.dur) dur = Math.min(dur, opts.dur);
    p.layout = { tpl: tpl.id, start: SE.util.round(start, 6), dur: SE.util.round(dur, 6), slots: tpl.slots.map((_, i) => (used[i] ? used[i].id : null)) };
    L.reflow(p);
    return used.length;
  };
  /** A layout with every slot empty, starting at start (its tracks are created). Clips are added by dragging. */
  L.empty = function (p, tplId, start, dur) {
    const tpl = T.get(tplId);
    if (!tpl) return false;
    if (tpl.aspect) L.setAspect(p, tpl.aspect);
    p.layout = { tpl: tpl.id, start: SE.util.round(start, 6), dur: SE.util.round(dur || tpl.dur, 6), slots: S.empty(tpl.id) };
    L.reflow(p);
    return true;
  };
  /** Change the template of the current layout; clips stay, extra ones leave the layout. */
  L.setTemplate = function (p, tplId) {
    const tpl = T.get(tplId);
    if (!p.layout || !tpl) return false;
    p.layout.tpl = tpl.id;
    p.layout.slots = S.resize(p.layout.slots, tpl.slots.length);
    if (tpl.aspect) L.setAspect(p, tpl.aspect);
    L.reflow(p);
    return true;
  };
  L.swap = function (p, i, j) {
    const lay = p.layout;
    if (!lay || i === j || i >= lay.slots.length || j >= lay.slots.length) return false;
    lay.slots = S.swap(lay.slots, i, j);
    L.reflow(p);
    return true;
  };
  /** Drop an existing clip into slot i. A clip already in a slot swaps places with the occupant. */
  L.put = function (p, i, id) {
    const lay = p.layout, c = M.clip(p, id);
    if (!lay || !c || c.kind === 'audio' || i >= lay.slots.length) return false;
    lay.slots = S.fill(lay.slots, i, id);
    L.reflow(p);
    return true;
  };
  /** Create the clips for a bin item at time start (video plus linked sound). Returns the video clip id. */
  L.createMedia = function (p, meta, start, dur) {
    const v = M.newClip({ kind: meta.kind === 'image' ? 'image' : 'video', media: meta.id, track: M.videoTracks(p)[0].id, start, dur });
    p.clips.push(v);
    if (meta.kind === 'video' && meta.hasAudio) {
      const a = M.newClip({ kind: 'audio', media: meta.id, track: L.ensureTrack(p, 'audio', 0).id, start, dur, link: SE.util.uid('l') });
      v.link = a.link;
      p.clips.push(a);
    }
    return v.id;
  };
  /** Put a bin item into slot i of the current layout (a new clip at the layout start). */
  L.placeMedia = function (p, i, meta) {
    const lay = p.layout;
    if (!lay || i >= lay.slots.length || !meta) return false;
    lay.slots = S.fill(lay.slots, i, L.createMedia(p, meta, lay.start, lay.dur));
    L.reflow(p);
    return true;
  };
  /** Empty slot i (its clip stays on the timeline, where it is). */
  L.free = function (p, i) { if (p.layout && i < p.layout.slots.length) p.layout.slots = S.free(p.layout.slots, i); };
  L.clear = function (p) { p.layout = null; };
})();
