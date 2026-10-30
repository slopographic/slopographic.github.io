/* Slop Tables: the URL sections (shared/router) and the view modes (shared/viewmode).
 * Parameter: ?side=open|collapsed, the sidebar (Sheets, Templates, Functions). The sidebar keeps its own saved state
 * (sidebar.js), so the link sets it only when it names one, and the toggle writes the choice back. Classic script; loads
 * after the module that builds the sidebar. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const collapsed = () => $('side').classList.contains('collapsed');

  function init() {
    const R = SlopRoute.register('tables', {
      ready: () => !!(window.SlopTables && window.SlopTables.ready),
      params: { side: { values: ['open', 'collapsed'], def: 'open' } },
      apply(s) { if (R.has('side') && (s.side === 'collapsed') !== collapsed()) $('sideToggle').click(); },
    });
    $('sideToggle').addEventListener('click', () => setTimeout(() => R.set({ side: collapsed() ? 'collapsed' : 'open' }), 0));
    SlopViewMode.register('tables', {
      regions: { toolbar: ['.topbar', '.fbar'], sidebar: '#side' },
      edges: { sidebar: 'left' },
      mount: '.topbar',
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
