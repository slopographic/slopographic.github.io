/* Slop PDF — ui/view-state: coming back to Slop PDF brings back the session you left, and the view it was in: the tool,
 * the page open in the editor, the zoom, the panel and where the page list or page is scrolled. With autosave on
 * (Menu > Autosave session in this browser) the files come back by themselves, so the Restore button is not needed.
 * The view lives in SlopSession; the session itself stays in IndexedDB (io/session.js). Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, A = SP.app, S = A._;
  var APP = 'pdf', ready = false; // nothing is saved until the saved view is applied, so boot cannot overwrite it

  function viewNow() {
    var grid = S.els.grid, viewer = S.els.viewer;
    return {
      tool: A.tool, mode: A.mode, pid: Ed.pid || null, zoomMode: Ed.zoomMode, zoom: Ed.zoom, layout: Ed.layoutMode || null,
      noPanel: S.els.app.classList.contains('no-panel'),
      scroll: { grid: grid ? grid.scrollTop : 0, viewer: viewer ? viewer.scrollTop : 0, viewerLeft: viewer ? viewer.scrollLeft : 0 },
      split: SP.panes ? SP.panes.snapshot() : null,
    };
  }
  var auto = window.SlopSession.autosave(APP, 'view', viewNow, { delay: 300 });
  var touch = function () { if (ready) auto.touch(); };
  // Window capture, registered before the navigation engine attaches (in boot): the engine stops the wheel, Space-pan and
  // pinch events it takes, so a listener further down would never see them.
  ['pointerup', 'click', 'keyup'].forEach(function (t) { window.addEventListener(t, touch, true); });
  window.addEventListener('wheel', touch, { capture: true, passive: true });

  /** Boot: once the stored tabs are open (ui/doc-tabs.js), the view the page was left in is applied to the tab on screen.
   * A Slop Drive launch (?drive=<id>) opens its own file in a new tab, so the saved view is not put back over it. */
  A.restoreView = async function () {
    var launching = /[?&]drive=/.test(location.search);
    await (A.tabsReady || Promise.resolve()).catch(function () {}); // the page is ready once the stored tabs are open
    var v = await window.SlopSession.load(APP, 'view', null).catch(function () { return null; });
    if (v && typeof v === 'object' && E.state.pages.length && !launching) A.applyView(v);   // route.js puts a link's ?tool= over it
    if (v && typeof v === 'object' && v.split && !launching && SP.panes) SP.panes.restore(v.split);
    ready = true;
    document.documentElement.classList.add('ready');
  };
  A.viewNow = viewNow;
  A.applyView = function (v) { applyView(v); };

  function applyView(v) {
    var Es = SP.editor._;
    // while the saved view is applied, no eased zoom may land on top of it and scroll-follow must not change the page
    if (Es.stopEase) Es.stopEase();
    Es.restoring = true;
    if (v.noPanel && window.innerWidth > 900) A.togglePanel(false);
    if (v.tool && typeof v.tool === 'string') A.setTool(v.tool);
    if (v.mode === 'page' && v.pid && E.pageById(v.pid)) {
      A.openPage(v.pid, true);
      if (v.zoomMode === 'num' && v.zoom > 0) { Ed.zoomMode = 'num'; Ed.zoom = v.zoom; Ed.layout(); }
    }
    if (v.layout && Ed.setLayout && v.layout !== Ed.layoutMode) Ed.setLayout(v.layout);
    var sc = v.scroll || {};
    if (S.els.grid && sc.grid) S.els.grid.scrollTop = sc.grid;
    if (S.els.viewer) { if (sc.viewer) S.els.viewer.scrollTop = sc.viewer; if (sc.viewerLeft) S.els.viewer.scrollLeft = sc.viewerLeft; }
    if (Es.stopEase) Es.stopEase();
    // scroll events arrive a frame or two later: the restore ends after them
    requestAnimationFrame(function () { requestAnimationFrame(function () { Es.restoring = false; }); });
  }
})();
