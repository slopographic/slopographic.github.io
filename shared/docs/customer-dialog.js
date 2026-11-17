// "New customer" (or "New supplier") from inside a document: a small dialog that stores a contact through SlopData.store
// and hands the record back to the caller. Classic script, uses SlopUI and SlopBiz.h. Exposes window.SlopDocs.customerDialog.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopDocs = g.SlopDocs || {});

  /** Opens the dialog. onSaved(record) runs after the contact is stored. opts: { word: 'customer' | 'supplier' }; a supplier
   *  is stored with supplier: true. */
  function open(onSaved, { word = 'customer' } = {}) {
    // Read at open time: this script can load before shared/slopui.js and shared/biz/biz.js.
    const UI = g.SlopUI, h = g.SlopBiz.h;
    const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k), who = word === 'supplier' ? 'supplier' : 'customer';
    const name = h('input', { type: 'text', maxlength: 200, autocomplete: 'off' });
    const email = h('input', { type: 'email', maxlength: 200, autocomplete: 'off' });
    const phone = h('input', { type: 'tel', maxlength: 60, autocomplete: 'off' });
    const msg = h('p', { class: 'msg bad', role: 'status' });   // i18n-ignore: class names
    const body = h('div', null, UI.field(t('biz.cd.name'), name), UI.field(t('biz.cd.email'), email), UI.field(t('biz.cd.phone'), phone), msg);
    UI.dialog({
      title: t('biz.doc.new_' + who),
      body,
      buttons: [
        { label: t('menu.cancel') },
        {
          label: t('biz.doc.add_' + who), primary: true,
          act: async () => {
            const n = name.value.trim();
            if (!n) { msg.textContent = t('biz.cd.name_needed'); return false; }
            const rec = { name: n, email: email.value.trim(), phone: phone.value.trim(), stage: 'customer' };
            if (word === 'supplier') rec.supplier = true;
            const r = await S.store.put('customers', rec);
            if (!r.ok) { msg.textContent = r.message || t('biz.cd.not_saved'); return false; }
            UI.toast(t('biz.cd.added', { name: n }));
            onSaved(r.value);
            return undefined;
          },
        },
      ],
    });
    setTimeout(() => name.focus(), 30);
  }

  NS.customerDialog = { open };
})(typeof window !== 'undefined' ? window : globalThis);
