// Slop Ledger: the financial statements, from the journal. Pure (the account totals come from SlopData.ledger.summarize,
// the one place that adds up the journal); the Node tests load it after shared/data/ledger.js. Exposes
// SlopLedger.statements:
//   period(kind, today)                    -> { from, to } for 'month', 'quarter', 'year', 'last-year' (YYYY-MM-DD)
//   profitAndLoss(entries, accounts, { from, to })
//       -> { revenue: [{ code, name, amount }], expenses: [...], totalRevenue, totalExpenses, result }
//   balanceSheet(entries, accounts, { at })
//       -> { assets, liabilities, equity: [... rows], resultToDate, totalAssets, totalLiabilities, totalEquity, balanced }
//   Amounts are base minor units on each account's normal side (revenue and liabilities positive as credits). The books are
//   never closed into equity, so the balance sheet shows everything earned and spent up to its date as "Result to date".
(function (g) {
  'use strict';
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const L = () => g.SlopData.ledger;
  const pad = (n) => String(n).padStart(2, '0');
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m is 1-based

  function period(kind, today) {
    const y = +today.slice(0, 4), m = +today.slice(5, 7);
    if (kind === 'month') return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
    if (kind === 'quarter') { const q0 = Math.floor((m - 1) / 3) * 3 + 1; return { from: `${y}-${pad(q0)}-01`, to: `${y}-${pad(q0 + 2)}-${pad(lastDay(y, q0 + 2))}` }; }
    if (kind === 'last-year') return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }

  /** The account totals of the entries inside a date range (from and to included; either may be empty). */
  function rows(entries, accounts, from, to) {
    const inside = (entries || []).filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
    return L().summarize(inside, accounts || []).rows;
  }
  const of = (list, type) => list.filter((r) => r.type === type && r.balance !== 0).map((r) => ({ code: r.code, name: r.name, amount: r.balance }));
  const sum = (list) => list.reduce((t, r) => t + r.amount, 0);

  function profitAndLoss(entries, accounts, { from, to }) {
    const r = rows(entries, accounts, from, to);
    const revenue = of(r, 'revenue'), expenses = of(r, 'expense');
    const totalRevenue = sum(revenue), totalExpenses = sum(expenses);
    return { from, to, revenue, expenses, totalRevenue, totalExpenses, result: totalRevenue - totalExpenses };
  }

  function balanceSheet(entries, accounts, { at }) {
    const r = rows(entries, accounts, '', at);
    const assets = of(r, 'asset'), liabilities = of(r, 'liability'), equity = of(r, 'equity');
    const resultToDate = sum(of(r, 'revenue')) - sum(of(r, 'expense'));
    const totalAssets = sum(assets), totalLiabilities = sum(liabilities), totalEquity = sum(equity) + resultToDate;
    return { at, assets, liabilities, equity, resultToDate, totalAssets, totalLiabilities, totalEquity, balanced: totalAssets === totalLiabilities + totalEquity };
  }

  NS.statements = { period, profitAndLoss, balanceSheet };
})(typeof window !== 'undefined' ? window : globalThis);
