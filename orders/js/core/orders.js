// Slop Orders data: every read and write goes through SlopData (store, stock, billing). No second order model here.
// An order is a record in `orders`; its lines are SlopData lines (see shared/docs/model.js for the line helpers).
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopOrders = g.SlopOrders || {});
  const { ok, fail } = S.result;

  /** Orders with a status filter and a search over number, customer name and notes. Newest number first. */
  function list({ status = 'all', search = '' } = {}) {
    return S.store.readAll(async (tx) => {
      const o = await tx.list('orders');
      if (!o.ok) return o;
      const c = await tx.list('customers');
      if (!c.ok) return c;
      const names = new Map(c.value.map((x) => [x.id, x.name]));
      const q = String(search).trim().toLowerCase();
      const rows = o.value
        .map((r) => ({ ...r, customerName: names.get(r.customerId) || '(no customer)' }))
        .filter((r) => status === 'all' || r.status === status)
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

  /** Adds a customer from inside an order. Stage is 'customer' because they are buying. */
  function addCustomer({ name, email, phone }) {
    return S.store.put('customers', { name, email, phone, stage: 'customer' });
  }

  /** A random PDF seed for a new order (the template is picked from it; see shared/docs/pdf-layouts.js). */
  const newSeed = () => (g.crypto && g.crypto.getRandomValues ? g.crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff : Math.floor(Math.random() * 2147483647));

  /** Saves the editor's form. form: { id?, customerId, date, currency?, notes, lines (stored shape), pdfSeed?, pdfLayout?, docLang? }.
   *  New orders are always drafts and take a number. Existing orders keep their status unless one is given.
   *  The PDF seed and layout are kept on the order (confirm and fulfil keep them). */
  async function save(form, status) {
    const base = { customerId: form.customerId, date: form.date, notes: form.notes, lines: form.lines };
    if (form.currency) base.currency = form.currency;   // an absent currency keeps the stored one (or takes the base)
    if (form.sample) base.sample = true;   // random samples are marked so they can be cancelled together
    if (form.pdfLayout !== undefined) base.pdfLayout = form.pdfLayout || '';   // '' = the template the seed picks
    if (form.docLang !== undefined) base.docLang = form.docLang || '';   // '' = the company's document language
    if (form.pdfSeed !== undefined && form.pdfSeed !== null) base.pdfSeed = form.pdfSeed;
    if (!form.id) return S.store.put('orders', { ...base, pdfSeed: base.pdfSeed ?? newSeed(), status: 'draft' });
    const cur = await S.store.get('orders', form.id);
    if (!cur.ok) return cur;
    if (!cur.value) return fail('not_found', g.SlopI18n ? g.SlopI18n.t('orders.core.gone') : 'orders.core.gone');
    return S.store.put('orders', { ...cur.value, ...base, status: status || cur.value.status });
  }

  /** Moves an order to another status through the store's rules (draft, confirmed, fulfilled, cancelled). */
  async function setStatus(id, status) {
    const cur = await S.store.get('orders', id);
    if (!cur.ok) return cur;
    if (!cur.value) return fail('not_found', g.SlopI18n ? g.SlopI18n.t('orders.core.gone') : 'orders.core.gone');
    return S.store.put('orders', { ...cur.value, status });
  }

  /** Saves the form, then confirms it (draft -> open). Two writes: the save, then the status change. */
  async function confirm(form) {
    const r = await save(form);
    return r.ok ? setStatus(r.value.id, 'open') : r;
  }
  const cancel = (id) => setStatus(id, 'cancelled');

  NS.orders = { list, customers, products, addCustomer, save, setStatus, confirm, cancel, get: (id) => S.store.get('orders', id) };
})(typeof window !== 'undefined' ? window : globalThis);
