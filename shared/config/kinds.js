/* The built-in shared kinds: "settings" (the global profile: currency, locale, default tax rate) and "numbering" (the
 * invoice and order number formats). Both are registered for app '*', so any app can import them. Their apply functions
 * call the SlopData store (shared/data/store.js) inside one transaction: there is no second store. A file never carries
 * the counter (next), so importing a format cannot move a number backwards. Load after validate.js and io.js.
 * SlopData is read when a kind runs, not when this file loads. */
(function (g) {
  'use strict';
  const C = g.SlopConfig;
  if (!C || C.getKind('settings', C.consts.SHARED)) return;
  const { F, consts: { SHARED } } = C;
  const tr = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/config.js

  const store = () => {
    const d = g.SlopData;
    if (!d || !d.store) throw new Error(tr('ui.cfgv.no_store'));
    return d.store;
  };
  /** A failed store result aborts the apply (the caller turns the throw into a rollback). */
  const check = (r) => {
    if (!r || r.ok === false) throw new Error((r && r.message) || tr('ui.cfgv.refused'));
    return r;
  };

  /* ---------- settings ---------- */
  async function readSettings() {
    const s = check(await store().get('settings', 'main')).value || {};
    return { defaultCurrency: s.defaultCurrency, locale: s.locale, defaultTaxRate: (s.defaultTaxRate || 0) / 100 };
  }

  C.registerKind('settings', SHARED, {
    strict: true,
    fields: {
      defaultCurrency: F.currency({ desc: 'base currency as an ISO 4217 code, e.g. USD or EUR' }),   // i18n-ignore: schema notes for the AI prompt
      locale: F.locale({ desc: 'language tag for number and date formats, e.g. en-US or de-DE' }),   // i18n-ignore: schema notes for the AI prompt
      defaultTaxRate: F.num({ min: 0, max: 100, desc: 'default tax rate as a percentage, e.g. 20 means 20%' }),   // i18n-ignore: schema notes for the AI prompt
    },
  }, async (v) => {
    const s = store();
    check(await s.transact(async (tx) => {
      const cur = await tx.get('settings', 'main');
      if (!cur.ok) return cur;
      const next = { ...(cur.value || { id: 'main' }), id: 'main' };
      if (v.defaultCurrency !== undefined) next.defaultCurrency = v.defaultCurrency;
      if (v.locale !== undefined) next.locale = v.locale;
      if (v.defaultTaxRate !== undefined) next.defaultTaxRate = Math.round(v.defaultTaxRate * 100); // stored as basis points
      return tx.put('settings', next);
    }));
  }, { label: 'ui.config.kind_settings', description: 'ui.config.kind_settings_desc', read: readSettings });

  /* ---------- numbering ---------- */
  const SEQUENCE = F.obj({
    id: F.enum(['invoice', 'order'], { required: true, desc: 'which document the format is for' }),   // i18n-ignore: schema notes for the AI prompt
    prefix: F.str({ max: 20, required: true, pattern: /^[A-Za-z0-9 _.\/#-]*$/, desc: 'text before the number, e.g. "INV-"' }),   // i18n-ignore: schema notes for the AI prompt
    pad: F.int({ min: 1, max: 12, required: true, desc: 'digits in the number, zero padded, e.g. 4 gives 0001' }),   // i18n-ignore: schema notes for the AI prompt
  });

  async function readNumbering() {
    const rows = check(await store().list('numbering')).value || [];
    return {
      sequences: rows.filter((r) => r.id === 'invoice' || r.id === 'order')
        .map((r) => ({ id: r.id, prefix: r.prefix || '', pad: r.pad || 4 })),
    };
  }

  C.registerKind('numbering', SHARED, {
    strict: true,
    fields: { sequences: F.list(SEQUENCE, { min: 1, max: 2, required: true, desc: 'one entry per document: invoice and/or order' }) },   // i18n-ignore: schema notes for the AI prompt
  }, async (v) => {
    const s = store();
    check(await s.transact(async (tx) => {
      for (const seq of v.sequences) {
        const cur = await tx.get('numbering', seq.id);
        if (!cur.ok) return cur;
        if (!cur.value) return tx.fail({ ok: false, code: 'not_found', message: tr('ui.cfgv.no_sequence', { id: seq.id }) });
        const w = await tx.put('numbering', { ...cur.value, prefix: seq.prefix, pad: seq.pad });
        if (!w.ok) return w;
      }
      return { ok: true, value: true };
    }));
  }, { label: 'ui.config.kind_numbering', description: 'ui.config.kind_numbering_desc', read: readNumbering });
})(typeof window !== 'undefined' ? window : globalThis);
