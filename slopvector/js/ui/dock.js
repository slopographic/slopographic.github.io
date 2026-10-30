/* SlopVector — ui: panel dock and tab groups */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom, IO = SV.io, C = SV.cmd;
  var clone = SV.clone, getObj = SV.getObj, esc = SV.esc, fmt = G.fmt;
  var abs = Math.abs, min = Math.min, max = Math.max, round = Math.round, PI = Math.PI;
  var UI = SV.ui = SV.ui || {}; UI.st = UI.st || {};
  var IS_MAC = SV.IS_MAC;
  var $ = UI._p = UI._p || {};
  function buildAlign() { return $.buildAlign.apply(this, arguments); }
  function buildAppearance() { return $.buildAppearance.apply(this, arguments); }
  function buildGradient() { return $.buildGradient.apply(this, arguments); }
  function buildLayers() { return $.buildLayers.apply(this, arguments); }
  function buildPathfinder() { return $.buildPathfinder.apply(this, arguments); }
  function buildProperties() { return $.buildProperties.apply(this, arguments); }
  function buildSwatches() { return $.buildSwatches.apply(this, arguments); }
  function h() { return $.h.apply(this, arguments); }
  function savePrefs() { return $.savePrefs.apply(this, arguments); }
  function swatches() { return $.swatches.apply(this, arguments); }
  var PANEL_NAMES = $.PANEL_NAMES;

  /* ================= dock & panels ================= */
  UI.st.activeTabs = { a: 'properties', c: 'swatches' }; UI.st.collapsed = {};
  var GROUPS = [{ id: 'a', panels: ['properties', 'appearance'] }, { id: 'b', panels: ['layers'] }, { id: 'c', panels: ['swatches', 'gradient', 'align', 'pathfinder'] }];
  var panelEls = {};
  function groupOf(p) { return GROUPS.filter(function (g) { return g.panels.indexOf(p) >= 0; })[0]; }
  function isPanelVisible(p) { var g = groupOf(p); return S.prefs.panels && !UI.st.collapsed[g.id] && (g.panels.length === 1 || UI.st.activeTabs[g.id] === p); }
  function showPanel(p) {
    var g = groupOf(p); S.prefs.panels = true; UI.st.collapsed[g.id] = false;
    if (g.panels.length > 1) UI.st.activeTabs[g.id] = p;
    savePrefs(); applyDock();
    if (UI.dockSheet && UI.dockSheet.isPhone()) UI.dockSheet.open();
  }
  UI.showPanel = showPanel;
  function togglePanels() {
    if (UI.dockSheet && UI.dockSheet.isPhone()) { UI.dockSheet.toggle(); return; }   // a phone: the panels drawer
    S.prefs.panels = !S.prefs.panels; savePrefs(); applyDock();
    setTimeout(function () { SV.requestRender(true); }, 0);
  }
  UI.togglePanels = togglePanels;
  /** Collapse or expand a dock group (its tab bar stays). */
  UI.setGroupCollapsed = function (gid, on) { UI.st.collapsed[gid] = on; savePrefs(); applyDock(); };
  function applyDock() {
    var app = document.getElementById('app');
    app.classList.toggle('no-dock', !S.prefs.panels);
    GROUPS.forEach(function (g) {
      var ge = document.getElementById('dg-' + g.id);
      ge.classList.toggle('collapsed', !!UI.st.collapsed[g.id]);
      g.panels.forEach(function (p) {
        var on = g.panels.length === 1 || UI.st.activeTabs[g.id] === p;
        panelEls[p].body.hidden = !on;
        var tab = ge.querySelector('[data-tab="' + p + '"]');
        if (tab) { tab.classList.toggle('on', on); tab.setAttribute('aria-selected', on ? 'true' : 'false'); }
      });
    });
    SV.requestRender(true);
  }
  function buildDock() {
    var dock = document.getElementById('dock');
    // Phones: the dock is a drawer from the right. SlopSheet (shared/ui/sheet.js) does the Panels button, the ×, Escape, a
    // tap outside and the swipe.
    UI.dockSheet = SlopSheet.attach({ root: document.getElementById('app'), panel: dock, side: 'end', phone: '(max-width: 899px)', toggles: [document.getElementById('panelsToggle')], label: SV.t('vector.dock.panels') });
    GROUPS.forEach(function (g) {
      var ge = h('section', { class: 'dock-group dg-' + g.id, id: 'dg-' + g.id });
      var tabs = h('div', { class: 'dock-tabs', role: 'tablist' });
      g.panels.forEach(function (p) {
        var t = h('button', { type: 'button', class: 'dock-tab', role: 'tab', 'data-tab': p, i18n: { text: PANEL_NAMES[p] } });
        t.addEventListener('click', function () { UI.st.activeTabs[g.id] = p; UI.st.collapsed[g.id] = false; savePrefs(); applyDock(); });
        t.addEventListener('dblclick', function () { UI.setGroupCollapsed(g.id, true); });
        tabs.appendChild(t);
      });
      tabs.appendChild(h('span', { class: 'grow' }));
      tabs.appendChild(h('button', { type: 'button', class: 'dock-collapse', i18n: { title: 'vector.dock.collapse', 'aria-label': 'vector.dock.collapse_group' }, html: '<svg viewBox="0 0 12 12"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>', onclick: function () { UI.setGroupCollapsed(g.id, !UI.st.collapsed[g.id]); } }));
      ge.appendChild(tabs);
      g.panels.forEach(function (p) {
        var body = h('div', { class: 'panel-body panel-' + p, role: 'tabpanel', i18n: { 'aria-label': PANEL_NAMES[p] } });
        panelEls[p] = { body: body };
        ge.appendChild(body);
      });
      dock.appendChild(ge);
    });
    buildProperties(); buildAppearance(); buildLayers(); buildSwatches(); buildGradient(); buildAlign(); buildPathfinder();
    // The suite rule (shared/frame/HANDOFF.md): the main button, Export ▾ (the File ▸ Export commands), sits at the foot of
    // the dock (the shared footer, shared/frame/panel.js).
    if (window.SlopFramePanel) {
      var EXPORTS = ['file.exportSVG', 'file.exportPNG', 'file.exportJPG', 'file.exportPDF', 'file.exportAI', 'file.exportBuffer'];
      var frame = SlopFramePanel.create(dock, { bare: true });
      SV.live(function () {   // footer() redraws only the footer, in the current language
        frame.footer([{ id: 'dockExport', label: SV.t('menu.export'), primary: true, title: SV.t('vector.dock.export_tip'),
          menu: function () { return EXPORTS.map(function (id) { var a = SV.actions[id]; return a && { label: a.label, act: function () { a.run(); } }; }).filter(Boolean); } }],
        { more: SV.t('vector.dock.panels'), onMore: function () { UI.dockSheet.toggle(); } });
      });
    }
    applyDock();
  }

  $.applyDock = applyDock; $.buildDock = buildDock; $.isPanelVisible = isPanelVisible; $.panelEls = panelEls; $.showPanel = showPanel; $.togglePanels = togglePanels;
})();
