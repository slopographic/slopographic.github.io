// Import from Slop Contacts. The saved list is a .scontacts file in Slop Drive (JSON, format 'slop-contacts').
// Each contact becomes one customer that keeps the contact's id in contactId. A contact whose id is already on a
// customer (live or deleted) is skipped, so re-importing never duplicates. Everything is written in one transaction.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const { ok, fail } = S.result;
  const cut = (s, n) => String(s || '').slice(0, n);

  /** The saved Contacts lists in Slop Drive, newest first: [{ id, name, modified, blob }]. [] without SlopHub. */
  async function findLists() {
    const hub = g.SlopHub;
    if (!hub || !hub.list) return [];
    const files = await hub.list({ trashed: false }); // intake-ok: the newest saved list is offered first; choosing one is the shared picker
    return files.filter((f) => /\.scontacts$/i.test(f.name || '') || f.type === 'application/x-slop-contacts')
      .sort((a, b) => (b.modified || 0) - (a.modified || 0));
  }

  /** Parses a .scontacts blob into its contact array. Fails with a plain message for any other file. */
  async function readList(blob) {
    let d;
    const msg = g.SlopI18n ? g.SlopI18n.t('crm.core.not_list') : 'crm.core.not_list';
    try { d = JSON.parse(await blob.text()); } catch (e) { return fail('invalid', msg); }
    if (!d || d.format !== 'slop-contacts' || !Array.isArray(d.contacts)) return fail('invalid', msg);
    return ok(d.contacts.filter((c) => c && typeof c === 'object'));
  }

  /** A contact as customer fields: name, first email and phone, the address on one line, groups as categories. */
  function toCustomer(c) {
    const n = c.name || {};
    const full = [n.given, n.family].filter(Boolean).join(' ');
    const first = (list) => (Array.isArray(list) && list[0] && list[0].value) || '';
    const adr = (Array.isArray(c.adr) ? c.adr : []).map((a) => [a.street, a.locality, a.region, a.postal, a.country]
      .filter(Boolean).join(', ')).filter(Boolean).join('; ');
    return {
      contactId: cut(c.id, 80),
      name: cut(c.fn || full || c.org || first(c.emails) || 'Unnamed contact', 200),   // i18n-ignore: the stored name of a contact without one (data)
      email: cut(first(c.emails), 200), phone: cut(first(c.phones), 60),
      address: cut(adr, 1000), categories: (Array.isArray(c.groups) ? c.groups : []).map((x) => cut(x, 40)).slice(0, 20),
      notes: cut(c.note, 5000), stage: 'lead',
    };
  }

  /** The import plan: which contacts become customers, which are already linked, and which cannot be stored. */
  function plan(contacts, linked) {
    const seen = new Set(linked);
    const add = [], skipped = [], invalid = [];
    for (const c of contacts) {
      const rec = toCustomer(c);
      if (!rec.contactId || seen.has(rec.contactId)) { skipped.push(rec); continue; }
      const check = S.schema.prepare('customers', rec);
      if (!check.ok) { invalid.push(rec); continue; }
      seen.add(rec.contactId);
      add.push(check.value);
    }
    return { add, skipped: skipped.length, invalid: invalid.length };
  }

  /** Writes the planned customers in one transaction. Returns how many were added. */
  async function apply(p) {
    const r = await S.store.transact(async (tx) => {
      for (const rec of p.add) {
        const w = await tx.put('customers', rec);
        if (!w.ok) return w;
      }
      return ok(p.add.length);
    });
    return r;
  }

  NS.contactsImport = { findLists, readList, toCustomer, plan, apply };
})(typeof window !== 'undefined' ? window : globalThis);
