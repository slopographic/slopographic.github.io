/* SlopVector — ui: app boot */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom, IO = SV.io, C = SV.cmd;
  var clone = SV.clone, getObj = SV.getObj, esc = SV.esc, fmt = G.fmt;
  var abs = Math.abs, min = Math.min, max = Math.max, round = Math.round, PI = Math.PI;
  var UI = SV.ui = SV.ui || {}; UI.st = UI.st || {};
  var IS_MAC = SV.IS_MAC;
  var $ = UI._p = UI._p || {};
  function applyRulers() { return $.applyRulers.apply(this, arguments); }
  function bindContextMenus() { return $.bindContextMenus.apply(this, arguments); }
  function bindRulers() { return $.bindRulers.apply(this, arguments); }
  function buildDock() { return $.buildDock.apply(this, arguments); }
  function buildMenubar() { return $.buildMenubar.apply(this, arguments); }
  function buildStatus() { return $.buildStatus.apply(this, arguments); }
  function buildToolbar() { return $.buildToolbar.apply(this, arguments); }
  function loadPrefs() { return $.loadPrefs.apply(this, arguments); }
  function setTheme() { return $.setTheme.apply(this, arguments); }
  function togglePanels() { return $.togglePanels.apply(this, arguments); }

  /* ================= init ================= */
  function init() {
    D.stage = document.getElementById('stage');
    D.docsvg = document.getElementById('docsvg');
    D.overlay = document.getElementById('overlay');
    D.vpBack = document.getElementById('vpBack');
    D.vpArt = document.getElementById('vpArt');
    D.artboard = document.getElementById('artboard');
    D.artShadow = document.getElementById('artShadow');
    D.grid = document.getElementById('grid');
    D.textEditor = document.getElementById('textEditor');
    // The saved theme, else the one shared/theme/theme.js already painted (it follows the system), else Pro.
    var ok = function (t) { return t === 'light' || t === 'classic' || t === 'pro'; };
    var th = SV.lsGet('slopvector.theme'), shown = document.documentElement.getAttribute('data-theme');
    UI.st.currentTheme = ok(th) ? th : ok(shown) ? shown : 'pro';
    document.documentElement.setAttribute('data-theme', UI.st.currentTheme);
    loadPrefs();
    buildMenubar(); buildToolbar(); buildDock(); buildStatus(); bindRulers(); applyRulers();
    document.getElementById('panelsToggle').addEventListener('click', function () { if (!UI.dockSheet.isPhone()) togglePanels(); });   // on a phone it is the drawer's toggle
    document.addEventListener('click', function (e) { var b = e.target && e.target.closest ? e.target.closest('button') : null; if (b && e.detail > 0 && !b.closest('.sui-dlg')) setTimeout(function () { if (document.activeElement === b) b.blur(); }, 0); }, true);
    D.textEditor.addEventListener('input', SV.onEditorInput);
    SV.bindStage(); SV.bindKeys(); SV.wireCommands(); SV.intake.bindDrop(); SV.buffer.bindDrop(); if (window.SlopBuffer) SlopBuffer.tray(document.body); bindContextMenus();
    var saved = SV.loadAutosave(), recovered = false;
    if (saved) { try { SV.loadDoc(saved.doc, { fit: true }); S.fileName = saved.fileName || null; recovered = true; } catch (e) { recovered = false; } }
    if (!recovered) SV.loadDoc(SV.sampleDoc(), { fit: true });
    SV.resetHistory();
    SV.restoreView(recovered);
    SV.hub.init();
    if (recovered && !/[?&]drive=/.test(location.search)) { S.savedIdx = -1; setTimeout(function () { UI.toast(SV.t('vector.msg.recovered', { name: S.doc.name })); }, 300); }
    setTheme(UI.st.currentTheme);
    SV.updateCursor();
    SV.fitArtboard();
    SV.renderNow();
    window.addEventListener('resize', function () { SV.requestRender(true); });
    if (window.ResizeObserver) new ResizeObserver(function () { SV.requestRender(); }).observe(D.stage);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { SV.clearTextCache(); SV.requestRender(true); });
    window.addEventListener('beforeunload', function (e) { if (SV.isDirty()) { SV.autosaveNow(); e.preventDefault(); e.returnValue = ''; return ''; } });
    document.getElementById('app').classList.add('ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
