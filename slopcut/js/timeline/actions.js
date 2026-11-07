/* SlopCut: timeline actions run by commands (split, delete, clipboard, markers, in/out, titles,
   transitions, fades, nudging, trimming to the playhead, tracks). They live on SE.act. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, E = SE.edit, A = SE.app, act = SE.act;
  const now = () => (SE.player ? SE.player.time : 0);
  const fps = () => SE.doc.fps;
  let clipboard = null;

  act.splitAt = function (t, ids) {
    const out = SE.change(U.t('slopedit.insp.split'), (p) => { const r = E.split(p, U.snapFrame(t, p.fps), ids); return r.length ? r : false; });
    if (out === false) A.status(U.t('slopedit.tl.nothing_to_split_here'));
  };
  /** S: split the selected clips under the playhead (or every track when none is selected or all=true). */
  act.split = function (all) {
    const t = now(), sel = A.selectedIds().filter((id) => { const c = M.clip(SE.doc, id); return c && t > c.start && t < M.end(c); });
    act.splitAt(t, all || !sel.length ? null : sel);
  };
  act.remove = function (ripple) {
    const ids = A.selectedIds(); if (!ids.length) return;
    SE.change(ripple ? U.t('slopedit.cmd.ripple_delete') : 'Delete', (p) => E.remove(p, ids, { ripple }));
    A.select([]);
  };
  act.selectAll = () => A.select(SE.doc.clips.map((c) => c.id));
  act.copy = function () {
    const g = E.group(SE.doc, A.selectedIds()), clips = SE.doc.clips.filter((c) => g.has(c.id));
    if (!clips.length) return;
    const t0 = Math.min(...clips.map((c) => c.start));
    clipboard = clips.map((c) => Object.assign(JSON.parse(JSON.stringify(c)), { start: c.start - t0 }));
    A.status(U.t('slopedit.tl.copied', { n: clips.length }));
  };
  act.cut = function () { act.copy(); act.remove(false); };
  act.paste = function () {
    if (!clipboard) { A.status(U.t('slopedit.tl.nothing_to_paste')); return; }
    const t = now(), links = new Map();
    SE.change(U.t('slopedit.tl.paste'), (p) => {
      const ids = [];
      for (const c0 of clipboard) {
        if (!M.track(p, c0.track)) continue;
        const c = Object.assign(JSON.parse(JSON.stringify(c0)), { id: U.uid('c'), start: U.round(t + c0.start, 6) });
        if (c.link) { if (!links.has(c.link)) links.set(c.link, U.uid('l')); c.link = links.get(c.link); }
        p.clips.push(c); ids.push(c.id);
      }
      const g = new Set(ids);
      for (const id of ids) { const c = M.clip(p, id); E.clearRange(p, c.track, c.start, M.end(c), g); }
      A.select(ids);
    });
  };
  act.duplicate = function () {
    const g = E.group(SE.doc, A.selectedIds()), clips = SE.doc.clips.filter((c) => g.has(c.id));
    if (!clips.length) return;
    const end = Math.max(...clips.map(M.end));
    act.copy();
    const t = SE.player.time; SE.player.time = end; act.paste(); SE.player.time = t;
  };
  act.toggleLink = function () {
    const ids = A.selectedIds();
    const linked = ids.some((id) => M.clip(SE.doc, id).link);
    SE.change(linked ? U.t('slopedit.tl.unlink') : U.t('slopedit.tl.link'), (p) => (linked ? E.unlink(p, ids) : ids.length > 1 ? E.link(p, ids) : false));
  };
  act.nudge = function (frames) {
    const ids = A.selectedIds(); if (!ids.length) return;
    SE.change(U.t('slopedit.tl.nudge'), (p) => E.move(p, ids, frames / p.fps, 0), { key: 'nudge' });
  };
  /** Q / W: ripple-trim the clip under the playhead on the targeted tracks so it starts / ends here. */
  act.trimToPlayhead = function (edge) {
    const t = U.snapFrame(now(), fps());
    const sel = A.selectedIds().map((id) => M.clip(SE.doc, id)).filter((c) => c && t > c.start && t < M.end(c));
    const c = sel[0] || SE.doc.clips.find((x) => t > x.start && t < M.end(x) && !M.track(SE.doc, x.track).lock);
    if (!c) { A.status(U.t('slopedit.tl.no_clip_under_the_playhead')); return; }
    const start = c.start;
    SE.change(edge === 'in' ? U.t('slopedit.tl.ripple_trim_start') : U.t('slopedit.tl.ripple_trim_end'), (p) => E.trim(p, c.id, edge, t, { ripple: true }));
    if (edge === 'in') SE.player.seek(start);
  };
  /** Up/Down: jump to the previous/next edit point (clip edges, markers). */
  act.gotoEdit = function (dir) {
    const t = now(), pts = new Set([0]);
    for (const c of SE.doc.clips) { pts.add(U.round(c.start, 4)); pts.add(U.round(M.end(c), 4)); }
    for (const k of SE.doc.markers) pts.add(U.round(k.t, 4));
    const s = [...pts].sort((a, b) => a - b);
    const next = dir > 0 ? s.find((x) => x > t + 1e-4) : s.reverse().find((x) => x < t - 1e-4);
    if (next != null) SE.player.seek(next);
  };
  act.addMarker = function () {
    const t = U.snapFrame(now(), fps());
    if (SE.doc.markers.some((k) => Math.abs(k.t - t) < 1e-3)) { A.status(U.t('slopedit.tl.there_is_already_a_marker')); return; }
    SE.change(U.t('slopedit.cmd.add_marker'), (p) => { p.markers.push({ id: U.uid('k'), t, name: 'Marker ' + (p.markers.length + 1), color: '#ffc94a' }); p.markers.sort((a, b) => a.t - b.t); }); // i18n-ignore: names stored in the project
  };
  act.editMarker = async function (id) {
    const k = SE.doc.markers.find((m) => m.id === id); if (!k) return;
    const v = await SlopUI.prompt(U.t('slopedit.tl.marker'), U.t('slopedit.bin.name'), k.name || '');
    if (v != null) SE.change(U.t('slopedit.tl.rename_marker'), (p) => { p.markers.find((m) => m.id === id).name = v; });
  };
  act.removeMarker = (id) => SE.change(U.t('slopedit.tl.delete_marker'), (p) => { p.markers = p.markers.filter((m) => m.id !== id); });
  act.markIn = () => SE.change(U.t('slopedit.cmd.mark_in'), (p) => { p.io = Object.assign({}, p.io, { in: U.snapFrame(now(), p.fps) }); if (p.io.out != null && p.io.out <= p.io.in) p.io.out = null; });
  act.markOut = () => SE.change(U.t('slopedit.cmd.mark_out'), (p) => { p.io = Object.assign({}, p.io, { out: U.snapFrame(now(), p.fps) }); if (p.io.in != null && p.io.in >= p.io.out) p.io.in = null; });
  act.clearInOut = () => SE.change(U.t('slopedit.tl.clear_in_out'), (p) => { p.io = null; });

  /** Track for a new title/matte: the lowest video track that is free at the playhead (adds one if needed). */
  function freeVideoTrack(p, t, dur) {
    const vt = M.videoTracks(p).filter((x) => !x.lock);
    return (vt.slice(1).find((tk) => !p.clips.some((c) => c.track === tk.id && c.start < t + dur && M.end(c) > t)) || M.addTrack(p, 'video')).id;
  }
  act.addTitle = function (preset) {
    const t = U.snapFrame(now(), fps());
    SE.change(U.t('slopedit.tl.add_title'), (p) => { const id = E.addGenerated(p, 'title', freeVideoTrack(p, t, 4), t, 4, preset || {}); A.select([id]); });
    if (SE.inspector) SE.inspector.focusText();
  };
  /** A graphic from the library at the playhead (gfx: { id, color, size, anim }). */
  act.addGraphic = function (gfx) {
    const t = U.snapFrame(now(), fps());
    SE.change(U.t('slopedit.tl.add_graphic'), (p) => { const id = E.addGenerated(p, 'graphic', freeVideoTrack(p, t, 3), t, 3, { gfx: Object.assign({}, gfx) }); A.select([id]); });
  };
  act.addColor = function (color) {
    const t = U.snapFrame(now(), fps());
    SE.change(U.t('slopedit.tl.add_colour_matte'), (p) => { const id = E.addGenerated(p, 'color', M.videoTracks(p)[0].id, t, 5, { color: color || '#1b1b22' }); A.select([id]); });
  };
  act.addTrack = (kind) => SE.change(U.t('slopedit.tl.add_track'), (p) => { M.addTrack(p, kind); });
  /** Add a transition to the selected clip, or to the cut nearest the playhead. */
  act.addTransition = function (type) {
    let c = A.primary();
    if (!c || !type) {
      if (!type) { if (c) SE.change(U.t('slopedit.cmd.remove_transition'), (p) => E.setTransition(p, c.id, null)); return; }
    }
    if (!c) {
      const t = now(); let best = null;
      for (const x of SE.doc.clips) if (x.kind !== 'audio' && M.prevAdjacent(SE.doc, x) && (!best || Math.abs(x.start - t) < Math.abs(best.start - t))) best = x;
      c = best;
    } else if (c.kind === 'audio') { const v = M.linked(SE.doc, c).find((x) => x.kind !== 'audio'); if (v) c = v; }
    if (!c) { A.status(U.t('slopedit.tl.select_a_clip_or_put')); return; }
    const id = c.id;
    SE.change(U.t('slopedit.menu.add_transition'), (p) => E.setTransition(p, id, type, SE.transitions.dur));
    A.select([id]);
  };
  act.fade = function (which) {
    const ids = A.selectedIds(); if (!ids.length) return;
    SE.change(which === 'in' ? U.t('slopedit.insp.fade_in') : U.t('slopedit.insp.fade_out'), (p) => {
      for (const id of E.group(p, ids)) {
        const c = M.clip(p, id), d = Math.min(1, c.dur / 2);
        if (c.kind === 'audio') c[which === 'in' ? 'afIn' : 'afOut'] = d; else c[which === 'in' ? 'fadeIn' : 'fadeOut'] = d;
      }
    });
  };
  act.addVolumeKey = function () {
    const t = now(), c = A.selectedIds().map((id) => M.clip(SE.doc, id)).find((x) => x && x.kind === 'audio' && t >= x.start && t <= M.end(x));
    if (!c) { A.status(U.t('slopedit.tl.select_an_audio_clip_under')); return; }
    SE.change(U.t('slopedit.tl.add_keyframe'), (p) => { const cc = M.clip(p, c.id), u = U.round(t - cc.start, 3); const v = cc.keys && cc.keys.length ? M.gainAt(Object.assign({}, cc, { vol: 1, afIn: 0, afOut: 0 }), u) : 1; cc.keys = (cc.keys || []).filter((k) => Math.abs(k.t - u) > 1e-3).concat({ t: u, v: U.round(v, 3) }).sort((a, b) => a.t - b.t); });
  };
  /** Reset all: a clip's settings go back to their defaults. Media, timing, text, colour matte and links stay. */
  act.resetClip = function () {
    const ids = A.selectedIds();
    SE.change(U.t('slopedit.tl.reset_clip'), (p) => { for (const id of ids) resetAll(M.clip(p, id)); });
  };
  function resetAll(c) {
    if (!c) return;
    if (c.kind === 'effect') { c.fx = M.fxDefault(); return; }
    for (const k of ['x', 'y', 'scale', 'rot', 'opacity', 'cropL', 'cropT', 'cropR', 'cropB', 'bright', 'contrast', 'sat', 'temp', 'fadeIn', 'fadeOut', 'vol', 'afIn', 'afOut']) c[k] = M.CLIP[k];
    c.trIn = null; c.keys = null; c.anim = null;
  }
  /** Keyframes at the playhead: one key per property, holding its current value (so nothing jumps). */
  act.keyAtPlayhead = function () {
    const t = now(), AN = SE.anim;
    const c = A.selectedIds().map((id) => M.clip(SE.doc, id)).find((x) => x && x.kind !== 'audio' && x.kind !== 'effect' && t >= x.start && t <= M.end(x));
    if (!c) { A.status(U.t('slopedit.tl.select_a_clip_under_the')); return; }
    SE.change(U.t('slopedit.tl.add_keyframes'), (p) => { const cc = M.clip(p, c.id), u = U.round(t - cc.start, 3); for (const k of AN.KEYS) AN.addKey(cc, k, u, AN.valueAt(cc, k, u), 'linear'); });
  };
  /** Reset keyframes for the selected clips (or the ids given). */
  act.resetKeys = function (ids = A.selectedIds()) {
    SE.change(U.t('slopedit.cmd.reset_keyframes'), (p) => { for (const id of ids) { const c = M.clip(p, id); if (c) SE.anim.clear(c); } });
  };
  /** Reset the random effect layer (its defaults) for the selected layers. */
  act.resetEffect = function (ids = A.selectedIds()) {
    SE.change(U.t('slopedit.tl.reset_effect_layer'), (p) => { for (const id of ids) { const c = M.clip(p, id); if (c && c.kind === 'effect') c.fx = M.fxDefault(); } });
  };
  /** Random effect layer at the playhead, on the lowest free video track above V1 (it acts on the tracks below). */
  act.addEffect = function () {
    const t = U.snapFrame(now(), fps());
    SE.change(U.t('slopedit.tl.add_random_effect_layer'), (p) => {
      const fx = M.fxDefault(); fx.seed = window.SlopVideo.seed.make();
      const id = E.addGenerated(p, 'effect', freeVideoTrack(p, t, 5), t, 5, { name: 'Random effect', fx }); // i18n-ignore: names stored in the project
      A.select([id]);
    });
  };
})();
