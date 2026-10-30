/* Slop Press — commands: Layout, Type, View, Window, Help, plus one command per paragraph/character style. */
(function () {
  'use strict';
  var PR = window.PR, A = PR.actions, S = PR.state, H = PR.history, P = PR.pages, M = PR.model, U = PR.util, V = PR.view, FM = PR.format, ST = PR.store;
  var ui = function () { return PR.ui || {}; };
  var textTarget = function () { return FM.hasText(); };
  function goPage(i) { if (!S.doc.pages.length) return; S.editMaster = null; S.page = U.clamp(i, 0, S.doc.pages.length - 1); PR.emit('page', S.page); V.showPage(S.page); PR.touch(); }
  PR.goPage = goPage;
  function setTheme(t) { document.documentElement.setAttribute('data-theme', t); ST.pref('theme', t); V.request(); PR.emit('theme', t); }
  function toggle(key, on, off) { V.show[key] = !V.show[key]; ST.pref('show', V.show); V.request(); PR.emit('view'); if (on) U.toast(U.t(V.show[key] ? on : off)); }
  function special(ch, key) { return function () { PR.textEdit.insert(ch, U.t(key)); }; }

  A.register([
    /* ---------- Layout ---------- */
    { id: 'layout.addPage', title: 'press.cmd.layout_add_page', group: 'press.menu.layout', keys: ['Shift+Mod+P'], keywords: ['insert', 'new page'], run: function () { P.insertPages(S.doc, S.page + 1, 1); H.commit(U.t('press.edit.undo_add_page')); goPage(S.page + 1); } },
    { id: 'layout.insertPages', title: 'press.cmd.layout_insert_pages', group: 'press.menu.layout', run: function () { ui().insertPages(); } },
    { id: 'layout.duplicatePage', title: 'press.cmd.layout_duplicate_page', group: 'press.menu.layout', run: function () { P.duplicatePage(S.doc, S.page); H.commit(U.t('press.edit.undo_duplicate_page')); goPage(S.page + 1); } },
    { id: 'layout.deletePage', title: 'press.cmd.layout_delete_page', group: 'press.menu.layout', when: function () { return S.doc.pages.length > 1 && !S.editMaster; }, run: function () { P.deletePages(S.doc, [S.page]); S.sel = []; H.commit(U.t('press.edit.undo_delete_page')); goPage(Math.min(S.page, S.doc.pages.length - 1)); } },
    { id: 'layout.firstPage', title: 'press.cmd.layout_first_page', group: 'press.menu.layout', keys: ['Shift+Mod+PageUp'], run: function () { goPage(0); } },
    { id: 'layout.prevPage', title: 'press.cmd.layout_prev_page', group: 'press.menu.layout', keys: ['Shift+PageUp'], run: function () { goPage(S.page - 1); } },
    { id: 'layout.nextPage', title: 'press.cmd.layout_next_page', group: 'press.menu.layout', keys: ['Shift+PageDown'], run: function () { goPage(S.page + 1); } },
    { id: 'layout.lastPage', title: 'press.cmd.layout_last_page', group: 'press.menu.layout', keys: ['Shift+Mod+PageDown'], run: function () { goPage(S.doc.pages.length - 1); } },
    { id: 'layout.goto', title: 'press.cmd.layout_goto', group: 'press.menu.layout', keys: ['Mod+J'], run: function () { window.SlopUI.prompt(U.t('press.dlg.goto_title'), U.t('press.dlg.goto_label'), String(P.label(S.doc, S.page))).then(function (v) { if (v == null) return; var n = parseInt(v, 10) - (S.doc.startPage || 1); if (!isNaN(n)) goPage(n); }); } },
    { id: 'layout.marginsColumns', title: 'press.cmd.layout_margins_columns', group: 'press.menu.layout', run: function () { ui().docSetup('margins'); } },
    { id: 'layout.createGuides', title: 'press.cmd.layout_create_guides', group: 'press.menu.layout', keywords: ['grid', 'rows', 'columns'], run: function () { ui().createGuides(); } },
    { id: 'layout.clearGuides', title: 'press.cmd.layout_clear_guides', group: 'press.menu.layout', run: function () { var g = PR.layers.guideList(S.doc, S); g.length = 0; H.commit(U.t('press.edit.undo_clear_guides')); } },
    { id: 'layout.newMaster', title: 'press.cmd.layout_new_master', group: 'press.menu.layout', run: function () { ui().newMaster(); } },
    { id: 'layout.editMaster', title: 'press.cmd.layout_edit_master', group: 'press.menu.layout', checked: function () { return !!S.editMaster; }, run: function () {
      if (S.editMaster) { S.editMaster = null; S.sel = []; PR.emit('page', S.page); V.fitPage(); PR.touch(); return; }
      var pg = S.doc.pages[S.page], mid = pg && pg.master || (S.doc.masters[0] && S.doc.masters[0].id);
      if (!mid) return U.toast(U.t('press.app.no_masters'));
      ui().editMaster(mid, P.masterSide(S.doc, S.page));
    } },
    { id: 'layout.applyMaster', title: 'press.cmd.layout_apply_master', group: 'press.menu.layout', run: function () { ui().applyMaster(); } },
    { id: 'layout.overrideMaster', title: 'press.cmd.layout_override_master', group: 'press.menu.layout', keys: ['Alt+Shift+Mod+L'], when: function () { return !S.editMaster && P.masterItems(S.doc, S.page).length > 0; }, run: function () { var m = P.overrideMaster(S.doc, S.page); H.commit(U.t('press.edit.undo_override_master_items')); PR.select(m.map(function (i) { return i.id; })); } },
    { id: 'layout.autoflow', title: 'press.cmd.layout_autoflow', group: 'press.menu.layout', keywords: ['add pages', 'overset'], when: function () { return PR.engine.oversetStories().length > 0; }, run: function () {
      var sid = PR.selected()[0] && PR.selected()[0].story; var list = PR.engine.oversetStories(); if (list.indexOf(sid) < 0) sid = list[0];
      var n = PR.engine.autoflow(sid); H.commit(U.t('press.edit.undo_autoflow')); U.toast(U.t('press.app.pages_added', { n: n }));
    } },

    /* ---------- Type ---------- */
    { id: 'type.bold', title: 'press.cmd.type_bold', group: 'press.menu.type', keys: ['Shift+Mod+B'], when: textTarget, run: function () { FM.toggle('bold'); } },
    { id: 'type.italic', title: 'press.cmd.type_italic', group: 'press.menu.type', keys: ['Shift+Mod+I'], when: textTarget, run: function () { FM.toggle('italic'); } },
    { id: 'type.underline', title: 'press.cmd.type_underline', group: 'press.menu.type', keys: ['Shift+Mod+U'], when: textTarget, run: function () { var c = FM.current(); FM.char({ underline: !(c && c.char.underline) }); } },
    { id: 'type.alignLeft', title: 'press.cmd.type_align_left', group: 'press.menu.type', keys: ['Shift+Mod+L'], when: textTarget, run: function () { FM.para({ align: 'left' }); } },
    { id: 'type.alignCenter', title: 'press.cmd.type_align_center', group: 'press.menu.type', keys: ['Shift+Mod+C'], when: textTarget, run: function () { FM.para({ align: 'center' }); } },
    { id: 'type.alignRight', title: 'press.cmd.type_align_right', group: 'press.menu.type', keys: ['Shift+Mod+R'], when: textTarget, run: function () { FM.para({ align: 'right' }); } },
    { id: 'type.justify', title: 'press.cmd.type_justify', group: 'press.menu.type', keys: ['Shift+Mod+J'], when: textTarget, run: function () { FM.para({ align: 'justify' }); } },
    { id: 'type.justifyAll', title: 'press.cmd.type_justify_all', group: 'press.menu.type', keys: ['Shift+Mod+F'], when: textTarget, run: function () { FM.para({ align: 'justify-all' }); } },
    { id: 'type.bigger', title: 'press.cmd.type_bigger', group: 'press.menu.type', keys: ['Shift+Mod+.'], when: textTarget, run: function () { var c = FM.current(); FM.char({ size: Math.round((c.char.size + 1) * 10) / 10 }); } },
    { id: 'type.smaller', title: 'press.cmd.type_smaller', group: 'press.menu.type', keys: ['Shift+Mod+,'], when: textTarget, run: function () { var c = FM.current(); FM.char({ size: Math.max(1, Math.round((c.char.size - 1) * 10) / 10) }); } },
    { id: 'type.trackIn', title: 'press.cmd.type_track_in', group: 'press.menu.type', keys: ['Alt+ArrowLeft'], when: function () { return !!S.text; }, run: function () { var c = FM.current(); FM.char({ tracking: (c.char.tracking || 0) - 10 }); } },
    { id: 'type.trackOut', title: 'press.cmd.type_track_out', group: 'press.menu.type', keys: ['Alt+ArrowRight'], when: function () { return !!S.text; }, run: function () { var c = FM.current(); FM.char({ tracking: (c.char.tracking || 0) + 10 }); } },
    { id: 'type.pageNumber', title: 'press.cmd.type_page_number', group: 'press.menu.type', keys: ['Alt+Shift+Mod+N'], keywords: ['special character', 'folio', 'marker'], when: function () { return !!S.text; }, run: special(M.PAGE_NUM, 'press.edit.undo_page_number') },
    { id: 'type.emDash', title: 'press.cmd.type_em_dash', group: 'press.menu.type', keys: ['Alt+Shift+-'], keywords: ['special character'], when: function () { return !!S.text; }, run: special('—', 'press.edit.undo_em_dash') },
    { id: 'type.enDash', title: 'press.cmd.type_en_dash', group: 'press.menu.type', keys: ['Alt+-'], keywords: ['special character'], when: function () { return !!S.text; }, run: special('–', 'press.edit.undo_en_dash') },
    { id: 'type.nbsp', title: 'press.cmd.type_nbsp', group: 'press.menu.type', keys: ['Alt+Mod+X'], keywords: ['special character', 'white space'], when: function () { return !!S.text; }, run: special('\u00A0', 'press.edit.undo_nonbreaking_space') },
    { id: 'type.softHyphen', title: 'press.cmd.type_soft_hyphen', group: 'press.menu.type', keys: ['Shift+Mod+-'], keywords: ['special character'], when: function () { return !!S.text; }, run: special('\u00AD', 'press.edit.undo_discretionary_hyphen') },
    { id: 'type.lineBreak', title: 'press.cmd.type_line_break', group: 'press.menu.type', keywords: ['special character', 'shift enter'], when: function () { return !!S.text; }, run: special('\u2028', 'press.edit.undo_line_break') },
    { id: 'type.bullet', title: 'press.cmd.type_bullet', group: 'press.menu.type', keywords: ['special character'], when: function () { return !!S.text; }, run: special('•', 'press.edit.undo_bullet') },
    { id: 'type.copyright', title: 'press.cmd.type_copyright', group: 'press.menu.type', keywords: ['special character'], when: function () { return !!S.text; }, run: special('©', 'press.edit.undo_copyright') },
    { id: 'type.placeholder', title: 'press.cmd.type_placeholder', group: 'press.menu.type', keywords: ['lorem ipsum'], when: function () { return PR.selected().some(function (it) { return it.type === 'text'; }) || !!S.text; }, run: function () { ui().fillPlaceholder(); } },
    { id: 'type.clearOverrides', title: 'press.cmd.type_clear_overrides', group: 'press.menu.type', when: textTarget, run: function () { FM.clearOverrides(); } },
    { id: 'type.redefinePara', title: 'press.cmd.type_redefine_para', group: 'press.menu.type', when: textTarget, run: function () { if (FM.redefine('para')) U.toast(U.t('press.app.style_redefined')); } },
    { id: 'type.newParaStyle', title: 'press.cmd.type_new_para_style', group: 'press.menu.type', run: function () { ui().styleEditor('para', null); } },
    { id: 'type.newCharStyle', title: 'press.cmd.type_new_char_style', group: 'press.menu.type', run: function () { ui().styleEditor('char', null); } },
    { id: 'type.hyphenate', title: 'press.cmd.type_hyphenate', group: 'press.menu.type', when: textTarget, checked: function () { var c = FM.current(); return !!(c && c.para.hyphenate); }, run: function () { var c = FM.current(); FM.para({ hyphenate: !c.para.hyphenate }); } },
    { id: 'type.composerKP', title: 'press.cmd.type_composer_kp', group: 'press.menu.type', when: textTarget, checked: function () { var c = FM.current(); return !!(c && c.para.composer === 'kp'); }, run: function () { FM.para({ composer: 'kp' }); } },
    { id: 'type.composerGreedy', title: 'press.cmd.type_composer_greedy', group: 'press.menu.type', when: textTarget, checked: function () { var c = FM.current(); return !!(c && c.para.composer !== 'kp'); }, run: function () { FM.para({ composer: 'greedy' }); } },
    { id: 'type.gridAlign', title: 'press.cmd.type_grid_align', group: 'press.menu.type', when: textTarget, checked: function () { var c = FM.current(); return !!(c && c.para.gridAlign); }, run: function () { var c = FM.current(); FM.para({ gridAlign: !c.para.gridAlign }); } },
    { id: 'type.dropCap', title: 'press.cmd.type_drop_cap', group: 'press.menu.type', when: textTarget, checked: function () { var c = FM.current(); return !!(c && c.para.dropLines >= 2); }, run: function () { var c = FM.current(); FM.para({ dropLines: c.para.dropLines >= 2 ? 0 : 3 }); } },

    /* ---------- View ---------- */
    { id: 'view.zoomIn', title: 'press.cmd.view_zoom_in', group: 'menu.view', keys: ['Mod+=', 'Shift+Mod+='], run: function () { V.zoomBy(1.25); } },
    { id: 'view.zoomOut', title: 'press.cmd.view_zoom_out', group: 'menu.view', keys: ['Mod+-'], run: function () { V.zoomBy(0.8); } },
    { id: 'view.fitPage', title: 'press.cmd.view_fit_page', group: 'menu.view', keys: ['Mod+0'], run: function () { V.fitPage(); } },
    { id: 'view.fitSpread', title: 'press.cmd.view_fit_spread', group: 'menu.view', keys: ['Alt+Mod+0'], run: function () { V.fitSpread(); } },
    { id: 'view.actual', title: 'press.cmd.view_actual', group: 'menu.view', keys: ['Mod+1'], run: function () { V.actualSize(); } },
    { id: 'view.pasteboard', title: 'press.cmd.view_pasteboard', group: 'menu.view', keys: ['Alt+Shift+Mod+0'], run: function () { V.fitRect(V.bounds()); } },
    { id: 'view.preview', title: 'press.cmd.view_preview', group: 'menu.view', keys: ['W'], keywords: ['screen mode', 'hide guides'], checked: function () { return V.preview; }, run: function () { V.preview = !V.preview; V.request(); PR.emit('view'); } },
    { id: 'view.guides', title: 'press.cmd.view_guides', group: 'menu.view', keys: ['Mod+;'], checked: function () { return V.show.guides; }, run: function () { toggle('guides', 'press.app.guides_on', 'press.app.guides_off'); } },
    { id: 'view.baseline', title: 'press.cmd.view_baseline', group: 'menu.view', keys: ["Alt+Mod+'"], checked: function () { return V.show.baseline; }, run: function () { toggle('baseline', 'press.app.baseline_on', 'press.app.baseline_off'); } },
    { id: 'view.frames', title: 'press.cmd.view_frames', group: 'menu.view', keys: ['Mod+H'], checked: function () { return V.show.frames; }, run: function () { toggle('frames'); } },
    { id: 'view.threads', title: 'press.cmd.view_threads', group: 'menu.view', keys: ['Alt+Mod+Y'], checked: function () { return V.show.threads; }, run: function () { toggle('threads'); } },
    { id: 'view.snap', title: 'press.cmd.view_snap', group: 'menu.view', keys: ['Shift+Mod+;'], checked: function () { return V.show.snap; }, run: function () { toggle('snap', 'press.app.snap_on', 'press.app.snap_off'); } },
    { id: 'view.rulers', title: 'press.cmd.view_rulers', group: 'menu.view', keys: ['Mod+R'], checked: function () { return V.show.rulers; }, run: function () { toggle('rulers'); document.getElementById('app').classList.toggle('no-rulers', !V.show.rulers); } },
    { id: 'theme.pro', title: 'press.cmd.theme_pro', group: 'menu.view', checked: function () { return document.documentElement.getAttribute('data-theme') === 'pro'; }, run: function () { setTheme('pro'); } },
    { id: 'theme.light', title: 'press.cmd.theme_light', group: 'menu.view', checked: function () { return document.documentElement.getAttribute('data-theme') === 'light'; }, run: function () { setTheme('light'); } },
    { id: 'theme.classic', title: 'press.cmd.theme_classic', group: 'menu.view', checked: function () { return document.documentElement.getAttribute('data-theme') === 'classic'; }, run: function () { setTheme('classic'); } },

    /* ---------- Window ---------- */
    { id: 'window.pages', title: 'press.cmd.window_pages', group: 'press.menu.window', keys: ['Mod+F12'], run: function () { ui().showPanel('pages'); } },
    { id: 'window.layers', title: 'press.cmd.window_layers', group: 'press.menu.window', keys: ['F7'], run: function () { ui().showPanel('layers'); } },
    { id: 'window.paraStyles', title: 'press.cmd.window_para_styles', group: 'press.menu.window', keys: ['Mod+F11'], run: function () { ui().showPanel('styles', 'para'); } },
    { id: 'window.charStyles', title: 'press.cmd.window_char_styles', group: 'press.menu.window', keys: ['Shift+F11'], run: function () { ui().showPanel('styles', 'char'); } },
    { id: 'window.props', title: 'press.cmd.window_props', group: 'press.menu.window', run: function () { ui().showPanel('props'); } },
    { id: 'window.swatches', title: 'press.cmd.window_swatches', group: 'press.menu.window', keys: ['F5'], run: function () { ui().showPanel('swatches'); } },
    { id: 'window.togglePanels', title: 'press.cmd.window_toggle_panels', group: 'press.menu.window', keys: ['Tab'], run: function () { ui().togglePanels(); } },

    /* ---------- Help ---------- */
    { id: 'help.search', title: 'press.cmd.help_search', group: 'menu.help', keys: ['Mod+K'], keywords: ['palette', 'spotlight'], run: function () { A.palette(); } },
    { id: 'help.shortcuts', title: 'press.cmd.help_shortcuts', group: 'menu.help', keys: ['Alt+Shift+Mod+K'], run: function () { A.keymap(); } },
    { id: 'help.about', title: 'press.cmd.help_about', group: 'menu.help', run: function () { ui().about(); } },
    { id: 'help.home', title: 'slopographic.com', group: 'menu.help', run: function () { location.href = '../'; } } // i18n-ignore: the site's address
  ]);
  // a theme the site does not offer (its profile hides it, shared/theme/theme.js) is not a command or a menu row here
  ['pro', 'light', 'classic'].forEach(function (t) { if (window.SlopTheme && !SlopTheme.has(t)) A.unregister('theme.' + t); });

  /* ---------- one command per style ("Apply paragraph style: Heading 1") ---------- */
  var styleIds = [];
  PR.registerStyleCommands = function () {
    if (!S.doc) return;
    styleIds.forEach(function (id) { A.unregister(id); }); styleIds = [];
    var list = [];
    PR.styles.names(S.doc, 'para').forEach(function (n) { list.push({ id: 'style.para.' + n, title: function () { return U.t('press.cmd.style_para', { name: n }); }, group: 'press.menu.styles', keywords: ['paragraph style'], when: textTarget, run: function () { FM.paraStyle(n); } }); });
    PR.styles.names(S.doc, 'char').forEach(function (n) { list.push({ id: 'style.char.' + n, title: function () { return U.t('press.cmd.style_char', { name: n }); }, group: 'press.menu.styles', keywords: ['character style'], when: textTarget, run: function () { FM.charStyle(n); } }); });
    styleIds = list.map(function (c) { return c.id; });
    A.register(list);
  };
  var lastSig = '';
  PR.on('commit', function () { var sig = S.doc && Object.keys(S.doc.styles.para).concat(Object.keys(S.doc.styles.char)).join('|'); if (sig !== lastSig) { lastSig = sig; PR.registerStyleCommands(); } });
  PR.on('doc', function () { lastSig = ''; PR.registerStyleCommands(); });
})();
