// Company profile: name, address, tax number, default currency, locale, default tax rate and the documents' language
// (docLang: one of SlopBiz.docLang.langs(); none given keeps the stored one, else the page's language). The record is the shared
// settings (SlopData). The default currency is the ledger's base, so it is refused once any journal entry exists.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopAdmin = g.SlopAdmin || {});
  const { ok, fail } = S.result;

  /** Checks the typed profile and returns the record to store, or a failed Result that names the field. */
  function checked(cur, input) {
    const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
    const cc = String(input.defaultCurrency || '').trim().toUpperCase();
    if (!S.locale.isCurrency(cc) || !S.locale.currencies().includes(cc)) return fail('invalid', t('admin.core.currency'));
    const loc = S.locale.canonicalLocale(String(input.locale || '').trim());
    if (!loc) return fail('invalid', t('admin.core.locale'));
    const rate = S.money.parsePercent(String(input.defaultTaxRate ?? '').trim() || '0', { typed: true });   // typed in the page's language
    if (rate === null) return fail('invalid', t('admin.core.rate'));
    const DL = g.SlopBiz && g.SlopBiz.docLang;
    const docLang = input.docLang || cur.docLang || (DL ? DL.pick('', '') : '');
    if (DL && docLang && !DL.langs().includes(docLang)) return fail('invalid', t('biz.dl.bad'));
    return ok({ ...cur, companyName: input.companyName, address: input.address, taxNumber: input.taxNumber,
      defaultCurrency: cc, locale: loc, defaultTaxRate: rate, docLang: docLang || undefined });
  }

  /** Saves the profile. A refused currency change keeps the old one and says why. */
  async function save(input) {
    const cur = await S.store.get('settings', 'main');
    if (!cur.ok) return cur;
    const base = cur.value || { ...S.schemaDefs.DEFAULT_SETTINGS };
    const rec = checked(base, input);
    if (!rec.ok) return rec;
    return S.store.put('settings', rec.value);
  }

  /** The profile as text for the form (tax rate as a percentage, with the page language's decimal mark). */
  function asForm(s) {
    return { companyName: s.companyName || '', address: s.address || '', taxNumber: s.taxNumber || '',
      defaultCurrency: s.defaultCurrency || 'USD', locale: s.locale || 'en-US',
      defaultTaxRate: S.money.typedPlain(String((s.defaultTaxRate || 0) / 100)) };
  }

  NS.profile = { save, checked, asForm };
})(typeof window !== 'undefined' ? window : globalThis);
