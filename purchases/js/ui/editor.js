// The purchase order editor: the shared document editor (shared/docs/doc-editor.js, its party a supplier) with what is the
// purchase order's own: the expected date, the link to the bill, and the actions its status allows (place the order,
// receive it into stock, record the supplier's bill as an expense, cancel).
(function (g) {
  'use strict';
  const NS = (g.SlopPurchases = g.SlopPurchases || {});
  const U = NS.util;
  const UI = g.SlopUI;
  const S = g.SlopData;
  const h = U.h;
  const $ = (id) => document.getElementById(id);
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const METHODS = ['bank', 'card', 'cash', 'other'];   // their words: purchases.ed.<id>
  let ed = null;

  const extra = {
    blank: (st) => Object.assign(st, { expectedDate: '', expenseId: null, receivedAt: '' }),
    apply: (st, rec) => Object.assign(st, { expectedDate: rec.expectedDate || '', expenseId: rec.expenseId || null, receivedAt: rec.receivedAt || '' }),
    fieldError: (name, st) => (name !== 'expectedDate' ? undefined : !st.expectedDate || DATE.test(st.expectedDate) ? null : t('purchases.ed.bad_expected')),
    collect(st) {
      if (st.expectedDate && !DATE.test(st.expectedDate)) return { error: t('purchases.ed.bad_expected') };
      if (st.expectedDate && st.expectedDate < st.date) return { error: t('purchases.ed.expected_before') };
      return { expectedDate: st.expectedDate || '' };
    },
    paint(st, ro) {
      $('eExpected').value = st.expectedDate || '';
      $('eExpected').disabled = ro;
      const box = $('eLinks');
      box.replaceChildren();
      if (st.receivedAt) box.append(t('purchases.ed.received_at', { date: st.receivedAt }) + ' ');
      if (st.expenseId) box.append(t('purchases.ed.bill') + ' ', h('a', { href: `../expenses/#e/${st.expenseId}`, text: t('purchases.ed.bill_link') }));
    },
    mount(st, edited) { $('eExpected').addEventListener('input', (e) => { st.expectedDate = e.target.value; edited(); }); },
  };

  function actions(st) {
    const b = (label, fn, cls = 'btn') => h('button', { type: 'button', class: cls, text: label, onclick: fn });
    const out = [];
    if (!ed.isNew()) out.push(b(t('purchases.ed.pdf'), ed.exportPdf));
    if (st.status === 'draft') out.push(b(t(ed.isNew() ? 'purchases.ed.save_draft' : 'purchases.ed.save'), () => ed.save()), b(t('purchases.ed.place'), place, 'btn primary'));   // i18n-ignore: class names and the noun id
    if (st.status === 'ordered') out.push(b(t('purchases.ed.save_changes'), () => ed.save()), b(t('purchases.ed.receive'), receive, 'btn primary'));   // i18n-ignore: class names and the noun id
    if ((st.status === 'ordered' || st.status === 'received') && !st.expenseId && !ed.isNew()) out.push(b(t('purchases.ed.record_bill'), bill, st.status === 'received' ? 'btn primary' : 'btn'));   // i18n-ignore: class names and the noun id
    if ((st.status === 'draft' || st.status === 'ordered') && !ed.isNew()) out.push(b(t('purchases.ed.cancel'), cancel, 'btn danger'));   // i18n-ignore: class names and the noun id
    if (st.status === 'received') out.push(h('p', { class: 'note', text: t(st.expenseId ? 'purchases.ed.billed_note' : 'purchases.ed.received_note') }));
    if (st.status === 'cancelled') out.push(h('p', { class: 'note', text: t('purchases.ed.cancelled_note') }));
    return out;
  }

  /** Saves first, runs one step on the saved order, reloads it, and says what happened (or why not). */
  async function act(run, done) {
    if (!(await ed.saveIfNeeded())) return;
    const r = await run(ed.id());
    if (!r.ok) { UI.alert(t('purchases.ed.not_done'), U.refusal(r)); return; }
    await ed.reload();
    const text = done(ed.live().number);
    ed.setMsg(text);
    UI.toast(text);
  }

  const place = () => act((id) => NS.purchases.setStatus(id, 'ordered'), (n) => t('purchases.ed.ordered', { number: n }));

  async function receive() {
    const n = ed.live().lines.filter((l) => l.productId).length;
    const yes = await UI.confirm(t('purchases.ed.receive_q'), n ? t('purchases.ed.receive_body', { number: ed.live().number, n }) : t('purchases.ed.receive_none', { number: ed.live().number }), t('purchases.ed.receive_ok'));
    if (yes) await act((id) => NS.purchases.receive(id), (num) => t('purchases.ed.received', { number: num }));
  }

  async function cancel() {
    const yes = await UI.confirm(t('purchases.ed.cancel_q'), t('purchases.ed.cancel_body', { number: ed.live().number }), t('purchases.ed.cancel_q'), { danger: true });
    if (yes) await act((id) => NS.purchases.setStatus(id, 'cancelled'), (num) => t('purchases.ed.cancelled', { number: num }));
  }

  /** Dialog: the bill's date, expense category and how it was paid; records it as a posted expense. */
  async function bill() {
    if (!(await ed.saveIfNeeded())) return;
    const accts = await g.SlopBiz.expenseAccounts();
    const date = h('input', { type: 'date', value: S.ledger.today() });
    const account = UI.select(accts.map((a) => [a.code, `${a.code} ${a.name}`]), accts[0] && accts[0].code);
    const method = UI.select(METHODS.map((m) => [m, t('purchases.ed.' + m)]), 'bank');
    const st = ed.live();
    UI.dialog({
      title: t('purchases.ed.bill_title'),
      body: h('div', null, h('p', { class: 'note', text: t('purchases.ed.bill_body', { number: st.number, amount: U.money(g.SlopDocs.model.totals(st.lines).total, st.currency, st.locale) }) }),
        UI.field(t('purchases.ed.date'), date), UI.field(t('purchases.ed.category'), account), UI.field(t('purchases.ed.paid_by'), method)),
      buttons: [{ label: t('menu.cancel') }, { label: t('purchases.ed.record'), primary: true,
        act: async () => { await act((id) => NS.purchases.recordBill(id, { date: date.value, account: account.value, method: method.value }), (n) => t('purchases.ed.recorded', { number: n })); } }],
    });
  }

  ed = g.SlopDocs.docEditor.create({
    ns: NS, noun: 'purchase order', title: () => t('purchases.ed.new'), route: 'po', party: 'supplier',   // i18n-ignore: class names and the noun id
    data: { get: (id) => NS.purchases.get(id), save: (f) => NS.purchases.save(f), customers: () => NS.purchases.suppliers(), products: () => NS.purchases.products() },
    statusLabel: () => new Proxy({}, { get: (o, s) => g.SlopBiz.statusText(s) }), locked: (st) => st.status === 'received' || st.status === 'cancelled',
    dateError: () => t('purchases.ed.date_error'), extra, actions,
  });

  NS.editor = Object.assign(ed, {
    place, receive, bill, cancel,
    state: () => { const st = ed.live(); return { open: !!st.id || st.lines.length > 0, status: st.status, billed: !!st.expenseId, dirty: st.dirty, isNew: ed.isNew() }; },
  });
  NS.views = NS.views || {};
  NS.views.edit = { mount: ed.mount, refresh: () => {}, onShow: (id, opts) => (opts && opts.reorder ? NS.reorder.open(opts.reorder) : ed.open(id || null)) };
})(typeof window !== 'undefined' ? window : globalThis);
