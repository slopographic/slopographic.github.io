// The Credit note view (#c/<credit note id>): one credit note as a printable sheet: the company and customer blocks, the
// invoice it credits, the reason, the subtotal, tax and amount credited, and what was paid back and how. Print it, or open
// the invoice. The record bar (shared/biz/docbar.js) names it by its number.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const U = NS.util;
  const h = U.h;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  // The credit note itself is a document the person prints: its words are in its invoice's document language (SlopBiz.docLang)

  /** Draws the credit note, or says that it is gone. */
  async function show(id) {
    const cn = await S.store.get('creditNotes', id);
    if (!cn.ok || !cn.value) { $('cnSheet').replaceChildren(h('p', { class: 'msg bad', text: t('invoices.cr.gone') })); return; }   // i18n-ignore: CSS class names
    const c = cn.value;
    const [inv, cust, s] = await Promise.all([S.store.get('invoices', c.invoiceId), S.store.get('customers', c.customerId), U.settings()]);
    const invoice = inv.ok && inv.value ? inv.value : null, customer = cust.ok && cust.value ? cust.value : { name: '' };
    const DL = g.SlopBiz.docLang, w = await DL.load(DL.pick(invoice && invoice.docLang, s.docLang), s.locale), tx = w.t;
    const m = (v) => U.money(v, c.currency, w.locale);
    const lines = g.SlopBiz.sheet.lines;
    const row = (label, value, cls) => h('tr', { class: cls }, h('td', { text: label }), h('td', { class: 'num', text: value }));
    const invNo = invoice ? invoice.number : '';
    $('cnSheet').replaceChildren(h('article', { class: 'doc-sheet credit-note', lang: w.code },
      g.SlopBiz.sheet.head(s, tx('biz.pr.t_credit'), [tx('biz.pr.m_no', { number: c.number }), tx('biz.pr.m_date', { date: w.day(c.date) }), invoice ? tx('biz.pr.m_for_invoice', { number: invNo }) : null], w),
      h('div', { class: 'sheet-to' }, h('span', { class: 'sub', text: tx('biz.pr.to') }), h('b', { text: customer.name }), ...[customer.email, ...lines(customer.address)].filter(Boolean).map((x) => h('div', { text: x }))),
      h('p', { class: 'note', text: c.reason ? tx('biz.pr.reason', { reason: c.reason }) : tx('biz.pr.credit_against', { number: invNo }) }),
      h('div', { class: 'sheet-scroll' }, h('table', { class: 'grid-t' },
        h('tbody', null, row(tx('biz.pr.cn_subtotal'), m(c.subtotal || 0)), row(tx('biz.pr.c_tax'), m(c.tax || 0))),
        h('tfoot', null, h('tr', null, h('th', { text: tx('biz.pr.amount_credited') }), h('th', { class: 'num', text: m(c.amount) }))))),
      c.refund ? h('p', { class: 'sheet-total' }, h('span', { text: tx('biz.pr.paid_back', { method: tx(`biz.pr.pm_${['bank', 'cash', 'card', 'other'].includes(c.method) ? c.method : 'bank'}`) }) }), h('b', { text: m(c.refund) }))
        : h('p', { class: 'note', text: tx('biz.pr.taken_off', { amount: m(c.amount), number: invNo }) })));
    $('cnInvoice').href = `#i/${c.invoiceId}`;
    g.SlopBiz.docbar.title(t('invoices.cr.title', { number: c.number }));
  }

  function mount() { $('cnPrint').addEventListener('click', () => g.print()); }

  NS.views = NS.views || {};
  NS.views.credit = { mount, onShow: show };
  NS.creditNote = { show };
})(typeof window !== 'undefined' ? window : globalThis);
