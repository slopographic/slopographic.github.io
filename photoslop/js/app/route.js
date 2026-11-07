/* PhotoSlop: the URL sections (shared/router) and the view modes (shared/viewmode).
 * Parameters: ?tool=<tool id> (the tool to select on load, only when the link names one), ?panel=<panel id> (the docked
 * panel to expand on load, e.g. history). Written as the person picks a tool or expands a panel.
 * Layout: each panel's open state is already kept per panel (store 'collapsed.<id>'), so no separate layout is saved.
 * Classic script; loads after the tools and the panels are built. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const toolIds = () => (typeof TOOLS !== 'undefined' ? TOOLS.map((t) => t.id) : []);

  function init() {
    const tools = toolIds();
    const R = SlopRoute.register('photoslop', {
      ready: () => document.body.classList.contains('ready'),
      params: {
        tool: { values: tools, def: '' },
        panel: { pattern: /^[a-z-]{1,24}$/, def: '' },
      },
      apply(s) {
        if (R.has('tool') && s.tool && typeof selectTool === 'function') selectTool(s.tool);
        const p = s.panel && $('panel-' + s.panel);
        if (R.has('panel') && p && p.classList.contains('collapsed') && typeof setPanelCollapsed === 'function') setPanelCollapsed(p, false);
      },
    });
    // The tool and the panel the person picks are written; a replace, so back and forward are not filled with them.
    $('toolbox').addEventListener('click', (e) => { if (e.target.closest('.tool')) setTimeout(() => { if (typeof UI !== 'undefined' && UI.tool) R.set({ tool: UI.tool }); }, 0); });
    $('panels').addEventListener('click', (e) => {
      if (!e.target.closest('.panel-head')) return;
      setTimeout(() => {
        const p = e.target.closest('.panel');
        if (p && !p.classList.contains('collapsed')) R.set({ panel: p.id.replace(/^panel-/, '') });
      }, 0);
    });
    SlopViewMode.register('photoslop', {
      regions: { toolbar: '.topbar', sidebar: '#toolbox', panels: '#panels' },
      edges: { sidebar: 'left', panels: 'right' },
      mount: '.topbar',
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
