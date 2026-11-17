/* Slop EML: the URL sections (shared/router) and the view modes (shared/viewmode). Parameter: ?view=html|text, the body
 * view of the message on screen. The view is applied each time a message appears, so a link or a reload keeps the
 * view the person chose last. Classic script, after js/main.js. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function init() {
    const R = SlopRoute.register('eml', {
      ready: () => document.body.classList.contains('ready'),
      params: { view: { values: ['html', 'text'], def: 'html' } },
    });
    const pressed = (id) => $(id).getAttribute('aria-pressed') === 'true';
    // A message opened: show the view the URL names (EmlApp falls back when a part is missing).
    new MutationObserver(() => {
      const want = R.get('view');
      if (!$('em-msg').hidden && window.EmlApp && pressed(want === 'text' ? 'em-v-html' : 'em-v-text')) window.EmlApp.setView(want);
    }).observe($('em-msg'), { attributes: true, attributeFilter: ['hidden'] });
    $('em-v-html').addEventListener('click', () => R.set({ view: 'html' }));
    $('em-v-text').addEventListener('click', () => R.set({ view: 'text' }));
    SlopViewMode.register('eml', {
      regions: { toolbar: '.smb-bar' },
      mount: '.smb-bar',
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
