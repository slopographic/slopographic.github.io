// Invoices list: status filter (draft, issued, paid, void, overdue), search, overdue rows marked, the outstanding balance
// per customer, and a row menu; both lists are SlopList (shared/ui/list.js). "From an order" creates a draft from a
// confirmed or fulfilled order.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const U = NS.util;
  const M = g.SlopDocs.model;
  const UI = g.SlopUI;
  const h = U.h;
  const $ = (id) => document.getElementById(id);
  let list = null, owed = null, settings = null, openId = null;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  async function draw() {
    if (!$('view-list') || $('view-list').hidden) return;
    settings = await U.settings();
    const r = await NS.invoices.list({ status: $('iStatus').value, search: $('iSearch').value });
    if (!r.ok) { $('iSummary').textContent = U.refusal(r); return; }
    const all = await NS.invoices.list({});
    openId = NS.state.view === 'edit' ? NS.editor.id() : null;
    list.set(r.value);
    owed.set(all.ok ? NS.invoices.outstanding(all.value) : []);
  }

  /** One invoice as a SlopList row: number and customer, the total, its status (overdue first), due date, balance and links.
   *  The invoice open beside the list is the selected row. */
  function row(x) {
    const s = settings;
    return { title: `${x.number || t('invoices.li.draft')} · ${x.customerName}`, amount: U.money(x.total, x.currency || s.currency, s.locale),
      cls: x.overdue ? 'is-overdue' : '', selected: x.id === openId,
      meta: [{ chip: x.overdue ? t('invoices.li.overdue') : g.SlopBiz.statusText(x.status), cls: x.overdue ? 'bad' : { paid: 'good', void: 'void' }[x.status] || '' },
        x.dueDate ? t('invoices.li.due', { date: x.dueDate }) : x.date, x.status === 'issued' ? t('invoices.li.balance', { amount: U.money(x.balance, x.currency, s.locale) }) : null,
        x.orderId ? t('invoices.li.from_order') : null, x.sample ? { chip: t('invoices.li.sample'), cls: 'warn' } : null] };
  }

  /** What one customer owes: the total due, the number of invoices, and the overdue part. */
  function owedRow(d) {
    const s = settings;
    return { title: d.customerName, amount: U.money(d.due, d.currency, s.locale),
      meta: [t('invoices.li.invoices_n', { n: d.count }), d.overdue ? { chip: t('invoices.li.overdue_amt', { amount: U.money(d.overdue, d.currency, s.locale) }), cls: 'bad' } : null] };
  }

  async function run(promise, okText) {
    const r = await promise;
    if (!r.ok) { UI.alert(t('invoices.li.not_done'), U.refusal(r)); return r; }
    if (okText) UI.toast(okText);
    draw();
    return r;
  }

  function menuFor(x) {
    const items = [{ label: t('invoices.li.open'), act: () => NS.app.go(`i/${x.id}`) }, { label: t('invoices.li.preview'), act: () => NS.app.go(`p/${x.id}`) }];
    if (x.status === 'draft') {
      items.push({ label: t('invoices.ed.issue'), act: async () => { if (await UI.confirm(t('invoices.ed.issue_q'), t('invoices.ed.issue_body'), t('invoices.ed.issue_ok'))) run(NS.invoices.issue(x.id), t('invoices.li.issued')); } });
      items.push({ label: t('invoices.ed.delete'), act: async () => { if (await UI.confirm(t('invoices.ed.del_q'), t('invoices.ed.del_body'), t('invoices.ed.del_ok'), { danger: true })) run(NS.invoices.removeDraft(x.id), t('invoices.li.deleted')); } });
    }
    items.push({ label: t('invoices.ed.pdf'), act: () => NS.preview.pdf(x.id) });
    if (x.status !== 'draft') items.push({ label: t('invoices.li.statement_for', { name: x.customerName }), act: () => NS.app.go(`s/${x.customerId}`) });
    if (x.status === 'issued') {
      items.push({ label: t('invoices.ed.payment'), act: () => NS.paymentDialog.open(x.id, () => draw()) });
      if (!x.paid) items.push({ label: t('invoices.ed.void'), act: async () => { if (await UI.confirm(t('invoices.ed.void_q'), t('invoices.ed.void_body', { number: x.number }), t('invoices.ed.void_ok'), { danger: true })) run(NS.invoices.voidInvoice(x.id), t('invoices.li.voided', { number: x.number })); } });
    }
    return items;
  }

  /** Dialog: pick a confirmed or fulfilled order that has no invoice yet, then create the draft. */
  async function fromOrder() {
    const o = await S.store.list('orders');
    const c = await NS.invoices.customers();
    if (!o.ok || !c.ok) { UI.alert(t('invoices.li.not_available'), U.refusal(o.ok ? c : o)); return; }
    const names = new Map(c.value.map((x) => [x.id, x.name]));
    const eligible = o.value.filter((x) => (x.status === 'open' || x.status === 'fulfilled') && !x.invoiceId)
      .sort((a, b) => String(b.number).localeCompare(String(a.number)));
    if (!eligible.length) { UI.alert(t('invoices.li.no_order'), t('invoices.li.no_order_body')); return; }
    const sel = h('select', { class: 'sui-input' }, eligible.map((x) => h('option', { value: x.id, text: `${x.number} · ${names.get(x.customerId) || t('invoices.li.no_customer')} · ${x.date}` })));
    UI.dialog({
      title: t('invoices.li.inv_order'),
      body: UI.field(t('invoices.li.order'), sel),
      buttons: [{ label: t('invoices.li.cancel') }, {
        label: t('invoices.li.create'), primary: true,
        act: async () => {
          const s = await U.settings();
          const ord = eligible.find((x) => x.id === sel.value);
          const r = await S.billing.invoiceFromOrder(sel.value, { dueDate: M.addDays(ord.date, s.paymentTermsDays) });
          if (!r.ok) { UI.alert(t('invoices.li.not_created'), U.refusal(r)); return false; }
          UI.toast(t('invoices.li.created'));
          NS.app.go(`i/${r.value.id}`);
          return undefined;
        },
      }],
    });
  }

  function mount() {
    $('iSearch').addEventListener('input', draw);
    $('iStatus').addEventListener('change', draw);
    $('iNew').addEventListener('click', () => NS.app.go('new'));
    $('iEmptyNew').addEventListener('click', () => NS.app.go('new'));
    $('iFromOrder').addEventListener('click', fromOrder);
    NS.sampleActions.mount();
    list = g.SlopList.mount($('iRows'), { label: 'invoices.li.label', count: 'invoices.li.count', summary: $('iSummary'), empty: $('iEmpty'),
      row, open: (x) => NS.app.go(`i/${x.id}`), menu: menuFor });
    owed = g.SlopList.mount($('iOutstanding'), { key: 'key', label: 'invoices.li.owed_label', count: 'invoices.li.owed_count',
      empty: 'invoices.li.owed_empty', row: owedRow,
      open: (d) => NS.app.go(`s/${d.customerId}`), menu: (d) => [{ label: t('invoices.li.statement'), act: () => NS.app.go(`s/${d.customerId}`) }] });
  }

  NS.views = NS.views || {};
  NS.views.list = { mount, refresh: draw, onShow: draw };
  NS.listView = { draw, menuFor, fromOrder };
})(typeof window !== 'undefined' ? window : globalThis);
