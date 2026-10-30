// Slop CRM model: groups and tags (rename, merge, delete, membership, counts), the list filter and sort, and the
// customer form fields (mapping and validation). The classic scripts run in one vm context against an in-memory copy
// of the store API that validates with the real schema. Run: node tests/run.mjs crm
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const PIN = "window.SlopI18n = window.SlopI18n.create({ defaultLang: 'en', profile: null });";   // English in any build (a white-label build may choose another language first)

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = ['money.js', 'barcode.js', 'schema-checks.js', 'schema-defs.js', 'schema.js'].map((f) => path.join(ROOT, 'shared', 'data', f));
const BIZ = [path.join(ROOT, 'shared', 'biz', 'biz.js')];
const CRM = ['util.js', 'notes.js', 'labels.js', 'customer-fields.js', 'query.js'].map((f) => path.join(ROOT, 'crm', 'js', 'core', f));
// SlopI18n with the English tables (crm/i18n/en, shared/biz/i18n/en), so messages read as on the page
const I18N = [path.join(ROOT, 'shared', 'i18n', 'i18n.js'), path.join(ROOT, 'shared', 'biz', 'i18n', 'en', 'biz.js'),
  ...['en.js', 'en/data.js', 'en/data2.js'].map((p) => path.join(ROOT, 'shared', 'i18n', 'ui', p)),   // the records' messages
  ...['page', 'views', 'forms'].map((p) => path.join(ROOT, 'crm', 'i18n', 'en', p + '.js'))];
const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of [...I18N, ...DATA, ...BIZ, ...CRM]) { vm.runInContext(await readFile(f, 'utf8'), ctx, { filename: path.basename(f) }); if (f === I18N[0]) vm.runInContext(PIN, ctx); }
const D = ctx.SlopData, NS = ctx.SlopCrm;
const plain = (v) => JSON.parse(JSON.stringify(v));
const deq = (a, b) => assert.deepEqual(plain(a), plain(b));

/** An in-memory store API with the same calls as the transaction API in shared/data/store.js. */
function memApi() {
  const tables = { customers: new Map(), customerGroups: new Map(), customerTags: new Map() };
  let n = 0;
  const table = (name) => { if (!tables[name]) throw new Error(`no table ${name}`); return tables[name]; };
  const api = {
    tables,
    async get(name, key) { return D.result.ok(table(name).get(key) ?? null); },
    async list(name) { return D.result.ok([...table(name).values()].filter((r) => !r.deletedAt)); },
    async put(name, rec) {
      const d = D.schema.def(name);
      const key = rec[d.key] || `id-${++n}`;
      const prev = table(name).get(key);
      const first = D.schema.prepare(name, { ...rec, [d.key]: key });
      if (!first.ok) return D.result.fail('invalid', D.schema.errorText(first.errors), { errors: first.errors });
      const out = { ...first.value, [d.key]: key, createdAt: 1, updatedAt: prev ? prev.updatedAt + 1 : 1, version: prev ? prev.version + 1 : 1 };
      table(name).set(key, out);
      return D.result.ok(out);
    },
    async remove(name, key) { table(name).delete(key); return D.result.ok(true); },
  };
  return api;
}
const ok = (r) => { assert.equal(r.ok, true, r.message); return r.value; };
const refused = (r, text) => { assert.equal(r.ok, false); assert.match(r.message, text); };
const cust = async (api, name, extra = {}) => ok(await api.put('customers', { name, stage: 'lead', ...extra }));
const byName = (list) => list.map((c) => c.name).sort();

test('group names: unique without regard to case, renamed in place, bounded', async () => {
  const api = memApi();
  const vip = ok(await NS.labels.ops.createGroup(api, '  VIP  '));
  assert.equal(vip.name, 'VIP');
  refused(await NS.labels.ops.createGroup(api, 'vip'), /already a group/);
  const wh = ok(await NS.labels.ops.createGroup(api, 'Wholesale'));
  refused(await NS.labels.ops.renameGroup(api, wh.id, 'vip'), /already a group/);
  refused(await NS.labels.ops.renameGroup(api, wh.id, '   '), /Give it a name/);
  refused(await NS.labels.ops.createGroup(api, 'x'.repeat(61)), /Keep the name to 60/);
  ok(await NS.labels.ops.renameGroup(api, wh.id, 'WHOLESALE'));   // its own name, other case: allowed
  assert.equal(api.tables.customerGroups.get(wh.id).name, 'WHOLESALE');
  assert.equal(api.tables.customerGroups.get(wh.id).id, wh.id);
  refused(await NS.labels.ops.renameGroup(api, 'missing', 'Nope'), /no longer exists/);
});

test('membership is many to many: counts follow adds and removes, and adding twice adds once', async () => {
  const api = memApi();
  const ada = await cust(api, 'Ada'), ben = await cust(api, 'Ben'), cy = await cust(api, 'Cy');
  const w = ok(await NS.labels.ops.createGroup(api, 'Wholesale')), v = ok(await NS.labels.ops.createGroup(api, 'VIP'));
  ok(await NS.labels.ops.setMembers(api, 'group', [ada.id, ben.id], w.id, true));
  ok(await NS.labels.ops.setMembers(api, 'group', [ada.id, ben.id], w.id, true));
  ok(await NS.labels.ops.setMembers(api, 'group', [ada.id], v.id, true));
  const list = ok(await api.list('customers'));
  deq(api.tables.customers.get(ada.id).groupIds, [w.id, v.id]);
  deq(api.tables.customers.get(ben.id).groupIds, [w.id]);
  const counts = NS.labels.countsOf(list, 'groupIds');
  assert.equal(counts.get(w.id), 2);
  assert.equal(counts.get(v.id), 1);
  ok(await NS.labels.ops.setMembers(api, 'group', [ben.id, cy.id], w.id, false));
  deq(api.tables.customers.get(ben.id).groupIds, []);
  assert.equal(NS.labels.countsOf(ok(await api.list('customers')), 'groupIds').get(w.id), 1);
  refused(await NS.labels.ops.setMembers(api, 'group', [ada.id], 'nope', true), /no longer exists/);
});

test('filter by group and by tag, combined with the search text and the stage', async () => {
  const api = memApi();
  const ada = await cust(api, 'Ada Mill', { stage: 'customer' }), ben = await cust(api, 'Ben Ort', { stage: 'lead' });
  const cy = await cust(api, 'Cy Vale', { stage: 'customer' });
  const w = ok(await NS.labels.ops.createGroup(api, 'Wholesale'));
  const hot = ok(await NS.labels.ops.createTag(api, 'Hot', 'red'));
  ok(await NS.labels.ops.setMembers(api, 'group', [ada.id, cy.id], w.id, true));
  ok(await NS.labels.ops.setMembers(api, 'tag', [ada.id, ben.id], hot.id, true));
  const all = ok(await api.list('customers'));
  deq(byName(NS.query.filter(all, { group: w.id })), ['Ada Mill', 'Cy Vale']);
  deq(byName(NS.query.filter(all, { tag: hot.id })), ['Ada Mill', 'Ben Ort']);
  deq(byName(NS.query.filter(all, { group: w.id, tag: hot.id })), ['Ada Mill']);
  deq(byName(NS.query.filter(all, { tag: hot.id, stage: 'lead' })), ['Ben Ort']);
  deq(byName(NS.query.filter(all, { group: w.id, q: 'vale' })), ['Cy Vale']);
  deq(byName(NS.query.filter(all, {})), ['Ada Mill', 'Ben Ort', 'Cy Vale']);
});

test('tags: recolour and rename keep the id; the name must be unique', async () => {
  const api = memApi();
  const t = ok(await NS.labels.ops.createTag(api, 'Hot', 'red'));
  assert.equal(t.color, 'red');
  ok(await NS.labels.ops.recolourTag(api, t.id, 'teal'));
  assert.equal(api.tables.customerTags.get(t.id).color, 'teal');
  const c = ok(await NS.labels.ops.createTag(api, 'Cold'));
  assert.equal(c.color, 'blue');
  refused(await NS.labels.ops.renameTag(api, t.id, ' cold '), /already a tag.*merge the two/);
  ok(await NS.labels.ops.renameTag(api, t.id, 'Warm'));
  assert.equal(api.tables.customerTags.get(t.id).name, 'Warm');
  assert.equal(api.tables.customerTags.get(t.id).color, 'teal');
  refused(await NS.labels.ops.createTag(api, 'Bad', 'purple'), /must be one of/);
});

test('merge moves customers across once each, then removes the old tag', async () => {
  const api = memApi();
  const ada = await cust(api, 'Ada'), ben = await cust(api, 'Ben'), cy = await cust(api, 'Cy');
  const hot = ok(await NS.labels.ops.createTag(api, 'Hot', 'red'));
  const cold = ok(await NS.labels.ops.createTag(api, 'Cold', 'blue'));
  ok(await NS.labels.ops.setMembers(api, 'tag', [ada.id, ben.id], hot.id, true));
  ok(await NS.labels.ops.setMembers(api, 'tag', [ada.id, cy.id], cold.id, true));
  const plan = NS.labels.mergeChanges(ok(await api.list('customers')), hot.id, cold.id);
  deq(plan.map((p) => p.id).sort(), [ada.id, ben.id].sort());
  const res = ok(await NS.labels.ops.mergeTags(api, hot.id, cold.id));
  deq(plain(res), { moved: 2, into: 'Cold' });
  deq(api.tables.customers.get(ada.id).tagIds, [cold.id]);
  deq(api.tables.customers.get(ben.id).tagIds, [cold.id]);
  deq(api.tables.customers.get(cy.id).tagIds, [cold.id]);
  assert.equal(api.tables.customerTags.has(hot.id), false);
  assert.equal(NS.labels.countsOf(ok(await api.list('customers')), 'tagIds').get(cold.id), 3);
  refused(await NS.labels.ops.mergeTags(api, cold.id, cold.id), /different tag/);
  refused(await NS.labels.ops.mergeTags(api, hot.id, cold.id), /no longer exists/);
});

test('delete takes a tag or group off every customer, and a merged-away tag leaves no ids behind', async () => {
  const api = memApi();
  const ada = await cust(api, 'Ada'), ben = await cust(api, 'Ben');
  const t = ok(await NS.labels.ops.createTag(api, 'Hot'));
  const gr = ok(await NS.labels.ops.createGroup(api, 'Wholesale'));
  ok(await NS.labels.ops.setMembers(api, 'tag', [ada.id, ben.id], t.id, true));
  ok(await NS.labels.ops.setMembers(api, 'group', [ada.id], gr.id, true));
  ok(await NS.labels.ops.deleteTag(api, t.id));
  ok(await NS.labels.ops.deleteGroup(api, gr.id));
  deq(api.tables.customers.get(ada.id).tagIds, []);
  deq(api.tables.customers.get(ben.id).tagIds, []);
  deq(api.tables.customers.get(ada.id).groupIds, []);
  assert.equal(api.tables.customerTags.size, 0);
  assert.equal(api.tables.customerGroups.size, 0);
});

test('sort by name, stage, last activity and follow-up; follow-up dates without a date go last', async () => {
  const list = [
    { name: 'Cy', stage: 'lost', updatedAt: 5, followUp: '2026-10-20', notes: '' },
    { name: 'Ada', stage: 'customer', updatedAt: 9, followUp: '', notes: '' },
    { name: 'ben', stage: 'lead', updatedAt: 1, followUp: '2026-10-01', notes: '[2026-11-02] Called' },
  ];
  const names = (l) => l.map((c) => c.name);
  deq(names(NS.query.sort(list, 'name', 'asc')), ['Ada', 'ben', 'Cy']);
  deq(names(NS.query.sort(list, 'name', 'desc')), ['Cy', 'ben', 'Ada']);
  deq(names(NS.query.sort(list, 'stage', 'asc')), ['ben', 'Ada', 'Cy']);
  deq(names(NS.query.sort(list, 'activity', 'desc')), ['ben', 'Ada', 'Cy']);
  assert.equal(NS.query.activityOf(list[2]), Date.parse('2026-11-02T00:00:00Z'));
  deq(names(NS.query.sort(list, 'followUp', 'asc')), ['ben', 'Cy', 'Ada']);
  deq(names(NS.query.sort(list, 'followUp', 'desc')), ['Cy', 'ben', 'Ada']);
});

test('customer fields: the first phone, email and address keep their labels; blank rows are dropped', () => {
  const v = NS.fields.toForm({ name: ' Ada ', phone: '555 0100', phoneLabel: 'work', phones: [{ label: 'home', value: '0700 9000' }],
    email: 'ada@example.com', emailLabel: 'personal', addresses: [{ label: 'home', value: '1 Mill Lane' }] });
  deq(v.phones, [{ label: 'work', value: '555 0100' }, { label: 'home', value: '0700 9000' }]);
  v.phones.push({ label: 'fax', value: '   ' });
  v.emails = [{ label: '', value: ' ada@example.com ' }, { label: 'work', value: '' }];
  const ch = NS.fields.toChanges(v);
  assert.equal(ch.name, 'Ada');
  assert.equal(ch.phone, '555 0100');
  assert.equal(ch.phoneLabel, 'work');
  deq(ch.phones, [{ label: 'home', value: '0700 9000' }]);
  assert.equal(ch.email, 'ada@example.com');
  assert.equal(ch.emailLabel, 'work');
  deq(ch.emails, []);
  // no main address was saved, so the first address row becomes the main one and the list is compacted
  assert.equal(ch.address, '1 Mill Lane');
  assert.equal(ch.addressLabel, 'home');
  deq(ch.addresses, []);
});

test('customer fields: validation names each bad field and passes a good form', () => {
  const good = NS.fields.toForm({ name: 'Ada', stage: 'lead' });
  deq(NS.fields.validate(good), {});
  const bad = { ...good, name: '  ', website: 'not a site!', followUp: '2026-02-30', notes: '',
    phones: [{ label: 'mobile', value: '12' }, { label: 'mobile', value: '+44 20 7946 0958' }],
    emails: [{ label: 'work', value: 'ada@' }] };
  deq(NS.fields.validate(bad), {
    name: 'Name is needed.',
    website: 'Use a web address such as example.com.',
    followUp: 'Use a real date, such as 2026-10-31.',
    'phone:0': 'Use 6 to 20 digits. Spaces, + ( ) and - are fine.',
    'email:0': 'That email does not look right, for example name@example.com.',
  });
  deq(NS.fields.validate({ ...good, website: 'example.com/shop', followUp: '2026-10-31' }), {});
});
