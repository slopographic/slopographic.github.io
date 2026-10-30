/* Slopculator: the URL sections (shared/router) and the view modes (shared/viewmode).
 * Parameters: ?expr=<calculation> (read on load, as before; never written, since typed text is not URL state),
 * ?panel=tape|history|convert (brings that panel into view on load). Classic script, after js/app.js. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PANEL_HEAD = { tape: 'sc-tape-h', history: 'sc-hist-h', convert: 'sc-conv-h' };

  function init() {
    SlopRoute.register('calc', {
      params: {
        expr: { def: '', max: 200 },
        panel: { values: ['tape', 'history', 'convert'], def: '' },
      },
      apply(s) {
        const input = $('sc-expr');
        if (s.expr && input) { input.value = s.expr; input.dispatchEvent(new Event('input')); }
        const head = PANEL_HEAD[s.panel] && $(PANEL_HEAD[s.panel]);
        // 'start': the panel itself comes into view, not only its heading at the bottom edge ('nearest' left the heading
        // a fraction of a pixel below a phone's screen, so it could count as out of view)
        if (head) head.scrollIntoView({ block: 'start' });
      },
    });
    SlopViewMode.register('calc', {
      regions: { toolbar: '.smb-bar', sidebar: '.sc-side' },
      edges: { sidebar: 'right' },
      mount: '.smb-bar',
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
