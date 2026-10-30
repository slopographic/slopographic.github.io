/* SlopVector: the URL sections (shared/router) and the view modes (shared/viewmode).
 * Parameters: ?tool=<tool id> (selected on load when the link names one), ?panel=<dock panel id> (shown on load:
 * properties, appearance, layers, swatches, gradient, align, pathfinder). Written as the person picks a tool or a panel.
 * Layout: the dock's open panels and tabs are already kept in slopvector.prefs, so no second copy is saved.
 * Classic script; loads after the tools and the dock are built. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PANELS = ['properties', 'appearance', 'layers', 'swatches', 'gradient', 'align', 'pathfinder'];

  function init() {
    const tools = window.SV && SV.TOOL_LIST ? SV.TOOL_LIST.map((t) => t.id) : [];
    const R = SlopRoute.register('vector', {
      ready: () => document.getElementById('app').classList.contains('ready') && !!(window.SV && SV.viewRestored),
      params: {
        tool: { values: tools, def: '' },
        panel: { values: PANELS, def: '' },
      },
      apply(s) {
        if (R.has('tool') && s.tool && window.SV && SV.setTool) SV.setTool(s.tool);
        if (R.has('panel') && s.panel && window.UI && UI.showPanel) UI.showPanel(s.panel);
      },
    });
    $('toolbar').addEventListener('click', (e) => { if (e.target.closest('.tool')) setTimeout(() => { if (SV.state && SV.state.tool) R.set({ tool: SV.state.tool }); }, 0); });
    $('dock').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) R.set({ panel: tab.dataset.tab });
    });
    SlopViewMode.register('vector', {
      regions: { toolbar: ['#menubar', '#controlbar'], sidebar: '#toolbar', panels: '#dock' },
      edges: { sidebar: 'left', panels: 'right' },
      mount: '#menubar',
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
