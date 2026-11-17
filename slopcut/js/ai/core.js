/* SlopCut: the editing vocabulary as SlopCmd commands with arguments (the one list every AI surface reads: the Slop AI
   panel, WebMCP and the Claude Code bridge get their tools from it through shared/ai/cmdtools.js; macros record it).
   This file is the shared part, SE.ai:
     def(list)                 adds commands (SE.cmd.add, registered with SlopCmd at boot). Each run(args, ctx) gets checked
                               arguments; from the palette (args null) a small form asks for them first, prefilled by
                               prefill() (the selected clip, the playhead): SlopCmdForm, shared/commands/argform.js
     clip(id) / clips(list)    the clip (or clips) named: an id, 'selected', or a comma list; a plain error otherwise
     track(spec, kind)         'V2', 'A1', a track id or a number (video by default); missing V/A tracks are added
     media(q)                  a bin item by id or name, else a Slop Drive file (id or name) imported into the bin
     state()                   the small JSON the assistant reads (app_state): sequence, tracks, clips, media, markers
     job(title, ctx)           a long job: { set(f, text), signal (encode.js style), aborted(), close() } with a progress
                               dialog and Cancel, stopped too by ctx.signal (the AI panel's Stop, a workflow's cancel)
   The commands are in cmd-*.js and build.js; they edit through SE.change and the timeline core (core/edit.js), so each
   one is one undo step, and SlopCmd.provide({ checkpoint }) gives the panel its "Undo all AI changes". */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model;
  const AI = SE.ai = {};
  const T = (t) => U.round(Number(t) || 0, 4);
  AI.t = T;
  AI.frame = (t) => U.snapFrame(Math.max(0, Number(t) || 0), SE.doc.fps);
  AI.now = () => (SE.player ? SE.player.time : 0);

  /* ------------------------------------------------------------ lookups */
  AI.clip = function (id) {
    const s = String(id == null ? '' : id).trim();
    const first = () => SE.doc.clips.filter((x) => x.media && x.kind !== 'audio').sort((x, y) => x.start - y.start)[0] || SE.doc.clips.filter((x) => x.media)[0];
    const c = !s || s === 'selected' ? SE.app.primary() : s === 'first' ? first() : M.clip(SE.doc, s);
    if (!c) throw new Error(s && s !== 'selected' ? `There is no clip "${s}". list_clips gives the ids.` : 'Name a clip (its id from list_clips), or select one.');
    return c;
  };
  AI.clips = function (list) {
    const s = String(list == null ? '' : list).trim();
    if (!s || s === 'selected') { const ids = SE.app.selectedIds(); if (!ids.length) throw new Error('Name the clips (ids from list_clips), or select them.'); return ids; }
    if (s === 'all') return SE.doc.clips.map((c) => c.id);
    return s.split(/[\s,]+/).filter(Boolean).map((id) => AI.clip(id).id);
  };
  /** A track by 'V2' / 'A1', id or number; kind is the default for a bare number. Adds tracks up to the one asked for. */
  AI.track = function (p, spec, kind = 'video') {
    if (spec == null || spec === '') return (kind === 'audio' ? M.audioTracks(p) : M.videoTracks(p))[0].id;
    const s = String(spec).trim(), byId = M.track(p, s);
    if (byId) return byId.id;
    const m = /^([va])?\s*(\d+)$/i.exec(s);
    if (!m) throw new Error(`There is no track "${s}". Use V1, V2… for video and A1, A2… for sound.`);
    const k = m[1] ? (m[1].toLowerCase() === 'a' ? 'audio' : 'video') : kind, n = U.clamp(Number(m[2]), 1, 12);
    const list = () => (k === 'audio' ? M.audioTracks(p) : M.videoTracks(p));
    while (list().length < n) M.addTrack(p, k);
    return list()[n - 1].id;
  };
  AI.trackName = (p, id) => { const t = M.track(p, id); return t ? t.name : id; };

  /** A media item: bin id or name first, then Slop Drive (id or name), imported once. */
  AI.media = async function (q) {
    const s = String(q == null ? '' : q).trim();
    if (!s) throw new Error('Name the media: a bin item (list_media) or a Slop Drive file id or name.');
    const low = s.toLowerCase();
    const have = SE.doc.media.find((m) => m.id === s || m.driveId === s) || SE.doc.media.find((m) => m.name.toLowerCase() === low) || SE.doc.media.find((m) => U.baseName(m.name).toLowerCase() === low);
    if (have) { if (!SE.media.ready(have.id)) throw new Error(`${have.name} is not ready (${(SE.media.get(have.id) || {}).error || 'still loading'}).`); return have; }
    const rec = await AI.driveRecord(s);
    const metas = await SE.media.importFiles([new File([rec.blob], rec.name, { type: rec.type || rec.blob.type || '' })], { from: 'drive' });
    if (!metas[0]) throw new Error(`${rec.name} could not be read as video, sound or a picture.`);
    metas[0].driveId = rec.id;
    return metas[0];
  };
  /** A Slop Drive record with its blob, by id or by name. */
  AI.driveRecord = async function (q) {
    const H = window.SlopHub;
    if (!H || SE.offline) throw new Error('Slop Drive is not available here, so only the bin items can be used.');
    let rec = await H.get(q).catch(() => null);
    if (!rec) {
      const low = String(q).toLowerCase(), all = await H.list().catch(() => []);
      const f = all.find((x) => x.name.toLowerCase() === low) || all.find((x) => x.name.toLowerCase().includes(low));
      rec = f ? (f.blob ? f : await H.get(f.id)) : null;
    }
    if (!rec || !rec.blob) throw new Error(`There is no Slop Drive file "${q}" (and no bin item of that name).`);
    return rec;
  };

  /* ------------------------------------------------------------ state for the assistant */
  function clipRow(p, c) {
    const r = { id: c.id, track: AI.trackName(p, c.track), kind: c.kind, name: M.label(p, c), start: T(c.start), end: T(M.end(c)), dur: T(c.dur) };
    if (c.media) Object.assign(r, { media: c.media, in: T(c.in), out: T(c.in + c.dur * c.speed) });
    if (c.speed !== 1) r.speed = c.speed;
    if (c.kind === 'audio' || c.vol !== 1) r.volume = c.vol;
    if (c.link) r.link = c.link;
    if (c.trIn) r.transition = c.trIn;
    if (c.x || c.y || c.scale !== 1) r.transform = { x: c.x, y: c.y, scale: c.scale };
    if (c.kind === 'title') r.text = String(c.text.str).slice(0, 120);
    return r;
  }
  AI.clipRow = clipRow;
  AI.state = function () {
    const p = SE.doc, clips = p.clips.slice().sort((a, b) => a.start - b.start);
    return {
      sequence: { name: p.name, width: p.w, height: p.h, fps: p.fps, duration: T(M.duration(p)), background: p.bg },
      tracks: M.displayTracks(p).map((t) => ({ id: t.id, name: t.name, kind: t.kind, mute: t.mute, solo: t.solo, lock: t.lock, hide: t.hide, clips: p.clips.filter((c) => c.track === t.id).length })),
      clips: clips.slice(0, 150).map((c) => clipRow(p, c)), more: clips.length > 150 ? clips.length - 150 : undefined,
      media: p.media.map((m) => ({ id: m.id, name: m.name, kind: m.kind, dur: isFinite(m.dur) ? T(m.dur) : null, width: m.w, height: m.h, sound: !!m.hasAudio, status: (SE.media.get(m.id) || {}).status || 'missing' })),
      markers: p.markers.map((k) => ({ id: k.id, t: T(k.t), name: k.name })), inOut: p.io || null,
      selected: SE.app.selectedIds(), playhead: T(AI.now()),
      transitions: M.TRANSITIONS.map((x) => x[0]),
    };
  };

  /* ------------------------------------------------------------ long jobs */
  AI.job = function (title, ctx = {}) {
    const outer = ctx.signal || null, st = { cancelled: false };
    const prog = SE.progress && !(window.SlopMacros && SlopMacros.isHost) ? SE.progress.open(title, { onCancel: () => { st.cancelled = true; } }) : null;
    const signal = { get cancelled() { return st.cancelled || !!(outer && outer.aborted); } };
    return {
      signal, aborted: () => signal.cancelled,
      set(f, text) { if (prog) prog.set(f, text); if (ctx.progress) try { ctx.progress(f, text); } catch (e) { /* the caller's view */ } },
      close() { if (prog) prog.close(); },
    };
  };

  /* ------------------------------------------------------------ registering */
  /** Commands into SE.cmd (registered with SlopCmd at boot); from the palette a form asks for the args (shared/commands/argform.js). */
  AI.def = function (list) { SE.cmd.add(list.map((c) => window.SlopCmdForm.wrap(Object.assign({}, c, { hidden: false })))); };

  /* ------------------------------------------------------------ what the assistant shares */
  function provide() {
    if (!window.SlopCmd || !SlopCmd.provide) return;
    SlopCmd.provide({
      state: () => AI.state(),
      checkpoint: () => { const n = SE.history.undoStack.length; return () => { while (SE.history.undoStack.length > n && SE.history.undo()); }; },
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', provide, { once: true }); else provide();
})();
