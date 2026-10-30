// Slop Quotes data: every read and write goes through SlopData (store, quotes). No second quote model here. A quote is a
// record in `quotes`; its lines are SlopData lines. Converting goes through SlopData.quotes (one transaction each).
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopQuotes = g.SlopQuotes || {});
  const { ok, fail } = S.result;

  /** Quotes with a status filter ('expired' = open and past their valid-until date) and a search over number, customer
   *  and notes. Each row has customerName and expired. Newest number first. */
  function list({ status = 'all', search = '' } = {}) {
    return S.store.readAll(async (tx) => {
      const o = await tx.list('quotes');
      if (!o.ok) return o;
      const c = await tx.list('customers');
      if (!c.ok) return c;
      const names = new Map(c.value.map((x) => [x.id, x.name]));
      const day = S.ledger.today(), q = String(search).trim().toLowerCase();
      const rows = o.value
        .map((r) => ({ ...r, customerName: names.get(r.customerId) || '(no customer)', expired: S.quotes.isExpired(r, day) }))
        .filter((r) => status === 'all' || (status === 'expired' ? r.expired : r.status === status))
        .filter((r) => !q || [r.number, r.customerName, r.notes].some((t) => String(t || '').toLowerCase().includes(q)))
        .sort((a, b) => String(b.number).localeCompare(String(a.number)));
      return ok(rows);
    });
  }

  /** Customers (not deleted), by name. */
  async function customers() {
    const r = await S.store.list('customers');
    return r.ok ? ok(r.value.sort((a, b) => a.name.localeCompare(b.name))) : r;
  }

  /** Products (with sku and price), by SKU. */
  async function products() {
    const r = await S.store.list('products');
    return r.ok ? ok(r.value.sort((a, b) => a.sku.localeCompare(b.sku))) : r;
  }

  /** Saves the editor's form. form: { id?, customerId, date, validUntil?, currency?, notes, lines, pdfSeed?, pdfLayout?, docLang? }.
   *  A new quote is a draft and takes a number; an existing one keeps its status. */
  async function save(form) {
    const base = { customerId: form.customerId, date: form.date, notes: form.notes, lines: form.lines };
    if (form.validUntil !== undefined) base.validUntil = form.validUntil || undefined;
    if (form.currency) base.currency = form.currency;
    if (form.pdfLayout !== undefined) base.pdfLayout = form.pdfLayout || '';
    if (form.docLang !== undefined) base.docLang = form.docLang || '';   // '' = the company's document language
    if (form.pdfSeed !== undefined && form.pdfSeed !== null) base.pdfSeed = form.pdfSeed;
    if (!form.id) return S.store.put('quotes', { ...base, pdfSeed: base.pdfSeed ?? g.SlopDocs.layouts.newSeed(), status: 'draft' });
    const cur = await S.store.get('quotes', form.id);
    if (!cur.ok) return cur;
    if (!cur.value) return fail('not_found', g.SlopI18n ? g.SlopI18n.t('quotes.core.gone') : 'quotes.core.gone');
    return S.store.put('quotes', { ...cur.value, ...base });
  }

  /** Moves a quote to another status through the store's rules (draft, sent, accepted, declined). */
  async function setStatus(id, status) {
    const cur = await S.store.get('quotes', id);
    if (!cur.ok) return cur;
    if (!cur.value) return fail('not_found', g.SlopI18n ? g.SlopI18n.t('quotes.core.gone') : 'quotes.core.gone');
    return S.store.put('quotes', { ...cur.value, status });
  }

  /** Accepted -> a confirmed order (SlopData.quotes.toOrder). */
  const toOrder = (id) => S.quotes.toOrder(id);

  /** Accepted -> a draft invoice due after the payment terms (SlopData.quotes.toInvoice). */
  async function toInvoice(id) {
    const s = await NS.util.settings();
    return S.quotes.toInvoice(id, { dueDate: g.SlopDocs.model.addDays(S.ledger.today(), s.paymentTermsDays) });
  }

  NS.quotes = { list, customers, products, save, setStatus, toOrder, toInvoice, get: (id) => S.store.get('quotes', id) };
})(typeof window !== 'undefined' ? window : globalThis);
