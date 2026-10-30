/* SlopCut: the URL sections (shared/router) and the view modes (shared/viewmode). Parameter: ?pane=media|effects|insp|
 * timeline|preview, the pane in focus (the tabs above the timeline; on a phone it is the only pane shown). Applied on
 * load when the link names one, and written when the person picks a tab. Classic script; after the app modules. */
(function () {
  'use strict';
  const PANES = ['media', 'effects', 'insp', 'timeline', 'preview'];
  const app = () => window.SE && window.SE.app;

  function init() {
    const R = SlopRoute.register('slopcut', {
      ready: () => !!(window.SE && SE.app && SE.app.els && SE.app.els.mtabs && SE.app.els.mtabs.children.length),
      params: { pane: { values: PANES, def: 'media' } },
      apply(s) { if (R.has('pane') && app() && app().setPane) app().setPane(s.pane); },
    });
    const mtabs = document.getElementById('mtabs');
    if (mtabs) mtabs.addEventListener('click', (e) => {
      const b = e.target.closest('.mtab');
      if (b && b.dataset.pane) R.set({ pane: b.dataset.pane });
    });
    SlopViewMode.register('slopcut', {
      regions: { toolbar: '.topbar', sidebar: '#bin', panels: '#insp' },
      edges: { sidebar: 'left', panels: 'right' },
      mount: '.topbar',
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
