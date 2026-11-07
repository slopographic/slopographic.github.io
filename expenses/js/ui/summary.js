// Slop Expenses summary: what was spent this month and this year, the tax to reclaim this year, a table by month with its
// biggest categories, and the CSV of every expense (for a spreadsheet or the accountant).
(function (g) {
  'use strict';
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const S = g.SlopData, B = g.SlopBiz, UI = g.SlopUI, el = g.SlopUI.el;
  const NS = (g.SlopExpenses = g.SlopExpenses || {});
  const $ = (id) => document.getElementById(id);

  async function draw() {
    const [r, s, accts] = await Promise.all([S.store.list('expenses'), B.settings(), B.expenseAccounts()]);
    const all = r.ok ? r.value : [], names = Object.fromEntries(accts.map((a) => [a.code, a.name]));
    const months = NS.core.summary(all).filter((m) => (m.currency || s.currency) === s.currency);
    const now = S.ledger.today(), thisMonth = now.slice(0, 7), thisYear = now.slice(0, 4);
    const year = months.filter((m) => m.month.startsWith(thisYear));
    const sum = (list, k) => list.reduce((acc, m) => acc + m[k], 0), money = (v) => B.money(v, s.currency, s.locale);
    const stat = (value, label) => el('div', { class: 'stat' }, el('b', null, value), el('span', null, label));
    $('sStats').replaceChildren(
      stat(money(sum(months.filter((m) => m.month === thisMonth), 'amount')), t('expenses.su.month')),
      stat(money(sum(year, 'amount')), t('expenses.su.year', { year: thisYear })),
      stat(money(sum(year, 'tax')), t('expenses.su.tax', { year: thisYear })));
    const top = (m) => Object.entries(m.byAccount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([code, v]) => `${names[code] || code} ${money(v)}`).join(' · ');
    $('sMonths').replaceChildren(...months.map((m) => el('tr', null, el('th', { scope: 'row' }, m.month), el('td', { class: 'num' }, String(m.count)),
      el('td', { class: 'num' }, money(m.amount)), el('td', { class: 'num' }, money(m.tax)), el('td', null, top(m)))));
    $('sEmpty').hidden = months.length > 0;
    const other = all.filter((e) => e.currency && e.currency !== s.currency && e.status === 'posted').length;
    $('sOther').textContent = other ? t('expenses.su.other', { n: other }) : '';
  }

  async function exportCsv() {
    const [r, accts] = await Promise.all([S.store.list('expenses'), B.expenseAccounts()]);
    if (!r.ok) { UI.alert(t('expenses.su.not_exported'), B.refusal(r)); return; }
    const text = NS.core.csv(r.value, Object.fromEntries(accts.map((a) => [a.code, a.name])), (m, c) => S.money.plainMinor(m, c || 'USD'));
    UI.download(new Blob(['﻿' + text], { type: 'text/csv' }), `expenses-${S.ledger.today()}.csv`);
  }

  function mount() { $('sCsv').addEventListener('click', exportCsv); }

  NS.summaryView = { exportCsv };
  NS.views = NS.views || {};
  NS.views.summary = { mount, show: draw, refresh: draw };
})(typeof window !== 'undefined' ? window : globalThis);
