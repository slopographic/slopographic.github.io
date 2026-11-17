/* Slop Slides: the URL sections (shared/router) and the view modes (shared/viewmode). Parameter: ?slide=<n>, the slide
 * shown (1 for the first). Applied once, when the first deck is ready (after the saved place, so a link wins over it);
 * written as the slide changes. The slide's content is never in the URL. Classic script; after the app modules. */
(function () {
  'use strict';
  const A = () => window.SS && window.SS.app;

  function init() {
    const R = SlopRoute.register('slides', {
      ready: () => document.body.classList.contains('ready'),
      params: { slide: { int: true, min: 1, max: 999, def: 1 } },
    });
    let applied = false;
    const app = A();
    if (app && app.on) {
      app.on('deck', () => {
        if (applied || !app.deck) return;
        applied = true;
        if (R.has('slide')) { const i = R.get('slide') - 1; if (i !== app.idx && i < app.deck.slides.length) app.go(i); }
      });
      app.on('slide', () => { if (applied && app.idx !== undefined) R.set({ slide: app.idx + 1 }); });
    }
    SlopViewMode.register('slides', {
      regions: { toolbar: '.top', sidebar: '.slides-pane', panels: '#inspector' },
      edges: { sidebar: 'left', panels: 'right' },
      mount: '.top',
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
