// The Company tab: the profile form (name, address, tax number, default currency, locale, default tax rate, the documents'
// language), and a pointer to Slop Inventory, where the product catalogue is kept (it is not copied here). The Document
// language lists the languages the business tables ship (SlopBiz.docLang); with none stored it shows the page's language,
// which the first save stores (the rule in shared/biz/biz.js).
(function (g) {
  'use strict';
  const NS = (g.SlopAdmin = g.SlopAdmin || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  // A render reads the stored profile, then fills the form. A save (or a newer render) while it reads makes what it read
  // old: it then leaves the form alone, so it cannot put the values from before the save back (the form went stale).
  let gen = 0;
  async function render() {
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#cForm')) return;
    const mine = ++gen;
    const s = await NS.util.settings();
    if (mine !== gen) return;
    const f = NS.profile.asForm(s);
    $('cName').value = f.companyName;
    $('cAddress').value = f.address;
    $('cTax').value = f.taxNumber;
    $('cCur').value = f.defaultCurrency;
    $('cLocale').value = f.locale;
    $('cRate').value = f.defaultTaxRate;
    const DL = g.SlopBiz.docLang, name = (c) => (g.SlopI18n && g.SlopI18n.lang(c) ? g.SlopI18n.lang(c).name : c);
    $('cDocLang').replaceChildren(...DL.langs().map((c) => el('option', { value: c }, name(c))));
    $('cDocLang').value = DL.pick('', s.docLang);
  }

  async function save() {
    gen++;   // a render still reading has the profile from before this save
    $('cMsg').textContent = '';
    const r = await NS.profile.save({ companyName: $('cName').value, address: $('cAddress').value, taxNumber: $('cTax').value,
      defaultCurrency: $('cCur').value, locale: $('cLocale').value, defaultTaxRate: $('cRate').value, docLang: $('cDocLang').value });
    if (!r.ok) { $('cMsg').textContent = t('admin.co.not_saved', { why: NS.util.refusal(r) }); return; }
    UI.toast(t('admin.co.saved'));
  }

  function mount() {
    $('cCurList').replaceChildren(...g.SlopData.locale.currencies().map((c) => el('option', { value: c })));
    $('cSave').addEventListener('click', save);
  }

  NS.views = NS.views || {};
  NS.views.company = { mount, render };
})(typeof window !== 'undefined' ? window : globalThis);
