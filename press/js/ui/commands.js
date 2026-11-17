/* Slop Press — commands: File, Edit, Object and Tools. (Layout, Type, View, Window, Help and styles: commands2.js) */
(function () {
  'use strict';
  var PR = window.PR, A = PR.actions, S = PR.state, H = PR.history, I = PR.items, M = PR.model, U = PR.util;
  var ui = function () { return PR.ui || {}; };
  var hasSel = function () { return S.sel.length > 0 && !S.text; };
  var hasDoc = function () { return !!S.doc; };
  var editingText = function () { return !!S.text; };
  function del() {
    if (!S.sel.length) return;
    S.sel.slice().forEach(function (id) { I.remove(S.doc, id); });
    S.sel = []; H.commit(U.t('press.edit.undo_delete')); PR.emit('select', S.sel);
  }
  function nudge(dx, dy) {
    var its = PR.selected(); if (!its.length) return;
    its.forEach(function (it) { it.x += dx; it.y += dy; });
    H.commit(U.t('press.edit.undo_nudge'), true);
  }
  var NUDGE = function () { return U.UNITS[S.doc.unit] >= 2 ? U.UNITS.mm : 1; };

  A.register([
    /* ---------- File ---------- */
    { id: 'file.new', title: 'press.cmd.file_new', group: 'menu.file', keys: ['Mod+N'], keywords: ['create', 'blank'], run: function () { ui().newDocument(); } },
    { id: 'file.template', title: 'press.cmd.file_template', group: 'menu.file', keys: ['Alt+Mod+N'], keywords: ['magazine', 'flyer', 'business card', 'zine'], run: function () { ui().templates(); } },
    { id: 'file.open', title: 'press.cmd.file_open', group: 'menu.file', keys: ['Mod+O'], keywords: ['slpress', 'load'], run: function () { PR.io.openFile(); } },
    { id: 'file.openDrive', title: 'press.cmd.file_open_drive', group: 'menu.file', when: function () { return !!window.SlopHub; }, run: function () { PR.hub.openFromDrive(); } },
    { id: 'file.save', title: 'menu.save', group: 'menu.file', keys: ['Mod+S'], keywords: ['slpress', 'download'], run: function () { if (PR.hub) PR.hub.save(); else PR.io.save(); } },
    { id: 'file.saveAs', title: 'press.cmd.file_save_as', group: 'menu.file', keys: ['Shift+Mod+S'], run: function () { PR.io.save(true); } },
    { id: 'file.saveDrive', title: 'press.cmd.file_save_drive', group: 'menu.file', when: function () { return !!window.SlopHub && PR.hub.canSend(); }, run: function () { PR.hub.saveToDrive(); } },
    { id: 'file.place', title: 'press.cmd.file_place', group: 'menu.file', keys: ['Mod+D'], keywords: ['image', 'import', 'text file'], run: function () { PR.place.pick(); } },
    { id: 'file.placeDrive', title: 'press.cmd.file_place_drive', group: 'menu.file', when: function () { return !!window.SlopHub; }, run: function () { PR.hub.placeFromDrive(); } },
    { id: 'file.exportPDF', title: 'press.cmd.file_export_pdf', group: 'menu.file', keys: ['Mod+E'], keywords: ['print', 'bleed', 'crop marks', 'press'], run: function () { ui().exportPDF(); } },
    { id: 'file.exportPNG', title: 'press.cmd.file_export_png', group: 'menu.file', keys: ['Alt+Mod+E'], keywords: ['image', 'raster'], run: function () { ui().exportPNG(); } },
    { id: 'file.print', title: 'press.cmd.file_print', group: 'menu.file', keys: ['Mod+P'], run: function () { ui().printDialog(); } },
    { id: 'file.docSetup', title: 'press.cmd.file_doc_setup', group: 'menu.file', keys: ['Alt+Mod+P'], keywords: ['page size', 'bleed', 'facing'], run: function () { ui().docSetup(); } },
    { id: 'file.loadFont', title: 'press.cmd.file_load_font', group: 'menu.file', keywords: ['ttf', 'otf', 'typeface'], run: function () { ui().loadFont(); } },
    { id: 'file.downloadApp', title: 'press.cmd.file_download_app', group: 'menu.file', keywords: ['offline', 'single file'], run: function () { PR.build.download(); } },
    { id: 'file.revert', title: 'press.cmd.file_revert', group: 'menu.file', when: function () { return H.canUndo(); }, run: function () { while (H.doUndo()) { /* back to the start */ } } },

    /* ---------- Edit ---------- */
    { id: 'edit.undo', title: 'ui.undo', group: 'menu.edit', keys: ['Mod+Z'], when: H.canUndo, run: function () { var l = H.doUndo(); if (l) U.toast(U.t('ui.undo_what', { what: U.t(l) })); } },
    { id: 'edit.redo', title: 'ui.redo', group: 'menu.edit', keys: ['Shift+Mod+Z', 'Mod+Y'], when: H.canRedo, run: function () { var l = H.doRedo(); if (l) U.toast(U.t('ui.redo_what', { what: U.t(l) })); } },
    { id: 'edit.cut', title: 'ui.cut', group: 'menu.edit', when: function () { return hasSel() || editingText(); }, run: function () { PR.clipboard.command('cut'); } },
    { id: 'edit.copy', title: 'ui.copy', group: 'menu.edit', when: function () { return hasSel() || editingText(); }, run: function () { PR.clipboard.command('copy'); } },
    { id: 'edit.paste', title: 'ui.paste', group: 'menu.edit', run: function () { PR.clipboard.command('paste'); } },
    { id: 'edit.pasteInPlace', title: 'press.cmd.edit_paste_in_place', group: 'menu.edit', keys: ['Alt+Shift+Mod+V'], when: function () { return PR.clipboard.has(); }, run: function () { PR.clipboard.pasteItems(true); } },
    { id: 'edit.duplicate', title: 'ui.duplicate', group: 'menu.edit', keys: ['Alt+Shift+Mod+D'], when: hasSel, run: function () { var c = I.duplicate(S.doc, S.sel, 12, 12); H.commit(U.t('press.edit.undo_duplicate')); PR.select(c.map(function (x) { return x.id; })); } },
    { id: 'edit.delete', title: 'ui.delete', group: 'menu.edit', keys: ['Delete', 'Backspace'], when: hasSel, run: del },
    { id: 'edit.selectAll', title: 'press.cmd.edit_select_all', group: 'menu.edit', keys: ['Mod+A'], run: function () {
      if (S.text) return PR.textEdit.selectAll();
      PR.select(PR.activeItems().filter(function (it) { return !PR.layers.locked(S.doc, it) && PR.layers.visible(S.doc, it); }).map(function (it) { return it.id; }));
    } },
    { id: 'edit.deselect', title: 'press.cmd.edit_deselect', group: 'menu.edit', keys: ['Shift+Mod+A'], run: function () { if (S.text) PR.textEdit.exit(); PR.select([]); } },
    { id: 'edit.escape', title: 'press.cmd.edit_escape', group: 'menu.edit', keys: ['Escape'], when: function () { return !(PR.ui.dockSheet && PR.ui.dockSheet.isOpen()); }, run: function () { if (PR.selectTool.loaded) { PR.selectTool.loaded = null; PR.view.canvas.classList.remove('loaded'); return; } if (S.text) { PR.textEdit.exit(); PR.tools.set('select'); } else if (S.tool !== 'select') PR.tools.set('select'); else PR.select([]); } },
    { id: 'nudge.left', title: 'press.cmd.nudge_left', group: 'menu.edit', keys: ['ArrowLeft'], when: hasSel, run: function () { nudge(-NUDGE(), 0); } },
    { id: 'nudge.right', title: 'press.cmd.nudge_right', group: 'menu.edit', keys: ['ArrowRight'], when: hasSel, run: function () { nudge(NUDGE(), 0); } },
    { id: 'nudge.up', title: 'press.cmd.nudge_up', group: 'menu.edit', keys: ['ArrowUp'], when: hasSel, run: function () { nudge(0, -NUDGE()); } },
    { id: 'nudge.down', title: 'press.cmd.nudge_down', group: 'menu.edit', keys: ['ArrowDown'], when: hasSel, run: function () { nudge(0, NUDGE()); } },
    { id: 'nudge.left10', title: 'press.cmd.nudge_left10', group: 'menu.edit', keys: ['Shift+ArrowLeft'], when: hasSel, run: function () { nudge(-NUDGE() * 10, 0); } },
    { id: 'nudge.right10', title: 'press.cmd.nudge_right10', group: 'menu.edit', keys: ['Shift+ArrowRight'], when: hasSel, run: function () { nudge(NUDGE() * 10, 0); } },
    { id: 'nudge.up10', title: 'press.cmd.nudge_up10', group: 'menu.edit', keys: ['Shift+ArrowUp'], when: hasSel, run: function () { nudge(0, -NUDGE() * 10); } },
    { id: 'nudge.down10', title: 'press.cmd.nudge_down10', group: 'menu.edit', keys: ['Shift+ArrowDown'], when: hasSel, run: function () { nudge(0, NUDGE() * 10); } },

    /* ---------- Object ---------- */
    { id: 'arrange.front', title: 'press.cmd.arrange_front', group: 'press.menu.object', keys: ['Shift+Mod+]'], when: hasSel, run: function () { I.arrange(S.doc, S.sel, 'front'); H.commit(U.t('press.edit.undo_bring_to_front')); } },
    { id: 'arrange.forward', title: 'press.cmd.arrange_forward', group: 'press.menu.object', keys: ['Mod+]'], when: hasSel, run: function () { I.arrange(S.doc, S.sel.slice().reverse(), 'forward'); H.commit(U.t('press.edit.undo_bring_forward')); } },
    { id: 'arrange.backward', title: 'press.cmd.arrange_backward', group: 'press.menu.object', keys: ['Mod+['], when: hasSel, run: function () { I.arrange(S.doc, S.sel, 'backward'); H.commit(U.t('press.edit.undo_send_backward')); } },
    { id: 'arrange.back', title: 'press.cmd.arrange_back', group: 'press.menu.object', keys: ['Shift+Mod+['], when: hasSel, run: function () { I.arrange(S.doc, S.sel.slice().reverse(), 'back'); H.commit(U.t('press.edit.undo_send_to_back')); } },
    { id: 'object.lock', title: 'press.cmd.object_lock', group: 'press.menu.object', keys: ['Mod+L'], when: hasSel, run: function () { PR.selected().forEach(function (it) { it.locked = true; }); S.sel = []; H.commit(U.t('press.edit.undo_lock')); } },
    { id: 'object.unlockAll', title: 'press.cmd.object_unlock_all', group: 'press.menu.object', keys: ['Alt+Mod+L'], run: function () { PR.activeItems().forEach(function (it) { it.locked = false; }); H.commit(U.t('press.edit.undo_unlock_all')); } },
    { id: 'object.textFrameOptions', title: 'press.cmd.object_text_frame_options', group: 'press.menu.object', keys: ['Mod+B'], keywords: ['columns', 'inset', 'vertical justification'], when: function () { return PR.selected().some(function (it) { return it.type === 'text'; }); }, run: function () { ui().textFrameOptions(); } },
    { id: 'object.fitFill', title: 'press.cmd.object_fit_fill', group: 'press.menu.object', keys: ['Alt+Shift+Mod+C'], when: function () { return PR.selected().some(function (it) { return it.type === 'image'; }); }, run: function () { setFit('fill'); } },
    { id: 'object.fitFit', title: 'press.cmd.object_fit_fit', group: 'press.menu.object', keys: ['Alt+Shift+Mod+E'], when: function () { return PR.selected().some(function (it) { return it.type === 'image'; }); }, run: function () { setFit('fit'); } },
    { id: 'object.fitCenter', title: 'press.cmd.object_fit_center', group: 'press.menu.object', keys: ['Shift+Mod+E'], when: function () { return PR.selected().some(function (it) { return it.type === 'image'; }); }, run: function () { setFit('center'); } },
    { id: 'object.fitStretch', title: 'press.cmd.object_fit_stretch', group: 'press.menu.object', when: function () { return PR.selected().some(function (it) { return it.type === 'image'; }); }, run: function () { setFit('stretch'); } },
    { id: 'wrap.none', title: 'press.cmd.wrap_none', group: 'press.menu.object', when: hasSel, checked: function () { return wrapIs('none'); }, run: function () { setWrap('none'); } },
    { id: 'wrap.box', title: 'press.cmd.wrap_box', group: 'press.menu.object', when: hasSel, checked: function () { return wrapIs('box'); }, run: function () { setWrap('box'); } },
    { id: 'wrap.contour', title: 'press.cmd.wrap_contour', group: 'press.menu.object', when: hasSel, checked: function () { return wrapIs('contour'); }, run: function () { setWrap('contour'); } },
    { id: 'wrap.jump', title: 'press.cmd.wrap_jump', group: 'press.menu.object', when: hasSel, checked: function () { return wrapIs('jump'); }, run: function () { setWrap('jump'); } },
    { id: 'object.breakThread', title: 'press.cmd.object_break_thread', group: 'press.menu.object', when: function () { var s = PR.selected()[0]; return s && s.type === 'text' && !!s.next; }, run: function () { I.breakAfter(S.doc, PR.selected()[0].id); H.commit(U.t('press.edit.undo_break_thread')); } },
    { id: 'object.rotate90', title: 'press.cmd.object_rotate90', group: 'press.menu.object', when: hasSel, run: function () { PR.selected().forEach(function (it) { it.rot = ((it.rot || 0) + 90) % 360; }); H.commit(U.t('press.edit.undo_rotate')); } },
    { id: 'object.placeImage', title: 'press.cmd.object_place_image', group: 'press.menu.object', when: function () { var s = PR.selected()[0]; return s && (s.type === 'image' || s.type === 'rect' || s.type === 'ellipse'); }, run: function () { PR.place.pick(PR.selected()[0]); } },

    /* ---------- Tools ---------- */
    { id: 'tool.select', title: 'press.cmd.tool_select', group: 'press.menu.tools', keys: ['V'], run: function () { PR.tools.set('select'); } },
    { id: 'tool.text', title: 'press.cmd.tool_text', group: 'press.menu.tools', keys: ['T'], keywords: ['text'], run: function () { PR.tools.set('text'); } },
    { id: 'tool.frame', title: 'press.cmd.tool_frame', group: 'press.menu.tools', keys: ['F'], keywords: ['image', 'placeholder'], run: function () { PR.tools.set('frame'); } },
    { id: 'tool.rect', title: 'press.cmd.tool_rect', group: 'press.menu.tools', keys: ['M'], run: function () { PR.tools.set('rect'); } },
    { id: 'tool.ellipse', title: 'press.cmd.tool_ellipse', group: 'press.menu.tools', keys: ['L'], keywords: ['circle'], run: function () { PR.tools.set('ellipse'); } },
    { id: 'tool.line', title: 'press.cmd.tool_line', group: 'press.menu.tools', keys: ['\\'], keywords: ['rule'], run: function () { PR.tools.set('line'); } },
    { id: 'tool.polygon', title: 'press.cmd.tool_polygon', group: 'press.menu.tools', keys: ['P'], keywords: ['star'], run: function () { PR.tools.set('polygon'); } },
    { id: 'tool.hand', title: 'press.cmd.tool_hand', group: 'press.menu.tools', keys: ['H'], keywords: ['pan'], run: function () { PR.tools.set('hand'); } },
    { id: 'tool.zoom', title: 'press.cmd.tool_zoom', group: 'press.menu.tools', keys: ['Z'], run: function () { PR.tools.set('zoom'); } },
    { id: 'tool.swapColors', title: 'press.cmd.tool_swap_colors', group: 'press.menu.tools', keys: ['Shift+X'], run: function () { var d = S.defaults, f = d.fill; d.fill = d.stroke; d.stroke = f; PR.selected().forEach(function (it) { var t = it.fill; it.fill = it.stroke; it.stroke = t; }); if (S.sel.length) H.commit(U.t('press.edit.undo_swap_colours')); PR.emit('defaults'); } }
  ]);
  function setFit(fit) { PR.selected().forEach(function (it) { if (it.type === 'image') it.fit = fit; }); H.commit(U.t('press.edit.undo_fitting')); }
  function wrapIs(t) { var s = PR.selected()[0]; return !!s && (s.wrap || {}).type === t; }
  function setWrap(t) { PR.selected().forEach(function (it) { it.wrap = U.assign({ off: 6 }, it.wrap, { type: t }); }); H.commit(U.t('press.edit.undo_text_wrap')); }
  void M; void hasDoc;
})();
