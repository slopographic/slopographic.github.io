/* Slopculator Convert panel: a value, a category, and a from and to unit. The arithmetic is exact (exact.js) and the
 * units are the same table the expression language uses (units.js), so `1 km in m` and this panel agree.
 * Classic script, loaded after exact.js and units.js. Options are built with DOM methods, never innerHTML. */
(function () {
  'use strict';
  const C = window.SlopCalc;
  const $ = (id) => document.getElementById(id);
  const START = { category: 'length', from: 'km', to: 'm' };
  let cats = [];

  function fillSelect(select, items) {
    select.replaceChildren(...items.map((it) => {
      const o = document.createElement('option');
      o.value = it.key;
      o.textContent = it.label;
      return o;
    }));
  }

  /** Shows a category, with `from` and `to` picked when the category has them (else the first two units). */
  function showCategory(key, from, to) {
    const cat = cats.find((c) => c.key === key) || cats[0];
    $('sc-conv-cat').value = cat.key;
    const fromSel = $('sc-conv-from'), toSel = $('sc-conv-to');
    fillSelect(fromSel, cat.units);
    fillSelect(toSel, cat.units);
    fromSel.value = cat.units.some((u) => u.key === from) ? from : cat.units[0].key;
    toSel.value = cat.units.some((u) => u.key === to) ? to : cat.units[Math.min(1, cat.units.length - 1)].key;
    update();
  }

  /** Converts the typed value and writes the answer. A bad number says why, in place. */
  function update() {
    const out = $('sc-conv-out');
    const from = $('sc-conv-from'), to = $('sc-conv-to');
    const value = ($('sc-conv-value').value || '').trim() || '0';
    try {
      const r = C.exact.convert($('sc-conv-cat').value, from.value, to.value, value);
      const label = to.selectedOptions[0].textContent;
      out.textContent = `${r.exact ? '' : '≈ '}${r.text}${label.startsWith('°') ? '' : ' '}${label}`; // 212°F, as in the expression
      out.classList.remove('sc-error');
    } catch (e) {
      out.textContent = e.message;
      out.classList.add('sc-error');
    }
  }

  function swap() {
    const from = $('sc-conv-from'), to = $('sc-conv-to');
    const a = from.value;
    from.value = to.value;
    to.value = a;
    update();
  }

  function boot() {
    if (!$('sc-conv-form') || !C || !C.units || !C.exact) return;
    cats = C.units.categories();
    fillSelect($('sc-conv-cat'), cats);
    $('sc-conv-cat').addEventListener('change', () => showCategory($('sc-conv-cat').value));
    $('sc-conv-from').addEventListener('change', update);
    $('sc-conv-to').addEventListener('change', update);
    $('sc-conv-value').addEventListener('input', update);
    $('sc-conv-swap').addEventListener('click', swap);
    $('sc-conv-form').addEventListener('submit', (e) => { e.preventDefault(); update(); });
    showCategory(START.category, START.from, START.to);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
