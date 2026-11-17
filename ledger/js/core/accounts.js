// Chart of accounts: add an account, rename one. Codes are four digits and never change; accounts are never deleted
// (the data layer enforces that). The type sets the normal side of the balance and cannot change once added.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const { fail } = S.result;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** Adds an account. Refuses a code that already exists. */
  async function add({ code, name, type }) {
    const c = String(code || '').trim(), n = String(name || '').trim();
    if (!/^\d{4}$/.test(c)) return fail('invalid', t('ledger.ac.e_code'));
    if (!n) return fail('invalid', t('ledger.ac.e_name'));
    const cur = await S.store.get('accounts', c);
    if (!cur.ok) return cur;
    if (cur.value) return fail('conflict', t('ledger.ac.e_exists', { code: c, name: cur.value.name }));
    return S.store.put('accounts', { code: c, name: n, type });
  }

  /** Renames an account. The code and the type stay as they are. */
  async function rename(code, name) {
    const n = String(name || '').trim();
    if (!n) return fail('invalid', t('ledger.ac.e_empty'));
    const cur = await S.store.get('accounts', code);
    if (!cur.ok) return cur;
    if (!cur.value) return fail('not_found', t('ledger.ac.e_none', { code }));
    return S.store.put('accounts', { ...cur.value, name: n });
  }

  NS.accounts = { add, rename, TYPES: S.schemaDefs.ENUM.accountType };
})(typeof window !== 'undefined' ? window : globalThis);
