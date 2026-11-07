// Record a payment against an issued invoice through SlopData.billing.recordPayment. The amount defaults to the balance.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const U = NS.util;
  const M = g.SlopDocs.model;
  const UI = g.SlopUI;
  const h = U.h;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** Opens the dialog for an invoice. onDone() runs after a payment is stored. */
  async function open(invoiceId, onDone) {
    const c = await NS.context.load(invoiceId);
    if (!c.ok) { UI.alert(t('invoices.li.not_available'), U.refusal(c)); return; }
    const inv = c.value.invoice;
    if (inv.status !== 'issued') { UI.alert(t('invoices.pay.no'), t('invoices.pay.only_issued')); return; }
    const due = c.value.balance;
    const amount = h('input', { type: 'text', inputmode: 'decimal', value: M.amountText(due, inv.currency) });
    const date = h('input', { type: 'date', value: S.ledger.today() });
    const method = UI.select([['bank', t('invoices.pay.bank')], ['cash', t('invoices.pay.cash')], ['card', t('invoices.pay.card')], ['other', t('invoices.pay.other')]], 'bank');
    const note = h('input', { type: 'text', maxlength: 300, autocomplete: 'off' });
    const msg = h('p', { class: 'msg bad', role: 'status' });   // i18n-ignore: CSS class names
    const body = h('div', null,
      h('p', { class: 'note', text: t('invoices.pay.due_line', { number: inv.number, amount: c.value.money(due) }) }),
      UI.field(t('invoices.pay.amount', { currency: inv.currency }), amount), UI.field(t('invoices.pay.date'), date), UI.field(t('invoices.pay.method'), method), UI.field(t('invoices.pay.note'), note), msg);
    UI.dialog({
      title: t('invoices.pay.title'),
      body,
      buttons: [{ label: t('invoices.li.cancel') }, {
        label: t('invoices.pay.title'), primary: true,
        act: async () => {
          const minor = M.amountFromText(amount.value, inv.currency);
          if (!minor) { msg.textContent = t('invoices.pay.bad_amount'); return false; }
          if (minor > due) { msg.textContent = t('invoices.pay.only_due', { amount: c.value.money(due) }); return false; }
          const r = await S.billing.recordPayment({ invoiceId, amount: minor, date: date.value, method: method.value, note: note.value.trim() || undefined });
          if (!r.ok) { msg.textContent = U.refusal(r); return false; }
          UI.toast(minor === due ? t('invoices.pay.paid', { number: inv.number }) : t('invoices.pay.recorded'));
          if (onDone) onDone();
          return undefined;
        },
      }],
    });
    setTimeout(() => amount.select(), 30);
  }

  NS.paymentDialog = { open };
})(typeof window !== 'undefined' ? window : globalThis);
