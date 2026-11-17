/* Slop Contacts: import planning (no DOM). readFile() turns a dropped or chosen file into contacts: vCard (.vcf,
 * .vcard; photos are skipped), .scontacts, or CSV (the rows are returned for the column mapping). plan() matches the
 * incoming contacts against the list on phone (digits, E.164 with the default country code) or e-mail. apply() adds
 * the new ones and, for each match, skips, merges into the existing contact, or adds a copy, as the person chose.
 * Merging keeps the existing id, its pipeline stage, follow-up date and shared tags. Classic script.
 * Adds SlopContacts.importPlan. */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const M = SC.model, P = SC.phone; // SC.dedupe is read when used (it loads after this file in the page)

  /** Read one file. Returns { kind: 'vcard' | 'scontacts', name, contacts } or { kind: 'csv', name, headers, rows }. */
  async function readFile(file) {
    const name = (file && file.name) || 'contacts', text = await file.text();
    if (/\.scontacts$/i.test(name) || /^\s*\{/.test(text)) return { kind: 'scontacts', name, contacts: SC.format.fromScontacts(text) };
    if (/BEGIN:VCARD/i.test(text)) return { kind: 'vcard', name, contacts: SC.vcard.read(text, { photos: false }) };
    return { kind: 'csv', name, ...SC.csvMap.parse(text) };
  }
  /** The file types the drop target takes. */
  const DROPPABLE = /\.(vcf|vcard|csv)$/i;

  /** The keys a contact is matched on: its phones and e-mails. */
  function matchKeys(c, cc) {
    const keys = [];
    for (const p of c.phones) { const k = P.phoneKey(p.value, cc); if (k) keys.push(k); }
    for (const e of c.emails) { const k = P.emailKey(e.value); if (k) keys.push(k); }
    return keys;
  }
  const label = (k) => (k.startsWith('p:') ? 'phone +' + k.slice(2) : 'e-mail ' + k.slice(2));

  /** One row per incoming contact: { c, match (the first existing contact sharing a key, or null), why: ['phone …'] }.
   *  A contact with the same id (an X-SLOP-ID from the Drive bundle) is a match first. */
  function plan(existing, incoming, cc) {
    const index = new Map(), byId = new Map(existing.map((e) => [e.id, e]));
    for (const e of existing) for (const k of new Set(matchKeys(e, cc))) if (!index.has(k)) index.set(k, e);
    return (incoming || []).map((c) => {
      let match = byId.get(c.id) || null;
      const why = match ? ['the same id'] : [];
      for (const k of new Set(matchKeys(c, cc))) {
        const e = index.get(k);
        if (!e) continue;
        if (!match) match = e;
        if (e === match) why.push(label(k));
      }
      return { c, match, why };
    });
  }

  /** Applies the rows. choice: 'skip' | 'merge' | 'add' (for matches only; new contacts are always added).
   *  newId(incoming) gives the id for each added contact (the caller may keep the incoming id). Returns { list, added, merged, skipped }. */
  function apply(existing, rows, choice, newId, cc) {
    const list = existing.slice(), pos = new Map(list.map((c, i) => [c.id, i]));
    const out = { added: 0, merged: 0, skipped: 0 };
    for (const r of rows) {
      if (r.match && choice === 'skip') { out.skipped++; continue; }
      if (!r.match || choice === 'add') { list.push(M.normalise({ ...r.c, id: newId(r.c) })); out.added++; continue; }
      const i = pos.get(r.match.id), cur = list[i];
      const m = SC.dedupe.mergeGroup([cur, r.c], cc);
      list[i] = M.normalise({ ...m, id: cur.id });
      out.merged++;
    }
    return { list, ...out };
  }

  SC.importPlan = { readFile, DROPPABLE, matchKeys, plan, apply };
})();
