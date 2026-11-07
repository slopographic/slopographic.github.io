// Slop Timesheets list: period, customer, state and search filters, the totals for what is shown, and one row per entry
// (SlopList, shared/ui/list.js: click or Enter opens it, right-click or the Menu key opens its menu). CSV of what is shown.
(function (g) {
  'use strict';
  const S = g.SlopData, B = g.SlopBiz, UI = g.SlopUI;
  const NS = (g.SlopTimesheets = g.SlopTimesheets || {});
  const C = () => NS.core;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const STATE = () => ({ open: { chip: t('timesheets.li.to_bill'), cls: '' }, billed: { chip: t('timesheets.li.billed'), cls: 'good' }, internal: { chip: t('timesheets.li.internal'), cls: 'void' } });
  let list = null, settings = null, shown = [];

  const filters = () => ({ period: $('tPeriod').value, customerId: $('tCustomer').value, state: $('tState').value, search: $('tSearch').value });
  const moneyLine = (amounts) => Object.entries(amounts).map(([cur, m]) => B.money(m, cur, settings.locale)).join(' + ');

  async function fillCustomers() {
    const r = await NS.entries.customers(), sel = $('tCustomer'), was = sel.value;
    sel.replaceChildren(B.h('option', { value: '', text: t('timesheets.li.every') }), ...(r.ok ? r.value : []).map((c) => B.h('option', { value: c.id, text: c.name })));
    sel.value = was;
  }

  async function draw() {
    if ($('view-list').hidden) return;
    settings = await B.settings();
    const r = await NS.entries.rows();
    if (!r.ok) { $('tSummary').textContent = B.refusal(r); return; }
    shown = C().filter(r.value, filters(), S.ledger.today());
    list.set(shown);
    const sum = C().summary(shown, S.timesheets.amountOf);
    $('tTotal').textContent = shown.length ? t('timesheets.li.total', { time: C().hm(sum.minutes), billable: C().hm(sum.billableMinutes) }) + (Object.keys(sum.amounts).length ? ` · ${moneyLine(sum.amounts)}` : '') : '';
  }

  /** One entry as a SlopList row: what was done, the time and its value, and the date, customer, project and state. */
  function row(x) {
    const st = STATE()[x.state];
    return { title: x.description, amount: `${C().hm(x.minutes)} h`,
      meta: [{ chip: st.chip, cls: st.cls }, x.date, x.customerName || null, x.project || null,
        x.billable ? B.money(x.amount, x.currency, settings.locale) : null, x.invoiceNumber ? (x.invoiceNumber === 'draft' ? t('timesheets.li.on_draft') : t('timesheets.li.on', { number: x.invoiceNumber })) : null] };
  }

  async function remove(x) {
    const yes = await UI.confirm(t('timesheets.ed.del_q'), t('timesheets.li.del_body', { what: x.description, time: C().hm(x.minutes), date: x.date }), t('timesheets.ed.del_ok'), { danger: true });
    if (!yes) return;
    const r = await NS.entries.remove(x.id);
    if (!r.ok) UI.alert(t('timesheets.li.not_deleted'), B.refusal(r)); else { UI.toast(t('timesheets.ed.deleted')); draw(); }
  }

  function menuFor(x) {
    const items = [{ label: t('timesheets.li.open'), act: () => NS.app.go(`t/${x.id}`) }, { label: t('timesheets.li.again'), act: () => NS.app.go(`new/${x.id}`) }];
    if (x.state === 'open') items.push({ label: t('timesheets.li.bill', { name: x.customerName || t('timesheets.li.this_customer') }), act: () => NS.app.go(`bill/${x.customerId}`) });
    if (x.state === 'billed') items.push({ label: t('timesheets.li.open_invoice', { number: x.invoiceNumber }), act: () => { location.href = `../invoices/#i/${x.invoiceId}`; } });
    if (x.state !== 'billed') items.push({ label: t('timesheets.li.delete'), act: () => remove(x) });
    return items;
  }

  /** Downloads the shown rows as CSV. */
  function downloadCsv() {
    if (!shown.length) { UI.toast(t('timesheets.li.nothing')); return; }
    const text = C().csv(shown, S.timesheets.amountOf, (m, c) => S.money.plainMinor(m, c || settings.currency));
    UI.download(new Blob([text], { type: 'text/csv' }), `timesheet-${S.ledger.today()}.csv`);
    UI.toast(t('timesheets.li.csv_done'));
  }

  function mount() {
    for (const id of ['tSearch', 'tPeriod', 'tCustomer', 'tState']) $(id).addEventListener(id === 'tSearch' ? 'input' : 'change', draw);
    $('tNew').addEventListener('click', () => NS.app.go('new'));
    $('tCsv').addEventListener('click', downloadCsv);
    list = g.SlopList.mount($('tRows'), { label: 'timesheets.li.label', count: 'timesheets.li.count', summary: $('tSummary'),
      empty: 'timesheets.li.empty', row, open: (x) => NS.app.go(`t/${x.id}`), menu: menuFor });
  }

  NS.views = NS.views || {};
  NS.views.list = { mount, show: async () => { await fillCustomers(); await draw(); if (NS.timer) NS.timer.paint(); }, refresh: draw };
  NS.listView = { draw, menuFor, downloadCsv };
})(typeof window !== 'undefined' ? window : globalThis);
