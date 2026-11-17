// The order editor: the shared document editor (shared/docs/doc-editor.js) with what is the order's own: its statuses,
// the link to its invoice, and the actions (confirm, fulfil, cancel, convert to invoice) that the current status allows.
(function (g) {
  'use strict';
  const NS = (g.SlopOrders = g.SlopOrders || {});
  const U = NS.util;
  const UI = g.SlopUI;
  const S = g.SlopData;
  const h = U.h;
  const $ = (id) => document.getElementById(id);
  let ed = null;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  const extra = {
    blank: (st) => Object.assign(st, { invoiceId: null, invoiceNumber: '' }),
    async apply(st, rec) {
      st.invoiceId = rec.invoiceId || null;
      st.invoiceNumber = '';
      if (st.invoiceId) {
        const inv = await S.store.get('invoices', st.invoiceId);
        st.invoiceNumber = inv.ok && inv.value ? (inv.value.number || t('orders.ed.draft')) : '';
      }
    },
    paint(st) {
      const box = $('eInvoice');
      box.replaceChildren();
      if (st.invoiceId) box.append(t('orders.ed.invoice') + ' ', h('a', { href: `../invoices/#i/${st.invoiceId}`, text: st.invoiceNumber || t('orders.ed.draft') }));
    },
  };

  function actions(st) {
    const b = (label, fn, cls = 'btn') => h('button', { type: 'button', class: cls, text: label, onclick: fn });
    const out = [];
    if (ed.isNew()) out.push(b(t('orders.ed.sample'), () => NS.sampleActions.quick()));
    if (!ed.isNew()) out.push(b(t('orders.ed.pdf'), ed.exportPdf));
    if (st.status === 'draft') {
      out.push(b(t(ed.isNew() ? 'orders.ed.save_draft' : 'orders.ed.save'), () => ed.save()), b(t('orders.ed.confirm'), confirm, 'btn primary'));   // i18n-ignore: class names
      if (!ed.isNew()) out.push(b(t('orders.ed.cancel'), cancel, 'btn danger'));   // i18n-ignore: class names
    }
    if (st.status === 'open') out.push(b(t('orders.ed.save_changes'), () => ed.save()), b(t('orders.ed.fulfil'), fulfil, 'btn primary'), b(t('orders.ed.cancel'), cancel, 'btn danger'));   // i18n-ignore: class names
    if ((st.status === 'open' || st.status === 'fulfilled') && !st.invoiceId) out.push(b(t('orders.ed.convert'), convert));
    if ((st.status === 'open' || st.status === 'fulfilled') && !ed.isNew()) out.push(b(t('orders.ed.delivery'), () => ed.saveIfNeeded().then((ok) => ok && NS.app.go(`d/${ed.id()}`))));
    if (st.status === 'fulfilled') out.push(h('p', { class: 'note', text: t('orders.ed.fulfilled_note') }));
    if (st.status === 'cancelled') out.push(h('p', { class: 'note', text: t('orders.ed.cancelled_note') }));
    return out;
  }

  /** Runs one action on the saved order, reloads it, and says what happened (or why not, in a dialog when alertTitle). */
  async function act(run, done, alertTitle) {
    const r = await run(ed.id());
    if (!r.ok) { if (alertTitle) UI.alert(alertTitle, U.refusal(r)); else ed.setMsg(U.refusal(r), true); return; }
    await ed.reload();
    const st = ed.live();
    ed.setMsg(done(st.number));
    UI.toast(done(st.number));
  }

  async function confirm() {
    if (await ed.saveIfNeeded()) await act(NS.actions.confirmId, (n) => t('orders.ed.confirmed', { number: n }));
  }

  async function fulfil() {
    const yes = await UI.confirm(t('orders.ed.fulfil_q'), t('orders.ed.fulfil_body', { number: ed.live().number }), t('orders.ed.fulfil_ok'));
    if (yes && (await ed.saveIfNeeded())) await act(NS.fulfil.fulfil, (n) => t('orders.ed.fulfilled', { number: n }), t('orders.ed.not_fulfilled'));
  }

  async function cancel() {
    if (ed.isNew()) return ed.back(true);
    const yes = await UI.confirm(t('orders.ed.cancel'), t('orders.ed.cancel_body', { number: ed.live().number }), t('orders.ed.cancel'), { danger: true });
    if (yes) await act(NS.actions.cancelId, (n) => t('orders.ed.cancelled', { number: n }), t('orders.ed.not_cancelled'));
    return undefined;
  }

  async function convert() {
    if (await ed.saveIfNeeded()) await act(NS.actions.convertId, () => t('orders.ed.converted'), t('orders.ed.not_converted'));
  }

  ed = g.SlopDocs.docEditor.create({
    ns: NS, noun: 'order', title: () => t('orders.ed.new'), route: 'o',
    data: { get: (id) => NS.orders.get(id), save: (f) => NS.orders.save(f), customers: () => NS.orders.customers(), products: () => NS.orders.products() },
    statusLabel: () => new Proxy({}, { get: (o, s) => g.SlopBiz.statusText(s) }), locked: (st) => st.status === 'fulfilled' || st.status === 'cancelled',
    dateError: () => t('orders.ed.date_error'), extra, actions,
  });

  NS.editor = Object.assign(ed, {
    confirm, fulfil, cancel, convert,
    state: () => { const st = ed.live(); return { open: !!st.id || st.lines.length > 0, status: st.status, invoiceId: st.invoiceId, dirty: st.dirty, isNew: ed.isNew() }; },
  });
  NS.views = NS.views || {};
  NS.views.edit = { mount: ed.mount, refresh: () => {}, onShow: (id) => ed.open(id || null) };
})(typeof window !== 'undefined' ? window : globalThis);
