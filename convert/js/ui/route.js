/* Slop Convert: the URL sections (shared/router) and the view modes (shared/viewmode). Parameter: ?to=<format>, the
 * format the converter starts on (for example ?to=pdf-to-docx): the default target of every file that can take it (each
 * file has its own target, so a mix keeps the others' defaults); written when the person sets a format for every file or the selected ones (the bulk bar).
 * The files are never in the URL.
 * Classic script; loads after the converter module. */
(function () {
  'use strict';

  function init() {
    const R = SlopRoute.register('convert', {
      params: { to: { pattern: /^[a-z0-9-]{1,24}$/, def: '' } },
    });
    // The link's format is the default target (ConvertTool.setDefaultTarget): every file that can take it starts on it,
    // files added later too, and the others keep their own default. A format the person picks wins.
    const want = R.get('to');
    if (want) {
      const give = () => { const root = document.querySelector('[data-convert-root]'), t = root && root.convertTool; if (t) t.setDefaultTarget(want); return !!t; };
      if (!give()) { const obs = new MutationObserver(() => { if (give()) obs.disconnect(); }); obs.observe(document.body, { childList: true, subtree: true }); }
    }
    // the converter says when a format is set for every file or the selected ones (ConvertTool bulkPick: 'cv:target')
    document.addEventListener('cv:target', (e) => { if (e.detail && e.detail.id) R.set({ to: e.detail.id }); });
    SlopViewMode.register('convert', {
      regions: { toolbar: '.cv-top', panels: ['.cv-explain', '.cv-card'] },
      edges: { panels: 'bottom' },
      hides: { focus: ['toolbar'], content: ['toolbar', 'panels'] },
      mount: '.cv-top',
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
