/* Slop Gallery — ui/drive-bar: the controls above the Drive grid. Kind chips (several can be on at once; each shows how many
 * files it holds, for the search as typed), the name search, the sort (date added or name) and a clear button.
 * Changes go to ui/drive-view.js through setQuery(). Exposes window.SlopGallery.driveBar.init() and .sync(counts, query, total, shown). */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  function init() {
    $('dchips').replaceChildren(...window.SlopKinds.CHIPS.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.chip = c.id;
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<span class="chip-l"></span> <span class="chip-n">0</span>';
      b.querySelector('.chip-l').textContent = c.label;
      return b;
    }));
    $('dchips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-chip]');
      if (!b) return;
      const on = new Set(G.driveView.query().chips);
      if (on.has(b.dataset.chip)) on.delete(b.dataset.chip); else on.add(b.dataset.chip);
      G.driveView.setQuery({ chips: [...on] });
    });
    $('dSearch').addEventListener('input', (e) => G.driveView.setQuery({ text: e.target.value }));
    $('dSort').addEventListener('change', (e) => G.driveView.setQuery({ sort: e.target.value }));
    $('dClear').addEventListener('click', () => {
      $('dSearch').value = '';
      G.driveView.setQuery({ text: '', chips: [], sort: 'added' });
    });
  }
  /** Shows the counts, the chips that are on, and "shown of total". */
  function sync(counts, query, total, shown) {
    for (const b of $('dchips').querySelectorAll('[data-chip]')) {
      b.setAttribute('aria-pressed', String(query.chips.includes(b.dataset.chip)));
      b.querySelector('.chip-n').textContent = String(counts[b.dataset.chip] || 0);
    }
    $('dCount').textContent = t('gallery.drive.shown', { shown, total });
    $('dSort').value = query.sort;
  }

  G.driveBar = { init, sync };
})();
