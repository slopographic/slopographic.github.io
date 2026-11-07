// The Statement view (#s/<customer id>): one customer's account in one currency, as a printable sheet: the company and
// customer blocks, every issued invoice, payment and credit note (and refund) with a running balance (from a date, or from the start), what is owed
// now and how late it is (SlopData.statement). Print it, download it as CSV, or write a payment reminder (ui/reminder.js).
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const U = NS.util;
  const h = U.h;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  // The statement itself is a document the person prints or sends: its words are the document language's (SlopBiz.docLang,
  // the company's), loaded with the data; the page's own controls speak the page's language.
  const AGE = ['current', 'd30', 'd60', 'd90', 'over90'];   // biz.pr.age_<id>
  let cur = null;   // { customer, invoices, payments, settings, words }

  /** Reads the customer, their invoices and the payments, and fills the currency pick. */
  async function load(customerId) {
    const [c, inv, pay, cn, settings] = await Promise.all([S.store.get('customers', customerId), S.store.list('invoices'), S.store.list('payments'),
      S.store.list('creditNotes', { index: 'customerId', value: customerId }), U.settings()]);
    if (!c.ok || !c.value) { cur = null; return false; }
    const words = await g.SlopBiz.docLang.load(g.SlopBiz.docLang.pick('', settings.docLang), settings.locale);
    cur = { customer: c.value, invoices: inv.ok ? inv.value : [], payments: pay.ok ? pay.value : [], credits: cn.ok ? cn.value : [], settings, words };
    const list = S.statement.currencies(cur.invoices, customerId);
    $('stCurrency').replaceChildren(...(list.length ? list : [settings.currency]).map((x) => h('option', { value: x, text: x })));
    $('stCurrency').closest('label').hidden = list.length < 2;
    return true;
  }

  function build() {
    return S.statement.build(cur.invoices, cur.payments, cur.customer.id, { currency: $('stCurrency').value, from: $('stFrom').value, today: S.ledger.today(), credits: cur.credits });
  }

  /** Draws the sheet. */
  function draw() {
    if (!cur) { $('stSheet').replaceChildren(h('p', { class: 'msg bad', text: t('invoices.st.gone') })); return; }   // i18n-ignore: CSS class names
    const st = build(), s = cur.settings, c = cur.customer, w = cur.words, tx = w.t;
    const m = (v) => U.money(v, st.currency, w.locale);
    const lines = g.SlopBiz.sheet.lines;
    const row = (cells, cls) => h('tr', { class: cls }, cells.map((x, i) => h('td', { class: i >= 4 ? 'num' : '' }, x)));
    const heads = ['biz.pr.date', 'biz.pr.s_what', 'biz.pr.s_invoice', 'biz.pr.due', 'biz.pr.s_charged', 'biz.pr.s_paid', 'biz.pr.s_balance'];
    const open = (o) => (o.late ? tx('biz.pr.open_late', { ref: o.ref, amount: m(o.left), n: o.late }) : `${o.ref} ${m(o.left)}`);
    $('stSheet').replaceChildren(h('article', { class: 'doc-sheet statement', lang: w.code },
      g.SlopBiz.sheet.head(s, tx('biz.pr.t_statement'), [tx('biz.pr.m_date', { date: w.day(st.today) }), st.from ? tx('biz.pr.m_from', { date: w.day(st.from) }) : null], w),
      h('div', { class: 'sheet-to st-to' }, h('span', { class: 'sub', text: tx('biz.pr.to') }), h('b', { text: c.name }), ...[c.email, c.phone, ...lines(c.address)].filter(Boolean).map((x) => h('div', { text: x }))),
      h('p', { class: 'sheet-total st-total' }, h('span', { text: tx('biz.pr.balance_owed') }), h('b', { text: m(st.closing) })),
      h('div', { class: 'sheet-scroll' }, h('table', { class: 'grid-t st-table' },
        h('thead', null, h('tr', null, heads.map((k, i) => h('th', { class: i >= 4 ? 'num' : '', text: tx(k) })))),
        h('tbody', null, st.from ? row(['', tx('biz.pr.opening'), '', '', '', '', m(st.opening)], 'st-open') : null,
          st.lines.map((l) => row([w.day(l.date), tx(`biz.pr.k_${l.kind}`), l.ref, w.day(l.due), l.debit ? m(l.debit) : '', l.credit ? m(l.credit) : '', m(l.balance)])),
          st.lines.length ? null : h('tr', null, h('td', { colspan: 7, class: 'sub', text: tx('biz.pr.nothing_period') }))),
        h('tfoot', null, h('tr', null, h('th', { colspan: 6, text: tx('biz.pr.balance_owed') }), h('th', { class: 'num', text: m(st.closing) }))))),
      h('div', { class: 'stats st-age' }, AGE.map((k) => h('div', { class: `stat${st.ageing[k] && k !== 'current' ? ' is-late' : ''}` }, h('b', { text: m(st.ageing[k]) }), h('span', { text: tx(`biz.pr.age_${k}`) })))),
      h('p', { class: 'note', text: st.owed.length ? tx('biz.pr.still_open', { list: st.owed.map(open).join(' · ') }) : tx('biz.pr.nothing_owed') })));
    g.SlopBiz.docbar.title(t('invoices.st.title', { name: c.name }));   // the record bar (shared/biz/docbar.js) names the statement
    $('stRemind').disabled = st.closing <= 0;
  }

  /** Downloads the statement as CSV. */
  function downloadCsv() {
    if (!cur) return;
    const st = build();
    const text = S.statement.csv(st, (v) => S.money.plainMinor(v, st.currency));
    g.SlopUI.download(new Blob([text], { type: 'text/csv' }), `statement-${cur.customer.name.replace(/[^\w.-]+/g, '-')}-${st.today}.csv`);
  }

  async function show(customerId) {
    $('stFrom').value = '';
    await load(customerId);
    draw();
  }

  function mount() {
    $('stCurrency').addEventListener('change', draw);
    $('stFrom').addEventListener('input', draw);
    $('stPrint').addEventListener('click', () => g.print());
    $('stCsv').addEventListener('click', downloadCsv);
    $('stRemind').addEventListener('click', () => cur && NS.reminder.open(build(), cur.customer, cur.settings, cur.words));
  }

  NS.statementView = { show, draw, build, downloadCsv };
  NS.views = NS.views || {};
  NS.views.statement = { mount, refresh: () => { if (cur) show(cur.customer.id); }, onShow: show };
})(typeof window !== 'undefined' ? window : globalThis);
