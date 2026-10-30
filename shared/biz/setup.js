// Getting started with the business apps: the first steps, each done or not, worked out from the shared data (never stored),
// with the app that does it. Slop Admin shows them on its Get started tab. Classic script, loaded after shared/data and
// biz.js. SlopBiz.setup = { STEPS, steps(settings, counts) (pure), load() -> Result of { steps, done, total } }.
(function (g) {
  'use strict';
  const B = (g.SlopBiz = g.SlopBiz || {});

  // id, where it is done (a path from the site root), and when it counts as done; the step and why it matters are the
  // string tables' biz.setup.<id> and biz.setup.<id>_why (shared/biz/i18n), read when steps() runs.
  const t = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
  const STEPS = [
    { id: 'company', href: 'admin/#company', done: (s) => !!(s.companyName && s.companyName.trim()) },
    { id: 'customer', href: 'crm/', done: (s, c) => c.customers > 0 },
    { id: 'product', href: 'inventory/#products', done: (s, c) => c.products > 0 },
    { id: 'sell', href: 'invoices/#new', done: (s, c) => c.quotes + c.invoices > 0 },
    { id: 'spend', href: 'expenses/#new', done: (s, c) => c.expenses > 0 },
  ];

  /** Pure: each step with done. counts: { customers (not suppliers), products, quotes, invoices, expenses }. */
  function steps(settings, counts) {
    const c = { customers: 0, products: 0, quotes: 0, invoices: 0, expenses: 0, ...counts };
    return STEPS.map((st) => ({ id: st.id, title: t('biz.setup.' + st.id), why: t(`biz.setup.${st.id}_why`), href: st.href, done: !!st.done(settings || {}, c) }));
  }

  /** Reads the settings and the counts in one transaction and works out the steps. */
  async function load() {
    const S = g.SlopData;
    const r = await S.store.readAll(async (tx) => {
      const out = {};
      for (const n of ['customers', 'products', 'quotes', 'invoices', 'expenses']) {
        const l = await tx.list(n);
        if (!l.ok) return l;
        out[n] = n === 'customers' ? l.value.filter((x) => !x.supplier).length : l.value.length;
      }
      const s = await tx.get('settings', 'main');
      if (!s.ok) return s;
      return S.result.ok({ settings: s.value || {}, counts: out });
    });
    if (!r.ok) return r;
    const list = steps(r.value.settings, r.value.counts);
    return S.result.ok({ steps: list, done: list.filter((x) => x.done).length, total: list.length });
  }

  B.setup = { STEPS, steps, load };
})(typeof window !== 'undefined' ? window : globalThis);
