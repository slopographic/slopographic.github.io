// Products view: search, sort, low-stock filter, the product rows, and the row menu (edit, show movements, reorder in Slop
// Purchases, delete).
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInv = g.SlopInv || {});
  const U = NS.util;
  const UI = g.SlopUI;
  const $ = (id) => document.getElementById(id);
  let rows = [];
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  const COMPARE = {
    name: (a, b) => a.name.localeCompare(b.name),
    sku: (a, b) => a.sku.localeCompare(b.sku),
  };

  /** A list row shows the product name and the part number (SKU), and how many are on order. Price, tax, stock and EAN are in
   *  the form and reports. */
  function rowEl(r) {
    return U.h('div', { class: 'row' + (r.low ? ' is-low' : ''), role: 'row', tabindex: 0, dataset: { id: r.id } },
      U.h('span', { role: 'cell', class: 'c-name' }, U.h('b', { class: 'mono', text: r.sku }), U.h('span', { class: 'sub', text: r.name }),
        r.onOrder ? U.h('span', { class: 'chip ordered', text: t('inventory.pr.on_order', { n: r.onOrder }) }) : null));   // i18n-ignore: CSS class names
  }

  /** Redraws the rows from the last read, applying the search, filter and sort. */
  function draw() {
    const st = NS.state.settings || { currency: 'USD', locale: 'en-US' };
    const q = $('pSearch').value.trim().toLowerCase();
    const filter = $('pFilter').value;
    const list = rows
      .filter((r) => (!q || [r.sku, r.ean, r.name].some((x) => String(x).toLowerCase().includes(q))))
      .filter((r) => filter !== 'low' || r.low)
      .sort(COMPARE[$('pSort').value] || COMPARE.name);
    $('pRows').replaceChildren(...list.map((r) => rowEl(r)));
    $('pEmpty').hidden = list.length > 0;
    const tot = NS.rows.totalsOf(rows);
    $('pSummary').textContent = t('inventory.pr.summary', { products: t('inventory.pr.products', { n: tot.products }), low: tot.low, value: U.money(tot.value, st.currency, st.locale), shown: list.length });
  }

  async function refresh() {
    const r = await NS.rows.stockRows();
    if (!r.ok) { $('pSummary').textContent = U.refusal(r); return; }
    rows = r.value;
    draw();
  }

  async function openEdit(id) {
    const r = await S.store.get('products', id);
    if (!r.ok || !r.value) { if (UI) UI.toast(r.ok ? t('inventory.pr.gone') : U.refusal(r)); return; }
    NS.productForm.open({ product: r.value, onSaved: () => NS.app.refresh() });
  }

  async function remove(id) {
    const r = await S.store.get('products', id);
    if (!r.ok || !r.value) return;
    const name = r.value.name;
    const yes = await UI.confirm(t('inventory.pr.del_q'), t('inventory.pr.del_body', { name }), t('inventory.pr.delete'), { danger: true });
    if (!yes) return;
    const d = await NS.products.remove(id);
    if (!d.ok) { UI.alert(t('inventory.pr.not_deleted'), t('inventory.pr.cannot', { name, why: d.message })); return; }
    UI.toast(t('inventory.pr.deleted', { name }));
    NS.app.refresh();
  }

  function mount() {
    NS.productForm.open({ show: false });   // the panel on the right starts as a new product
    $('pSearch').addEventListener('input', draw);
    $('pSort').addEventListener('change', draw);
    $('pFilter').addEventListener('change', draw);
    $('pAdd').addEventListener('click', () => NS.productForm.open({ onSaved: () => NS.app.refresh() }));
    const box = $('pRows');
    box.addEventListener('click', (e) => { const row = e.target.closest('[data-id]'); if (row) openEdit(row.dataset.id); });
    box.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const row = e.target.closest('[data-id]');
      if (row) openEdit(row.dataset.id);
    });
    if (g.SlopCtx) {
      SlopCtx.bind(box, (target) => {
        const row = target && target.closest ? target.closest('[data-id]') : null;
        if (!row) return null;
        const id = row.dataset.id;
        return [
          { label: t('inventory.pr.edit'), act: () => openEdit(id) },
          { label: t('inventory.pr.moves'), act: () => NS.app.show('stock', id) },
          { label: t('inventory.pr.reorder'), act: () => { location.href = `../purchases/#reorder/${id}`; } },
          '-',
          { label: t('inventory.pr.del_q'), act: () => remove(id) },
        ];
      });
    }
  }

  NS.views = NS.views || {};
  NS.views.products = { mount, refresh, draw, openEdit, remove, onShow: () => refresh() };
})(typeof window !== 'undefined' ? window : globalThis);
