/* Slop Press: the URL sections (shared/router) and the view modes (shared/viewmode). Parameters:
 *   ?tool=<tool id>      the tool selected on load (select, text, frame, rect, ellipse, ...), when the link names one.
 *   ?panel=<panel id>    the dock panel shown on load: pages, layers, props, swatches, parastyles, charstyles.
 * Both are written as the person picks a tool or a dock tab. Classic script; after the app modules. */
(function () {
  'use strict';
  const PANELS = ['pages', 'layers', 'props', 'swatches', 'parastyles', 'charstyles'];
  const PR = () => window.PR;

  function init() {
    const R = SlopRoute.register('press', {
      ready: () => document.getElementById('app').classList.contains('ready'),
      params: {
        tool: { pattern: /^[a-z]{1,20}$/, def: '' },
        panel: { values: PANELS, def: '' },
      },
      apply(s) {
        const pr = PR();
        if (!pr) return;
        const known = s.tool && document.querySelector('#toolbar .tool[data-tool="' + s.tool + '"]');
        if (R.has('tool') && known && pr.actions) pr.actions.run('tool.' + s.tool);
        if (R.has('panel') && s.panel && pr.ui && pr.ui.showPanel) pr.ui.showPanel(s.panel);
      },
    });
    document.getElementById('toolbar').addEventListener('click', (e) => {
      const b = e.target.closest('.tool');
      if (b) setTimeout(() => { const pr = PR(); if (pr && pr.state && pr.state.tool) R.set({ tool: pr.state.tool }); }, 0);
    });
    document.getElementById('dock').addEventListener('click', (e) => {
      const t = e.target.closest('.dtab');
      if (t) R.set({ panel: t.getAttribute('data-panel') });
    });
    SlopViewMode.register('press', {
      regions: { toolbar: ['#menubar', '#controlbar'], sidebar: '#toolbar', panels: '#dock' },
      edges: { sidebar: 'left', panels: 'right' },
      mount: '#menubar',
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
