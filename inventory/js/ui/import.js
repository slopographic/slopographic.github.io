// Data actions: import products from CSV (preview and validation report, then all or nothing), export the product
// list, download a full backup, and restore a backup through the validated import.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInv = g.SlopInv || {});
  const U = NS.util;
  const UI = g.SlopUI;
  const { h } = U;
  const $ = (id) => document.getElementById(id);
  const stamp = () => new Date().toISOString().slice(0, 10);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** Plain sentence for one row of the report. */
  function rowText(l) {
    if (l.action === 'error') return l.errors.map((e) => `${e.field === 'sku' ? 'SKU' : e.field} ${e.message}`).join('; ');
    return l.action === 'new' ? t('inventory.im.new') : t('inventory.im.update');
  }

  /** Dialog: pick a CSV, see the plan, import only when it is clean. */
  function openImport() {
    const report = h('div', { class: 'report-box', 'aria-live': 'polite' });
    // the CSV comes in one way: the intake's part 'inventory.csv' (shared/intake), from this button
    const file = h('button', { type: 'button', class: 'btn', text: t('inventory.im.choose'), onclick: () => g.SlopIntake.pick({ to: 'inventory.csv', multiple: false, accept: '.csv,text/csv' }) });
    let plan = null;
    const apply = async () => {
      if (!plan || !plan.ok) return false;
      const r = await NS.importer.applyImport(plan);
      if (!r.ok) { report.append(h('p', { class: 'form-error', text: U.refusal(r) })); return false; }
      UI.toast(t('inventory.im.imported', { what: t('inventory.pr.products', { n: r.value }) }));
      NS.app.refresh();
      return true;
    };
    g.SlopIntake.register({ id: 'inventory.csv', main: false, paste: false, toast: false, limit: 1, accept: { types: ['text/csv', 'text/plain', 'application/vnd.ms-excel'], exts: ['.csv'], noun: 'inventory.im.noun' },
      process: async (f) => {
        const text = await f.text();
        const cur = await S.store.list('products');
        const st = await U.settings();
        plan = NS.importer.planImport(text, cur.ok ? cur.value : [], st);
        report.replaceChildren(...planView(plan, f.name));
        return f.name;
      } });
    UI.dialog({
      title: t('inventory.im.title'),
      cls: 'wide',
      body: h('div', { class: 'import' },
        h('p', { class: 'note', text: t('inventory.im.note') }),
        h('p', { class: 'note', text: SlopExamples.info('inventory').note }),
        h('button', { type: 'button', class: 'btn', text: t('inventory.im.example'), onclick: () => SlopExamples.download('inventory') }),
        file, report),
      buttons: [{ label: t('inventory.im.cancel') }, { label: t('inventory.im.all'), primary: true, act: apply }],
    });
  }

  /** The preview: counts, a line for each row, and the errors with their line numbers. */
  function planView(plan, name) {
    const head = h('p', { class: plan.ok ? 'ok-line' : 'form-error', text: plan.ok
      ? t('inventory.im.ready', { file: name, n: plan.newCount, u: plan.updateCount })
      : t('inventory.im.bad', { file: name, n: plan.badRows || 0 }) });
    const out = [head];
    for (const m of plan.headerErrors) out.push(h('p', { class: 'form-error', text: t('inventory.im.header', { m }) }));
    if (plan.lines.length) {
      out.push(h('ul', { class: 'report' }, plan.lines.slice(0, 300).map((l) => h('li', { class: `rep-${l.action}` },
        h('b', { text: t('inventory.im.line', { n: l.line, sku: l.sku || t('inventory.im.no_sku') }) }), ` ${l.name || ''} — `, h('span', { text: rowText(l) })))));
        if (plan.lines.length > 300) out.push(h('p', { class: 'note', text: t('inventory.im.first', { n: plan.lines.length }) }));
    }
    return out;
  }

  /** Downloads the product list (with on hand) as CSV. */
  async function exportCsv() {
    const r = await NS.rows.stockRows();
    if (!r.ok) { UI.alert(t('inventory.im.failed'), U.refusal(r)); return; }
    const st = await U.settings();
    const text = NS.csv.build(NS.importer.exportRows(r.value, st));
    UI.download(new Blob([text], { type: 'text/csv' }), `slop-inventory-products-${stamp()}.csv`);
    UI.toast(t('inventory.im.exported', { what: t('inventory.pr.products', { n: r.value.length }) }));
  }

  function mount() {
    $('dImport').addEventListener('click', openImport);
    $('dExport').addEventListener('click', exportCsv);
    g.SlopBiz.backup.mount({ done: () => NS.app.refresh() });   // full backup and restore (shared/biz/backup.js)
  }

  NS.dataActions = { openImport, exportCsv, backup: () => g.SlopBiz.backup.backup(), restore: (f) => g.SlopBiz.backup.restore(f) };
  NS.views = NS.views || {};
  NS.views.data = { mount, refresh: () => {}, onShow: () => {} };
})(typeof window !== 'undefined' ? window : globalThis);
