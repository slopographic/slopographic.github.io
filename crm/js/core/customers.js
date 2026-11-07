// Slop CRM customers: reads and writes the shared 'customers' collection through SlopData.store. Each write is one
// store call, which validates and stamps the record. Stage moves, notes and follow-up dates are small saves of one field.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const { fail } = S.result;
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });

  /** Every live customer, sorted by name. Resolves to a Result. */
  async function load() {
    const r = await S.store.list('customers');
    return r.ok ? { ok: true, value: r.value.slice().sort(byName) } : r;
  }

  /** One live customer, or null. */
  function get(id) { return S.store.get('customers', id); }

  /** Creates (no id) or updates one customer. Fields not in `changes` keep their stored value. */
  async function save(id, changes) {
    if (!id) return S.store.put('customers', { stage: 'lead', ...changes });
    const cur = await S.store.get('customers', id);
    if (!cur.ok) return cur;
    if (!cur.value) return fail('not_found', g.SlopI18n ? g.SlopI18n.t('crm.core.gone') : 'crm.core.gone');
    return S.store.put('customers', { ...cur.value, ...changes });
  }

  /** Moves a customer to another pipeline stage. Same stage is a no-op success. */
  async function moveStage(id, stage) {
    if (!NS.STAGES.includes(stage)) return fail('invalid', `unknown stage ${stage}`);
    const cur = await get(id);
    if (!cur.ok) return cur;
    if (cur.value && cur.value.stage === stage) return { ok: true, value: cur.value };
    return save(id, { stage });
  }

  /** Adds a dated note to the end of the customer's notes. */
  async function addNote(id, text, date) {
    const cur = await get(id);
    if (!cur.ok || !cur.value) return cur.ok ? fail('not_found', g.SlopI18n ? g.SlopI18n.t('crm.core.gone') : 'crm.core.gone') : cur;
    const next = NS.notes.append(cur.value.notes, date, text);
    if (next === (cur.value.notes || '')) return fail('invalid', g.SlopI18n ? g.SlopI18n.t('crm.core.write_note') : 'crm.core.write_note');
    return save(id, { notes: next });
  }

  /** Sets or clears (null) the follow-up date. */
  function setFollowUp(id, date) { return save(id, { followUp: date || null }); }

  /** Soft-deletes a customer. Orders and invoices keep pointing at it. */
  function remove(id) { return S.store.remove('customers', id); }

  /** Contact ids already linked to a customer, deleted ones included (a deleted customer is not re-imported). */
  async function linkedContactIds() {
    const r = await S.store.list('customers', { includeDeleted: true });
    if (!r.ok) return r;
    return { ok: true, value: new Set(r.value.map((c) => c.contactId).filter(Boolean)) };
  }

  /** Sorted, unique category names across live customers. */
  function categoriesOf(list) {
    return [...new Set(list.flatMap((c) => c.categories || []))].sort((a, b) => a.localeCompare(b));
  }

  NS.customers = { load, get, save, moveStage, addNote, setFollowUp, remove, linkedContactIds, categoriesOf };
  NS.history = {
    /** Orders and invoices of one customer, read from the shared collections (not copied). */
    async of(id) {
      const [o, i] = await Promise.all([
        S.store.list('orders', { index: 'customerId', value: id }),
        S.store.list('invoices', { index: 'customerId', value: id }),
      ]);
      if (!o.ok) return o;
      if (!i.ok) return i;
      const byDate = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
      return { ok: true, value: { orders: o.value.sort(byDate), invoices: i.value.sort(byDate) } };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
