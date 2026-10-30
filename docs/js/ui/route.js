/* Slop Docs: the URL sections (shared/router) and the view modes (shared/viewmode). Parameter: ?outline=open|shut, whether
 * the outline (the document tree on the left) is shown. The outline keeps its own state for the session (outline.js),
 * so the link sets it only when it names one; the show and hide buttons write the choice back. Classic script; loads
 * after the outline module. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const shut = () => $('app').classList.contains('ol-shut');

  function init() {
    const R = SlopRoute.register('docs', {
      ready: () => !!(window.SlopDocs && window.SlopDocs.ready),
      params: { outline: { values: ['open', 'shut'], def: 'open' } },
      apply(s) {
        if (R.has('outline') && (s.outline === 'shut') !== shut()) {
          const b = $('outline').querySelector(s.outline === 'shut' ? '.ol-hide' : '.ol-show');
          if (b) b.click();
        }
      },
    });
    $('outline').addEventListener('click', (e) => {
      if (e.target.closest('.ol-show, .ol-hide')) setTimeout(() => R.set({ outline: shut() ? 'shut' : 'open' }), 0);
    });
    SlopViewMode.register('docs', {
      regions: { toolbar: ['.topbar', '#toolbar'], sidebar: '#outline' },
      edges: { sidebar: 'left' },
      mount: '.topbar',
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
