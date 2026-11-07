// Reports view: the stock value total (integer money, formatted only for display), the low-stock list (at or below
// each product's reorder level) and the value by product. Everything comes from one read of products and movements.
(function (g) {
  'use strict';
  const NS = (g.SlopInv = g.SlopInv || {});
  const U = NS.util;
  const { h } = U;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  async function refresh() {
    const r = await NS.rows.stockRows();
    if (!r.ok) { $('kValue').textContent = U.refusal(r); return; }
    const st = NS.state.settings || { currency: 'USD', locale: 'en-US' };
    const rows = r.value;
    const tot = NS.rows.totalsOf(rows);
    $('kValue').textContent = U.money(tot.value, st.currency, st.locale);
    $('kProducts').textContent = String(tot.products);
    $('kUnits').textContent = String(tot.units);
    $('kLow').textContent = String(tot.low);
    const low = rows.filter((x) => x.low).sort((a, b) => (a.onHand - a.reorderLevel) - (b.onHand - b.reorderLevel) || a.sku.localeCompare(b.sku));
    $('lowList').replaceChildren(...low.map((x) => h('li', { class: 'out' },
      h('span', { text: `${x.sku} ${x.name}` }),
      h('span', { class: 'sub', text: t('inventory.rp.reorder_at', { n: x.reorderLevel }) + (x.onOrder ? ' ' + t('inventory.rp.on_order', { n: x.onOrder }) : '') }),
      h('b', { class: 'num', text: `${x.onHand} ${x.unit}` }),
      h('a', { class: 'btn small', href: `../purchases/#reorder/${x.id}`, text: t('inventory.rp.reorder') }))));   // i18n-ignore: CSS class names
    $('lowEmpty').hidden = low.length > 0;
    const valued = rows.slice().sort((a, b) => b.value - a.value || a.sku.localeCompare(b.sku));
    $('valueList').replaceChildren(...(valued.length ? valued : []).map((x) => h('li', null,
      h('span', { text: `${x.sku} ${x.name}` }),
      h('span', { class: 'sub num', text: `${x.onHand} × ${U.money(x.price, st.currency, st.locale)}` }),   // i18n-ignore: CSS class names
      h('b', { class: 'num', text: U.money(x.value, st.currency, st.locale) }))));
    if (!valued.length) $('valueList').replaceChildren(h('li', { class: 'empty', text: t('inventory.rp.none') }));
  }

  NS.views = NS.views || {};
  NS.views.reports = { mount: () => {}, refresh, onShow: () => refresh() };
})(typeof window !== 'undefined' ? window : globalThis);
