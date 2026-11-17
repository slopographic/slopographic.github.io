// Line cards for an order or an invoice: product, description, quantity, unit price, tax %, discount %, line total,
// and the totals box (computed by SlopData.money through SlopDocs.model). Edits go to the app's editor through
// onEdit(i, patch). Shared by Slop Orders and Slop Invoices. Classic script. Exposes window.SlopDocs.lines.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopDocs = g.SlopDocs || {});
  const M = NS.model;

  /** Small DOM builder: h('a', { class, href, onclick, dataset }, 'text', child). Text children are escaped by the DOM. */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, String(v));
    }
    for (const c of kids.flat()) {
      if (c === null || c === undefined || c === false) continue;
      e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return e;
  }

  const NEW_PRODUCT = '__new__';
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  const money = (minor, o) => S.money.formatMinor(minor, o.currency, o.locale);

  /** Reads one typed field into a line value; null when the text is not valid (the card then says why). */
  function parseField(field, text, currency) {
    if (field === 'qty') return /^\d+$/.test(String(text).trim()) ? Number(text) : null;
    if (field === 'unitPrice') return M.amountFromText(text, currency);
    if (field === 'taxRate' || field === 'discount') return M.bpFromPercent(text);
    return String(text);
  }

  function productSelect(line, o) {
    const sel = h('select', { 'aria-label': t('biz.ln.product'), disabled: o.readOnly, dataset: { f: 'product' } },
    h('option', { value: '', text: t('biz.ln.custom') }),
      ...o.products.map((p) => h('option', { value: p.id, selected: p.id === line.productId, text: `${p.sku} · ${p.name} · ${money(p.price, o)}` })),
      h('option', { value: NEW_PRODUCT, text: t('biz.ln.new_product') }));
    return sel;
  }

  function card(line, i, o) {
    const inp = (f, label, value, extra = {}) => h('label', { class: extra.wide ? 'wide' : '' }, label,
      h('input', { type: extra.type || 'text', value, disabled: o.readOnly, inputmode: extra.inputmode, maxlength: extra.maxlength, dataset: { f } }));
    const c = h('div', { class: 'line-card', dataset: { i: String(i) } },
      h('div', { class: 'line-grid' },
        h('label', { class: 'wide' }, t('biz.ln.product'), productSelect(line, o)),
        inp('description', t('biz.ln.desc'), line.description, { wide: true, maxlength: 300 }),
        inp('qty', t('biz.ln.qty'), line.qty ?? '', { inputmode: 'numeric' }),
        inp('unitPrice', t('biz.ln.unit_price', { currency: o.currency }), line.unitPrice == null ? '' : M.amountText(line.unitPrice, o.currency), { inputmode: 'decimal' }),
        inp('taxRate', t('biz.ln.tax'), M.percentText(line.taxRate ?? 0), { inputmode: 'decimal' }),
        inp('discount', t('biz.ln.discount'), M.percentText(line.discount || 0), { inputmode: 'decimal' })),
      h('div', { class: 'line-foot' }, h('span', { class: 'num', dataset: { role: 'total' } }),
        o.readOnly ? null : h('button', { type: 'button', class: 'btn small danger', dataset: { f: 'remove' }, text: t('biz.ln.remove') })),   // i18n-ignore: class names
      h('p', { class: 'line-err', role: 'status', dataset: { role: 'err' } }));
    paintCard(c, line, o);
    return c;
  }

  /** Refreshes one card's total, error text and invalid marking from its line. */
  function paintCard(c, line, o) {
    const errs = M.lineErrors(line);
    c.querySelector('[data-role="total"]').textContent = t('biz.ln.total', { amount: money(M.lineTotal(line), o) });
    c.querySelector('[data-role="err"]').textContent = errs.length ? t('biz.ln.fix', { errors: errs.join('; ') }) : '';
    c.classList.toggle('bad', errs.length > 0);
  }

  /** Draws every line card into box. o: { products, currency, locale, readOnly, onEdit(i, patch), onProduct(i, product), onNewProduct(i), onRemove(i) }. */
  function draw(box, lines, o) {
    box.replaceChildren(...lines.map((l, i) => card(l, i, o)));
    if (!lines.length) box.append(h('p', { class: 'empty', text: t('biz.ln.none') }));
    if (box.dataset.bound) return;
    box.dataset.bound = '1';
    box.addEventListener('input', (e) => {
      const c = e.target.closest('.line-card');
      if (!c || !e.target.dataset.f || e.target.dataset.f === 'product') return;
      const i = Number(c.dataset.i);
      const f = e.target.dataset.f;
      const patch = { [f]: parseField(f, e.target.value, box.__o.currency) };
      box.__o.onEdit(i, patch);
      paintCard(c, box.__lines[i], box.__o);
    });
    box.addEventListener('change', (e) => {
      const c = e.target.closest('.line-card');
      if (!c || e.target.dataset.f !== 'product') return;
      const id = e.target.value;
      if (id === NEW_PRODUCT) {
        e.target.value = '';
        if (box.__o.onNewProduct) box.__o.onNewProduct(Number(c.dataset.i));
        return;
      }
      box.__o.onProduct(Number(c.dataset.i), id ? box.__o.products.find((p) => p.id === id) : null);
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f="remove"]');
      if (b) box.__o.onRemove(Number(b.closest('.line-card').dataset.i));
    });
  }

  /** Keeps the latest lines and options on the box for the listeners (they are bound once). */
  function bind(box, lines, o) { box.__lines = lines; box.__o = o; }

  /** Totals box: subtotal, tax by rate, total. Says so when a line is not complete yet. */
  function drawTotals(box, lines, o) {
    const tot = M.totals(lines);
    box.replaceChildren();
    if (!tot) { box.append(h('p', { class: 'note', text: g.SlopI18n ? g.SlopI18n.t('biz.ln.totals_later') : '' })); return; }
    const dl = h('dl', null);
    const add = (label, value, cls) => dl.append(h('dt', { class: cls, text: label }), h('dd', { class: cls, text: value }));
    const w = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
    add(w('biz.ln.subtotal'), money(tot.subtotal, o));
    for (const r of tot.byRate) add(w('biz.ln.tax_on', { rate: M.percentText(r.rate) || '0', net: money(r.net, o) }), money(r.tax, o));
    add(w('biz.ln.grand'), money(tot.total, o), 'grand');
    box.append(dl);
  }

  NS.lines = { draw: (box, lines, o) => { bind(box, lines, o); draw(box, lines, o); }, bind, drawTotals, paintCard, money, parseField };
})(typeof window !== 'undefined' ? window : globalThis);
