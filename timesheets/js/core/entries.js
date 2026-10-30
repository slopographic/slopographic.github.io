// Slop Timesheets data: every read and write goes through SlopData (store, timesheets). Rows for the list carry the
// customer's name and a state: open (billable, not billed), billed (on a live invoice, with its number) or internal.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopTimesheets = g.SlopTimesheets || {});
  const { ok, fail } = S.result;
  const T = () => S.timesheets;

  /** Every entry with customerName, state, amount and the invoice number when billed. */
  function rows() {
    return S.store.readAll(async (tx) => {
      const e = await tx.list('timeEntries');
      if (!e.ok) return e;
      const c = await tx.list('customers');
      if (!c.ok) return c;
      const inv = await tx.list('invoices', { includeDeleted: true });
      if (!inv.ok) return inv;
      const names = new Map(c.value.map((x) => [x.id, x.name])), invoices = new Map(inv.value.map((x) => [x.id, x]));
      return ok(e.value.map((r) => {
        const state = !r.billable ? 'internal' : T().isOpen(r, invoices) ? 'open' : 'billed';
        const i = state === 'billed' ? invoices.get(r.invoiceId) : null;
        return { ...r, customerName: names.get(r.customerId) || '', state, amount: T().amountOf(r), invoiceNumber: i ? i.number || 'draft' : '', released: !!r.invoiceId && state !== 'billed' };
      }));
    });
  }

  /** Customers (not deleted), by name. */
  async function customers() {
    const r = await S.store.list('customers');
    return r.ok ? ok(r.value.sort((a, b) => a.name.localeCompare(b.name))) : r;
  }

  /** The rate, currency and project last used for a customer (or for internal time, without one), for a new entry. */
  async function lastUsed(customerId) {
    const r = await S.store.list('timeEntries');
    const list = (r.ok ? r.value : []).filter((e) => (e.customerId || '') === (customerId || ''))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return list.length ? { rate: list[0].rate || 0, project: list[0].project || '', currency: list[0].currency } : null;
  }

  /** The project names used so far, sorted. */
  async function projects() {
    const r = await S.store.list('timeEntries');
    return [...new Set((r.ok ? r.value : []).map((e) => e.project).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  /** Saves the form: { id?, date, customerId, project, description, minutes, rate, currency, billable }. An entry on a void
   *  or deleted invoice is released first, so it can be changed. */
  async function save(form) {
    const rec = { date: form.date, customerId: form.customerId || undefined, project: form.project || '', description: form.description,
      minutes: form.minutes, rate: form.rate, currency: form.currency, billable: !!form.billable };
    if (!form.id) return S.store.put('timeEntries', rec);
    let cur = await S.store.get('timeEntries', form.id);
    if (!cur.ok) return cur;
    if (!cur.value) return fail('not_found', g.SlopI18n ? g.SlopI18n.t('timesheets.core.gone') : 'timesheets.core.gone');
    if (cur.value.invoiceId) {
      const rel = await T().release(form.id);
      if (rel.ok) cur = rel;
    }
    return S.store.put('timeEntries', { ...cur.value, ...rec });
  }

  NS.entries = { rows, customers, lastUsed, projects, save, remove: (id) => S.store.remove('timeEntries', id), get: (id) => S.store.get('timeEntries', id) };
})(typeof window !== 'undefined' ? window : globalThis);
