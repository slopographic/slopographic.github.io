/* Slop Hex: the URL sections (shared/router) and the view modes (shared/viewmode). Parameters: ?find=hex|text.
 * Classic script, runs once the page is parsed, after boot (js/main.js). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function init() {
    const sel = $('hx-mode');
    const R = SlopRoute.register('hex', {
      params: { find: { values: ['hex', 'text'], def: 'hex' } },
      apply(s) { if (sel && sel.value !== s.find) sel.value = s.find; },
    });
    if (sel) sel.addEventListener('change', () => R.set({ find: sel.value }));
    SlopViewMode.register('hex', {
      regions: { toolbar: ['.smb-bar', '.hx-bar'], panels: '#hx-info' },
      edges: { panels: 'top' },
      hides: { focus: ['toolbar'], content: ['toolbar', 'panels'] },
      mount: '.smb-bar',
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
