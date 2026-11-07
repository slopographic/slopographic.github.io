// The Taxes tab: the tax rates the records use, with how many products carry each one. Rates are set per product in
// Slop Inventory, the product catalogue (not duplicated here); the default for new lines is in the company profile.
(function (g) {
  'use strict';
  const NS = (g.SlopAdmin = g.SlopAdmin || {});
  const el = g.SlopUI.el;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  async function render() {
    const s = await NS.util.settings();
    $('xDefault').textContent = t('admin.tx.default', { pct: NS.tax.pct(s.defaultTaxRate || 0) });
    const r = await NS.tax.inUse();
    if (!r.ok) { $('xRows').replaceChildren(el('tr', null, el('td', { colspan: 2, class: 'msg' }, NS.util.refusal(r)))); return; }
    $('xRows').replaceChildren(...r.value.map((x) => el('tr', null,
      el('td', { class: 'num' }, NS.tax.pct(x.rate)), el('td', { class: 'num' }, String(x.products)))));
    $('xEmpty').hidden = r.value.length > 0;
  }

  NS.views = NS.views || {};
  NS.views.taxes = { render };
})(typeof window !== 'undefined' ? window : globalThis);
