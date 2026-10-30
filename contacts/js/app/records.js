/* Slop Contacts: the link to the shared customer records (SlopData 'customers'). Reads every live customer into the
 * list. Each change to the list is written as one transaction: changed contacts are put (merged over the stored record,
 * so fields the screen does not show are kept), removed contacts are soft-deleted. Writes run one after another, and
 * the list is reloaded when another tab or app changes a customer while nothing is pending. Also reads the created dates
 * and the CRM tags (customerTags) for the filters. Adds SlopContacts.records. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const D = window.SlopData;
  const UI = window.SlopUI;
  let queue = Promise.resolve(), pending = 0;

  /** Reads every live customer into the list. Nothing is written back. */
  async function load() {
    const r = await D.store.list('customers');
    if (!r.ok) { UI.toast(r.message || SC.tr('contacts.rec.read_failed')); return false; }
    S.touched = new Map(r.value.map((x) => [x.id, x.updatedAt || 0]));
    S.created = new Map(r.value.map((x) => [x.id, x.createdAt || 0]));
    const t = await D.store.list('customerTags'); // the CRM's tags, for the tag filter (read only here)
    if (t.ok) S.tags = t.value.map((x) => ({ id: x.id, name: String(x.name || ''), color: x.color || 'blue' }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    S.setList(r.value.map((rec) => SC.customerMap.toContact(rec)), { write: false });
    return true;
  }

  /** Writes the difference between two lists in one transaction. Failure reloads the stored list and says why. */
  function persist(prev, next) {
    const before = new Map(prev.map((c) => [c.id, c]));
    const kept = new Set(next.map((c) => c.id));
    const changed = next.filter((c) => !before.has(c.id) || !SC.model.sameContent(before.get(c.id), c));
    const removed = prev.filter((c) => !kept.has(c.id)).map((c) => c.id);
    if (!changed.length && !removed.length) return;
    pending++;
    const run = async () => {
      const r = await D.store.transact(async (tx) => {
        for (const c of changed) {
          const cur = await tx.get('customers', c.id);
          if (!cur.ok) return cur;
          const w = await tx.put('customers', SC.customerMap.toRecord(c, cur.value));
          if (!w.ok) return w;
        }
        for (const id of removed) {
          const w = await tx.remove('customers', id);
          if (!w.ok) return w;
        }
        return D.result.ok(true);
      });
      pending--;
      if (!r.ok) { UI.alert(SC.tr('contacts.rec.save_failed'), SC.tr('contacts.rec.save_body', { why: r.message || SC.tr('contacts.rec.nothing_changed') })); await load(); }
      else if (!pending) await load(); // picks up the stored times (Recent) once the queue is empty
    };
    queue = queue.then(run, run);
  }

  /** Startup: load, then keep the list in step with the store. */
  async function init() {
    const ok = await load();
    S.persist = persist;
    D.store.subscribe(() => { if (!pending) load(); });
    return ok;
  }

  /** A new record id (never one the store has seen, deleted records included). */
  const newId = () => D.store.newId();

  SC.records = { init, load, persist, newId, flush: () => queue, pending: () => pending > 0 };
})();
