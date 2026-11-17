// Quotes list: search, status filter (expired = open and past the valid-until date), one row per quote (SlopList,
// shared/ui/list.js: click or Enter opens it, the arrows move, right-click or the Menu key opens its menu).
(function (g) {
  'use strict';
  const NS = (g.SlopQuotes = g.SlopQuotes || {});
  const U = NS.util;
  const UI = g.SlopUI;
  const $ = (id) => document.getElementById(id);
  const CHIP = { sent: '', accepted: 'good', declined: 'void' }; // SlopList chip classes per status
  let list = null, settings = null;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  async function draw() {
    if (!$('view-list') || $('view-list').hidden) return;
    settings = await U.settings();
    const r = await NS.quotes.list({ status: $('qStatus').value, search: $('qSearch').value });
    if (!r.ok) { $('qSummary').textContent = U.refusal(r); return; }
    list.set(r.value);
  }

  /** One quote as a SlopList row: number and customer, the total, its status (expired first), dates and links. */
  function row(x) {
    const s = settings;
    return { title: `${x.number} · ${x.customerName}`, amount: U.money(x.total, x.currency || s.currency, s.locale), cls: x.expired ? 'is-overdue' : '',
      meta: [x.expired ? { chip: t('quotes.li.expired'), cls: 'bad' } : { chip: g.SlopBiz.statusText(x.status), cls: CHIP[x.status] || '' }, x.date,
        x.validUntil ? t('quotes.li.valid_until', { date: x.validUntil }) : null, x.orderId ? t('quotes.li.ordered') : null, x.invoiceId ? t('quotes.li.invoiced') : null] };
  }

  /** Runs a Result-returning action from the menu: a plain message on refusal, then redraws. */
  async function run(promise, okText) {
    const r = await promise;
    if (!r.ok) { UI.alert(t('quotes.ed.not_done'), U.refusal(r)); return; }
    UI.toast(okText);
    draw();
  }

  function menuFor(x) {
    const items = [{ label: t('quotes.li.open'), act: () => NS.app.go(`q/${x.id}`) }];
    const open = x.status === 'draft' || x.status === 'sent';
    if (x.status === 'draft') items.push({ label: t('quotes.ed.send'), act: () => run(NS.quotes.setStatus(x.id, 'sent'), t('quotes.li.sent', { number: x.number })) });
    if ((open || x.status === 'accepted') && !x.orderId && !x.invoiceId) {
      items.push({ label: t('quotes.ed.make_order'), act: () => run(NS.quotes.toOrder(x.id), t('quotes.li.ordered_t', { number: x.number })) });
      items.push({ label: t('quotes.ed.make_invoice'), act: () => run(NS.quotes.toInvoice(x.id), t('quotes.li.invoiced_t', { number: x.number })) });
    }
    if (open) items.push({ label: t('quotes.li.decline'), act: () => run(NS.quotes.setStatus(x.id, 'declined'), t('quotes.li.declined', { number: x.number })) });
    if (x.status === 'declined') items.push({ label: t('quotes.ed.reopen'), act: () => run(NS.quotes.setStatus(x.id, 'draft'), t('quotes.li.reopened', { number: x.number })) });
    if (x.orderId) items.push({ label: t('quotes.li.open_order'), act: () => { location.href = `../orders/#o/${x.orderId}`; } });
    if (x.invoiceId) items.push({ label: t('quotes.li.open_invoice'), act: () => { location.href = `../invoices/#i/${x.invoiceId}`; } });
    return items;
  }

  function mount() {
    $('qSearch').addEventListener('input', draw);
    $('qStatus').addEventListener('change', draw);
    $('qNew').addEventListener('click', () => NS.app.go('new'));
    list = g.SlopList.mount($('qRows'), { label: 'quotes.li.label', count: 'quotes.li.count', summary: $('qSummary'),
      empty: 'quotes.li.empty', row, open: (x) => NS.app.go(`q/${x.id}`), menu: menuFor });
  }

  NS.listView = { mount, draw, menuFor };
  NS.views = NS.views || {};
  NS.views.list = { mount, refresh: draw, onShow: draw };
})(typeof window !== 'undefined' ? window : globalThis);
