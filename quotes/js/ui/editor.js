// The quote editor: the shared document editor (shared/docs/doc-editor.js) with what is the quote's own: the valid-until
// date, the links to the order or invoice made from it, and the actions its status allows (send, revise, accept, decline,
// reopen, make an order, make an invoice).
(function (g) {
  'use strict';
  const NS = (g.SlopQuotes = g.SlopQuotes || {});
  const U = NS.util;
  const UI = g.SlopUI;
  const S = g.SlopData;
  const M = g.SlopDocs.model;
  const h = U.h;
  const $ = (id) => document.getElementById(id);
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  let ed = null;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** The number of a linked document, or 'draft'; '' when it no longer exists. */
  async function numberOf(collection, id) {
    if (!id) return '';
    const r = await S.store.get(collection, id);
    return r.ok && r.value ? (r.value.number || t('quotes.ed.draft')) : '';
  }

  const extra = {
    blank: (st) => Object.assign(st, { validUntil: M.addDays(st.date, 30), orderId: null, invoiceId: null, orderNumber: '', invoiceNumber: '' }),
    async apply(st, rec) {
      Object.assign(st, { validUntil: rec.validUntil || '', orderId: rec.orderId || null, invoiceId: rec.invoiceId || null });
      st.orderNumber = await numberOf('orders', st.orderId);
      st.invoiceNumber = await numberOf('invoices', st.invoiceId);
    },
    collect(st) {
      if (st.validUntil && !DATE.test(st.validUntil)) return { error: t('quotes.ed.bad_valid') };
      if (st.validUntil && st.validUntil < st.date) return { error: t('quotes.ed.valid_before') };
      return { validUntil: st.validUntil || '' };
    },
    paint(st, ro) {
      $('eValid').value = st.validUntil || '';
      $('eValid').disabled = ro;
      const box = $('eLinks');
      box.replaceChildren();
      if (st.orderId) box.append(t('quotes.ed.order') + ' ', h('a', { href: `../orders/#o/${st.orderId}`, text: st.orderNumber || t('quotes.ed.draft') }));
      if (st.invoiceId) box.append(t('quotes.ed.invoice') + ' ', h('a', { href: `../invoices/#i/${st.invoiceId}`, text: st.invoiceNumber || t('quotes.ed.draft') }));
    },
    mount(st, edited) { $('eValid').addEventListener('input', (e) => { st.validUntil = e.target.value; edited(); }); },
  };

  function actions(st) {
    const b = (label, fn, cls = 'btn') => h('button', { type: 'button', class: cls, text: label, onclick: fn });
    const open = st.status === 'draft' || st.status === 'sent';
    const free = !st.orderId && !st.invoiceId;
    const out = [];
    if (!ed.isNew()) out.push(b(t('quotes.ed.pdf'), ed.exportPdf));
    if (st.status === 'draft') out.push(b(t(ed.isNew() ? 'quotes.ed.save_draft' : 'quotes.ed.save'), () => ed.save()), b(t('quotes.ed.send'), send, 'btn primary'));   // i18n-ignore: class names
    if (st.status === 'sent') out.push(b(t('quotes.ed.save_changes'), () => ed.save()));
    if ((open || st.status === 'accepted') && free && !ed.isNew()) {
      out.push(b(t('quotes.ed.make_order'), toOrder, st.status === 'draft' ? 'btn' : 'btn primary'), b(t('quotes.ed.make_invoice'), toInvoice));   // i18n-ignore: class names
    }
    if (st.status === 'sent') out.push(b(t('quotes.ed.accept'), () => status('accepted', (n) => t('quotes.ed.is_accepted', { number: n }))), b(t('quotes.ed.to_draft'), () => status('draft', (n) => t('quotes.ed.is_draft', { number: n }))));
    if (open && !ed.isNew()) out.push(b(t('quotes.ed.decline'), decline, 'btn danger'));   // i18n-ignore: class names
    if (st.status === 'declined') out.push(b(t('quotes.ed.reopen'), () => status('draft', (n) => t('quotes.ed.reopened', { number: n }))), h('p', { class: 'note', text: t('quotes.ed.declined_note') }));
    if (st.status === 'accepted') out.push(h('p', { class: 'note', text: t(free ? 'quotes.ed.accepted_note' : 'quotes.ed.converted_note') }));
    if (open && st.validUntil && S.quotes.isExpired(st, S.ledger.today())) out.unshift(h('p', { class: 'note bad-text', text: t('quotes.ed.expired', { date: st.validUntil }) }));
    return out;
  }

  /** Runs one action on the saved quote, reloads it, and says what happened (or why not). */
  async function act(run, done) {
    if (!(await ed.saveIfNeeded())) return false;
    const r = await run(ed.id());
    if (!r.ok) { UI.alert(t('quotes.ed.not_done'), U.refusal(r)); return false; }
    await ed.reload();
    const text = done(ed.live().number, r.value);
    ed.setMsg(text);
    UI.toast(text);
    return true;
  }

  const status = (to, done) => act((id) => NS.quotes.setStatus(id, to), done);
  const send = () => status('sent', (n) => t('quotes.ed.sent', { number: n }));
  const toOrder = () => act(NS.quotes.toOrder, (n, o) => t('quotes.ed.ordered', { number: n, order: o.number }));
  const toInvoice = () => act(NS.quotes.toInvoice, (n) => t('quotes.ed.invoiced', { number: n }));

  async function decline() {
    const yes = await UI.confirm(t('quotes.ed.decline_q'), t('quotes.ed.decline_body', { number: ed.live().number }), t('quotes.ed.decline_ok'), { danger: true });
    if (yes) await status('declined', (n) => t('quotes.ed.declined', { number: n }));
  }

  ed = g.SlopDocs.docEditor.create({
    ns: NS, noun: 'quote', title: () => t('quotes.ed.new'), route: 'q',
    data: { get: (id) => NS.quotes.get(id), save: (f) => NS.quotes.save(f), customers: () => NS.quotes.customers(), products: () => NS.quotes.products() },
    statusLabel: () => new Proxy({}, { get: (o, s) => g.SlopBiz.statusText(s) }), locked: (st) => st.status === 'accepted' || st.status === 'declined',
    dateError: () => t('quotes.ed.date_error'), extra, actions,
  });

  NS.editor = Object.assign(ed, {
    send, toOrder, toInvoice, decline,
    state: () => { const st = ed.live(); return { open: !!st.id || st.lines.length > 0, status: st.status, converted: !!(st.orderId || st.invoiceId), dirty: st.dirty, isNew: ed.isNew() }; },
  });
  NS.views = NS.views || {};
  NS.views.edit = { mount: ed.mount, refresh: () => {}, onShow: (id) => ed.open(id || null) };
})(typeof window !== 'undefined' ? window : globalThis);
