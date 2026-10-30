// Manual journal entries. buildEntry checks the typed lines and says what is wrong before anything is written
// (the data layer checks again, so a refusal from either side shows a message). Posting goes through
// SlopData.ledger, which converts a foreign currency at the stored rate. Posted entries are never edited.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const U = NS.util;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** Pure: turns typed rows into journal lines. rows: [{ account, debit, credit }] as text, in input.lang (default: the
   *  page's language; SlopData.money.parseTyped). Returns a Result. */
  function buildEntry(input, knownCodes) {
    const errors = [];
    const date = String(input.date || '').trim();
    const memo = String(input.memo || '').trim();
    const cur = String(input.currency || '').trim().toUpperCase();
    if (!U.isDate(date)) errors.push(t('ledger.j.e_date'));
    if (!S.locale.isCurrency(cur)) errors.push(t('ledger.j.e_cur'));
    const rows = (input.rows || []).filter((r) => (r.account || '').trim() || (r.debit || '').trim() || (r.credit || '').trim());
    if (rows.length < 2) errors.push(t('ledger.j.e_two'));
    const lines = [];
    rows.forEach((r, i) => {
      const n = i + 1, acct = String(r.account || '').trim();
      const d = String(r.debit || '').trim(), c = String(r.credit || '').trim();
      if (!acct) { errors.push(t('ledger.j.e_acct', { n })); return; }
      if (knownCodes && !knownCodes.includes(acct)) { errors.push(t('ledger.j.e_no_acct', { n, code: acct })); return; }
      if ((d && c) || (!d && !c)) { errors.push(t('ledger.j.e_side', { n })); return; }
      const side = d ? 'debit' : 'credit';
      const minor = S.money.parseTyped(d || c, cur || 'USD', input.lang || true);   // typed by a person: the page's language
      if (minor === null || minor <= 0) { errors.push(t('ledger.j.e_amount', { n, d: S.money.digits(cur || 'USD') })); return; }
      lines.push({ account: acct, debit: side === 'debit' ? minor : 0, credit: side === 'credit' ? minor : 0 });
    });
    if (errors.length) return { ok: false, message: errors[0], errors };
    const dr = lines.reduce((s, l) => s + l.debit, 0), cr = lines.reduce((s, l) => s + l.credit, 0);
    if (dr !== cr) {
      const f = (m) => U.money(m, cur, 'en-US');
      return { ok: false, message: t('ledger.j.e_balance', { dr: f(dr), cr: f(cr), diff: f(Math.abs(dr - cr)) }), errors: [] };
    }
    return { ok: true, value: { date, memo: memo || undefined, currency: cur, lines } };
  }

  /** Posts a checked entry. The source is unique per manual entry. Returns the stored journal row. */
  function post(entry) {
    return S.ledger.postJournal({ ...entry, source: `manual:${S.store.newId()}` });
  }

  /** Reverses a posted entry at today's date. A second reversal of the same entry is refused by the data layer. */
  function reverse(id, memo) {
    return S.ledger.reverseJournal(id, { date: U.today(), memo: memo || undefined });
  }

  /** Journal entries, newest first. Resolves to a Result. */
  async function list() {
    const r = await S.store.list('journal');
    if (!r.ok) return r;
    const v = r.value.slice().sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));
    return { ok: true, value: v };
  }

  /** Ids of entries that have a reversing entry. */
  const reversedIds = (entries) => new Set(entries.filter((e) => e.reverses).map((e) => e.reverses));

  NS.journal = { buildEntry, post, reverse, list, reversedIds };
})(typeof window !== 'undefined' ? window : globalThis);
