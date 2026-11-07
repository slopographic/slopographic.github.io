// The Delivery note view (#d/<order id>): a printable business sheet (SlopBiz.sheet) for packing an order: the company
// block, the order number and date, who it goes to, every line with its quantity and unit but no prices (core/delivery.js),
// the order's notes, and a line for the receiver to sign; Address label opens the parcel label in SlopLabel
// (SlopBiz.addressLabel). The markup is built here, to keep the page short.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopOrders = g.SlopOrders || {});
  const U = NS.util;
  const h = U.h;
  const $ = (id) => document.getElementById(id);
  let orderId = null, label = null;   // label: what the Address label button sends
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  // The delivery note itself is a document the person prints: its words are in its order's document language (SlopBiz.docLang)

  async function show(id) {
    orderId = id || null;
    const [o, products, settings] = await Promise.all([NS.orders.get(orderId), S.store.list('products'), U.settings()]);
    if (!o.ok || !o.value) { $('dnSheet').replaceChildren(h('p', { class: 'msg bad', text: t('orders.dn.gone') })); return; }   // i18n-ignore: CSS class names
    const order = o.value, DL = g.SlopBiz.docLang, w = await DL.load(DL.pick(order.docLang, settings.docLang), settings.locale), tx = w.t;
    const c = await S.store.get('customers', order.customerId), who = (c.ok && c.value) || { name: tx('biz.pr.no_customer') };
    const note = NS.delivery.noteOf(order, products.ok ? products.value : []);
    label = { name: who.name, lines: [...g.SlopBiz.sheet.lines(who.address), who.phone].filter(Boolean), from: settings.companyName, ref: order.number, app: 'orders' };
    $('dnTitle').textContent = t('orders.dn.title', { number: order.number });
    $('dnSheet').replaceChildren(h('article', { class: 'doc-sheet delivery', lang: w.code },
      g.SlopBiz.sheet.head(settings, tx('biz.pr.t_delivery'), [tx('biz.pr.m_order', { number: order.number }), tx('biz.pr.m_date', { date: w.day(S.ledger.today()) }), tx('biz.pr.m_ordered', { date: w.day(order.date) })], w),
      h('div', { class: 'sheet-to' }, h('span', { class: 'sub', text: tx('biz.pr.deliver_to') }), h('b', { text: who.name }),
        ...[...g.SlopBiz.sheet.lines(who.address), who.phone].filter(Boolean).map((x) => h('div', { text: x }))),
      h('div', { class: 'sheet-scroll' }, h('table', { class: 'grid-t' },
        h('thead', null, h('tr', null, ['d_sku', 'd_item', 'c_qty', 'd_unit', 'd_packed'].map((x, i) => h('th', { class: i === 2 ? 'num' : '', text: tx(`biz.pr.${x}`) })))),
        h('tbody', null, note.rows.map((r) => h('tr', null, h('td', { class: 'mono', text: r.sku }), h('td', { text: r.description }),
          h('td', { class: 'num', text: String(r.qty) }), h('td', { text: r.unit }), h('td', { class: 'sheet-box', text: '☐' })))),
        h('tfoot', null, h('tr', null, h('th', { colspan: 2, text: tx('biz.pr.d_lines', { n: note.lines }) }), h('th', { class: 'num', text: w.num(note.items) }), h('th', { colspan: 2, text: tx('biz.pr.d_items') }))))),
      order.notes ? h('p', { class: 'note', text: order.notes }) : null,
      h('div', { class: 'sheet-sign' }, h('div', { text: tx('biz.pr.d_received_by') }), h('div', { text: tx('biz.pr.date') }), h('div', { text: tx('biz.pr.d_signature') }))));
  }

  function mount() {
    $('view-delivery').replaceChildren(
      h('div', { class: 'toolbar no-print' },
        h('button', { type: 'button', class: 'btn small', text: t('orders.dn.back'), 'data-i18n': 'orders.dn.back', onclick: () => NS.app.go(orderId ? `o/${orderId}` : 'list') }),   // i18n-ignore: CSS class names and routes
        h('h2', { class: 'h2', id: 'dnTitle', text: t('orders.page.delivery') }),
        h('button', { type: 'button', class: 'btn primary', text: t('orders.dn.print'), 'data-i18n': 'orders.dn.print', onclick: () => g.print() }),   // i18n-ignore: CSS class names
        h('button', { type: 'button', class: 'btn', text: t('orders.dn.label'), title: t('orders.dn.label_tip'), 'data-i18n': 'orders.dn.label', 'data-i18n-attr': 'title:orders.dn.label_tip',
          onclick: async () => { if (!label) return; try { await g.SlopBiz.addressLabel.send(label); g.SlopUI.toast(t('orders.dn.label_done')); } catch (e) { g.SlopUI.toast(t('orders.dn.label_failed', { why: e.message })); } } })),
      h('div', { id: 'dnSheet' }));
  }

  NS.views = NS.views || {};
  NS.views.delivery = { mount, refresh: () => { if (orderId) show(orderId); }, onShow: show };
  NS.deliveryView = { show };
})(typeof window !== 'undefined' ? window : globalThis);
