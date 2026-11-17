// Slop Timesheets billing: choose a customer, tick the open billable time to bill (all of it at first), set the tax rate,
// and make a draft invoice (SlopData.timesheets.toInvoice: one line per entry, due after the payment terms). The invoice is
// checked and issued in Slop Invoices. Time in another currency than the first ticked one waits for its own invoice.
(function (g) {
  'use strict';
  const S = g.SlopData, B = g.SlopBiz, UI = g.SlopUI, h = g.SlopBiz.h;
  const NS = (g.SlopTimesheets = g.SlopTimesheets || {});
  const $ = (id) => document.getElementById(id);
  let open = [], settings = null;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  const ticked = () => [...document.querySelectorAll('#bRows input[type=checkbox]:checked')].map((b) => open.find((x) => x.id === b.value));
  /** The typed tax rate in basis points ("12,5" in sv), null when it is not a percentage from 0 to 100. */
  const bp = () => S.money.parsePercent($('bTax').value.trim() || '0', { typed: true });

  /** The customers with open billable time, with how much. */
  function customersWithTime(rows) {
    const by = new Map();
    for (const r of rows) if (r.state === 'open') by.set(r.customerId, { name: r.customerName, minutes: (by.get(r.customerId)?.minutes || 0) + r.minutes });
    return [...by.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }

  function paintTotal() {
    const list = ticked();
    const cur = list[0] ? list[0].currency : settings.currency;
    const net = list.reduce((s, x) => s + x.amount, 0), tax = S.money.taxOn(net, bp() ?? 0);
    $('bTotal').textContent = list.length ? t('timesheets.bi.total', { n: list.length, time: NS.core.hm(list.reduce((s, x) => s + x.minutes, 0)), amount: B.money(net + tax, cur, settings.locale) }) + (tax ? ' ' + t('timesheets.bi.with_tax', { tax: B.money(tax, cur, settings.locale) }) : '') : t('timesheets.bi.none');
    $('bMake').disabled = !list.length;
  }

  function paintRows() {
    const cid = $('bCustomer').value;
    const mine = open.filter((x) => x.customerId === cid).sort((a, b) => (a.date < b.date ? -1 : 1));
    $('bRows').replaceChildren(...mine.map((x) => h('label', { class: 'bill-row' },
      h('input', { type: 'checkbox', value: x.id, checked: true, onchange: paintTotal }),
      h('span', { class: 'bill-what' }, h('b', { text: x.description }), h('span', { class: 'sub', text: [x.date, x.project].filter(Boolean).join(' · ') })),
      h('span', { class: 'num', text: `${NS.core.hm(x.minutes)} h` }), h('span', { class: 'num', text: B.money(x.amount, x.currency, settings.locale) }))));
    $('bEmpty').hidden = mine.length > 0;
    paintTotal();
  }

  async function show(customerId) {
    settings = await B.settings();
    const r = await NS.entries.rows();
    open = r.ok ? r.value.filter((x) => x.state === 'open') : [];
    const cs = customersWithTime(open);
    $('bCustomer').replaceChildren(...cs.map(([id, c]) => h('option', { value: id, text: t('timesheets.bi.to_bill', { name: c.name, time: NS.core.hm(c.minutes) }) })));
    if (customerId && cs.some(([id]) => id === customerId)) $('bCustomer').value = customerId;
    $('bTax').value = S.money.typedPlain(String((settings.defaultTaxRate || 0) / 100));
    $('bNone').hidden = cs.length > 0;
    $('bForm').hidden = !cs.length;
    paintRows();
  }

  async function make() {
    const list = ticked();
    if (!list.length) return;
    if (bp() === null) { UI.alert(t('timesheets.bi.not_made'), t('biz.pd.bad_tax')); return; }
    const due = g.SlopDocs ? g.SlopDocs.model.addDays(S.ledger.today(), settings.paymentTermsDays) : undefined;
    const r = await S.timesheets.toInvoice(list.map((x) => x.id), { dueDate: due, taxRate: bp() });
    if (!r.ok) { UI.alert(t('timesheets.bi.not_made'), B.refusal(r)); return; }
    UI.toast(t('timesheets.bi.made'));
    $('bDone').replaceChildren(t('timesheets.bi.done', { n: r.value.lines.length }) + ' ',
      h('a', { href: `../invoices/#i/${r.value.id}`, text: t('timesheets.bi.open') }), ' ' + t('timesheets.bi.check'));
    $('bDone').hidden = false;
    await show($('bCustomer').value);
  }

  function mount() {
    $('bCustomer').addEventListener('change', () => { $('bDone').hidden = true; paintRows(); });
    $('bTax').addEventListener('input', paintTotal);
    $('bMake').addEventListener('click', make);
    $('bAll').addEventListener('click', () => { const boxes = [...document.querySelectorAll('#bRows input')]; const on = boxes.some((b) => !b.checked); boxes.forEach((b) => { b.checked = on; }); paintTotal(); });
  }

  NS.views = NS.views || {};
  NS.views.bill = { mount, show, refresh: () => show($('bCustomer').value) };
  NS.bill = { make, show };
})(typeof window !== 'undefined' ? window : globalThis);
