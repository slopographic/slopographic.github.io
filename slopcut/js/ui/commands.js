/* SlopCut: every action as a command (for menus, shortcuts and the Spotlight palette).
   Registered with the shared SlopCmd package (shared/commands/) when it is available; until then a
   small built-in dispatcher and palette handle the same definitions. Actions live on SE.act.* */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util;
  const act = SE.act = SE.act || {};
  const C = SE.cmd = { list: [] };
  const run = (name, ...a) => () => (act[name] ? act[name](...a) : undefined);
  const hasClips = () => SE.doc.clips.length > 0;
  const hasSel = () => SE.app.selectedIds().length > 0;
  const hasMask = () => { const c = SE.app.primary(); return !!(c && c.mask); };
  const T = SE.model.TRANSITIONS;

  /** The commands, with titles and groups in the chosen language (built again after a language change). */
  const defs = () => [
    // File
    { id: 'file.import', title: U.t('slopedit.cmd.import_media'), group: U.t('slopedit.cmd.file'), keys: ['Mod+I'], keywords: ['open', 'video', 'audio', 'image', 'add'], run: () => SE.app.openDialog() },
    { id: 'file.drive', title: U.t('slopedit.cmd.import_from_slop_drive'), group: U.t('slopedit.cmd.file'), keywords: ['drive', 'open'], when: () => !!window.SlopHub && !SE.offline, run: () => SE.app.openFromDrive() },
    { id: 'file.new', title: U.t('slopedit.cmd.new_project'), group: U.t('slopedit.cmd.file'), keys: ['Alt+Mod+N'], run: run('newProject') },
    { id: 'file.open', title: U.t('slopedit.cmd.open_project_slopedit'), group: U.t('slopedit.cmd.file'), keys: ['Mod+O'], run: run('openProject') },
    { id: 'file.save', title: U.t('slopedit.cmd.save_project_slopedit'), group: U.t('slopedit.cmd.file'), keys: ['Mod+S'], keywords: ['download', 'zip'], run: run('saveProject') },
    { id: 'file.saveDrive', title: U.t('slopedit.cmd.save_project_to_slop_drive'), group: U.t('slopedit.cmd.file'), when: () => !!window.SlopHub && !SE.offline, run: run('saveProjectDrive') },
    { id: 'file.download', title: U.t('slopedit.cmd.download_project_slopedit'), group: U.t('slopedit.cmd.file'), run: run('downloadProject') },
    { id: 'file.export', title: U.t('slopedit.cmd.export_video'), group: U.t('slopedit.cmd.file'), keys: ['Mod+E'], keywords: ['render', 'mp4', 'webm', 'h264'], when: hasClips, run: run('exportVideo') },
    { id: 'file.gif', title: U.t('slopedit.cmd.export_gif'), group: U.t('slopedit.cmd.file'), keywords: ['animated', 'gif'], when: hasClips, run: run('exportGif') },
    { id: 'file.snapshot', title: U.t('slopedit.cmd.snapshot_frame_to_png'), group: U.t('slopedit.cmd.file'), keys: ['Shift+E'], keywords: ['still', 'frame', 'image', 'screenshot'], run: run('snapshot') },
    { id: 'file.snapshotSend', title: U.t('slopedit.cmd.send_frame_to_photoslop'), group: U.t('slopedit.cmd.file'), keywords: ['photoslop', 'still', 'edit'], when: () => !!window.SlopHub && !SE.offline, run: run('snapshotSend') },
    { id: 'file.sample', title: U.t('slopedit.cmd.load_sample_project'), group: U.t('slopedit.cmd.file'), keywords: ['demo', 'example'], run: () => SE.sample && SE.sample.load() },
    { id: 'file.offline', title: U.t('slopedit.cmd.download_app_offline_html'), group: U.t('slopedit.cmd.file'), run: run('downloadApp') },
    // Edit
    { id: 'edit.undo', title: U.t('slopedit.cmd.undo'), group: U.t('slopedit.cmd.edit'), keys: ['Mod+Z'], when: () => SE.history.canUndo(), run: () => SE.history.undo() },
    { id: 'edit.redo', title: U.t('slopedit.cmd.redo'), group: U.t('slopedit.cmd.edit'), keys: ['Shift+Mod+Z', 'Mod+Y'], when: () => SE.history.canRedo(), run: () => SE.history.redo() },
    { id: 'edit.cut', title: U.t('slopedit.cmd.cut'), group: U.t('slopedit.cmd.edit'), keys: ['Mod+X'], when: hasSel, run: run('cut') },
    { id: 'edit.copy', title: U.t('slopedit.cmd.copy'), group: U.t('slopedit.cmd.edit'), keys: ['Mod+C'], when: hasSel, run: run('copy') },
    { id: 'edit.paste', title: U.t('slopedit.cmd.paste_at_playhead'), group: U.t('slopedit.cmd.edit'), keys: ['Mod+V'], run: run('paste') },
    { id: 'edit.duplicate', title: U.t('slopedit.cmd.duplicate_clip'), group: U.t('slopedit.cmd.edit'), keys: ['Shift+Mod+D'], when: hasSel, run: run('duplicate') },
    { id: 'edit.delete', title: U.t('slopedit.cmd.delete_lift'), group: U.t('slopedit.cmd.edit'), keys: ['Delete', 'Backspace'], when: hasSel, run: run('remove', false) },
    { id: 'edit.rippleDelete', title: U.t('slopedit.cmd.ripple_delete'), group: U.t('slopedit.cmd.edit'), keys: ['Shift+Delete', 'Shift+Backspace'], keywords: ['close gap'], when: hasSel, run: run('remove', true) },
    { id: 'edit.split', title: U.t('slopedit.cmd.split_at_playhead'), group: U.t('slopedit.cmd.edit'), keys: ['S'], keywords: ['razor', 'cut', 'blade'], when: hasClips, run: run('split', false) },
    { id: 'edit.splitAll', title: U.t('slopedit.cmd.split_all_tracks_at_playhead'), group: U.t('slopedit.cmd.edit'), keys: ['Shift+S'], when: hasClips, run: run('split', true) },
    { id: 'edit.selectAll', title: U.t('slopedit.cmd.select_all_clips'), group: U.t('slopedit.cmd.edit'), keys: ['Mod+A'], when: hasClips, run: run('selectAll') },
    { id: 'edit.deselect', title: U.t('slopedit.cmd.deselect_all'), group: U.t('slopedit.cmd.edit'), keys: ['Shift+Mod+A'], run: () => SE.app.select([]) },
    { id: 'edit.clearSelection', title: U.t('slopedit.cmd.clear_selection'), group: U.t('slopedit.cmd.edit'), keys: ['Escape'], when: () => hasSel() || !!(SE.timeline && SE.timeline.multi), run: () => { SE.app.select([]); SE.timeline.setMulti(false); } },
    { id: 'edit.link', title: U.t('slopedit.cmd.link_unlink_audio_and_video'), group: U.t('slopedit.cmd.edit'), keys: ['Mod+L'], when: hasSel, run: run('toggleLink') },
    { id: 'edit.nudgeL', title: U.t('slopedit.cmd.nudge_clip_one_frame_left'), group: U.t('slopedit.cmd.edit'), keys: ['Alt+ArrowLeft'], when: hasSel, run: run('nudge', -1) },
    { id: 'edit.nudgeR', title: U.t('slopedit.cmd.nudge_clip_one_frame_right'), group: U.t('slopedit.cmd.edit'), keys: ['Alt+ArrowRight'], when: hasSel, run: run('nudge', 1) },
    { id: 'edit.trimIn', title: U.t('slopedit.cmd.ripple_trim_start_to_playhead'), group: U.t('slopedit.cmd.edit'), keys: ['Q'], when: hasClips, run: run('trimToPlayhead', 'in') },
    { id: 'edit.trimOut', title: U.t('slopedit.cmd.ripple_trim_end_to_playhead'), group: U.t('slopedit.cmd.edit'), keys: ['W'], when: hasClips, run: run('trimToPlayhead', 'out') },
    // Playback
    { id: 'play.toggle', title: U.t('slopedit.cmd.play_pause'), group: U.t('slopedit.cmd.playback'), keys: ['Space'], run: () => SE.player.toggle() },
    { id: 'play.reverse', title: U.t('slopedit.cmd.shuttle_reverse_j'), group: U.t('slopedit.cmd.playback'), keys: ['J'], run: () => SE.player.shuttle(-1) },
    { id: 'play.stop', title: U.t('slopedit.cmd.stop_k'), group: U.t('slopedit.cmd.playback'), keys: ['K'], run: () => SE.player.pause() },
    { id: 'play.forward', title: U.t('slopedit.cmd.shuttle_forward_l'), group: U.t('slopedit.cmd.playback'), keys: ['L'], run: () => SE.player.shuttle(1) },
    { id: 'play.prevFrame', title: U.t('slopedit.cmd.previous_frame'), group: U.t('slopedit.cmd.playback'), keys: ['ArrowLeft'], run: () => SE.player.step(-1) },
    { id: 'play.nextFrame', title: U.t('slopedit.cmd.next_frame'), group: U.t('slopedit.cmd.playback'), keys: ['ArrowRight'], run: () => SE.player.step(1) },
    { id: 'play.back', title: U.t('slopedit.cmd.back_1_second'), group: U.t('slopedit.cmd.playback'), keys: ['Shift+ArrowLeft'], run: () => SE.player.seek(SE.player.time - 1) },
    { id: 'play.fwd', title: U.t('slopedit.cmd.forward_1_second'), group: U.t('slopedit.cmd.playback'), keys: ['Shift+ArrowRight'], run: () => SE.player.seek(SE.player.time + 1) },
    { id: 'play.prevEdit', title: U.t('slopedit.cmd.go_to_previous_edit'), group: U.t('slopedit.cmd.playback'), keys: ['ArrowUp'], run: run('gotoEdit', -1) },
    { id: 'play.nextEdit', title: U.t('slopedit.cmd.go_to_next_edit'), group: U.t('slopedit.cmd.playback'), keys: ['ArrowDown'], run: run('gotoEdit', 1) },
    { id: 'play.start', title: U.t('slopedit.cmd.go_to_start'), group: U.t('slopedit.cmd.playback'), keys: ['Home'], run: () => SE.player.seek(0) },
    { id: 'play.end', title: U.t('slopedit.cmd.go_to_end'), group: U.t('slopedit.cmd.playback'), keys: ['End'], run: () => SE.player.seek(SE.model.duration(SE.doc)) },
    { id: 'play.markIn', title: U.t('slopedit.cmd.mark_in'), group: U.t('slopedit.cmd.playback'), keys: ['I'], run: run('markIn') },
    { id: 'play.markOut', title: U.t('slopedit.cmd.mark_out'), group: U.t('slopedit.cmd.playback'), keys: ['O'], run: run('markOut') },
    { id: 'play.clearInOut', title: U.t('slopedit.cmd.clear_in_and_out'), group: U.t('slopedit.cmd.playback'), keys: ['Alt+X'], run: run('clearInOut') },
    { id: 'play.loop', title: U.t('slopedit.cmd.loop_playback'), group: U.t('slopedit.cmd.playback'), keys: ['Shift+L'], checked: () => !!(SE.player && SE.player.loop), run: () => { SE.player.loop = !SE.player.loop; SE.emit('transport', {}); } },
    // Tools and timeline
    { id: 'tool.select', title: U.t('slopedit.cmd.selection_tool'), group: U.t('slopedit.cmd.tools'), keys: ['V'], checked: () => SE.timeline && SE.timeline.tool === 'select', run: () => SE.timeline.setTool('select') },
    { id: 'tool.razor', title: U.t('slopedit.cmd.razor_tool'), group: U.t('slopedit.cmd.tools'), keys: ['C'], keywords: ['blade', 'cut'], checked: () => SE.timeline && SE.timeline.tool === 'razor', run: () => SE.timeline.setTool('razor') },
    { id: 'tool.ripple', title: U.t('slopedit.cmd.ripple_edit_tool'), group: U.t('slopedit.cmd.tools'), keys: ['B'], checked: () => SE.timeline && SE.timeline.tool === 'ripple', run: () => SE.timeline.setTool('ripple') },
    { id: 'tool.multi', title: U.t('slopedit.cmd.select_several'), group: U.t('slopedit.cmd.tools'), keywords: ['multi-select', 'multiple', 'select mode', 'selection box', 'marquee'], checked: () => !!(SE.timeline && SE.timeline.multi), run: () => SE.timeline.setMulti(!SE.timeline.multi) }, // i18n-ignore: search keywords and key names
    { id: 'tool.snap', title: U.t('slopedit.cmd.snapping'), group: U.t('slopedit.cmd.tools'), keys: ['N'], keywords: ['magnet'], checked: () => SE.timeline && SE.timeline.snap, run: () => SE.timeline.toggleSnap() },
    { id: 'tl.zoomIn', title: U.t('slopedit.cmd.zoom_timeline_in'), group: U.t('slopedit.cmd.timeline'), keys: ['='], run: () => SE.timeline.zoomBy(1.4) },
    { id: 'tl.zoomOut', title: U.t('slopedit.cmd.zoom_timeline_out'), group: U.t('slopedit.cmd.timeline'), keys: ['-'], run: () => SE.timeline.zoomBy(1 / 1.4) },
    { id: 'tl.fit', title: U.t('slopedit.cmd.zoom_to_fit'), group: U.t('slopedit.cmd.timeline'), keys: ['\\'], run: () => SE.timeline.fit() },
    { id: 'tl.marker', title: U.t('slopedit.cmd.add_marker'), group: U.t('slopedit.cmd.timeline'), keys: ['M'], run: run('addMarker') },
    { id: 'tl.title', title: U.t('slopedit.cmd.add_title_at_playhead'), group: U.t('slopedit.cmd.timeline'), keys: ['T'], keywords: ['text', 'caption'], run: run('addTitle') },
    { id: 'tl.color', title: U.t('slopedit.cmd.add_colour_matte_at_playhead'), group: U.t('slopedit.cmd.timeline'), keywords: ['solid', 'background'], run: run('addColor') },
    { id: 'tl.effect', title: U.t('slopedit.cmd.add_random_effect_layer_at'), group: U.t('slopedit.cmd.timeline'), keywords: ['effect', 'grain', 'glitch', 'vignette', 'colour shift', 'zoom', 'random', 'adjustment'], run: run('addEffect') }, // i18n-ignore: search keywords and key names
    { id: 'tl.vtrack', title: U.t('slopedit.cmd.add_video_track'), group: U.t('slopedit.cmd.timeline'), run: run('addTrack', 'video') },
    { id: 'tl.atrack', title: U.t('slopedit.cmd.add_audio_track'), group: U.t('slopedit.cmd.timeline'), run: run('addTrack', 'audio') },
    { id: 'tl.settings', title: U.t('slopedit.cmd.sequence_settings'), group: U.t('slopedit.cmd.timeline'), keywords: ['resolution', 'fps', 'size'], run: run('sequenceSettings') },
    // Clip
    ...T.map(([type, label]) => ({ id: 'tr.' + type, title: U.t('slopedit.cmd.add_tr', { name: U.w('tr', type, label) }), group: U.t('slopedit.cmd.transitions'), keys: type === 'cross' ? ['Mod+D'] : undefined, keywords: ['transition', 'fade', type], when: hasClips, run: run('addTransition', type) })),
    { id: 'tr.remove', title: U.t('slopedit.cmd.remove_transition'), group: U.t('slopedit.cmd.transitions'), when: hasSel, run: run('addTransition', null) },
    { id: 'clip.fadeIn', title: U.t('slopedit.cmd.fade_in_1_s'), group: U.t('slopedit.cmd.clip'), when: hasSel, run: run('fade', 'in') },
    { id: 'clip.fadeOut', title: U.t('slopedit.cmd.fade_out_1_s'), group: U.t('slopedit.cmd.clip'), when: hasSel, run: run('fade', 'out') },
    { id: 'clip.speed', title: U.t('slopedit.cmd.speed_duration'), group: U.t('slopedit.cmd.clip'), keys: ['Mod+R'], keywords: ['slow motion', 'fast'], when: hasSel, run: run('speedDialog') },
    { id: 'clip.restoreAspect', title: U.t('slopedit.cmd.restore_original_aspect_ratio'), group: U.t('slopedit.cmd.clip'), when: () => { const c = SE.app.primary(); return !!c && !!SE.aspect.targetOf(SE.doc, c); }, run: () => { const c = SE.app.primary(); if (c) SE.aspect.restore(c.id); } },
    { id: 'clip.reset', title: U.t('slopedit.cmd.reset_all_settings_keeps_media'), group: U.t('slopedit.cmd.clip'), when: hasSel, run: run('resetClip') },
    { id: 'clip.keyPlayhead', title: U.t('slopedit.cmd.keyframe_at_playhead_all_properties'), group: U.t('slopedit.cmd.clip'), keywords: ['animation', 'keyframe', 'key', 'position', 'scale', 'rotation', 'opacity'], when: hasSel, run: run('keyAtPlayhead') },
    { id: 'clip.keysReset', title: U.t('slopedit.cmd.reset_keyframes'), group: U.t('slopedit.cmd.clip'), keywords: ['animation', 'keyframe'], when: hasSel, run: run('resetKeys') },
    { id: 'clip.effectReset', title: U.t('slopedit.cmd.reset_random_effect_layer'), group: U.t('slopedit.cmd.clip'), when: hasSel, run: run('resetEffect') },
    { id: 'clip.volKey', title: U.t('slopedit.cmd.add_volume_keyframe_at_playhead'), group: U.t('slopedit.cmd.clip'), keys: ['Shift+K'], when: hasSel, run: run('addVolumeKey') },
    // Clip masks (core/mask.js, render/mask-input.js, ui/insp-mask.js)
    { id: 'mask.add.rect', title: U.t('slopedit.cmd.add_mask_rectangle'), group: U.t('slopedit.cmd.clip'), keywords: ['mask', 'crop', 'shape'], when: hasSel, run: run('maskAdd', 'rect') },
    { id: 'mask.add.ellipse', title: U.t('slopedit.cmd.add_mask_ellipse'), group: U.t('slopedit.cmd.clip'), keywords: ['mask', 'circle', 'oval', 'shape'], when: hasSel, run: run('maskAdd', 'ellipse') },
    { id: 'mask.add.rrect', title: U.t('slopedit.cmd.add_mask_rounded_rectangle'), group: U.t('slopedit.cmd.clip'), keywords: ['mask', 'corner', 'radius', 'shape'], when: hasSel, run: run('maskAdd', 'rrect') },
    { id: 'mask.draw.free', title: U.t('slopedit.cmd.draw_mask_freehand'), group: U.t('slopedit.cmd.clip'), keywords: ['mask', 'path', 'brush', 'lasso'], when: hasSel, run: run('maskTool', 'free') },
    { id: 'mask.draw.pen', title: U.t('slopedit.cmd.draw_mask_bezier_path'), group: U.t('slopedit.cmd.clip'), keywords: ['mask', 'pen', 'curve', 'path'], when: hasSel, run: run('maskTool', 'pen') },
    { id: 'mask.remove', title: U.t('slopedit.cmd.remove_mask'), group: U.t('slopedit.cmd.clip'), keywords: ['mask', 'clear', 'delete'], when: hasMask, run: run('maskRemove') },
    { id: 'mask.invert', title: U.t('slopedit.cmd.invert_mask'), group: U.t('slopedit.cmd.clip'), keywords: ['mask', 'outside', 'flip'], checked: () => { const c = SE.app.primary(); return !!(c && c.mask && c.mask.invert); }, when: hasMask, run: run('maskInvert') },
    { id: 'mask.edit', title: U.t('slopedit.cmd.edit_mask_shape_monitor_handles'), group: U.t('slopedit.cmd.clip'), keywords: ['mask', 'handles', 'points'], checked: () => { const c = SE.app.primary(); return !!(c && SE.maskInput && SE.maskInput.edit === c.id); }, when: hasMask, run: run('maskEdit') },
    // Watermark (js/watermark; the command exists only when that module is loaded)
    ...(SE.watermark ? [{ id: 'wm.panel', title: U.t('slopedit.cmd.watermark_panel'), group: U.t('slopedit.cmd.sequence'), keywords: ['logo', 'copyright', 'mark', 'overlay', 'text', 'export'], run: run('openWatermark') }] : []),
    // Templates and random edit
    { id: 'tpl.panel', title: U.t('slopedit.cmd.templates_panel'), group: U.t('slopedit.cmd.sequence'), keys: ['Shift+G'], keywords: ['layout', 'split', 'grid', 'picture in picture', 'slots'], run: run('openTemplates') }, // i18n-ignore: search keywords and key names
    { id: 'tpl.random', title: U.t('slopedit.cmd.random_edit'), group: U.t('slopedit.cmd.sequence'), keys: ['Shift+R'], keywords: ['shuffle', 'auto edit', 'montage', 'seed', 'build'], run: run('randomDialog') }, // i18n-ignore: search keywords and key names
    { id: 'tpl.reshuffle', title: U.t('slopedit.cmd.reshuffle_random_edit_new_seed'), group: U.t('slopedit.cmd.sequence'), keywords: ['shuffle', 'seed'], when: () => !!SE.doc.random, run: run('reshuffleRandom') },
    { id: 'tpl.clear', title: U.t('slopedit.cmd.clear_template_layout'), group: U.t('slopedit.cmd.sequence'), when: () => !!SE.doc.layout, run: run('clearLayout') },
    ...SE.templates.list.map((t) => ({ id: 'tpl.apply.' + t.id, title: U.t('slopedit.cmd.apply_tpl', { name: t.name }), group: U.t('slopedit.cmd.templates'), keywords: ['layout', 'slots', t.desc], run: run('applyTemplate', t.id) })),
    // View
    { id: 'view.safe', title: U.t('slopedit.cmd.safe_area_overlay'), group: U.t('slopedit.cmd.view'), keys: ["'"], checked: () => !!(SE.preview && SE.preview.safe), run: run('toggleSafe') },
    { id: 'view.quality', title: U.t('slopedit.cmd.preview_quality_full_half'), group: U.t('slopedit.cmd.view'), checked: () => !!(SE.preview && SE.preview.half), run: run('toggleQuality') },
    ...SE.app.THEMES.map(([t, label, s]) => ({ id: 'view.theme.' + t, title: U.t('slopedit.cmd.theme', { name: U.t(label) }), group: U.t('slopedit.cmd.view'), checked: () => !!window.SlopTheme && SlopTheme.get() === s, run: () => SE.app.setTheme(t) })),
    // Help
    { id: 'help.search', title: U.t('slopedit.cmd.search_commands'), group: U.t('slopedit.cmd.help'), keys: window.SlopCmd ? undefined : ['Mod+K'], run: () => C.palette() },
    { id: 'help.keys', title: U.t('slopedit.cmd.keyboard_shortcuts'), group: U.t('slopedit.cmd.help'), keys: ['?', 'Shift+?'], run: () => C.keymap() },
    { id: 'help.about', title: U.t('slopedit.cmd.about_slopcut_privacy'), group: U.t('slopedit.cmd.help'), run: run('about') }
  ];
  C.list = defs();
  const byId = new Map(C.list.map((c) => [c.id, c]));
  C.get = (id) => byId.get(id);
  /** Adds commands from another script (SE.cmd.add): io/config.js uses it, loaded after this file. */
  C.add = (list) => { for (const c of list) { C.list.push(c); byId.set(c.id, c); } };
  C.run = function (id) {
    if (window.SlopCmd && registered) return SlopCmd.run(id);
    const c = byId.get(id); if (!c || (c.when && !c.when())) return;
    return c.run({});
  };
  C.enabled = (id) => { const c = byId.get(id); return !!c && (!c.when || !!c.when()); };
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const pretty = (k) => k.replace(/Mod\+/g, isMac ? '⌘' : 'Ctrl+').replace(/Shift\+/g, isMac ? '⇧' : 'Shift+').replace(/Alt\+/g, isMac ? '⌥' : 'Alt+').replace('Arrow', '').replace('Delete', 'Del').replace('Backspace', '⌫'); // i18n-ignore: search keywords and key names
  /** Display string of the first shortcut of a command ('' when none). */
  C.keyFor = function (id) {
    if (window.SlopCmd && registered && SlopCmd.keyFor) return SlopCmd.keyFor(id) || '';
    const c = byId.get(id); return c && c.keys ? pretty(c.keys[0]) : '';
  };
  /** A SlopUI.menu item for a command. */
  C.item = function (id, label) {
    const c = byId.get(id); if (!c) return null;
    return { label: label || c.title, key: C.keyFor(id).replace(/^⌘/, 'Ctrl+'), check: c.checked ? c.checked() : undefined, disabled: c.when ? !c.when() : false, act: () => C.run(id) };
  };

  /* ------------------------------------------------------------ SlopCmd or fallback */
  let registered = false;
  C.register = function () {
    if (registered || !window.SlopCmd) return registered;
    try {
      SlopCmd.init({ app: 'slopedit' });
      SlopCmd.register(C.list.map((c) => Object.assign({}, c, { icon: undefined })));
      registered = true;
      if (SlopCmd.on) SlopCmd.on('change', () => SE.emit('keys', {}));
    } catch (e) { console.warn('SlopCut: SlopCmd registration failed', e); }
    return registered;
  };
  C.usingShared = () => registered;
  /* A language change: the same commands with the new titles and groups (SlopCmd.register replaces by id). */
  U.onLang(() => {
    const fresh = new Map(defs().map((c) => [c.id, c]));
    for (const c of C.list) { const f = fresh.get(c.id); if (f) { c.title = f.title; c.group = f.group; } }
    if (registered) SlopCmd.register(C.list.map((c) => Object.assign({}, c, { icon: undefined })));
    SE.emit('keys', {});
  });
  C.palette = () => (registered && SlopCmd.open ? SlopCmd.open() : SE.cmdFallback && SE.cmdFallback.palette());
  C.keymap = () => (registered && SlopCmd.openKeymap ? SlopCmd.openKeymap() : SE.cmdFallback && SE.cmdFallback.keymap());
  /** Register with SlopCmd (loaded by index.html); the built-in fallback covers pages without it. */
  C.load = async function () {
    if (!C.register() && SE.cmdFallback) SE.cmdFallback.install(C.list);
  };
})();
