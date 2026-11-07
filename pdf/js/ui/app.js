/* Slop PDF — app shell: boot, tool rail, organizer/page-view modes, chrome (toolbar state, status
   bar, live announcements) and change handling. Actions live in ui/actions.js and ui/exports.js,
   menus/themes in ui/menus.js, drop/keyboard/autosave in ui/input.js, Slop Hub in ui/main.js. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, O = SP.organizer, Ed = SP.editor, PN = SP.panels;
  var A = SP.app = {};
  A.tool = 'organize'; A.mode = 'grid';
  A.insertOpts = { size: 'a4', orient: 'portrait', where: 'after' };
  var $ = U.$, h = U.h, t = U.t;
  var S = A._ = { els: {}, fileNameTouched: false, savedSession: null }; // shared by ui/*.js
  // [tool id, label in the current language, icon, label key]; the label is set from the key again on a language switch
  // (S.labelRail) so S.RAIL's readers (ui/commands.js) and the rail buttons always have the current words.
  var RAIL = [['organize', '', 'organize', 'pdf.app.rail_organize'], ['edit', '', 'edit', 'pdf.app.rail_edit'], ['sign', '', 'sign', 'pdf.app.rail_sign'], ['redact', '', 'redact', 'pdf.app.rail_redact'], ['numbers', '', 'numbers', 'pdf.app.rail_numbers'], ['watermark', '', 'watermark', 'pdf.app.rail_watermark'], ['comments', '', 'comments', 'pdf.app.rail_comments'],
    ['forms', '', 'forms', 'pdf.app.rail_forms'], ['compress', '', 'compress', 'pdf.app.rail_compress'], ['convert', '', 'convert', 'pdf.app.rail_convert'], ['ocr', '', 'ocr', 'pdf.app.rail_ocr'], ['split', '', 'split', 'pdf.app.rail_split'], ['metadata', '', 'info', 'pdf.app.rail_metadata']];
  function railLabels() { RAIL.forEach(function (r) { r[1] = t(r[3]); }); }
  railLabels();

  var PAGE_TOOLS = { edit: 1, sign: 1, redact: 1, comments: 1 };
  S.RAIL = RAIL;

  /* ---------------------------------------------------------------- boot */
  /* Two steps (shared/load/HANDOFF.md). A.boot builds the empty first view from the scripts the page runs before its
     first paint: the rail, the menus, the Organize panel, the drop zone. The rest of the app is in <template id="pdf-later">,
     loaded right after that paint; A.bootRest wires it. A press before then waits for it (A.whenReady). */
  var readyRes; A.isReady = false;
  A.ready = new Promise(function (r) { readyRes = r; });
  /** fn, run now once the app is wired, or as soon as it is. */
  A.whenReady = function (fn) {
    return function () {
      var self = this, args = arguments;
      if (A.isReady) return fn.apply(self, args);
      return A.ready.then(function () { return fn.apply(self, args); });
    };
  };
  A.boot = function () {
    ['app', 'rail', 'stage', 'grid', 'viewer', 'empty', 'props', 'ctxGrid', 'ctxPage', 'status', 'fileName', 'btnDownload', 'btnFonts', 'btnUndo', 'btnRedo', 'menus', 'btnMore', 'btnPanel', 'live', 'busy', 'restore', 'gridWrap']
      .forEach(function (id) { S.els[id] = document.getElementById(id); });
    S.buildRail(); S.buildMenus();
    PN.init(S.els.props);
    // phone width: the panel is a bottom sheet (shared/ui/sheet.js) that the rail's tools and the panel button open and close
    if (window.SlopSheet) S.sheet = SlopSheet.attach({ root: S.els.app, panel: S.els.props, phone: '(max-width: 900px)', openClass: 'sheet-open', triggers: S.els.rail,
      isActive: function (b) { return b.classList.contains('on'); }, toggles: [S.els.btnPanel], label: t('pdf.app.tool_panel') });
    // the properties panel's width: dragged on its edge and kept (shared/ui/resize-panel.js, every side panel's one implementation)
    if (window.SlopResizePanel) SlopResizePanel.attach(S.els.props, { app: 'pdf', id: 'props', edge: 'start', width: 304, min: 260, max: 560,
      phone: '(max-width: 900px)', cssVar: '--props-w', target: S.els.app, label: t('pdf.app.properties') });
    // the suite rule (shared/frame/HANDOFF.md): Download, the main button, sits at the foot of the properties panel (the
    // shared footer, shared/frame/panel.js); on a phone the closed sheet still shows it above the rail. File ▸ Download too.
    if (window.SlopFramePanel) SlopFramePanel.create(S.els.props, { bare: true }).footer([{ el: S.els.btnDownload }], { more: t('pdf.app.properties'), onMore: function () { if (S.sheet) S.sheet.toggle(); } });
    S.els.btnPanel.addEventListener('click', function () { if (!S.sheet || !S.sheet.isPhone()) A.togglePanel(); });
    S.els.btnDownload.addEventListener('click', A.whenReady(function () { A.download(); }));
    S.els.btnUndo.addEventListener('click', A.whenReady(function () { A.undo(); }));
    S.els.btnRedo.addEventListener('click', A.whenReady(function () { A.redo(); }));
    S.els.fileName.addEventListener('input', function () { S.fileNameTouched = true; });
    S.els.fileName.addEventListener('change', A.whenReady(function () { var v = S.els.fileName.value; A.rename(String(v).trim() ? v : 'document.pdf'); }));
    $('#emptySample').addEventListener('click', A.whenReady(function () { A.loadSample(); }));
    S.els.restore.addEventListener('click', A.whenReady(function () { A.restoreSession(); }));
    S.setupDrop();
    A.paintMeta(); // the shared theme script has already painted the page
    S.markRail(A.tool); PN.show(A.tool); S.updateChrome();
    if (SP.offline) document.documentElement.classList.add('is-offline');
    U.onLang(function () { S.labelRail(); S.updateUndo(); S.updateStatus(); }); // UI built once follows a language switch
  };
  A.bootRest = function () {
    S.buildCtxBars();
    O.init(S.els.grid, S.els.gridWrap);
    Ed.init(S.els.viewer);
    E.on('change', S.onChange);
    E.on('files', function () { PN.refresh('files'); });
    S.setupKeys();
    A.isReady = true; readyRes();
    A.setTool(A.tool);
    S.refreshAll();
    A.startTabs(); // ui/doc-tabs.js: the strip, and the tabs stored on this device (the document on screen opens first)
    A.restoreView(); // ui/view-state.js: the view the open tab was left in, once the tabs are open
    if (A.launch) A.launch(); // ui/main.js: Slop Hub (?drive=)
  };
  // The view modes, at once (the top bar is parsed): their control comes before the Drive link (DOMContentLoaded), as always
  if (window.SlopViewMode) SlopViewMode.register('pdf', { regions: { toolbar: '.topbar', sidebar: '#rail', panels: '#props' }, mount: '.topbar' });
  function start() {
    A.boot();
    var later = window.SlopLoad ? SlopLoad.ready('pdf-later') : Promise.resolve();
    later.then(A.bootRest).catch(function (e) { console.error('Slop PDF: could not start', e); A.status(t('pdf.app.start_failed', { error: String(e.message || e) }), 'err'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  /* ---------------------------------------------------------------- rail */
  S.buildRail = function () {
    RAIL.forEach(function (r) {
      var b = h('button', { type: 'button', class: 'rail-b', role: 'tab', 'data-tool': r[0], 'aria-selected': 'false', title: r[1], html: U.icon(r[2]) + '<span>' + U.esc(r[1]) + '</span>' });
      b.addEventListener('click', A.whenReady(function () { A.setTool(r[0]); })); // on a phone the sheet opens or closes with it (S.sheet)
      S.els.rail.appendChild(b);
    });
  };
  /** A language switch: the rail's labels (and S.RAIL's) in the new language. */
  S.labelRail = function () {
    railLabels();
    RAIL.forEach(function (r) {
      var b = S.els.rail && S.els.rail.querySelector('.rail-b[data-tool="' + r[0] + '"]'); if (!b) return;
      b.title = r[1]; var sp = b.querySelector('span'); if (sp) sp.textContent = r[1];
    });
  };
  S.markRail = function (tool) {
    U.$$('.rail-b', S.els.rail).forEach(function (b) { var on = b.dataset.tool === tool; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  };
  A.setTool = function (tool) {
    if (Ed.isEditingText()) Ed.commitText();
    A.tool = tool;
    S.markRail(tool);
    if (PAGE_TOOLS[tool]) { if (E.state.pages.length) A.ensurePage(); if (tool === 'redact' && Ed.tool !== 'redact') Ed.setTool('redact'); }
    else if (A.mode === 'page') A.showGrid(true);
    PN.show(tool);
    O.render();
    S.updateChrome();
  };
  A.ensurePage = function () {
    if (A.mode === 'page' && Ed.page()) return;
    var ids = O.selected(), id = ids[0] || O.focusId || (E.state.pages[0] && E.state.pages[0].id);
    if (id && E.pageById(id)) A.openPage(id, true);
  };
  A.openPage = function (id, keepTool) {
    if (!E.pageById(id)) return;
    A.mode = 'page';
    S.els.app.dataset.mode = 'page';
    if (!keepTool && !PAGE_TOOLS[A.tool]) { A.tool = 'edit'; U.$$('.rail-b', S.els.rail).forEach(function (b) { b.classList.toggle('on', b.dataset.tool === 'edit'); b.setAttribute('aria-selected', b.dataset.tool === 'edit' ? 'true' : 'false'); }); PN.show('edit'); }
    Ed.zoomMode = Ed.zoomMode === 'num' ? 'fit' : Ed.zoomMode;
    Ed.show(id);
    O.setSelection([id], id);
    S.updateChrome();
  };
  A.showGrid = function (fromTool) {
    if (Ed.isEditingText()) Ed.commitText();
    var id = Ed.pid;
    A.mode = 'grid'; S.els.app.dataset.mode = 'grid';
    Ed.hide();
    if (!fromTool && PAGE_TOOLS[A.tool]) { A.tool = 'organize'; A.setTool('organize'); }
    S.updateChrome();
    if (id) setTimeout(function () { O.reveal(id); O.focus(id, false); }, 0);
  };
  A.gotoPage = function (delta) {
    var i = E.indexOf(Ed.pid), j = U.clamp(i + delta, 0, E.state.pages.length - 1);
    if (j !== i) { Ed.show(E.state.pages[j].id); O.setSelection([E.state.pages[j].id], E.state.pages[j].id); S.updateChrome(); PN.refresh(); }
  };

  /** The active page changed (a scroll or a press in the continuous view): the page number, panel and selection follow. */
  A.pageChanged = function () {
    if (A.mode !== 'page' || !Ed.pid) return;
    O.setSelection([Ed.pid], Ed.pid);
    S.updateChrome(); PN.refresh('page');
  };
  A.zoomChanged = function (z) { var l = $('#zoomLbl'); if (l) l.textContent = Math.round(z * 72 / 96 * 100) + '%'; S.updateStatus(); };
  A.toolChanged = function () {
    U.$$('.pv-tools .tb', S.els.ctxPage).forEach(function (b) { b.classList.toggle('on', b.dataset.tool === Ed.tool); });
    PN.refresh('tool');
  };
  A.editorSelectionChanged = function () { PN.refresh('sel'); };
  A.selectionChanged = function () { PN.refresh('sel'); S.updateStatus(); };

  S.updateChrome = function () {
    var has = E.state.pages.length > 0;
    S.els.app.dataset.mode = has ? A.mode : 'empty';
    S.els.empty.hidden = has;
    S.els.ctxGrid.hidden = !has || A.mode !== 'grid';
    S.els.ctxPage.hidden = !has || A.mode !== 'page';
    if (A.mode === 'page') { var n = $('#pvNum'); if (n) n.textContent = (E.indexOf(Ed.pid) + 1) + ' / ' + E.state.pages.length; }
    S.els.btnDownload.disabled = !has;
    if (S.els.btnFonts) S.els.btnFonts.disabled = !has;
    A.toolChanged();
    S.updateUndo(); S.updateStatus();
  }
  S.updateUndo = function () {
    S.els.btnUndo.disabled = !E.canUndo(); S.els.btnRedo.disabled = !E.canRedo();
    S.els.btnUndo.title = E.canUndo() ? t('ui.undo_what', { what: E.undoLabel() }) + ' (Ctrl+Z)' : t('pdf.app.nothing_undo');
    S.els.btnRedo.title = E.canRedo() ? t('ui.redo_what', { what: E.redoLabel() }) + ' (Ctrl+Shift+Z)' : t('pdf.app.nothing_redo');
  }
  var statusMsg = '', statusT = 0;
  A.status = function (msg, kind) {
    statusMsg = msg; clearTimeout(statusT);
    var m = $('#statusMsg'); if (m) { m.textContent = msg; m.className = 'st-msg ' + (kind || ''); }
    statusT = setTimeout(function () { statusMsg = ''; var m2 = $('#statusMsg'); if (m2) m2.textContent = ''; }, 6000);
  };
  S.updateStatus = function () {
    // a copy made to take text off a page (editor/text-strip.js) counts as the file it was made from
    var root = function (id) { var f = E.files.get(id); return f && f.derived ? root(f.derived.from) : id; };
    var n = E.state.pages.length, files = new Set(E.state.pages.filter(function (p) { return p.f; }).map(function (p) { return root(p.f); })).size;
    var bits = [t('pdf.app.pages_n', { n: n }), t('pdf.app.files_n', { n: files })];
    if (O.sel.size) bits.push(t('pdf.app.selected_n', { n: O.sel.size }));
    $('#statusLeft').textContent = n ? bits.join(' · ') : t('pdf.app.no_document');
    $('#statusZoom').textContent = A.mode === 'page' && n ? t('pdf.app.zoom_pct', { pct: String(Math.round(Ed.zoom * 72 / 96 * 100)) }) : '';
  }
  A.announce = function (msg) { S.els.live.textContent = ''; setTimeout(function () { S.els.live.textContent = msg; }, 30); A.status(msg); };

  S.onChange = function (info) {
    O.render();
    if (A.mode === 'page') {
      if (!Ed.page()) { var first = E.state.pages[0]; if (first) Ed.show(first.id); else A.showGrid(); }
      else Ed.layout();
    }
    if (!E.state.pages.length && A.mode === 'page') A.showGrid();
    PN.refresh(info && info.history ? 'history' : 'change');
    S.updateChrome();
    if (info && info.history && info.label) A.status(info.label);
    S.autosave();
  }
  S.refreshAll = function () { O.render(); PN.refresh(); S.updateChrome(); }

  /* --------------------------------------------------------- undo/redo */
  A.undo = function () { if (Ed.isEditingText()) { Ed.commitText(); } var l = E.undo(); if (l) A.announce(t('pdf.app.undid', { what: l })); return l; };
  A.redo = function () { var l = E.redo(); if (l) A.announce(t('pdf.app.redid', { what: l })); };

})();
