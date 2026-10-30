// Import from Slop Contacts: the newest saved list in Slop Drive is offered first, and Choose another list… is the one
// shared Slop Drive picker (SlopIntake.fromDrive, part 'crm.contacts'); see the plan (new, already linked, cannot be
// stored), then import. Linked contacts are skipped, so a second import adds nothing that is already here.
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const tr = (k, v) => NS.tr(k, v);   // the string tables (crm/i18n)

  /** The plan for the list the person picked: reads the file and checks it against the customers. */
  async function planFor(rec) {
    const parsed = await NS.contactsImport.readList(rec.blob);
    if (!parsed.ok) return parsed;
    const linked = await NS.customers.linkedContactIds();
    if (!linked.ok) return linked;
    return { ok: true, value: NS.contactsImport.plan(parsed.value, linked.value) };
  }

  /** Opens the import dialog, or says that there is no saved list yet. */
  async function open() {
    const lists = await NS.contactsImport.findLists();
    if (!lists.length) {
      UI.dialog({ title: tr('crm.im.title'), body: tr('crm.im.none'),
        buttons: [{ label: tr('menu.ok'), primary: true }] });
      return;
    }
    let current = lists[0];
    const name = el('b', null, current.name);
    const info = el('p', { class: 'note', role: 'status' });
    let plan = null;
    const show = async () => {
      name.textContent = current.name;
      const p = await planFor(current);
      plan = p.ok ? p.value : null;
      info.textContent = p.ok
        ? tr('crm.im.plan', { add: plan.add.length, n: plan.add.length, skipped: String(plan.skipped), invalid: String(plan.invalid) })
        : NS.util.refusal(p);
    };
    const SI = g.SlopIntake;
    const other = () => SI.fromDrive({ title: tr('crm.im.choose'), accept: ['application/x-slop-contacts', 'application/json'], to: SI.part({
      id: 'crm.contacts', limit: 1, accept: { types: ['application/x-slop-contacts', 'application/json'], exts: ['.scontacts', '.json'], get noun() { return tr('crm.im.noun'); } },
      process: async (f, ctx) => { current = ctx.drive ? Object.assign({}, ctx.drive.record, { blob: f }) : { name: f.name, blob: f }; await show(); return f.name; },
    }) });
    UI.dialog({
      title: tr('crm.im.title'),
      body: el('div', null, el('p', { class: 'note' }, tr('crm.im.saved_list') + ' ', name, ' ', el('button', { type: 'button', class: 'sui-btn', onclick: other }, tr('crm.im.another'))), info,
        el('p', { class: 'note' }, tr('crm.im.note')),
        el('p', { class: 'note' }, SlopExamples.info('crm').note),
        el('button', { type: 'button', class: 'sui-btn', onclick: () => SlopExamples.download('crm') }, tr('crm.im.example'))),
      buttons: [
        { label: tr('menu.cancel') },
        { label: tr('crm.im.import'), primary: true, act: async () => {
          if (!plan || !plan.add.length) { UI.toast(tr('crm.im.nothing')); return false; }
          const r = await NS.contactsImport.apply(plan);
          if (!r.ok) { UI.toast(NS.util.refusal(r)); return false; }
          UI.toast(tr('crm.im.imported', { n: r.value }));
          return true;
        } },
      ],
    });
    show();
  }

  NS.importUi = { open };
})(typeof window !== 'undefined' ? window : globalThis);
