// Orders list: search, status filter, one row per order (SlopList, shared/ui/list.js: click or Enter opens it, the arrows
// move, right-click or the Menu key opens its menu). Every action is a SlopOrders action (core/actions.js, core/fulfil.js),
// so the list and the editor agree.
(function (g) {
  'use strict';
  const NS = (g.SlopOrders = g.SlopOrders || {});
  const U = NS.util;
  const M = g.SlopDocs.model;
  const UI = g.SlopUI;
  const $ = (id) => document.getElementById(id);
  const CHIP = { open: '', fulfilled: 'good', cancelled: 'void' }; // SlopList chip classes per status
  let list = null, settings = null;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  async function draw() {
    if (!$('view-list') || $('view-list').hidden) return;
    settings = await U.settings();
    const r = await NS.orders.list({ status: $('oStatus').value, search: $('oSearch').value });
    if (!r.ok) { $('oSummary').textContent = U.refusal(r); return; }
    list.set(r.value);
  }

  /** One order as a SlopList row: number and customer, the total, and its status, date, lines and links. */
  function row(x) {
    const lines = x.lines.length, s = settings;
    return { title: `${x.number} · ${x.customerName}`, amount: U.money(x.total, x.currency || s.currency, s.locale),
      meta: [{ chip: g.SlopBiz.statusText(x.status), cls: CHIP[x.status] || '' }, x.date, t('orders.li.lines', { n: lines }),
        x.invoiceId ? t('orders.li.invoiced') : null, x.sample ? { chip: t('orders.li.sample'), cls: 'warn' } : null] };
  }

  /** Runs a Result-returning action from the menu: a plain message on refusal, then redraws. */
  async function run(promise, okText) {
    const r = await promise;
    if (!r.ok) { UI.alert(t('orders.li.not_done'), U.refusal(r)); return; }
    if (okText) UI.toast(okText);
    draw();
  }

  async function fulfil(x) {
    const yes = await UI.confirm(t('orders.ed.fulfil_q'), t('orders.ed.fulfil_body', { number: x.number }), t('orders.ed.fulfil_ok'));
    if (yes) run(NS.actions.fulfilId(x.id), t('orders.li.fulfilled', { number: x.number }));
  }

  async function cancel(x) {
    const yes = await UI.confirm(t('orders.ed.cancel'), t('orders.ed.cancel_body', { number: x.number }), t('orders.ed.cancel'), { danger: true });
    if (yes) run(NS.actions.cancelId(x.id), t('orders.li.cancelled', { number: x.number }));
  }

  function menuFor(x) {
    const items = [{ label: t('orders.li.open'), act: () => NS.app.go(`o/${x.id}`) }];
    if (x.status === 'draft') items.push({ label: t('orders.ed.confirm'), act: () => run(NS.actions.confirmId(x.id), t('orders.li.confirmed', { number: x.number })) });
    if (x.status === 'open') items.push({ label: t('orders.ed.fulfil'), act: () => fulfil(x) });
    if (x.status === 'draft' || x.status === 'open') items.push({ label: t('orders.li.cancel'), act: () => cancel(x) });
    if ((x.status === 'open' || x.status === 'fulfilled') && !x.invoiceId) {
      items.push({ label: t('orders.ed.convert'), act: () => run(NS.actions.convertId(x.id), t('orders.li.inv_created')) });
    }
    if (x.status === 'open' || x.status === 'fulfilled') items.push({ label: t('orders.ed.delivery'), act: () => NS.app.go(`d/${x.id}`) });
    if (x.invoiceId) items.push({ label: t('orders.li.open_invoice'), act: () => { location.href = `../invoices/#i/${x.invoiceId}`; } });
    return items;
  }

  function mount() {
    $('oSearch').addEventListener('input', draw);
    $('oStatus').addEventListener('change', draw);
    $('oNew').addEventListener('click', () => NS.app.go('new'));
    NS.sampleActions.mount();
    list = g.SlopList.mount($('oRows'), { label: 'orders.li.label', count: 'orders.li.count', summary: $('oSummary'),
      empty: 'orders.li.empty', row, open: (x) => NS.app.go(`o/${x.id}`), menu: menuFor });
  }

  NS.listView = { mount, draw, menuFor };
  NS.views = NS.views || {};
  NS.views.list = { mount, refresh: draw, onShow: draw };
})(typeof window !== 'undefined' ? window : globalThis);
