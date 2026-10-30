// The Customers list as pure functions: filter by search, stage, category, tag and group, and sort by a column.
// The list reads customers from the store and calls these; the node test calls them directly.
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const DEFAULT_DIR = { name: 'asc', stage: 'asc', activity: 'desc', followUp: 'asc' };

  /** Milliseconds of the latest dated note on a customer (0 when none). */
  function latestNote(c) {
    let best = 0;
    for (const n of NS.notes.parse(c.notes)) if (n.date) best = Math.max(best, Date.parse(`${n.date}T00:00:00Z`) || 0);
    return best;
  }

  /** When the customer last had activity, in ms: the later of the last save and the latest dated note. */
  function activityOf(c) { return Math.max(Number(c.updatedAt) || 0, latestNote(c)); }

  /** Customers that match: f = { q, stage, cat, tag, group }. Empty values match everything. */
  function filter(list, f = {}) {
    const q = String(f.q || '').trim().toLowerCase();
    return list.filter((c) => (!f.stage || c.stage === f.stage)
      && (!f.cat || (c.categories || []).includes(f.cat))
      && (!f.tag || (c.tagIds || []).includes(f.tag))
      && (!f.group || (c.groupIds || []).includes(f.group))
      && (!q || [c.name, c.company, c.email, c.phone, c.address, ...(c.phones || []).map((p) => p.value), ...(c.emails || []).map((e) => e.value)]
        .some((v) => String(v || '').toLowerCase().includes(q))));
  }

  /** A sorted copy. Customers without a follow-up date always go last. Ties are broken by name. */
  function sort(list, key, dir) {
    const mul = dir === 'desc' ? -1 : 1;
    const name = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
    const cmp = {
      name,
      stage: (a, b) => NS.STAGES.indexOf(a.stage) - NS.STAGES.indexOf(b.stage),
      activity: (a, b) => activityOf(a) - activityOf(b),
      followUp: (a, b) => (a.followUp < b.followUp ? -1 : a.followUp > b.followUp ? 1 : 0),
    }[key] || name;
    return list.slice().sort((a, b) => {
      if (key === 'followUp' && (!a.followUp || !b.followUp)) return (!a.followUp) - (!b.followUp);
      return mul * cmp(a, b) || name(a, b);
    });
  }

  NS.query = { DEFAULT_DIR, latestNote, activityOf, filter, sort };
})(typeof window !== 'undefined' ? window : globalThis);
