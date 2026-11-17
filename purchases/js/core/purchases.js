// Slop Purchases data: every read and write goes through SlopData (store, purchases). A purchase order is a record in
// `purchases`; its supplier is a contact flagged supplier. Receiving and the bill go through SlopData.purchases.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopPurchases = g.SlopPurchases || {});
  const { ok, fail } = S.result;

  /** Purchase orders with a status filter ('late' = ordered and past the expected date; 'unbilled' = ordered or received
   *  without a recorded bill) and a search over number, supplier and notes. Rows carry supplierName, late and unbilled. */
  function list({ status = 'all', search = '' } = {}) {
    return S.store.readAll(async (tx) => {
      const o = await tx.list('purchases');
      if (!o.ok) return o;
      const c = await tx.list('customers');
      if (!c.ok) return c;
      const names = new Map(c.value.map((x) => [x.id, x.name]));
      const day = S.ledger.today(), q = String(search).trim().toLowerCase();
      const rows = o.value.map((r) => ({ ...r, supplierName: names.get(r.customerId) || '(no supplier)',
        late: r.status === 'ordered' && !!r.expectedDate && r.expectedDate < day,
        unbilled: (r.status === 'ordered' || r.status === 'received') && !r.expenseId }))
        .filter((r) => status === 'all' || (status === 'late' ? r.late : status === 'unbilled' ? r.unbilled : r.status === status))
        .filter((r) => !q || [r.number, r.supplierName, r.notes].some((t) => String(t || '').toLowerCase().includes(q)))
        .sort((a, b) => String(b.number).localeCompare(String(a.number)));
      return ok(rows);
    });
  }

  /** Suppliers (contacts flagged supplier, not deleted), by name. */
  async function suppliers() {
    const r = await S.store.list('customers');
    return r.ok ? ok(r.value.filter((c) => c.supplier).sort((a, b) => a.name.localeCompare(b.name))) : r;
  }

  /** Products, by SKU. A new line from a product takes its price; the buying price is typed over it. */
  async function products() {
    const r = await S.store.list('products');
    return r.ok ? ok(r.value.sort((a, b) => a.sku.localeCompare(b.sku))) : r;
  }

  /** Saves the editor's form ({ id?, customerId, date, expectedDate?, currency?, notes, lines, pdfSeed?, pdfLayout?, docLang? }). A new
   *  purchase order is a draft and takes a number; an existing one keeps its status. */
  async function save(form) {
    const base = { customerId: form.customerId, date: form.date, notes: form.notes, lines: form.lines };
    if (form.expectedDate !== undefined) base.expectedDate = form.expectedDate || undefined;
    if (form.currency) base.currency = form.currency;
    if (form.pdfLayout !== undefined) base.pdfLayout = form.pdfLayout || '';
    if (form.docLang !== undefined) base.docLang = form.docLang || '';   // '' = the company's document language
    if (form.pdfSeed !== undefined && form.pdfSeed !== null) base.pdfSeed = form.pdfSeed;
    if (!form.id) return S.store.put('purchases', { ...base, pdfSeed: base.pdfSeed ?? g.SlopDocs.layouts.newSeed(), status: 'draft' });
    const cur = await S.store.get('purchases', form.id);
    if (!cur.ok) return cur;
    if (!cur.value) return fail('not_found', g.SlopI18n ? g.SlopI18n.t('purchases.core.gone') : 'purchases.core.gone');
    return S.store.put('purchases', { ...cur.value, ...base });
  }

  /** Moves a purchase order to another status through the store's rules (draft, ordered, cancelled). */
  async function setStatus(id, status) {
    const cur = await S.store.get('purchases', id);
    if (!cur.ok) return cur;
    if (!cur.value) return fail('not_found', g.SlopI18n ? g.SlopI18n.t('purchases.core.gone') : 'purchases.core.gone');
    return S.store.put('purchases', { ...cur.value, status });
  }

  NS.purchases = { list, suppliers, products, save, setStatus, get: (id) => S.store.get('purchases', id),
    receive: (id, o) => S.purchases.receive(id, o), recordBill: (id, o) => S.purchases.recordBill(id, o) };
})(typeof window !== 'undefined' ? window : globalThis);
