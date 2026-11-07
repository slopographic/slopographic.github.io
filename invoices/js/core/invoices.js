// Slop Invoices data. Every write goes through SlopData: drafts through store.put, and issue, payments and void through
// billing (which also writes the journal in the same transaction). Balances are computed from the payments, never stored.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const { ok, fail } = S.result;
  const B = S.billing;
  /** A random PDF seed for a new document (the template is picked from it; see shared/docs/pdf-layouts.js). */
  const newSeed = () => (g.crypto && g.crypto.getRandomValues ? g.crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff : Math.floor(Math.random() * 2147483647));

  /** Invoices with balance, overdue flag and customer name. status: all, draft, issued, paid, void or overdue. Newest first. */
  function list({ status = 'all', search = '' } = {}) {
    return S.store.readAll(async (tx) => {
      const inv = await tx.list('invoices');
      if (!inv.ok) return inv;
      const pays = await tx.list('payments');
      if (!pays.ok) return pays;
      const cust = await tx.list('customers');
      if (!cust.ok) return cust;
      const names = new Map(cust.value.map((c) => [c.id, c.name]));
      const byInv = new Map();
      for (const p of pays.value) byInv.set(p.invoiceId, [...(byInv.get(p.invoiceId) || []), p]);
      const today = S.ledger.today();
      const q = String(search).trim().toLowerCase();
      const rows = inv.value.map((r) => {
        const p = byInv.get(r.id) || [];
        const balance = r.status === 'issued' ? B.balanceDue(r, p) : r.status === 'draft' ? r.total : 0;
        const overdue = r.status === 'issued' && balance > 0 && !!r.dueDate && r.dueDate < today;
        return { ...r, customerName: names.get(r.customerId) || '(no customer)', paid: B.paidOn(p), balance, overdue };
      })
        .filter((r) => (status === 'all' ? true : status === 'overdue' ? r.overdue : r.status === status))
        .filter((r) => !q || [r.number, r.customerName, r.notes].some((t) => String(t || '').toLowerCase().includes(q)))
        .sort((a, b) => String(b.number || 'zz').localeCompare(String(a.number || 'zz')));
      return ok(rows);
    });
  }

  /** Issued invoices that still have a balance, summed per customer and currency (key: the customer and currency). */
  function outstanding(rows) {
    const map = new Map();
    for (const r of rows) {
      if (r.status !== 'issued' || r.balance <= 0) continue;
      const key = `${r.customerName}\u0000${r.currency}`;
      const row = map.get(key) || { key, customerId: r.customerId, customerName: r.customerName, currency: r.currency, due: 0, count: 0, overdue: 0 };
      row.due += r.balance;
      row.count += 1;
      if (r.overdue) row.overdue += r.balance;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => a.customerName.localeCompare(b.customerName) || a.currency.localeCompare(b.currency));
  }

  /** Customers (not deleted), by name. */
  async function customers() {
    const r = await S.store.list('customers');
    return r.ok ? ok(r.value.sort((a, b) => a.name.localeCompare(b.name))) : r;
  }

  /** Products (with sku and price), by SKU: the same catalogue the orders use. */
  async function products() {
    const r = await S.store.list('products');
    return r.ok ? ok(r.value.sort((a, b) => a.sku.localeCompare(b.sku))) : r;
  }

  /** Stored invoice with its payments, or null. */
  async function get(id) {
    return S.store.readAll(async (tx) => {
      const inv = await tx.get('invoices', id);
      if (!inv.ok) return inv;
      if (!inv.value || inv.value.deletedAt) return ok(null);
      const pays = await tx.list('payments', { index: 'invoiceId', value: id });
      if (!pays.ok) return pays;
      const cust = await tx.get('customers', inv.value.customerId);
      if (!cust.ok) return cust;
      return ok({ invoice: inv.value, payments: pays.value.sort((a, b) => a.date.localeCompare(b.date)), customer: cust.value || null });
    });
  }

  /** Saves a draft. form: { id?, customerId, date, dueDate?, currency?, notes?, lines, pdfSeed?, pdfLayout?, docLang? }. Issued invoices are refused.
   *  The PDF seed and layout are kept on the record (issue keeps them), so the same invoice always exports the same way. */
  async function saveDraft(form) {
    const base = { customerId: form.customerId, date: form.date, dueDate: form.dueDate, notes: form.notes, lines: form.lines };
    if (form.currency) base.currency = form.currency;
    if (form.sample) base.sample = true;   // random samples (samples.js) are marked so they can be deleted together
    if (form.pdfLayout !== undefined) base.pdfLayout = form.pdfLayout || '';   // '' = the template the seed picks
    if (form.docLang !== undefined) base.docLang = form.docLang || '';   // '' = the company's document language
    if (form.pdfSeed !== undefined && form.pdfSeed !== null) base.pdfSeed = form.pdfSeed;
    if (!form.id) return S.store.put('invoices', { ...base, pdfSeed: base.pdfSeed ?? newSeed(), status: 'draft' });
    const cur = await S.store.get('invoices', form.id);
    if (!cur.ok) return cur;
    if (!cur.value) return fail('not_found', g.SlopI18n ? g.SlopI18n.t('invoices.core.gone') : 'invoices.core.gone');
    if (cur.value.status !== 'draft') return fail('invalid_transition', g.SlopI18n ? g.SlopI18n.t('invoices.core.issued_locked') : 'invoices.core.issued_locked');
    return S.store.put('invoices', { ...cur.value, ...base });
  }

  /** Deletes a draft (soft delete). Issued invoices are kept: void them instead. */
  const removeDraft = (id) => S.store.remove('invoices', id);

  const issue = (id) => B.issue(id);
  const recordPayment = (input) => B.recordPayment(input);
  const voidInvoice = (id) => B.voidInvoice(id);

  NS.invoices = { list, outstanding, customers, products, get, saveDraft, removeDraft, issue, recordPayment, voidInvoice };
})(typeof window !== 'undefined' ? window : globalThis);
