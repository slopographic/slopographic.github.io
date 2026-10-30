// The sample buttons' behaviour, shared by Slop Invoices and Slop Orders: Random sample (one document, no dialog),
// Random samples… (SlopUI options dialog, with a progress bar for five or more) and Delete all samples (SlopUI.confirm).
// Each takes getIO(), an async function that returns the app's io (see samples-run.js). Classic script. Exposes
// SlopDocs.samples.quick, .options and .deleteAll.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopDocs = g.SlopDocs || {});
  const M = NS.model;
  const UI = g.SlopUI;
  const samples = (NS.samples = NS.samples || {});
  const PROGRESS_AT = 5;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const inv = (kind) => kind === 'invoice';
  const para = (text) => UI.el('p', { class: 'sui-p' }, text);
  const block = (lines) => UI.el('div', null, lines.map(para));

  /** Totals per currency for the summary, as text ("12.00 USD · 3.50 EUR"). */
  function totalsText(created, io) {
    const sums = new Map();
    for (const c of created) sums.set(c.currency, (sums.get(c.currency) || 0) + c.total);
    return [...sums].map(([cur, v]) => S.money.formatMinor(v, cur, io.locale)).join(' · ') || '0';
  }

  /** The summary lines after a batch: what was made, the totals, what was added to the catalogue, what was refused. */
  function summaryLines(kind, res, io) {
    const d = res.value;
    const n = d.created.length;
    const out = [t(inv(kind) ? 'biz.sm.created_inv' : 'biz.sm.created_ord', { n })];
    if (n) out.push(t('biz.sm.total', { amount: totalsText(d.created, io) }));
    out.push(t('biz.sm.added', { customers: String(d.newCustomers), products: String(d.newProducts) }));
    out.push(t('biz.sm.seed', { seed: String(d.seed) }));
    if (d.failed.length) out.push(t('biz.sm.failed', { n: String(d.failed.length), why: d.failed[0].message }));
    return out;
  }

  /** One sample document now, with the default options (a random seed, the last 90 days, the base currency). */
  async function quick({ kind, getIO, onDone }) {
    const io = await getIO();
    const res = await samples.run({ kind, count: 1, seed: samples.newSeed(), from: M.addDays(io.today, -90), to: io.today, currency: io.base, missing: { customers: true, products: true }, io });
    if (!res.ok) { UI.alert(t('biz.sm.not_created'), res.message); return null; }
    if (!res.value.created.length) { UI.alert(t('biz.sm.not_created'), res.value.failed[0].message); return null; }
    const made = res.value.created[0];
    UI.toast(t(inv(kind) ? 'biz.sm.one_inv' : 'biz.sm.one_ord', { number: made.number || '' }).trim());
    if (onDone) onDone(made);
    return made;
  }

  /** The options dialog: count, seed, currency, date range, and whether to create missing customers and products. */
  async function options({ kind, getIO, onDone }) {
    const io = await getIO();
    const currencies = [...new Set([io.base, ...(S.locale.currencies() || [])])];
    const count = UI.number(5, 1, samples.MAX_DOCS, 1);
    const seed = UI.el('input', { class: 'sui-input', type: 'text', maxlength: '40', placeholder: t('biz.sm.seed_ph'), autocomplete: 'off', spellcheck: 'false' });
    const cur = UI.select(currencies.map((c) => [c, c]), io.base);
    const from = UI.el('input', { class: 'sui-input', type: 'date', value: M.addDays(io.today, -90) });
    const to = UI.el('input', { class: 'sui-input', type: 'date', value: io.today });
    const mc = UI.check(t('biz.sm.missing_cust'), true);
    const mp = UI.check(t('biz.sm.missing_prod'), true);
    const note = UI.el('p', { class: 'sui-p', role: 'status' });
    const bar = UI.el('progress', { class: 'sample-progress', max: String(count.value), value: '0', hidden: true, 'aria-label': t('biz.sm.progress') });
    const body = UI.el('div', { class: 'sample-options' },
      UI.field(t('biz.sm.docs', { n: String(samples.MAX_DOCS) }), count),
      UI.field(t('biz.sm.seed_l'), seed, t('biz.sm.seed_hint')),
      UI.field(t('biz.sm.currency'), cur),
      UI.field(t('biz.sm.from'), from), UI.field(t('biz.sm.to'), to),
      mc.el, mp.el, note, bar);
    const dlg = UI.dialog({
      title: t(inv(kind) ? 'biz.sm.random_inv' : 'biz.sm.random_ord'), body,
      buttons: [{ label: t('menu.cancel') }, {
        label: t('biz.sm.create'), primary: true,
        act: async () => {
          const n = Number(count.value);
          const o = { kind, count: n, seed: samples.normalizeSeed(seed.value), from: from.value, to: to.value, currency: cur.value };
          const bad = samples.checkOptions(o);
          if (bad) { note.textContent = bad; return false; }
          if (n >= PROGRESS_AT) { bar.max = n; bar.value = 0; bar.hidden = false; }
          body.querySelectorAll('input, select').forEach((x) => { x.disabled = true; });
          note.textContent = t('biz.sm.creating', { n });
          const res = await samples.run({ ...o, missing: { customers: mc.input.checked, products: mp.input.checked }, io,
            onProgress: (done) => { bar.value = done; note.textContent = done < n ? t('biz.sm.creating_i', { i: String(done + 1), n: String(n) }) : t('biz.sm.done'); } });
          dlg.close(true);
          if (!res.ok) { UI.alert(t('biz.sm.not_created'), res.message); return false; }
          UI.alert(t('biz.sm.created'), block(summaryLines(kind, res, io)));
          if (onDone) onDone(res.value);
          return false;
        },
      }],
    });
  }

  /** Confirms, then removes every live sample of the kind (see samples-run.js removeSamples). */
  async function deleteAll({ kind, getIO, onDone }) {
    const text = t(inv(kind) ? 'biz.sm.del_inv' : 'biz.sm.del_ord');
    if (!(await UI.confirm(t('biz.sm.del_all'), text, t('biz.sm.del_all'), { danger: true }))) return;
    const io = await getIO();
    const res = await samples.removeSamples(io);
    if (!res.ok) { UI.alert(t('biz.sm.not_deleted'), res.message); return; }
    const v = res.value;
    const lines = [t(inv(kind) ? 'biz.sm.deleted_inv' : 'biz.sm.cancelled_ord', { n: v.documents, customers: String(v.customers), products: String(v.products) })];
    if (v.kept.length) lines.push(t('biz.sm.kept', { n: String(v.kept.length), list: v.kept.slice(0, 5).join('; ') }));
    UI.alert(t('biz.sm.deleted'), block(lines));
    if (onDone) onDone(v);
  }

  Object.assign(samples, { quick, options, deleteAll, summaryLines });
})(typeof window !== 'undefined' ? window : globalThis);
