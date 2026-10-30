/* Slop PDF — top-bar menus (File/Edit/View/Help), shortcuts and about dialogs, themes, panel toggle. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, O = SP.organizer, Ed = SP.editor, PN = SP.panels, A = SP.app, S = A._;
  var $ = U.$, h = U.h, t = U.t;
  function sendSub(items, label, emptyLabel) {
    if (!window.SlopHub || SP.offline || !E.state.pages.length) return null;
    return { label: label, sub: items.length ? items : [{ label: emptyLabel, disabled: true }] };
  }
  A.sendSub = sendSub;
  /* The app's names (keys) and the shared theme ids (shared/theme/theme.js): the choice is saved through SlopTheme.set. */
  var THEMES = [['pro', 'pdf.menu.theme_pro', 'dark'], ['light', 'pdf.menu.theme_light', 'light'], ['classic', 'pdf.menu.theme_classic', 'classic']]
    .filter(function (r) { return !window.SlopTheme || SlopTheme.has(r[2]); });   // only the themes the site offers
  A.THEMES = THEMES;
  /* ------------------------------------------------------------- menus */
  S.buildMenus = function () {
    var defs = [['menu.file', S.fileMenu], ['menu.edit', S.editMenu], ['menu.view', S.viewMenu], ['menu.help', S.helpMenu]];
    defs.forEach(function (d) {
      var b = h('button', { type: 'button', class: 'menu-b', 'aria-haspopup': 'menu', 'data-i18n': d[0] }, t(d[0])); // data-i18n: follows a language switch
      var open = A.whenReady(function () { var r = b.getBoundingClientRect(); SlopUI.menu(d[1](), r.left, r.bottom + 2); }); // the items need the whole app
      b.addEventListener('click', function (e) { e.stopPropagation(); open(); });
      S.els.menus.appendChild(b);
    });
    var more = A.whenReady(function () { var r = S.els.btnMore.getBoundingClientRect(); SlopUI.menu(S.moreMenu(), r.right - 220, r.bottom + 4); });
    S.els.btnMore.addEventListener('click', function (e) { e.stopPropagation(); more(); });
  }
  /* The overflow (More) menu, shown at 900 px and below where the toolbar has no room: Convert is listed here directly
     (the toolbar button is hidden at that width) and the four top-bar menus follow. */
  S.moreMenu = function () {
    var has = E.state.pages.length > 0;
    var convert = window.SlopConvert && !SP.offline ? [{ label: t('pdf.menu.convert_doc'), act: A.openConvert, disabled: !has }, '-'] : [];
    return convert.concat([{ label: t('menu.file'), sub: S.fileMenu() }, { label: t('menu.edit'), sub: S.editMenu() }, { label: t('menu.view'), sub: S.viewMenu() }, { label: t('menu.help'), sub: S.helpMenu() }]);
  };
  S.fileMenu = function () {
    var has = E.state.pages.length > 0;
    return [
      { label: t('pdf.menu.open_files'), key: A.key('file.open'), act: A.openDialog },
      window.SlopHub ? { label: t('pdf.menu.open_drive'), act: A.openFromDrive } : null,
      { label: t('pdf.menu.try_sample'), act: A.loadSample },
      { label: t('pdf.menu.new_tab'), key: 'Ctrl+T', act: function () { A.newTab(); } },
      { label: t('pdf.menu.close_tab'), key: 'Ctrl+W', act: function () { A.closeTab(); } },
      S.savedSession && !has ? { label: t('pdf.menu.restore'), act: A.restoreSession } : null,
      '-',
      { label: t('ui.rename_dots'), key: A.key('file.rename'), act: function () { A.rename(null); } },
      '-',
      window.SlopHub && !SP.offline ? { label: t('pdf.menu.save_drive'), key: A.key('file.save'), act: function () { A.saveToDrive(); }, disabled: !has } : null,
      window.SlopHub && !SP.offline && has ? { label: t('pdf.menu.versions'), sub: A.versionItems() } : null,
      { label: t('pdf.menu.download_pdf'), key: A.key('file.download'), act: A.download, disabled: !has },
      { label: t('pdf.menu.protect'), key: A.key('file.protect'), act: function () { A.protect(); }, disabled: !has },
      { label: t('pdf.menu.download_selected'), act: A.extract, disabled: !O.sel.size },
      { label: t('pdf.menu.extract_text'), act: A.extractText, disabled: !has },
      !SP.offline && window.SlopAITools ? { label: t('pdf.menu.ocr_page'), act: function () { A.recognisePage(); }, disabled: !has } : null,
      !SP.offline && window.SlopAITools ? { label: t('pdf.menu.ocr_all'), act: function () { A.recogniseAll(); }, disabled: !has } : null,
      { label: t('pdf.menu.extract_all'), act: function () { A.extractAssets(); }, disabled: !has },
      { label: t('pdf.menu.pages_images'), act: function () { A.setTool('convert'); }, disabled: !has },
      window.SlopConvert && !SP.offline ? { label: t('pdf.menu.export_as'), sub: A.exportItems(), disabled: !has } : null,
      window.SlopConvert && !SP.offline ? { label: t('pdf.menu.convert'), act: A.openConvert, disabled: !has } : null,
      !SP.offline ? { label: t('pdf.menu.fonts'), act: A.openFonts, disabled: !has } : null,
      '-',
      sendSub(A.sendItems(), t('pdf.menu.send_to'), t('pdf.menu.send_none')),
      window.SlopHub && !SP.offline && has ? '-' : null,
      window.SlopHub && !SP.offline ? { label: t('pdf.menu.drive_autosave'), check: U.store.get('driveAutosave', true), act: function () { var v = !U.store.get('driveAutosave', true); U.store.set('driveAutosave', v); SlopUI.toast(t(v ? 'pdf.menu.drive_autosave_on' : 'pdf.menu.drive_autosave_off')); } } : null,
      { label: t('pdf.menu.download_app'), act: A.downloadApp },
      { label: t('pdf.menu.autosave'), check: U.store.get('autosave', true), act: function () { var v = !U.store.get('autosave', true); U.store.set('autosave', v); A.setAutosave(v); if (!v) U.idb.del('session'); SlopUI.toast(t(v ? 'pdf.menu.autosave_on' : 'pdf.menu.autosave_off')); } },
      '-',
      { label: t('pdf.menu.close_all'), act: A.closeAll, disabled: !has }
    ];
  }
  S.editMenu = function () {
    var has = E.state.pages.length > 0, pg = A.mode === 'page';
    return [
      { label: E.canUndo() ? t('ui.undo_what', { what: E.undoLabel() }) : t('ui.undo'), key: A.key('edit.undo'), act: A.undo, disabled: !E.canUndo() },
      { label: E.canRedo() ? t('ui.redo_what', { what: E.redoLabel() }) : t('ui.redo'), key: A.key('edit.redo'), act: A.redo, disabled: !E.canRedo() },
      '-',
      { label: t('pdf.se.cmd_cut'), key: A.key('edit.cut'), act: function () { Ed.cut(); }, disabled: !pg || !Ed.canCopy || !Ed.canCopy() },
      { label: t('pdf.se.cmd_copy'), key: A.key('edit.copy'), act: function () { Ed.copy(); }, disabled: !pg || !Ed.canCopy || !Ed.canCopy() },
      { label: t('pdf.se.cmd_paste'), key: A.key('edit.paste'), act: function () { Ed.paste(); }, disabled: !pg || !Ed.canPaste() },
      { label: t('pdf.se.cmd_paste_all'), act: function () { Ed.pasteOnPages(); }, disabled: !pg || !Ed.canPaste() },
      { label: t('pdf.se.cmd_paste_pages'), act: function () { Ed.askPasteOnPages(); }, disabled: !pg || !Ed.canPaste() },
      { label: t('pdf.se.cmd_select_words'), key: A.key('edit.selectBlockText'), act: function () { Ed.selectBlockText(); }, disabled: !pg || !Ed.canSelectBlockText || !Ed.canSelectBlockText() },
      '-',
      { label: t('pdf.menu.select_all_pages'), key: A.key('edit.selectAll'), act: function () { O.selectAll(); }, disabled: !has },
      { label: t('ui.select_none'), act: function () { O.setSelection([]); }, disabled: !O.sel.size },
      { label: t('pdf.menu.edit_objects'), key: A.key('edit.objects'), check: !!Ed.objMode, act: function () { if (!pg) A.ensurePage(); Ed.toggleObjects(); }, disabled: !has || !Ed.toggleObjects },
      '-',
      { label: t('pdf.menu.rotate_right'), key: A.key('pages.rotateRight'), act: function () { A.rotate(pg ? [Ed.pid] : A.targetIds(), 90); }, disabled: !has },
      { label: t('pdf.menu.rotate_left'), key: A.key('pages.rotateLeft'), act: function () { A.rotate(pg ? [Ed.pid] : A.targetIds(), -90); }, disabled: !has },
      { label: t('pdf.menu.duplicate_pages'), key: A.key('edit.duplicate'), act: function () { A.duplicate(A.targetIds()); }, disabled: !has },
      { label: t('pdf.menu.delete_pages'), key: A.key('edit.delete'), act: function () { A.remove(pg ? [Ed.pid] : A.targetIds()); }, disabled: !has },
      { label: t('pdf.menu.reverse'), act: A.reverse, disabled: !has },
      { label: t('pdf.menu.insert_blank'), act: A.insertBlank, disabled: !has },
      { label: t('pdf.menu.insert_file'), act: A.insertFromFile, disabled: !has }
    ];
  }
  S.viewMenu = function () {
    var theme = window.SlopTheme ? SlopTheme.get() : 'dark';
    return [
      { label: t('pdf.menu.all_pages'), act: function () { A.showGrid(); }, check: A.mode === 'grid' },
      { label: t('pdf.menu.page_view'), act: function () { A.ensurePage(); }, check: A.mode === 'page', disabled: !E.state.pages.length },
      { label: t('pdf.menu.split_view'), disabled: A.mode !== 'page' || E.state.pages.length < 1, sub: SP.panes.items() },
      '-',
      { label: t('ui.zoom_in'), key: A.key('view.zoomIn'), act: function () { if (A.mode === 'page') Ed.zoomBy(1.25); else O.zoomBy(1.25); } },
      { label: t('ui.zoom_out'), key: A.key('view.zoomOut'), act: function () { if (A.mode === 'page') Ed.zoomBy(0.8); else O.zoomBy(0.8); } },
      { label: t('pdf.menu.fit_page'), key: A.key('view.fit'), act: function () { Ed.fit('fit'); }, disabled: A.mode !== 'page' },
      { label: t('pdf.menu.page_layout'), disabled: A.mode !== 'page', sub: [['continuous', 'pdf.menu.layout_continuous'], ['single', 'pdf.menu.layout_single'], ['two', 'pdf.menu.layout_two']].map(function (m) { return { label: t(m[1]), check: Ed.layoutMode === m[0], act: function () { Ed.setLayout(m[0]); } }; }) },
      '-',
      { label: t('pdf.menu.theme'), sub: THEMES.map(function (r) { return { label: t(r[1]), check: theme === r[2], act: function () { A.setTheme(r[0]); } }; }) },
      { label: t('pdf.menu.props_panel'), check: !S.els.app.classList.contains('no-panel'), act: function () { A.togglePanel(); } }
    ];
  }
  S.helpMenu = function () {
    return [
      { label: t('pdf.menu.search_cmds'), key: A.key('cmd.palette'), act: function () { if (window.SlopCmd) SlopCmd.open(); }, disabled: !window.SlopCmd },
      { label: t('pdf.menu.shortcuts'), key: A.key('cmd.keymap'), act: S.showKeys },
      { label: t('pdf.menu.about'), act: S.showAbout },
      { label: t('pdf.menu.agents'), act: function () { if (window.SlopAgents) SlopAgents.about(); }, disabled: !window.SlopAgents },
      '-',
      { label: t('pdf.app.home'), act: function () { location.href = SP.offline ? 'https://slopographic.com/' : '../'; } }
    ];
  }
  /** The shared shortcut editor (search, record, conflicts, reset, export/import). */
  S.showKeys = function () { if (window.SlopCmd) SlopCmd.openKeymap(); };
  S.showAbout = function () {
    SlopUI.dialog({ title: t('pdf.menu.about_title'), body: h('div', null,
      h('p', { class: 'sui-p' }, t('pdf.menu.about_p1')),
      h('p', { class: 'sui-p' }, t('pdf.menu.about_p2')),
      h('p', { class: 'sui-p' }, t('pdf.menu.about_p3')),
      h('p', { class: 'sui-p' }, t('pdf.menu.about_p4'))), buttons: [{ label: t('pdf.menu.about_ok'), primary: true }] });
  }

  /* ------------------------------------------------------------ themes */
  /* The choice is saved for every page by the shared switcher; this page only shows it. */
  A.paintMeta = function () {
    var meta = document.querySelector('meta[name="theme-color"]');
    var id = document.documentElement.getAttribute('data-slop-theme');
    if (meta) meta.setAttribute('content', id === 'light' ? '#f1ede4' : id === 'classic' ? '#c0c0c0' : '#0e0e10');
  };
  A.setTheme = function (id) {
    var row = THEMES.filter(function (x) { return x[0] === id; })[0] || THEMES[0];
    var r = window.SlopTheme ? SlopTheme.set(row[2]) : { ok: false, error: t('pdf.menu.theme_missing') };
    if (!r.ok) { if (window.SlopTheme) SlopTheme.apply(row[2]); A.status(r.error, 'err'); }
    else A.status(t('pdf.menu.theme_set', { name: t(row[1]) }));
    A.paintMeta();
  };
  /** The properties panel: on a phone the bottom sheet (shared/ui/sheet.js, attached in ui/app.js), else the side panel. */
  A.togglePanel = function (force) {
    var sheet = S.sheet;
    if (sheet && sheet.isPhone()) { if (force == null) sheet.toggle(); else if (force) sheet.open(); else sheet.close(); }
    else if (window.innerWidth > 900 || !sheet) { S.els.app.classList.toggle('no-panel', force != null ? !force : undefined); S.els.btnPanel.setAttribute('aria-expanded', S.els.app.classList.contains('no-panel') ? 'false' : 'true'); }
    if (A.mode === 'page') setTimeout(function () { Ed.layout(); }, 200);
  };
})();
