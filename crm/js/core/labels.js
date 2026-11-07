// Groups and tags. A group is a named set (a customer can be in many). A tag is a coloured label with one definition,
// so renaming, recolouring, merging and deleting change the definition and the customers that hold it. The operations
// take a store transaction API (get, list, put, remove, each returning a Result), so the node test runs them on a copy.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const { ok, fail } = S.result;
  const MAX = { group: 60, tag: 40 };
  const COLOR_NAME = { blue: 'Blue', green: 'Green', amber: 'Amber', red: 'Red', violet: 'Violet', teal: 'Teal', pink: 'Pink', grey: 'Grey' };   // i18n-ignore: English colour names (NS.labels API); the page shows crm.col.<id>
  const KIND = { group: { store: 'customerGroups', field: 'groupIds', word: 'group' }, tag: { store: 'customerTags', field: 'tagIds', word: 'tag' } };

  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const same = (a, b) => norm(a).toLowerCase() === norm(b).toLowerCase();
  const live = (list) => list.filter((c) => !c.deletedAt);
  const swapId = (ids, from, to) => [...new Set((ids || []).map((x) => (x === from ? to : x)))];
  const withId = (ids, id) => [...new Set([...(ids || []), id])];
  const without = (ids, id) => (ids || []).filter((x) => x !== id);

  /** The message for a bad name, or null. `all` are the existing records of that kind; exceptId is the one being renamed. */
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  function nameError(kind, name, all, exceptId) {
    const n = norm(name);
    if (!n) return tr('crm.core.give_name');
    if (n.length > MAX[kind]) return tr('crm.core.name_n', { n: String(MAX[kind]) });
    const clash = all.find((x) => x.id !== exceptId && same(x.name, n));
    if (!clash) return null;
    return tr(kind === 'tag' ? 'crm.core.clash_tag' : 'crm.core.clash_group', { name: clash.name });
  }

  /** Customer changes that move every live customer from one tag to another. A customer with both gets it once. */
  function mergeChanges(customers, from, to) {
    return live(customers).filter((c) => (c.tagIds || []).includes(from))
      .map((c) => ({ id: c.id, changes: { tagIds: swapId(c.tagIds, from, to) } }));
  }

  /** How many live customers hold each label, as a Map of id to count. field is 'tagIds' or 'groupIds'. */
  function countsOf(customers, field) {
    const m = new Map();
    for (const c of live(customers)) for (const id of c[field] || []) m.set(id, (m.get(id) || 0) + 1);
    return m;
  }

  /** The customer fields after one label is added (on) or removed (off). */
  function membership(c, field, id, on) { return { [field]: on ? withId(c[field], id) : without(c[field], id) }; }

  const byName = (a, b) => norm(a.name).localeCompare(norm(b.name), undefined, { sensitivity: 'base' });

  /** Runs step over each item and stops at the first refusal. Resolves to ok(count). */
  async function each(items, step) {
    for (const x of items) { const r = await step(x); if (!r.ok) return r; }
    return ok(items.length);
  }

  /** The live label record of one kind, or a refusal. */
  async function findKind(api, kind, id) {
    const r = await api.get(KIND[kind].store, id);
    if (!r.ok) return r;
    return r.value && !r.value.deletedAt ? ok(r.value) : fail('not_found', tr(kind === 'tag' ? 'crm.core.gone_tag' : 'crm.core.gone_group'));
  }

  async function createLabel(api, kind, name, extra) {
    const all = await api.list(KIND[kind].store);
    if (!all.ok) return all;
    const err = nameError(kind, name, all.value);
    if (err) return fail('invalid', err);
    return api.put(KIND[kind].store, { ...extra, name: norm(name) });
  }

  async function renameLabel(api, kind, id, name) {
    const cur = await findKind(api, kind, id);
    if (!cur.ok) return cur;
    const all = await api.list(KIND[kind].store);
    if (!all.ok) return all;
    const err = nameError(kind, name, all.value, id);
    if (err) return fail('invalid', err);
    return api.put(KIND[kind].store, { ...cur.value, name: norm(name) });
  }

  /** Removes a label and takes it off every live customer that holds it. */
  async function deleteLabel(api, kind, id) {
    const cur = await findKind(api, kind, id);
    if (!cur.ok) return cur;
    const cs = await api.list('customers');
    if (!cs.ok) return cs;
    const f = KIND[kind].field;
    const holders = cs.value.filter((c) => (c[f] || []).includes(id));
    const put = await each(holders, (c) => api.put('customers', { ...c, ...membership(c, f, id, false) }));
    if (!put.ok) return put;
    return api.remove(KIND[kind].store, id);
  }

  /** Adds or removes one label on several customers. Customers that already match are left alone. */
  async function setMembers(api, kind, customerIds, labelId, on) {
    const f = KIND[kind].field;
    const lab = await findKind(api, kind, labelId);
    if (!lab.ok) return lab;
    return each(customerIds, async (id) => {
      const r = await api.get('customers', id);
      if (!r.ok) return r;
      const c = r.value;
      if (!c || c.deletedAt) return ok(false);
      const next = membership(c, f, labelId, on)[f];
      if (JSON.stringify(next) === JSON.stringify(c[f] || [])) return ok(false);
      return api.put('customers', { ...c, [f]: next });
    });
  }

  /** Merges tag `from` into tag `to`: customers move across (once each), then `from` is removed. */
  async function mergeTags(api, from, to) {
    if (from === to) return fail('invalid', tr('crm.core.other_tag'));
    const a = await findKind(api, 'tag', from);
    if (!a.ok) return a;
    const b = await findKind(api, 'tag', to);
    if (!b.ok) return b;
    const cs = await api.list('customers');
    if (!cs.ok) return cs;
    const moved = mergeChanges(cs.value, from, to);
    const put = await each(moved, ({ id, changes }) => api.put('customers', { ...cs.value.find((c) => c.id === id), ...changes }));
    if (!put.ok) return put;
    const rm = await api.remove('customerTags', from);
    if (!rm.ok) return rm;
    return ok({ moved: moved.length, into: b.value.name });
  }

  /** Transaction operations on a store API. Each one is all-or-nothing when run through the browser store. */
  const ops = {
    createGroup: (api, name) => createLabel(api, 'group', name, {}),
    renameGroup: (api, id, name) => renameLabel(api, 'group', id, name),
    deleteGroup: (api, id) => deleteLabel(api, 'group', id),
    createTag: (api, name, color) => createLabel(api, 'tag', name, { color: color || 'blue' }),
    renameTag: (api, id, name) => renameLabel(api, 'tag', id, name),
    recolourTag: async (api, id, color) => {
      const cur = await findKind(api, 'tag', id);
      return cur.ok ? api.put('customerTags', { ...cur.value, color }) : cur;
    },
    mergeTags,
    deleteTag: (api, id) => deleteLabel(api, 'tag', id),
    setMembers,
  };

  /** Groups and tags, each sorted by name. */
  async function load() {
    const [gr, tr] = await Promise.all([S.store.list('customerGroups'), S.store.list('customerTags')]);
    if (!gr.ok) return gr;
    if (!tr.ok) return tr;
    return ok({ groups: gr.value.slice().sort(byName), tags: tr.value.slice().sort(byName) });
  }

  const tx = (fn) => S.store.transact(fn);
  NS.labels = {
    COLOR_NAME, MAX, norm, nameError, mergeChanges, countsOf, membership, swapId, withId, without, ops, load,
    createGroup: (name) => tx((api) => ops.createGroup(api, name)),
    renameGroup: (id, name) => tx((api) => ops.renameGroup(api, id, name)),
    deleteGroup: (id) => tx((api) => ops.deleteGroup(api, id)),
    createTag: (name, color) => tx((api) => ops.createTag(api, name, color)),
    renameTag: (id, name) => tx((api) => ops.renameTag(api, id, name)),
    recolourTag: (id, color) => tx((api) => ops.recolourTag(api, id, color)),
    mergeTags: (from, to) => tx((api) => ops.mergeTags(api, from, to)),
    deleteTag: (id) => tx((api) => ops.deleteTag(api, id)),
    setMembers: (ids, kind, labelId, on) => tx((api) => ops.setMembers(api, kind, ids, labelId, on)),
    /** Adds or removes one label on one customer record, as a normal customer save. kind is 'group' or 'tag'. */
    setOnCustomer: (c, kind, labelId, on) => NS.customers.save(c.id, membership(c, KIND[kind].field, labelId, on)),
  };
})(typeof window !== 'undefined' ? window : globalThis);
