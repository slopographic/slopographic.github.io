// Purchase orders list: search, status filter (late = ordered and past the expected date; to bill = no bill recorded yet),
// one row per order (SlopList, shared/ui/list.js), and a row menu with the steps its status allows.
(function (g) {
  'use strict';
  const NS = (g.SlopPurchases = g.SlopPurchases || {});
  const U = NS.util;
  const UI = g.SlopUI;
  const $ = (id) => document.getElementById(id);
  const CHIP = { ordered: '', received: 'good', cancelled: 'void' }; // SlopList chip classes per status
  let list = null, settings = null;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  async function draw() {
    if (!$('view-list') || $('view-list').hidden) return;
    settings = await U.settings();
    const r = await NS.purchases.list({ status: $('pStatus').value, search: $('pSearch').value });
    if (!r.ok) { $('pSummary').textContent = U.refusal(r); return; }
    list.set(r.value);
  }

  /** One order as a SlopList row: number and supplier, the total, its status (late first), dates and the bill. */
  function row(x) {
    const s = settings;
    return { title: `${x.number} · ${x.supplierName}`, amount: U.money(x.total, x.currency || s.currency, s.locale), cls: x.late ? 'is-overdue' : '',
      meta: [x.late ? { chip: t('purchases.li.late'), cls: 'bad' } : { chip: g.SlopBiz.statusText(x.status), cls: CHIP[x.status] || '' }, x.date,
        x.expectedDate && x.status === 'ordered' ? t('purchases.li.expected', { date: x.expectedDate }) : null, x.receivedAt ? t('purchases.li.received', { date: x.receivedAt }) : null,
        x.expenseId ? t('purchases.li.billed') : x.unbilled ? { chip: t('purchases.li.to_bill'), cls: 'warn' } : null] };
  }

  async function run(promise, okText) {
    const r = await promise;
    if (!r.ok) { UI.alert(t('purchases.ed.not_done'), U.refusal(r)); return; }
    UI.toast(okText);
    draw();
  }

  function menuFor(x) {
    const items = [{ label: t('purchases.li.open'), act: () => NS.app.go(`po/${x.id}`) }];
    if (x.status === 'draft') items.push({ label: t('purchases.ed.place'), act: () => run(NS.purchases.setStatus(x.id, 'ordered'), t('purchases.li.ordered', { number: x.number })) });
    if (x.status === 'ordered') items.push({ label: t('purchases.ed.receive'), act: async () => { if (await UI.confirm(t('purchases.ed.receive_q'), t('purchases.li.receive_body', { number: x.number }), t('purchases.ed.receive_ok'))) run(NS.purchases.receive(x.id), t('purchases.li.received_t', { number: x.number })); } });
    if (x.unbilled) items.push({ label: t('purchases.ed.record_bill'), act: () => NS.app.go(`po/${x.id}`) });
    if (x.expenseId) items.push({ label: t('purchases.li.open_bill'), act: () => { location.href = `../expenses/#e/${x.expenseId}`; } });
    if (x.status === 'draft' || x.status === 'ordered') items.push({ label: t('purchases.li.cancel'), act: () => run(NS.purchases.setStatus(x.id, 'cancelled'), t('purchases.li.cancelled', { number: x.number })) });
    return items;
  }

  function mount() {
    $('pSearch').addEventListener('input', draw);
    $('pStatus').addEventListener('change', draw);
    $('pNew').addEventListener('click', () => NS.app.go('new'));
    list = g.SlopList.mount($('pRows'), { label: 'purchases.li.label', count: 'purchases.li.count', summary: $('pSummary'),
      empty: 'purchases.li.empty', row, open: (x) => NS.app.go(`po/${x.id}`), menu: menuFor });
  }

  NS.listView = { mount, draw, menuFor };
  NS.views = NS.views || {};
  NS.views.list = { mount, refresh: draw, onShow: draw };
})(typeof window !== 'undefined' ? window : globalThis);
