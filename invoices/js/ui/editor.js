// The invoice editor: the shared document editor (shared/docs/doc-editor.js) with what is the invoice's own: the due date,
// payments and balance, the top bar's number and status, the link to its order, and the actions its status allows. A draft
// is editable and can be issued or deleted; an issued invoice is read only, and payments and void go through billing.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const U = NS.util;
  const M = g.SlopDocs.model;
  const UI = g.SlopUI;
  const h = U.h;
  const $ = (id) => document.getElementById(id);
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  let ed = null;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const METHOD = () => ({ bank: t('invoices.pay.bank'), cash: t('invoices.pay.cash'), card: t('invoices.pay.card'), other: t('invoices.pay.other') });

  /** The status words: an issued invoice with nothing left to pay reads Paid. */
  const statusText = (st) => U.statusWord(st.status, st.balance);

  const extra = {
    blank: (st, s) => Object.assign(st, { dueDate: M.addDays(st.date, s.paymentTermsDays), orderId: null, payments: [], credits: [], paid: 0, balance: 0 }),
    /** The due date and order link from the record; the payments and balance from billing (NS.context). */
    async apply(st, rec) {
      Object.assign(st, { dueDate: rec.dueDate || '', orderId: rec.orderId || null, payments: [], credits: [], paid: 0, balance: 0 });
      const c = await NS.context.load(rec.id);
      if (c.ok) Object.assign(st, { payments: c.value.payments, credits: c.value.credits, paid: c.value.paid, balance: c.value.balance });
    },
    fieldError: (name, st) => (name !== 'dueDate' ? undefined : !st.dueDate || DATE.test(st.dueDate) ? null : t('invoices.ed.due_error')),
    collect: (st) => (st.dueDate && !DATE.test(st.dueDate) ? { error: t('invoices.ed.due_error') } : { dueDate: st.dueDate || undefined }),
    paint(st, ro) {
      document.querySelector('.app').dataset.docStatus = st.status;
      $('eDue').value = st.dueDate;
      $('eDue').disabled = ro;
      $('eBalance').textContent = st.status === 'issued' ? t('invoices.ed.balance', { amount: U.money(st.balance, st.currency, st.locale) }) : '';
      $('eOrder').replaceChildren(...(st.orderId ? [t('invoices.ed.from_order') + ' ', h('a', { href: `../orders/#o/${st.orderId}`, text: t('invoices.ed.open_order') })] : []));
      const box = $('ePayments');
      if (!st.payments.length) box.replaceChildren(h('p', { class: 'note', text: st.status === 'issued' ? t('invoices.ed.no_payments') : '' }));
      else box.replaceChildren(h('ul', { class: 'report' }, st.payments.map((p) => h('li', { text: `${p.date} · ${METHOD()[p.method] || p.method} · ${U.money(p.amount, st.currency, st.locale)}${p.note ? ` · ${p.note}` : ''}` }))));
      const m = (v) => U.money(v, st.currency, st.locale);
      $('eCredits').replaceChildren(...(st.credits || []).map((c) => h('li', null, h('a', { href: `#c/${c.id}`, text: c.number }),
        ` · ${c.date} · ${m(c.amount)}${c.refund ? ' ' + t('invoices.ed.paid_back', { amount: m(c.refund) }) : ''}${c.reason ? ` · ${c.reason}` : ''}`)));
      $('eCreditsHead').hidden = !(st.credits || []).length;
    },
    mount(st, edited) { $('eDue').addEventListener('input', (e) => { st.dueDate = e.target.value; edited(); }); },
  };

  function actions(st) {
    const b = (label, fn, cls = 'btn', disabled = false, title) => h('button', { type: 'button', class: cls, text: label, onclick: fn, disabled, title });
    const out = [];
    if (ed.isNew()) out.push(b(t('invoices.ed.sample'), () => NS.sampleActions.quick()));
    if (st.status === 'draft') {
      out.push(b(t(ed.isNew() ? 'invoices.ed.save_draft' : 'invoices.ed.save'), () => ed.save()), b(t('invoices.ed.issue'), issue, 'btn primary'));   // i18n-ignore: CSS class names
      if (!ed.isNew()) out.push(b(t('invoices.ed.delete'), removeDraft, 'btn danger'));   // i18n-ignore: CSS class names
    }
    if (st.status === 'issued') {
      out.push(b(t('invoices.ed.payment'), () => NS.paymentDialog.open(st.id, ed.reload), 'btn primary'));   // i18n-ignore: CSS class names
      out.push(b(t('invoices.ed.void'), voidInvoice, 'btn danger', st.payments.length > 0 || st.credits.length > 0, t(st.payments.length || st.credits.length ? 'invoices.ed.void_no' : 'invoices.ed.void_tip')));   // i18n-ignore: CSS class names
    }
    if (st.status === 'issued' || st.status === 'paid') out.push(b(t('invoices.ed.credit'), () => NS.creditDialog.open(st.id, ed.reload), 'btn', false, t('invoices.ed.credit_tip')));
    if (!ed.isNew() && st.status !== 'void') out.push(b(t('invoices.ed.repeat'), () => NS.repeatDialog.open(st.id, () => NS.app.go('repeat'))));
    if (!ed.isNew()) out.push(b(t('invoices.ed.preview'), preview), b(t('invoices.ed.pdf'), () => saveThen(() => NS.preview.pdf(st.id))));
    const closed = { paid: t('invoices.ed.closed_paid'), void: t('invoices.ed.closed_void'), credited: t('invoices.ed.closed_credited') };
    if (closed[st.status]) out.push(h('p', { class: 'note', text: closed[st.status] }));
    return out;
  }

  /** Runs fn after saving when there are changes or the invoice is new (a save in flight is waited for first). */
  async function saveThen(fn) { return (await ed.saveIfNeeded()) ? fn() : undefined; }

  /** Asks, runs one billing step on the saved invoice, reloads it, and says what happened (or why not). */
  async function step(question, run, failTitle, done) {
    if (question && !(await UI.confirm(...question))) return;
    await saveThen(async () => {
      const r = await run(ed.id());
      if (!r.ok) { UI.alert(failTitle, U.refusal(r)); return; }
      await ed.reload();
      UI.toast(done(ed.live().number));
    });
  }

  const issue = () => step([t('invoices.ed.issue_q'), t('invoices.ed.issue_body'), t('invoices.ed.issue_ok')],
    NS.invoices.issue, t('invoices.ed.not_issued'), (n) => t('invoices.ed.issued', { number: n }));
  const voidInvoice = () => step([t('invoices.ed.void_q'), t('invoices.ed.void_body', { number: ed.live().number }), t('invoices.ed.void_ok'), { danger: true }],
    NS.invoices.voidInvoice, t('invoices.ed.not_voided'), (n) => t('invoices.li.voided', { number: n }));

  async function removeDraft() {
    if (!(await UI.confirm(t('invoices.ed.del_q'), t('invoices.ed.del_body'), t('invoices.ed.del_ok'), { danger: true }))) return;
    const r = await NS.invoices.removeDraft(ed.id());
    if (!r.ok) { UI.alert(t('invoices.ed.not_deleted'), U.refusal(r)); return; }
    ed.clean();
    NS.app.go('list');
  }

  const preview = () => saveThen(() => NS.app.go(`p/${ed.id()}`));

  /** The stored invoice alone (NS.invoices.get also gives its payments and customer); null when it is gone. */
  async function invoiceOnly(id) {
    const r = await NS.invoices.get(id);
    return r.ok ? S.result.ok(r.value ? r.value.invoice : null) : r;
  }

  ed = g.SlopDocs.docEditor.create({
    ns: NS, noun: 'invoice', title: () => t('invoices.ed.new'), route: 'i',
    data: { get: invoiceOnly, save: (f) => NS.invoices.saveDraft(f), customers: () => NS.invoices.customers(), products: () => NS.invoices.products() },
    statusLabel: () => new Proxy({}, { get: (o, s) => g.SlopBiz.statusText(s) }), statusText, locked: (st) => st.status !== 'draft',
    heading: (st) => (st.id ? st.number || t('invoices.ed.draft_invoice') : t('invoices.ed.new')), savedText: () => t('invoices.ed.saved'),
    dateError: () => t('invoices.ed.date_error'), extra, actions,
  });

  NS.editor = Object.assign(ed, {
    issue, voidInvoice, removeDraft, preview,
    state: () => { const st = ed.live(); return { open: !!st.id || st.lines.length > 0, status: st.status, payments: st.payments.length, dirty: st.dirty, isNew: ed.isNew() }; },
  });
  NS.views = NS.views || {};
  NS.views.edit = { mount: ed.mount, refresh: () => {}, onShow: (id) => ed.open(id || null) };
})(typeof window !== 'undefined' ? window : globalThis);
