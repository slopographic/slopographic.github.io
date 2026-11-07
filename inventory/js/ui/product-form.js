// The product form: the products view's right panel (shared/biz/panel.js, set up in ui/app.js), "New product" until a
// product is opened for editing; Create product / Save at the panel's foot, Cancel back to a new one. On a phone the panel
// is a bottom sheet that opens with the form. The data layer validates every value; its errors show beside the fields.
// Price and tax rate are typed in the page's language ("12,50" in sv; SlopData.money.parseTyped and parsePercent, never
// through floats), and shown for editing the same way (typedMinor).
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInv = g.SlopInv || {});
  const U = NS.util;
  const UI = g.SlopUI;
  const { h } = U;
  const $ = (id) => document.getElementById(id);
  let fields = null, opts = {}, st = { currency: 'USD', defaultTaxRate: 0 };
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** One labelled row: the control, a hint, and an error line that the save fills in. label and hint are keys (words()). */
  function fieldRow(label, control, hint) {
    const msg = h('span', { class: 'ferr', role: 'alert' });
    const tip = hint != null ? h('span', { class: 'fhint' }) : null;
    const lab = h('span', { class: 'flabel' });
    const row = h('label', { class: 'frow' }, lab, control, tip, msg);
    return { row, control, msg, tip, lab, keys: [label, hint] };
  }
  /** The form's words in the current language (again on a language change). */
  function words() {
    if (!fields) return;
    for (const f of Object.values(fields)) { f.lab.textContent = t(f.keys[0]); if (f.tip && f.keys[1]) f.tip.textContent = t(f.keys[1]); }
    fields.price.tip.textContent = t('inventory.pf.price_hint', { cur: st.currency });
    const p = opts.product || null;
    $('pFormTitle').textContent = p ? t('inventory.pf.edit', { name: p.name }) : t('inventory.pf.new');
    $('pSave').textContent = t(p ? 'inventory.pf.save' : 'inventory.pf.create');
  }
  if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(words);

  /** Builds the fields once, into the form in the page. */
  function build() {
    const input = (attrs) => h('input', { class: 'sui-input', autocomplete: 'off', spellcheck: 'false', ...attrs });
    fields = {
      sku: fieldRow('inventory.f.sku', input({ maxlength: 80 }), 'inventory.pf.sku_hint'),
      ean: fieldRow('inventory.f.ean', input({ inputmode: 'numeric', maxlength: 18 }), 'inventory.pf.ean_hint'),
      name: fieldRow('inventory.f.name', input({ maxlength: 200 })),
      price: fieldRow('inventory.f.price', input({ inputmode: 'decimal' }), ''),
      taxRate: fieldRow('inventory.pf.tax', input({ inputmode: 'decimal' }), 'inventory.pf.tax_hint'),
      unit: fieldRow('inventory.f.unit', input({ maxlength: 20 })),
      reorderLevel: fieldRow('inventory.f.reorder', input({ type: 'number', min: 0, step: 1, inputmode: 'numeric' }), 'inventory.pf.reorder_hint'),
    };
    $('pFields').replaceChildren(...Object.values(fields).map((f) => f.row));
    $('pForm').addEventListener('submit', (e) => { e.preventDefault(); save(); });
    $('pCancel').addEventListener('click', () => open({ show: false }));
  }

  function clear() { $('pFormErr').textContent = ''; for (const f of Object.values(fields)) f.msg.textContent = ''; }
  function showErrors(r) {
    let general = true;
    for (const e of r.errors || []) if (fields[e.field]) { fields[e.field].msg.textContent = e.message; general = false; }
    if (r.code === 'conflict') { fields[/ean/i.test(r.message) ? 'ean' : 'sku'].msg.textContent = r.message; general = false; }
    if (general) $('pFormErr').textContent = U.refusal(r);
  }

  /**
   * Fills the form. opts: { product? (edit), sku?, ean? (prefill for a new product), onSaved?(product), back? (the view to
   * return to once saved, such as 'scan'), show? (false: only reset it, without moving to it) }.
   */
  async function open(o = {}) {
    if (!fields) build();
    opts = o;
    st = await U.settings();
    const p = o.product || null, F = fields;
    F.sku.control.value = p ? p.sku : o.sku || '';
    F.ean.control.value = p ? p.ean || '' : o.ean || '';
    F.name.control.value = p ? p.name : '';
    F.price.control.value = p ? S.money.typedMinor(p.price, st.currency) : '';
    F.taxRate.control.value = S.money.typedMinor(p ? p.taxRate : st.defaultTaxRate, 'USD');   // basis points as a percentage
    F.unit.control.value = p ? p.unit || 'each' : 'each';
    F.reorderLevel.control.value = p && p.reorderLevel !== undefined ? String(p.reorderLevel) : '';
    clear();
    words();
    $('pCancel').hidden = !p && !o.sku && !o.ean;
    if (o.show === false) return;
    if (NS.state.view !== 'products') await NS.app.show('products');
    const rp = NS.productPanel;
    if (rp && rp.frame && rp.frame.isPhone()) rp.frame.openSheet();
    setTimeout(() => F[p ? 'name' : 'sku'].control.focus(), 40);
  }

  async function save() {
    clear();
    const F = fields, p = opts.product || null, rec = { ...(p || {}) };
    const price = S.money.parseTyped(F.price.control.value, st.currency);
    const tax = S.money.parsePercent(F.taxRate.control.value, { typed: true });
    const reorderText = F.reorderLevel.control.value.trim();
    const reorder = reorderText === '' ? undefined : U.wholeOf(reorderText);
    let bad = false;
    const flag = (k, text) => { F[k].msg.textContent = text; bad = true; };
    if (F.price.control.value.trim() === '') flag('price', t('inventory.pf.required'));
    else if (price === null) flag('price', t('inventory.pf.bad_price'));
    if (tax === null) flag('taxRate', t('inventory.pf.bad_tax'));
    if (reorderText !== '' && (!Number.isSafeInteger(reorder) || reorder < 0)) flag('reorderLevel', t('inventory.pf.bad_reorder'));
    if (bad) { $('pFormErr').textContent = t('inventory.pf.not_saved'); return false; }
    Object.assign(rec, { sku: F.sku.control.value, ean: F.ean.control.value, name: F.name.control.value, price, taxRate: tax, unit: F.unit.control.value, reorderLevel: reorder });
    const r = await NS.products.save(rec);
    if (!r.ok) { showErrors(r); return false; }
    const done = opts;
    if (UI && UI.toast) UI.toast(p ? t('inventory.pf.saved') : t('inventory.pf.created', { sku: r.value.sku }));
    const rp = NS.productPanel;
    if (rp && rp.frame && rp.frame.isPhone()) rp.frame.closeSheet();
    await open({ show: false });   // back to a new product
    if (done.back) await NS.app.show(done.back);
    if (done.onSaved) done.onSaved(r.value);
    else NS.app.refresh();
    return true;
  }

  NS.productForm = { open, save };
})(typeof window !== 'undefined' ? window : globalThis);
