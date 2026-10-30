// Slop Expenses: the pure parts (no DOM, no storage): the tax inside an amount, the list filter, the summary by month and
// category, and the CSV export. Recording and voiding are SlopData.expenses (shared/data/expenses.js). Classic script;
// exposes window.SlopExpenses.core (and module.exports for the Node tests).
(function (g) {
  'use strict';
  const ONE = 10000; // 100.00% in basis points, as shared/data/money.js

  /** The tax contained in an amount that includes it, at a rate in basis points (2000 = 20%), rounded half up. */
  function taxIn(amount, rate) {
    if (!Number.isSafeInteger(amount) || !rate || rate < 0) return 0;
    return Math.round((amount * rate) / (ONE + rate));
  }

  /** The expenses to list: matching the search (supplier, description, notes), the status ('all', 'posted', 'owed', 'void') and
   *  the date range (YYYY-MM-DD, both ends included), newest first. */
  function filter(list, q = {}) {
    const text = String(q.search || '').trim().toLowerCase();
    return (list || []).filter((e) => {
      if (e.deletedAt) return false;
      if (q.status && q.status !== 'all' && e.status !== q.status) return false;
      if (q.from && e.date < q.from) return false;
      if (q.to && e.date > q.to) return false;
      if (!text) return true;
      return [e.supplier, e.description, e.notes].some((s) => String(s || '').toLowerCase().includes(text));
    }).sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));
  }

  /** Posted expenses grouped by month (YYYY-MM, newest first), each with its total, tax and the total per account. Amounts
   *  in different currencies are kept apart by currency. */
  function summary(list) {
    const months = new Map();
    for (const e of list || []) {
      if ((e.status !== 'posted' && e.status !== 'owed') || e.deletedAt) continue;   // a bill owed is a cost of its month too
      const key = e.date.slice(0, 7) + ' ' + (e.currency || '');
      const m = months.get(key) || { month: e.date.slice(0, 7), currency: e.currency || '', count: 0, amount: 0, tax: 0, byAccount: {} };
      m.count++; m.amount += e.amount; m.tax += e.tax || 0;
      m.byAccount[e.account] = (m.byAccount[e.account] || 0) + e.amount;
      months.set(key, m);
    }
    return [...months.values()].sort((a, b) => (a.month === b.month ? (a.currency < b.currency ? -1 : 1) : a.month < b.month ? 1 : -1));
  }

  const cell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  /** CSV of expenses (a header line, then one line per expense, oldest first). names: account code -> name; plain(minor, currency)
   *  is the plain decimal text (SlopData.money.plainMinor). Amounts are plain decimals, so spreadsheets read them as numbers. */
  function csv(list, names, plain) {
    const head = ['Date', 'Supplier', 'Description', 'Category', 'Amount', 'Tax', 'Currency', 'Paid by', 'Status', 'Notes'];   // i18n-ignore: CSV columns and the claim text stored on the expense (records stay as written)
    const rows = [...(list || [])].filter((e) => !e.deletedAt).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((e) => {
      return [e.date, e.supplier, e.description, (names || {})[e.account] ? `${e.account} ${names[e.account]}` : e.account,
        plain(e.amount, e.currency), plain(e.tax || 0, e.currency), e.currency || '', e.method || '', e.status, e.notes].map(cell).join(',');
    });
    return [head.join(','), ...rows].join('\r\n') + '\r\n';
  }

  const api = { ONE, taxIn, filter, summary, csv };
  const NS = (g.SlopExpenses = g.SlopExpenses || {});
  NS.core = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
