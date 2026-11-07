// Invoices and payments: the only code that issues, pays or voids an invoice. Each step writes the
// document and its journal entry in one transaction, so the books always match the documents.
// Drafts are ordinary store.put calls; everything after that goes through these functions.
// An invoice in a foreign currency is posted at its issue-date rate (see fx.js). Payments convert at that rate
// too, so no realised exchange gain or loss is booked yet.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js
  const { ok, fail } = ns.result;
  const A = () => ns.schema.ACCT;

  /** Pure: journal lines for an issued invoice. AR is debited for the total; revenue and tax are credited. Empty when the total is zero. */
  function invoiceLines(inv) {
    if (!inv.total) return [];
    const lines = [{ account: A().AR, debit: inv.total, credit: 0 }];
    if (inv.subtotal) lines.push({ account: A().REVENUE, debit: 0, credit: inv.subtotal });
    if (inv.tax) lines.push({ account: A().TAX_PAYABLE, debit: 0, credit: inv.tax });
    return lines;
  }

  /** Pure: total of the payments made against an invoice. */
  const paidOn = (payments) => payments.reduce((s, p) => s + p.amount, 0);

  /** Pure: what is still owed on an invoice given its payments: the total, less what was paid and what credit notes took off
   *  it, plus what was paid back (shared/data/credits.js keeps credited and refunded on the invoice). */
  const balanceDue = (inv, payments) => inv.total - paidOn(payments) - (inv.credited || 0) + (inv.refunded || 0);

  /** Pure: the base-currency amount of a payment. The payment that clears the invoice takes the rest of the
   *  base total, so rounding never leaves a residue; earlier payments convert at the invoice's rate. */
  function paymentBase(inv, payments, amount, due) {
    const invBase = inv.amountBase !== undefined ? inv.amountBase : inv.total;
    if (amount === due && !inv.credited) return invBase - payments.reduce((s, p) => s + (p.amountBase !== undefined ? p.amountBase : p.amount), 0);
    return inv.rateId ? ns.fx.scale(amount, inv.rate) : amount;
  }

  async function loadInvoice(tx, id) {
    const r = await tx.get('invoices', id);
    if (!r.ok) return r;
    return r.value && !r.value.deletedAt ? ok(r.value) : fail('not_found', say('ui.data.err.no_invoice', { id: String(id) }));
  }

  /** Draft -> issued. Takes the next invoice number, writes the journal (AR / revenue / tax) in the same transaction. */
  function issue(id) {
    return ns.store.transact(async (tx) => {
      const inv = await loadInvoice(tx, id);
      if (!inv.ok) return inv;
      if (inv.value.status !== 'draft') return fail('invalid_transition', say('ui.data.bill.draft_only'));
      const cust = await tx.get('customers', inv.value.customerId);
      if (!cust.ok) return cust;
      if (!cust.value || cust.value.deletedAt) return fail('not_found', say('ui.data.bill.no_customer'));
      const up = await tx.put('invoices', { ...inv.value, status: 'issued', issuedAt: Date.now() }, { posting: true });
      if (!up.ok) return up;
      const lines = invoiceLines(up.value);
      if (!lines.length) return up;
      const j = await ns.ledger.postIn(tx, { date: up.value.date, memo: `Invoice ${up.value.number}`, source: `invoice:${id}:issue`, lines, currency: up.value.currency });
      if (!j.ok) return j;
      return tx.put('invoices', { ...up.value, rateId: j.value.rateId, rate: j.value.rate, amountBase: j.value.amountBase }, { posting: true });
    });
  }

  /** Records a payment against an issued invoice. Partial payments are allowed; the invoice becomes paid when nothing is due. */
  function recordPayment(input) {
    const { invoiceId, amount, date, method, note } = input || {};
    return ns.store.transact(async (tx) => {
      const inv = await loadInvoice(tx, invoiceId);
      if (!inv.ok) return inv;
      if (inv.value.status !== 'issued') return fail('invalid_transition', say('ui.data.bill.pay_issued'));
      if (!Number.isSafeInteger(amount) || amount < 1) return fail('invalid', say('ui.data.err.amount'));
      const pays = await tx.list('payments', { index: 'invoiceId', value: invoiceId });
      if (!pays.ok) return pays;
      const due = balanceDue(inv.value, pays.value);
      if (amount > due) return fail('overpayment', say('ui.data.bill.overpay', { due: String(due) }));
      const base = paymentBase(inv.value, pays.value, amount, due);
      const id = ns.store.newId();
      const day = date || ns.ledger.today();
      const p = await tx.put('payments', {
        id, invoiceId, amount, date: day, method: method || 'bank', note,
        currency: inv.value.currency, rateId: inv.value.rateId, rate: inv.value.rate, amountBase: base,
      }, { posting: true });
      if (!p.ok) return p;
      const bank = method === 'cash' ? A().CASH : A().BANK;
      const j = await ns.ledger.postIn(tx, {
        date: day, memo: `Payment for ${inv.value.number}`, source: `payment:${id}`,
        lines: [{ account: bank, debit: base, credit: 0 }, { account: A().AR, debit: 0, credit: base }],
      });
      if (!j.ok) return j;
      if (amount === due) {
        const s = await tx.put('invoices', { ...inv.value, status: 'paid' }, { posting: true });
        if (!s.ok) return s;
      }
      return p;
    });
  }

  /** Issued -> void. Only allowed while no payment or credit note exists (take money back with a credit note). Reverses the issue entry. */
  function voidInvoice(id) {
    return ns.store.transact(async (tx) => {
      const inv = await loadInvoice(tx, id);
      if (!inv.ok) return inv;
      if (inv.value.status !== 'issued') return fail('invalid_transition', say('ui.data.bill.void_issued'));
      const pays = await tx.list('payments', { index: 'invoiceId', value: id });
      if (!pays.ok) return pays;
      if (pays.value.length) return fail('has_payments', say('ui.data.bill.void_paid'));
      if (inv.value.credited) return fail('has_credits', say('ui.data.bill.void_credited'));
      const v = await tx.put('invoices', { ...inv.value, status: 'void' }, { posting: true });
      if (!v.ok) return v;
      const je = await tx.list('journal', { index: 'source', value: `invoice:${id}:issue`, includeDeleted: true });
      if (!je.ok) return je;
      if (je.value.length) {
        const r = await ns.ledger.reverseIn(tx, je.value[0].id, { memo: `Void ${inv.value.number}` });
        if (!r.ok) return r;
      }
      return v;
    });
  }

  /** Order -> draft invoice, in one transaction. Copies the customer, currency, notes and lines (discounts too); the
   *  invoice carries orderId and the order carries invoiceId. Refused for draft or cancelled orders, and for an order
   *  whose invoice still exists. Totals are recomputed from the lines by the schema. */
  function invoiceFromOrder(orderId, { dueDate } = {}) {
    return ns.store.transact(async (tx) => {
      const o = await tx.get('orders', orderId);
      if (!o.ok) return o;
      if (!o.value || o.value.deletedAt) return fail('not_found', say('ui.data.err.no_order', { id: String(orderId) }));
      const order = o.value;
      if (order.status === 'draft' || order.status === 'cancelled') return fail('invalid_transition', say('ui.data.bill.order_open'));
      if (order.invoiceId) {
        const old = await tx.get('invoices', order.invoiceId);
        if (!old.ok) return old;
        if (old.value && !old.value.deletedAt) return fail('conflict', (old.value.number ? say('ui.data.bill.order_has', { number: old.value.number }) : say('ui.data.bill.order_has_draft')));
      }
      const inv = await tx.put('invoices', {
        customerId: order.customerId, date: ns.ledger.today(), dueDate, currency: order.currency,
        lines: order.lines.map((l) => ({ ...l })), notes: order.notes, orderId,
      });
      if (!inv.ok) return inv;
      const link = await tx.put('orders', { ...order, invoiceId: inv.value.id });
      return link.ok ? inv : link;
    });
  }

  ns.billing = { invoiceLines, paidOn, balanceDue, paymentBase, issue, recordPayment, voidInvoice, invoiceFromOrder };
})(typeof window !== 'undefined' ? window : globalThis);
