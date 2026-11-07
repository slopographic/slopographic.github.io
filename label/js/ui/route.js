/* SlopLabel: the URL sections (shared/router) and the view modes (shared/viewmode). Parameter: ?panel=props|objects|vars|data,
 * the dock tab to open on load (only when the link names one). The print form link keeps its #form=... hash: that hash
 * is the whole form, not a section, so the router leaves it alone. Classic script; after js/ui/app.js. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const TABS = ['props', 'objects', 'vars', 'data'];

  function init() {
    const R = SlopRoute.register('label', {
      ready: () => document.body.classList.contains('ready'),
      params: { panel: { values: TABS, def: '' } },
      apply(s) { if (R.has('panel') && s.panel && typeof showDock === 'function') showDock(s.panel); },
    });
    // A dock tab picked by the person is written to the URL (a replace, not a new history entry).
    $('dockTabs').addEventListener('click', () => setTimeout(() => {
      if (window.App && TABS.includes(App.tab)) R.set({ panel: App.tab });
    }, 0));
    SlopViewMode.register('label', {
      regions: { toolbar: ['#menubar', '#ctrlbar'], sidebar: '#toolbox', panels: '#dock' },
      edges: { sidebar: 'left', panels: 'right' },
      mount: '#ctrlbar',   // the control bar has room at a phone width; the menu bar is full there
      layout: {
        get: () => ({ dock: !!(window.App && App.sheet && App.sheet.isOpen()) }),
        set: (o) => { if (o.dock && typeof showDock === 'function') showDock(window.App && App.tab || 'props'); },
      },
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
