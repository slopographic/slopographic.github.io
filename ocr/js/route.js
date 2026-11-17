/* Slop OCR: the URL sections (shared/router) and the view modes (shared/viewmode). Parameters:
 *   ?page=<n>      the page shown, 1 for the first. Applied once, when the first pages arrive; written as the page changes.
 *   ?boxes=0|1     show the detected text boxes on the page picture (default 1).
 * The text itself is content and is never written to the URL. Classic script; loads after the app module. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function init() {
    const R = SlopRoute.register('ocr', {
      params: {
        page: { int: true, min: 1, max: 999, def: 1 },
        boxes: { values: ['0', '1'], def: '1' },
      },
      apply(s) {
        const boxes = $('boxes');
        if (boxes && boxes.checked !== (s.boxes === '1')) { boxes.checked = s.boxes === '1'; boxes.dispatchEvent(new Event('change')); }
      },
    });
    // The pages come with the first file. Show the page the link names once, then leave the app to pick pages.
    let wanted = R.get('page'), applied = false;
    new MutationObserver(() => {
      const sel = $('pages');
      if (applied || !sel || sel.options.length === 0) return;
      applied = true;
      const i = Math.min(Math.max(wanted, 1), sel.options.length) - 1;
      if (i > 0 && String(i) !== sel.value) { sel.value = String(i); sel.dispatchEvent(new Event('change')); }
    }).observe($('pages'), { childList: true });
    const note = () => setTimeout(() => { const v = parseInt($('pages').value, 10); if (Number.isFinite(v)) R.set({ page: v + 1 }); }, 0);
    $('pages').addEventListener('change', note);
    $('prev').addEventListener('click', note);
    $('next').addEventListener('click', note);
    $('boxes').addEventListener('change', () => R.set({ boxes: $('boxes').checked ? '1' : '0' }));
    SlopViewMode.register('ocr', {
      regions: { toolbar: '.smb-bar', panels: '.ocr-help' },
      edges: { panels: 'bottom' },
      hides: { focus: ['toolbar'], content: ['toolbar', 'panels'] },
      mount: '.smb-bar',
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
