// "New product" from inside an order or an invoice line: a small dialog that stores a product through SlopData.store
// and hands the record back to the caller. Classic script, uses SlopUI. Exposes window.SlopDocs.productDialog.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopDocs = g.SlopDocs || {});

  /** Small DOM builder (same as customer-dialog.js). */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, String(v));
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
  }

  /** Opens the dialog. onSaved(record) runs after the product is stored. opts.currency sets how the price is read. */
  function open(onSaved, opts) {
    // Read at open time: this script can load before shared/slopui.js.
    const UI = g.SlopUI;
    const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
    const currency = (opts && opts.currency) || 'USD';
    const sku = h('input', { type: 'text', maxlength: 80, autocomplete: 'off' });
    const name = h('input', { type: 'text', maxlength: 200, autocomplete: 'off' });
    const price = h('input', { type: 'text', inputmode: 'decimal', maxlength: 20, autocomplete: 'off', placeholder: g.SlopData.money.typedPlain('0.00') });
    const tax = h('input', { type: 'text', inputmode: 'decimal', maxlength: 6, autocomplete: 'off', value: '0' });
    const unit = h('input', { type: 'text', maxlength: 20, autocomplete: 'off', value: 'each' });
    const msg = h('p', { class: 'msg bad', role: 'status' });   // i18n-ignore: class names
    const body = h('div', null,
      UI.field(t('biz.pd.sku'), sku), UI.field(t('biz.pd.name'), name), UI.field(t('biz.pd.price', { currency }), price),
      UI.field(t('biz.pd.tax'), tax), UI.field(t('biz.pd.unit'), unit), msg);
    UI.dialog({
      title: t('biz.pd.title'),
      body,
      buttons: [
        { label: t('menu.cancel') },
        {
          label: t('biz.pd.add'), primary: true,
          act: async () => {
            const code = sku.value.trim(), n = name.value.trim();
            if (!code || !/^\S+$/.test(code)) { msg.textContent = t('biz.pd.sku_needed'); return false; }
            if (!n) { msg.textContent = t('biz.pd.name_needed'); return false; }
            const amount = S.money.parseTyped(price.value, currency);   // typed in the page's language ("12,50" in sv)
            if (amount === null || amount < 0) { msg.textContent = t('biz.pd.bad_price'); return false; }
            const rate = NS.model.bpFromPercent(tax.value.trim() || '0');
            if (rate === null || rate === undefined) { msg.textContent = t('biz.pd.bad_tax'); return false; }
            const r = await S.store.put('products', { sku: code, name: n, price: amount, taxRate: rate, unit: unit.value.trim() || 'each' });
            if (!r.ok) { msg.textContent = r.message || t('biz.pd.not_saved'); return false; }
            UI.toast(t('biz.pd.added', { name: n }));
            onSaved(r.value);
            return undefined;
          },
        },
      ],
    });
    setTimeout(() => sku.focus(), 30);
  }

  NS.productDialog = { open };
})(typeof window !== 'undefined' ? window : globalThis);
