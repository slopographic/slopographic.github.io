/* SlopCut: timeline context menus, double-click, and drops (media from the bin, effects from the
   Effects tab, files from the desktop) with a ghost preview of where clips will land. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, E = SE.edit, TL = SE.timeline, A = SE.app, C = SE.cmd;
  const it = (id, label) => C.item(id, label);

  TL.contextMenu = function (h, x, y) {
    if (h.area === 'markers' && h.marker) {
      const id = h.marker.id;
      SlopUI.menu([{ label: U.t('slopedit.tl.rename_marker_2'), act: () => SE.act.editMarker(id) }, { label: U.t('slopedit.tl.go_to_marker'), act: () => SE.player.seek(h.marker.t) }, '-', { label: U.t('slopedit.tl.delete_marker'), act: () => SE.act.removeMarker(id) }], x, y);
      return;
    }
    if (h.area === 'clip') {
      const c = h.clip;
      if (!A.sel.has(c.id)) A.select([...E.group(SE.doc, [c.id])]);
      SlopUI.menu([
        c.kind === 'title' ? { label: U.t('slopedit.tl.edit_title_text'), act: () => { A.select([c.id]); if (SE.inspector) SE.inspector.focusText(); } } : null,
        c.kind === 'title' ? '-' : null,
        it('edit.cut'), it('edit.copy'), it('edit.paste'), it('edit.duplicate'), '-',
        { label: U.t('slopedit.tl.split_here'), act: () => SE.act.splitAt(TL.snapT(h.t), [c.id]) },
        it('edit.split', U.t('slopedit.cmd.split_at_playhead')),
        { label: U.t('slopedit.tl.bring_to_front'), act: () => SE.order.front(A.selectedIds()) }, { label: U.t('slopedit.tl.send_to_back'), act: () => SE.order.back(A.selectedIds()) }, '-',
        it('edit.delete'), it('edit.rippleDelete'), '-',
        c.kind !== 'audio' ? { label: U.t('slopedit.insp.transition_in'), sub: M.TRANSITIONS.map(([t, l]) => ({ label: U.w('tr', t, l), check: c.trIn && c.trIn.type === t, act: () => { SE.change(U.t('slopedit.menu.add_transition'), (p) => E.setTransition(p, c.id, t, (c.trIn && c.trIn.dur) || 1)); } })).concat(['-', { label: U.t('slopedit.insp.none'), disabled: !c.trIn, act: () => SE.change(U.t('slopedit.cmd.remove_transition'), (p) => E.setTransition(p, c.id, null)) }]) } : null,
        c.kind !== 'audio' && c.kind !== 'effect' ? { label: U.t('slopedit.menu.mask'), sub: SE.maskMenu() } : null,
        it('clip.fadeIn'), it('clip.fadeOut'), it('clip.speed'), it('clip.restoreAspect'),
        c.kind === 'audio' ? { label: U.t('slopedit.tl.add_volume_keyframe_here'), act: () => SE.change(U.t('slopedit.tl.add_keyframe'), (p) => { const cc = M.clip(p, c.id), u = U.round(h.t - cc.start, 3); cc.keys = (cc.keys || []).concat({ t: u, v: 1 }).sort((a, b) => a.t - b.t); }) } : null,
        c.kind === 'audio' && c.keys ? { label: U.t('slopedit.tl.clear_volume_keyframes'), act: () => SE.change(U.t('slopedit.insp.clear_keyframes'), (p) => { M.clip(p, c.id).keys = null; }) } : null,
        '-',
        c.link ? { label: U.t('slopedit.tl.unlink_audio_video'), act: () => SE.change(U.t('slopedit.tl.unlink'), (p) => E.unlink(p, [c.id])) } : A.sel.size > 1 ? { label: U.t('slopedit.tl.link_selected'), act: () => SE.change(U.t('slopedit.tl.link'), (p) => E.link(p, A.selectedIds())) } : null,
        c.kind === 'video' && c.media ? { label: U.t('slopedit.tl.remove_background_send_to_isolate'), act: () => SE.cutout.send(c) } : null,
        c.media ? { label: U.t('slopedit.tl.reveal_in_bin'), act: () => { SE.bin.show('media'); setTimeout(() => { const el = document.querySelector('.bi[data-id="' + c.media + '"]'); if (el) { el.scrollIntoView({ block: 'nearest' }); el.focus(); } }, 50); } } : null,
        it('clip.reset')
      ], x, y);
      return;
    }
    const t = TL.snapT(h.t);
    const gap = h.row && gapAt(h.row.track.id, h.t);
    SlopUI.menu([
      it('edit.paste'),
      gap ? { label: U.t('slopedit.tl.close_gap'), act: () => SE.change(U.t('slopedit.tl.close_gap'), (p) => E.rippleShift(p, gap.b, -(gap.b - gap.a))) } : null,
      { label: U.t('slopedit.tl.add_marker_here'), act: () => { SE.player.seek(t); SE.act.addMarker(); } },
      { label: U.t('slopedit.tl.add_title_here'), act: () => { SE.player.seek(t); SE.act.addTitle(); } },
      '-', it('tl.vtrack'), it('tl.atrack'), it('tl.fit')
    ], x, y);
  };
  /** The empty gap around time t on a track (between two clips), or null. */
  function gapAt(trackId, t) {
    const clips = M.clipsOn(SE.doc, trackId);
    let a = 0;
    for (const c of clips) { if (c.start > t) return c.start - a > 1e-3 ? { a, b: c.start } : null; a = Math.max(a, M.end(c)); }
    return null;
  }
  TL.onDouble = function (h) {
    if (h.area === 'markers' && h.marker) SE.act.editMarker(h.marker.id);
    else if (h.area === 'ruler') SE.player.seek(h.t);
    else if (h.area === 'clip') { A.select([h.clip.id]); if (h.clip.kind === 'title' && SE.inspector) SE.inspector.focusText(); else if (A.isPhone()) A.setPane('insp'); }
  };

  /* ------------------------------------------------------------ drops */
  let dragMediaId = null;
  TL.dragMedia = (id) => { dragMediaId = id; if (!id) { TL.ghost = null; TL.snapLine = null; TL.dirty(); } };
  function target(e) {
    const r = SE.app.els.tlCanvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < 0 || y < 0 || x > r.width || y > r.height) return null;
    const row = TL.rowAt(y) || TL.rows().filter((rw) => rw.track.kind === 'video').pop();
    return { row, t: Math.max(0, TL.t(x)), x, y };
  }
  TL.dropTarget = (e) => target(e);
  function ghostFor(meta, tg) {
    const p = SE.doc, dur = meta.kind === 'image' ? 5 : meta.dur || 5;
    const start = TL.snapT(tg.t);
    let tk = tg.row.track;
    if (meta.kind === 'audio' && tk.kind !== 'audio') tk = M.audioTracks(p)[0];
    const g = [{ track: tk.id, start, dur }];
    if (meta.kind === 'video' && meta.hasAudio && tk.kind === 'video') { const at = M.audioTracks(p)[Math.max(0, M.videoTracks(p).indexOf(tk))]; if (at) g.push({ track: at.id, start, dur }); }
    return g;
  }
  function onDragOver(e) {
    const types = [...(e.dataTransfer.types || [])];
    const fx = types.includes('application/x-slopedit-fx'), media = types.includes('application/x-slopedit-media');
    if (!fx && !media) return;
    const tg = target(e); if (!tg || !tg.row) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    if (media && dragMediaId) { const meta = M.media(SE.doc, dragMediaId); if (meta) TL.ghost = ghostFor(meta, tg); }
    if (fx) { const h = TL.hit(tg.x, tg.y); TL.ghost = h.clip ? [{ track: h.clip.track, start: h.clip.start - 0.5, dur: 1 }] : [{ track: tg.row.track.id, start: TL.snapT(tg.t), dur: 4 }]; }
    TL.dirty();
  }
  function onDrop(e) {
    const tg = target(e); TL.ghost = null; TL.snapLine = null; TL.dirty();
    if (!tg || !tg.row) return;
    const mid = e.dataTransfer.getData('application/x-slopedit-media');
    const fx = e.dataTransfer.getData('application/x-slopedit-fx');
    if (!mid && !fx) return;
    e.preventDefault(); e.stopPropagation();
    if (mid) return dropMedia(mid, tg);
    if (fx) { try { TL.dropFx(JSON.parse(fx), tg); } catch (err) { console.warn(err); } }
  }
  function dropMedia(id, tg) {
    const meta = M.media(SE.doc, id); if (!meta || !SE.media.ready(id)) return;
    if (tg.row.track.lock) { SlopUI.toast(U.t('slopedit.tl.that_track_is_locked')); return; }
    if (tg.row.track.kind === 'audio' && meta.kind !== 'audio' && !meta.hasAudio) { SlopUI.toast(U.t('slopedit.tl.no_sound', { name: meta.name })); return; }
    const start = TL.snapT(tg.t);
    SE.change(U.t('slopedit.tl.add_clip'), (p) => { const ids = E.addMedia(p, meta, tg.row.track.id, start); A.select(ids); return ids.length ? ids : false; });
  }
  /** Effects dropped on the timeline: { kind: 'transition', type, dur } | { kind: 'title', preset } | { kind: 'color', color } | { kind: 'graphic', gfx } */
  TL.dropFx = function (fx, tg) {
    const h = TL.hit(tg.x, tg.y);
    if (fx.kind === 'transition') {
      const c = h.clip && h.clip.kind !== 'audio' ? h.clip : null;
      if (!c) { SlopUI.toast(U.t('slopedit.tl.drop_a_transition_onto_a')); return; }
      const near = h.clip && tg.t - c.start > c.dur / 2 ? M.nextAdjacent(SE.doc, c) : null;
      const id = (near || c).id;
      SE.change(U.t('slopedit.menu.add_transition'), (p) => E.setTransition(p, id, fx.type, fx.dur || SE.transitions.dur));
      A.select([id]);
      return;
    }
    let tk = tg.row.track;
    if (tk.kind !== 'video') tk = M.videoTracks(SE.doc).slice(-1)[0];
    const start = TL.snapT(tg.t);
    const made = { title: U.t('slopedit.tl.add_title'), graphic: U.t('slopedit.tl.add_graphic') }[fx.kind] || U.t('slopedit.tl.add_colour_matte');
    const dur = fx.kind === 'title' ? 4 : fx.kind === 'graphic' ? 3 : 5;
    const extra = fx.kind === 'title' ? JSON.parse(JSON.stringify(fx.preset || {})) : fx.kind === 'graphic' ? { gfx: Object.assign({}, fx.gfx) } : { color: fx.color };
    SE.change(made, (p) => {
      const id = E.addGenerated(p, fx.kind, tk.id, start, dur, extra);
      A.select([id]);
    });
  };
  /** Files dropped from the desktop onto the timeline (the intake's reader, io/intake.js): import, then place them there.
   *  Resolves the imported media. */
  TL.dropFiles = async function (files, tg) {
    const metas = await SE.media.importFiles(files);
    if (!metas.length || !tg.row) return metas;
    let t = TL.snapT(tg.t);
    SE.change(U.t('slopedit.tl.add_clip'), (p) => {
      let ids = [];
      for (const m of metas) { const got = E.addMedia(p, m, tg.row.track.id, t); ids = ids.concat(got); if (got.length) t = M.end(M.clip(p, got[0])); }
      A.select(ids);
    });
    return metas;
  };
  TL.initDrops = function () {
    const el = SE.app.els.tlLanes;
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', () => { TL.ghost = null; TL.dirty(); });
    el.addEventListener('drop', onDrop); // intake-ok: bin items and effects dragged onto a lane, not files
  };
})();
