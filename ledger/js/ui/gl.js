// The General ledger tab: every line of one account in date order, with the running balance on the account's normal
// side. Base amounts are shown; a foreign line also shows the original amount next to its base amount.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const el = g.SlopUI.el;
  const $ = (id) => document.getElementById(id);

  /** Pure: the lines of one account with the running balance. entries are in any order. */
  function ledgerRows(entries, code, type) {
    const side = NS.util.TYPE_SIDE[type] || 'debit';
    const sorted = entries.slice().sort((a, b) => (a.date === b.date ? (a.createdAt || 0) - (b.createdAt || 0) : a.date < b.date ? -1 : 1));
    let bal = 0;
    const rows = [];
    for (const e of sorted) {
      for (const l of e.lines) {
        if (l.account !== code) continue;
        bal += side === 'debit' ? l.debit - l.credit : l.credit - l.debit;
        rows.push({ date: e.date, memo: e.memo || e.source, debit: l.debit, credit: l.credit, fx: !!e.rateId, cur: e.currency,
          origDebit: l.origDebit || 0, origCredit: l.origCredit || 0, balance: bal });
      }
    }
    return { rows, balance: bal };
  }

  async function render() {
    const s = await NS.util.settings();
    const acc = await NS.util.accounts();
    if (!acc.ok) { $('gSummary').textContent = NS.util.refusal(acc); return; }
    const keep = $('gAcct').value;
    $('gAcct').replaceChildren(...acc.value.map((a) => el('option', { value: a.code }, `${a.code} ${a.name}`)));
    if (acc.value.some((a) => a.code === keep)) $('gAcct').value = keep;
    const a = acc.value.find((x) => x.code === $('gAcct').value) || acc.value[0];
    if (!a) return;
    const j = await NS.journal.list();
    if (!j.ok) { $('gSummary').textContent = NS.util.refusal(j); return; }
    const { rows, balance } = ledgerRows(j.value, a.code, a.type);
    const money = (m, c) => NS.util.money(m, c, s.locale);
    const body = rows.map((r) => el('tr', null,
      el('td', null, S.locale.formatDate(r.date, s.locale)), el('td', null, r.memo),
      el('td', { class: 'num' }, r.debit ? money(r.debit, s.base) : ''), el('td', { class: 'num' }, r.credit ? money(r.credit, s.base) : ''),
      el('td', { class: 'num' }, r.fx ? [money(r.origDebit || r.origCredit, r.cur), ' ', `(${r.cur})`] : ''),
      el('td', { class: 'num' }, money(r.balance, s.base))));
    $('gRows').replaceChildren(...body);
    $('gEmpty').hidden = rows.length > 0;
    const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
    const TYPE = { asset: t('ledger.type.asset'), liability: t('ledger.type.liability'), equity: t('ledger.type.equity'), revenue: t('ledger.type.revenue'), expense: t('ledger.type.expense') };
    const SIDE = { debit: t('ledger.side.debit'), credit: t('ledger.side.credit') };
    $('gSummary').textContent = t('ledger.gl.summary', { name: a.name, type: TYPE[a.type] || a.type, amount: money(balance, s.base), side: SIDE[NS.util.TYPE_SIDE[a.type]] || NS.util.TYPE_SIDE[a.type] });
  }

  function mount() {
    $('gAcct').addEventListener('change', render);
  }

  NS.views = NS.views || {};
  NS.views.gl = { mount, render };
  NS.ledgerRows = ledgerRows;
})(typeof window !== 'undefined' ? window : globalThis);
