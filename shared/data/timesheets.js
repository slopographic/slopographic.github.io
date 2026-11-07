// Timesheets: time worked, and billing it. An entry is an ordinary store record (`timeEntries`); billing goes through here:
// one transaction makes a draft invoice with one line per entry and marks the entries with its id. Billed time cannot be
// changed (the schema refuses it); time on an invoice that was voided or deleted is open again, and release() unlinks it.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js
  // The pure helpers load on their own (Slop Reports prices time with amountOf); the writes need SlopData.result.
  const ok = (v) => ns.result.ok(v), fail = (code, msg) => ns.result.fail(code, msg);

  /** Pure: what an entry is worth, in minor units: minutes at the hourly rate, rounded half up. */
  const amountOf = (e) => Math.round(((e.minutes || 0) * (e.rate || 0)) / 60);

  /** Pure: minutes as "1:30". */
  const hm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

  /** Pure: true when the invoice an entry points at no longer holds it (gone, deleted or void). */
  const deadInvoice = (inv) => !inv || !!inv.deletedAt || inv.status === 'void';

  /** Pure: true when an entry can be billed: billable, and not on a live invoice. invoices: id -> invoice. */
  const isOpen = (e, invoices) => !!e.billable && (!e.invoiceId || deadInvoice(invoices.get(e.invoiceId)));

  /** Pure: the invoice line for an entry: "2026-10-20 · Website: design (1:30 h)", quantity 1, priced at its amount. */
  function lineOf(e, taxRate = 0) {
    const what = e.project ? `${e.project}: ${e.description}` : e.description;
    return { description: `${e.date} · ${what} (${hm(e.minutes)} h)`.slice(0, 300), qty: 1, unitPrice: amountOf(e), taxRate };
  }

  /** Bills open entries on one draft invoice, in one transaction. All must be open, billable, for one customer and in one
   *  currency. opts: { dueDate, taxRate (basis points for every line, default 0) }. Resolves to the invoice. */
  function toInvoice(ids, { dueDate, taxRate = 0 } = {}) {
    if (!Array.isArray(ids) || !ids.length) return Promise.resolve(fail('invalid', say('ui.data.ts.choose')));
    return ns.store.transact(async (tx) => {
      const entries = [];
      for (const id of ids) {
        const r = await tx.get('timeEntries', id);
        if (!r.ok) return r;
        if (!r.value) return fail('not_found', say('ui.data.ts.none', { id: String(id) }));
        entries.push(r.value);
      }
      const invoices = new Map();
      for (const e of entries) {
        if (!e.invoiceId || invoices.has(e.invoiceId)) continue;
        const r = await tx.get('invoices', e.invoiceId);
        if (!r.ok) return r;
        invoices.set(e.invoiceId, r.value);
      }
      if (entries.some((e) => !isOpen(e, invoices))) return fail('conflict', say('ui.data.ts.billed'));
      if (new Set(entries.map((e) => e.customerId)).size > 1) return fail('invalid', say('ui.data.ts.one_customer'));
      if (new Set(entries.map((e) => e.currency)).size > 1) return fail('invalid', say('ui.data.ts.one_currency'));
      const sorted = entries.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const doc = { customerId: entries[0].customerId, currency: entries[0].currency, date: ns.ledger.today(), lines: sorted.map((e) => lineOf(e, taxRate)) };
      if (dueDate) doc.dueDate = dueDate;
      const inv = await tx.put('invoices', doc);
      if (!inv.ok) return inv;
      for (const e of entries) {
        const w = await tx.put('timeEntries', { ...e, invoiceId: inv.value.id });
        if (!w.ok) return w;
      }
      return inv;
    });
  }

  /** Unlinks an entry from an invoice that no longer holds it (void or deleted), so it can be changed or billed again. */
  function release(id) {
    return ns.store.transact(async (tx) => {
      const r = await tx.get('timeEntries', id);
      if (!r.ok) return r;
      if (!r.value) return fail('not_found', say('ui.data.ts.none', { id: String(id) }));
      if (!r.value.invoiceId) return ok(r.value);
      const inv = await tx.get('invoices', r.value.invoiceId);
      if (!inv.ok) return inv;
      if (!deadInvoice(inv.value)) return fail('invalid_transition', say('ui.data.ts.live'));
      const { invoiceId, ...rest } = r.value;
      return tx.put('timeEntries', rest);
    });
  }

  ns.timesheets = { amountOf, hm, isOpen, deadInvoice, lineOf, toInvoice, release };
})(typeof window !== 'undefined' ? window : globalThis);
