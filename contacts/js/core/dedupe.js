/* Slop Contacts: duplicates. Two contacts are candidates when they share a normalised phone (digits, after E.164
 * with the default country code), a normalised e-mail, or the same name plus organisation. Candidates are grouped
 * (union-find, so A~B and B~C make one group). Exact copies merge automatically. A merge keeps every phone,
 * e-mail, address and group; the scalar fields come from the richest contact, then from the others.
 * Classic script. Adds SlopContacts.dedupe. */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const M = SC.model, P = SC.phone;

  /** The duplicate keys of one contact. */
  function keysOf(c, cc) {
    const keys = [];
    for (const p of c.phones) { const k = P.phoneKey(p.value, cc); if (k) keys.push(k); }
    for (const e of c.emails) { const k = P.emailKey(e.value); if (k) keys.push(k); }
    const no = P.nameOrgKey(c); if (no) keys.push(no);
    return keys;
  }

  /** Groups of two or more candidate duplicates from a list of contacts (objects, not copies). */
  function findGroups(list, cc) {
    const parent = list.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const first = new Map();
    list.forEach((c, i) => {
      for (const k of keysOf(c, cc)) {
        if (first.has(k)) { const a = find(i), b = find(first.get(k)); if (a !== b) parent[a] = b; }
        else first.set(k, i);
      }
    });
    const groups = new Map();
    list.forEach((c, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); });
    return [...groups.values()].filter((g) => g.length > 1);
  }

  /** Every member has the same content (ids aside). */
  const isExact = (group) => group.every((c) => M.sameContent(c, group[0]));

  /** How many fields a contact fills in. The richest one wins the scalar fields. */
  function richness(c) {
    const n = c.name || {};
    return ['prefix', 'given', 'additional', 'family', 'suffix'].filter((k) => n[k]).length + ['fn', 'org', 'dept', 'title', 'bday', 'url', 'note']
      .filter((k) => c[k]).length + c.phones.length + c.emails.length + c.adr.length + c.groups.length;
  }

  /** Union entries by a key; a repeated entry adds its types. */
  function unionBy(entries, key) {
    const out = new Map();
    for (const e of entries) {
      const k = key(e);
      if (!out.has(k)) { out.set(k, { ...e, types: [...(e.types || [])] }); continue; }
      const t = out.get(k);
      t.types = [...new Set([...t.types, ...(e.types || [])])];
      // the international form of a number wins over a national one
      if (e.value && e.value.startsWith('+') && !t.value.startsWith('+')) t.value = e.value;
    }
    return [...out.values()];
  }

  /** One contact from a group. The id and scalar fields come from the richest member; lists are unions. */
  function mergeGroup(group, cc) {
    const ranked = group.map((c, i) => ({ c, i, r: richness(c) })).sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.c);
    const pick = (f) => { for (const c of ranked) { const v = f(c); if (v) return v; } return ''; };
    const name = {};
    for (const k of M.NAME_KEYS) name[k] = pick((c) => c.name[k]);
    const merged = {
      id: ranked[0].id,
      name,
      fn: pick((c) => c.fn),
      org: pick((c) => c.org), dept: pick((c) => c.dept), title: pick((c) => c.title),
      bday: pick((c) => c.bday), url: pick((c) => c.url),
      note: pick((c) => c.note), photo: pick((c) => c.photo),
      phones: unionBy(ranked.flatMap((c) => c.phones), (p) => P.phoneKey(p.value, cc) || p.value.toLowerCase()),
      emails: unionBy(ranked.flatMap((c) => c.emails), (e) => (e.value || '').toLowerCase()),
      adr: unionBy(ranked.flatMap((c) => c.adr), (a) => M.ADR_KEYS.map((k) => (a[k] || '').toLowerCase()).join('|')),
      groups: [...new Set(ranked.flatMap((c) => c.groups))],
      // the pipeline and the shared tags are kept, so a merge does not reset the stage to Lead
      stage: pick((c) => c.stage), followUp: pick((c) => c.followUp),
      tagIds: [...new Set(ranked.flatMap((c) => c.tagIds || []))],
    };
    return M.normalise(merged);
  }

  /** Replace each group with its merged contact, placed where its first member was. Other contacts keep their order. */
  function applyMerges(list, groups, cc) {
    const owner = new Map();
    for (const g of groups) for (const c of g) owner.set(c, g);
    const done = new Set(), out = [];
    for (const c of list) {
      const g = owner.get(c);
      if (!g) { out.push(c); continue; }
      if (done.has(g)) continue;
      done.add(g);
      out.push(mergeGroup(g, cc));
    }
    return out;
  }

  /** Merge every group whose members are exact copies. Returns { list, merged }. */
  function autoMergeExact(list, cc) {
    const groups = findGroups(list, cc).filter(isExact);
    return { list: applyMerges(list, groups, cc), merged: groups.length, removed: groups.reduce((n, g) => n + g.length - 1, 0) };
  }

  /** Why two contacts matched, for the report ("phone +447700900123", "e-mail a@b.c", "name and organisation"). */
  function reasonsOf(group, cc) {
    const seen = new Map();
    for (const c of group) for (const k of new Set(keysOf(c, cc))) seen.set(k, (seen.get(k) || 0) + 1);
    const shared = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    const tr = (key, v) => (window.SlopI18n ? window.SlopI18n.t(key, v) : key);
    return [...new Set(shared.map((k) => (k.startsWith('p:') ? tr('contacts.dd.phone', { n: k.slice(2) }) : k.startsWith('e:') ? tr('contacts.dd.email', { value: k.slice(2) }) : tr('contacts.dd.name_org'))))];
  }

  SC.dedupe = { keysOf, findGroups, isExact, mergeGroup, applyMerges, autoMergeExact, reasonsOf };
})();
