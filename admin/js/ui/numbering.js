// The Numbering tab: one card per sequence (invoices, orders). Prefix and padding change the look of the next
// number; the next number can only move forward. Issued numbers are never changed.
(function (g) {
  'use strict';
  const NS = (g.SlopAdmin = g.SlopAdmin || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const LABEL = { invoice: 'admin.nu.invoices', order: 'admin.nu.orders' };   // keys
  const label = (id) => (LABEL[id] ? t(LABEL[id]) : id);

  function card(seq) {
    const f = { prefix: el('input', { type: 'text', maxlength: 20, value: seq.prefix || '', 'data-field': 'prefix', autocomplete: 'off' }),
      pad: el('input', { type: 'number', min: 1, max: 12, step: 1, inputmode: 'numeric', value: seq.pad, 'data-field': 'pad' }),
      next: el('input', { type: 'number', min: 1, step: 1, inputmode: 'numeric', value: seq.next, 'data-field': 'next' }) };
    const shown = el('b', { class: 'preview' }, NS.numbering.preview(seq));
    const msg = el('p', { class: 'msg', role: 'alert' });
    const update = () => {
      const p = { id: seq.id, prefix: f.prefix.value, pad: f.pad.value, next: f.next.value };
      shown.textContent = NS.numbering.preview({ prefix: p.prefix, pad: Number(p.pad) || 1, next: Number(p.next) || 1 });
    };
    for (const k of Object.keys(f)) f[k].addEventListener('input', update);
    return el('section', { class: 'card', 'data-seq': seq.id },
      el('h2', { class: 'h3' }, label(seq.id)),
      el('p', { class: 'note' }, t('admin.nu.next') + ' ', shown),
      el('div', { class: 'grid3' },
        UI.field(t('admin.nu.prefix'), f.prefix), UI.field(t('admin.nu.digits'), f.pad), UI.field(t('admin.nu.next_issued', { n: String(seq.next - 1) }), f.next)),
      el('div', { class: 'toolbar' }, el('button', { type: 'button', class: 'btn primary', onclick: async () => {   // i18n-ignore: a class name
        msg.textContent = '';
        const r = await NS.numbering.save(seq.id, { prefix: f.prefix.value, pad: f.pad.value, next: f.next.value });
        if (!r.ok) { msg.textContent = t('admin.co.not_saved', { why: NS.util.refusal(r) }); return; }
        UI.toast(t('admin.nu.saved', { name: label(seq.id) }));
        } }, t('admin.nu.save'))),
      msg);
  }

  async function render() {
    const r = await NS.numbering.list();
    if (!r.ok) { $('nCards').replaceChildren(el('p', { class: 'msg', role: 'alert' }, NS.util.refusal(r))); return; }
    $('nCards').replaceChildren(...r.value.map(card));
  }

  NS.views = NS.views || {};
  NS.views.numbering = { render };
})(typeof window !== 'undefined' ? window : globalThis);
