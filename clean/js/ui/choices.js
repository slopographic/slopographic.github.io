/* SlopClean: the "What to remove" panel. One checkbox per category, with how many were found across all pictures.
 * A change re-runs the cleaning (the controller passes onChange). Classic script; sets window.CL.choices. */
(function () {
  'use strict';
  const CL = (window.CL = window.CL || {});
  const el = (...a) => window.SlopUI.el(...a);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  CL.choices = {
    render(state, onChange) {
      const box = document.getElementById('cl-choices');
      const all = state.items.flatMap((it) => it.findings);
      const rows = window.SlopClean.CATS.map((c) => {
        const n = all.filter((f) => f.cat === c.id).length;
        const input = el('input', { type: 'checkbox', checked: !!state.remove[c.id] });
        input.addEventListener('change', () => { state.remove[c.id] = input.checked; onChange(); });
        return el('label', { class: 'cl-choice' + (n ? '' : ' is-none') }, input,
          el('span', null, CL.words ? CL.words.cat(c) : c.label), el('span', { class: 'cl-count' }, String(n)));
      });
      box.replaceChildren(   // the heading is the panel section's ("What to remove", app/layout.js)
        el('p', { class: 'cl-side-p' }, t('clean.panel.note')),
        el('div', { class: 'cl-choice-list' }, rows));
    },
  };
})();
