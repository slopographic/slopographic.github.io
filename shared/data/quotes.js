// Quotes (estimates): a priced offer to a customer. Nothing is posted to the ledger. Drafts and status changes are ordinary
// store.put calls (the schema allows draft -> sent -> accepted or declined; see FLOWS). Turning a quote into an order or
// a draft invoice goes through here: one transaction writes the new document and links both ways, and accepts the quote.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js
  const { ok, fail } = ns.result;

  /** Pure: true when a quote that is still open (draft or sent) is past its validUntil date on day (YYYY-MM-DD). */
  const isExpired = (q, day) => !!q.validUntil && (q.status === 'draft' || q.status === 'sent') && q.validUntil < day;

  /** Reads a quote that can still be converted: open or accepted, and not already turned into this kind of document. */
  async function convertible(tx, id) {
    const r = await tx.get('quotes', id);
    if (!r.ok) return r;
    if (!r.value) return fail('not_found', say('ui.data.qt.none', { id: String(id) }));
    const q = r.value;
    if (q.status === 'declined') return fail('invalid_transition', say('ui.data.qt.declined'));
    if (q.orderId || q.invoiceId) return fail('conflict', say(q.orderId ? 'ui.data.qt.has_order' : 'ui.data.qt.has_invoice'));
    return ok(q);
  }

  /** Copies what the new document takes from the quote: customer, currency, notes and lines (discounts too). */
  const carry = (q) => ({ customerId: q.customerId, currency: q.currency, notes: q.notes, lines: q.lines.map((l) => ({ ...l })), quoteId: q.id,
    ...(q.docLang ? { docLang: q.docLang } : {}) });   // the order or invoice keeps the quote's document language

  /** Writes the new document and marks the quote accepted with a link to it. */
  async function finish(tx, q, collection, doc, link) {
    const made = await tx.put(collection, doc);
    if (!made.ok) return made;
    const done = await tx.put('quotes', { ...q, status: 'accepted', [link]: made.value.id });
    return done.ok ? made : done;
  }

  /** Quote -> confirmed order, in one transaction. The order is dated today and is open (confirmed), since the customer accepted. */
  function toOrder(id) {
    return ns.store.transact(async (tx) => {
      const q = await convertible(tx, id);
      if (!q.ok) return q;
      return finish(tx, q.value, 'orders', { ...carry(q.value), date: ns.ledger.today(), status: 'open' }, 'orderId');
    });
  }

  /** Quote -> draft invoice, in one transaction. dueDate is optional; the invoice is issued from Slop Invoices. */
  function toInvoice(id, { dueDate } = {}) {
    return ns.store.transact(async (tx) => {
      const q = await convertible(tx, id);
      if (!q.ok) return q;
      const doc = { ...carry(q.value), date: ns.ledger.today() };
      if (dueDate) doc.dueDate = dueDate;
      return finish(tx, q.value, 'invoices', doc, 'invoiceId');
    });
  }

  ns.quotes = { isExpired, toOrder, toInvoice };
})(typeof window !== 'undefined' ? window : globalThis);
