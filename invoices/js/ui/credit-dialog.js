// Issue a credit note against an issued or paid invoice through SlopData.credits.issue. The amount defaults to all that can
// still be credited. When the credit is more than is still owed, the rest is paid back, so the dialog asks how.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const U = NS.util;
  const M = g.SlopDocs.model;
  const UI = g.SlopUI;
  const h = U.h;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** Opens the dialog for an invoice. onDone() runs after the credit note is stored. */
  async function open(invoiceId, onDone) {
    const c = await NS.context.load(invoiceId);
    if (!c.ok) { UI.alert(t('invoices.li.not_available'), U.refusal(c)); return; }
    const inv = c.value.invoice, money = c.value.money;
    if (inv.status !== 'issued' && inv.status !== 'paid') { UI.alert(t('invoices.cr.none'), t('invoices.cr.only')); return; }
    const most = S.credits.creditable(inv), due = Math.max(0, S.billing.balanceDue(inv, c.value.payments));
    const amount = h('input', { type: 'text', inputmode: 'decimal', value: M.amountText(most, inv.currency) });
    const date = h('input', { type: 'date', value: S.ledger.today() });
    const reason = h('input', { type: 'text', maxlength: 300, autocomplete: 'off', placeholder: t('invoices.cr.reason_ph') });
    const method = UI.select([['bank', t('invoices.pay.bank')], ['cash', t('invoices.pay.cash')], ['card', t('invoices.pay.card')], ['other', t('invoices.pay.other')]], 'bank');
    const refundRow = UI.field(t('invoices.cr.pay_back'), method);
    const refundNote = h('p', { class: 'note' });
    const msg = h('p', { class: 'msg bad', role: 'status' });   // i18n-ignore: CSS class names
    /** Shows how the credit lands: off the balance, and what is paid back (with its method) when it is more than is owed. */
    const preview = () => {
      const minor = M.amountFromText(amount.value, inv.currency) || 0;
      const { applied, refund } = S.credits.effect(due, Math.min(minor, most));
      refundRow.hidden = !refund;
      refundNote.textContent = minor ? t(refund ? 'invoices.cr.effect_refund' : 'invoices.cr.effect', { applied: money(applied), refund: money(refund) }) : '';
    };
    amount.addEventListener('input', preview);
    const body = h('div', { class: 'credit-dialog' },
      h('p', { class: 'note', text: t('invoices.cr.line', { number: inv.number, total: money(inv.total), owed: money(due), most: money(most) }) }),
      UI.field(t('invoices.cr.amount', { currency: inv.currency }), amount), UI.field(t('invoices.pay.date'), date), UI.field(t('invoices.cr.reason'), reason), refundRow, refundNote, msg);
    preview();
    UI.dialog({
      title: t('invoices.page.credit_note'),
      body,
      buttons: [{ label: t('invoices.li.cancel') }, {
        label: t('invoices.cr.issue'), primary: true,
        act: async () => {
          const minor = M.amountFromText(amount.value, inv.currency);
          if (!minor) { msg.textContent = t('invoices.pay.bad_amount'); return false; }
          if (minor > most) { msg.textContent = t('invoices.cr.only_most', { amount: money(most) }); return false; }
          const r = await S.credits.issue({ invoiceId, amount: minor, date: date.value, reason: reason.value.trim() || undefined, method: method.value });
          if (!r.ok) { msg.textContent = U.refusal(r); return false; }
          UI.toast(r.value.refund ? t('invoices.cr.issued_refund', { number: r.value.number, amount: money(r.value.refund) }) : t('invoices.cr.issued', { number: r.value.number }));
          if (onDone) onDone();
          return undefined;
        },
      }],
    });
    setTimeout(() => amount.select(), 30);
  }

  NS.creditDialog = { open };
})(typeof window !== 'undefined' ? window : globalThis);
