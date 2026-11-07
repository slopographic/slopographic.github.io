// Credit notes: the only code that takes back part or all of an issued or paid invoice. A credit note reverses revenue and
// tax in the invoice's own proportions, lowers what the customer owes, and pays back (refund) whatever the customer had
// already paid beyond what is now owed. The note, its journal entry and the invoice's running totals (credited, refunded,
// and its status) are written in one transaction. A credit note is never changed or deleted; credit again or not at all.
// Foreign-currency invoices are credited at the invoice's own rate, as payments are, so no exchange gain or loss arises.
// Exposes SlopData.credits.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js
  const { ok, fail } = ns.result;
  const A = () => ns.schema.ACCT;

  /** Pure: the subtotal and tax of a credit of `amount`, in the invoice's proportions (tax rounded, the rest is subtotal). */
  function split(inv, amount) {
    const tax = inv.total ? Math.round((amount * (inv.tax || 0)) / inv.total) : 0;
    return { subtotal: amount - tax, tax };
  }
  /** Pure: how much of the invoice can still be credited. */
  const creditable = (inv) => Math.max(0, inv.total - (inv.credited || 0));

  /** Pure: what a credit of `amount` does: applied (taken off what is owed) and refund (paid back). due is the balance now. */
  function effect(due, amount) {
    const applied = Math.min(amount, Math.max(0, due));
    return { applied, refund: amount - applied };
  }

  /** Pure: the invoice's status after a credit: credited once credit notes cover it all, paid once nothing is owed, else as it was. */
  function statusAfter(inv, credited, due) {
    if (credited >= inv.total) return 'credited';
    if (inv.status === 'issued' && due <= 0) return 'paid';
    return inv.status;
  }

  /** Issues a credit note: { invoiceId, amount, date, reason, method }. method (cash, bank, card, other) is needed when part
   *  of the credit is paid back. Resolves with the credit note. */
  function issue(input) {
    const { invoiceId, amount, date, reason, method } = input || {};
    return ns.store.transact(async (tx) => {
      const r = await tx.get('invoices', invoiceId);
      if (!r.ok) return r;
      const inv = r.value;
      if (!inv || inv.deletedAt) return fail('not_found', say('ui.data.err.no_invoice', { id: String(invoiceId) }));
      if (inv.status !== 'issued' && inv.status !== 'paid') return fail('invalid_transition', say('ui.data.cr.issued'));
      if (!Number.isSafeInteger(amount) || amount < 1) return fail('invalid', say('ui.data.err.amount'));
      if (amount > creditable(inv)) return fail('overcredit', say('ui.data.cr.over', { left: String(creditable(inv)) }));
      const pays = await tx.list('payments', { index: 'invoiceId', value: invoiceId });
      if (!pays.ok) return pays;
      const due = ns.billing.balanceDue(inv, pays.value);
      const { applied, refund } = effect(due, amount);
      if (refund && !method) return fail('needs_method', say('ui.data.cr.method'));
      const num = await ns.numbering.allocate(tx, 'credit');
      if (!num.ok) return num;
      const id = ns.store.newId(), day = date || ns.ledger.today(), { subtotal, tax } = split(inv, amount);
      const base = (v) => (inv.rateId ? ns.fx.scale(v, inv.rate) : v);
      const taxB = base(tax), amountB = base(amount), refundB = refund ? base(refund) : 0;
      const lines = [{ account: A().REVENUE, debit: amountB - taxB, credit: 0 }];
      if (taxB) lines.push({ account: A().TAX_PAYABLE, debit: taxB, credit: 0 });
      if (amountB - refundB) lines.push({ account: A().AR, debit: 0, credit: amountB - refundB });
      if (refundB) lines.push({ account: method === 'cash' ? A().CASH : A().BANK, debit: 0, credit: refundB });
      const cn = await tx.put('creditNotes', {
        id, number: num.value, invoiceId, customerId: inv.customerId, date: day, currency: inv.currency, amount, subtotal, tax,
        refund, method: refund ? method : undefined, reason: reason || undefined, amountBase: amountB,
      }, { posting: true });
      if (!cn.ok) return cn;
      const j = await ns.ledger.postIn(tx, { date: day, memo: `Credit note ${num.value} for ${inv.number}`, source: `credit:${id}`, lines: lines.filter((l) => l.debit || l.credit) });
      if (!j.ok) return j;
      const credited = (inv.credited || 0) + amount;
      const up = await tx.put('invoices', { ...inv, credited, refunded: (inv.refunded || 0) + refund, status: statusAfter(inv, credited, due - applied) }, { posting: true });
      if (!up.ok) return up;
      return ok({ ...cn.value, applied });
    });
  }

  /** The credit notes of one invoice, oldest first. */
  async function forInvoice(invoiceId) {
    const r = await ns.store.list('creditNotes', { index: 'invoiceId', value: invoiceId });
    return r.ok ? ok(r.value.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.number < b.number ? -1 : 1))) : r;
  }

  ns.credits = { issue, forInvoice, split, creditable, effect, statusAfter };
})(typeof window !== 'undefined' ? window : globalThis);
