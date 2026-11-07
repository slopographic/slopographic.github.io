// Expenses: money going out (a supplier's bill, a receipt). The only code that records, pays or voids one: each step writes
// the expense and its journal entry in one transaction, so the books always match. An expense is posted when it is recorded:
// the expense account is debited with the amount without tax, the tax account with the reclaimable tax (it lowers the tax
// owed), and cash or bank is credited with what was paid. A bill to pay later (payLater, status owed) credits Accounts
// Payable instead; paying it later moves the amount from Accounts Payable to cash or bank. Voiding reverses what was
// posted. A foreign-currency expense is posted at its date's rate (see fx.js).
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js
  const { fail } = ns.result;
  const A = () => ns.schema.ACCT;

  /** The account money leaves from: cash, or the bank (card and other methods are paid from the bank). */
  const payFrom = (method) => (method === 'cash' ? A().CASH : A().BANK);
  /** Pure: journal lines for an expense: amount (tax included), tax, account (the expense account), and the credit to cash
   *  or bank (method), or to Accounts Payable for a bill not paid yet (status owed). */
  function expenseLines(e) {
    const net = e.amount - (e.tax || 0);
    const lines = [];
    if (net) lines.push({ account: e.account || A().EXPENSES, debit: net, credit: 0 });
    if (e.tax) lines.push({ account: A().TAX_PAYABLE, debit: e.tax, credit: 0 });
    lines.push({ account: e.status === 'owed' ? A().AP : payFrom(e.method), debit: 0, credit: e.amount });
    return lines;
  }

  /** Records an expense and posts it. input: { date, supplier, description, account, amount, tax, currency, method,
   *  receiptId, notes, payLater, dueDate }. account must be an expense account in the chart (default 5000). payLater
   *  records a bill owed to the supplier (Accounts Payable), due on dueDate; pay() settles it. */
  const record = (input) => ns.store.transact((tx) => recordIn(tx, input));

  /** record() inside a transaction the caller holds (Slop Purchases records a bill with its purchase order). */
  async function recordIn(tx, input) {
    const { payLater, ...e } = { ...(input || {}) };
    const acct = await tx.get('accounts', e.account || A().EXPENSES);
    if (!acct.ok) return acct;
    if (!acct.value || acct.value.type !== 'expense') return fail('invalid', say('ui.data.exp.not_expense', { code: String(e.account) }), [{ field: 'account', message: say('ui.data.exp.choose') }]);
    const id = ns.store.newId();
    const status = payLater ? 'owed' : 'posted';
    const rec = await tx.put('expenses', { ...e, id, account: acct.value.code, date: e.date || ns.ledger.today(), status, dueDate: payLater ? e.dueDate : undefined,
      paidDate: payLater ? undefined : e.date || ns.ledger.today() }, { posting: true });
    if (!rec.ok) return rec;
    const j = await ns.ledger.postIn(tx, {
      date: rec.value.date, memo: `Expense: ${rec.value.supplier}`, source: `expense:${id}`, lines: expenseLines(rec.value), currency: rec.value.currency,
    });
    if (!j.ok) return j;
    return tx.put('expenses', { ...rec.value, rateId: j.value.rateId, rate: j.value.rate, amountBase: j.value.amountBase }, { posting: true });
  }

  /** Owed -> posted: pays a bill. Accounts Payable is debited and cash or bank credited, on the date paid. input: { date, method }. */
  function pay(id, { date, method = 'bank' } = {}) {
    return ns.store.transact(async (tx) => {
      const r = await tx.get('expenses', id);
      if (!r.ok) return r;
      if (!r.value) return fail('not_found', say('ui.data.exp.none', { id: String(id) }));
      if (r.value.status !== 'owed') return fail('invalid_transition', say('ui.data.exp.pay_owed'));
      const day = date || ns.ledger.today();
      if (day < r.value.date) return fail('invalid', say('ui.data.exp.pay_early'), [{ field: 'date', message: say('ui.data.exp.pay_on') }]);
      const base = r.value.amountBase !== undefined ? r.value.amountBase : r.value.amount;
      const j = await ns.ledger.postIn(tx, { date: day, memo: `Bill paid: ${r.value.supplier}`, source: `expense:${id}:paid`,
        lines: [{ account: A().AP, debit: base, credit: 0 }, { account: payFrom(method), debit: 0, credit: base }] });
      if (!j.ok) return j;
      return tx.put('expenses', { ...r.value, status: 'posted', method, paidDate: day }, { posting: true });
    });
  }

  /** Posted or owed -> void: reverses what the expense posted (and its payment, for a bill paid later). The record stays,
   *  marked void, so the history is kept. */
  function voidExpense(id) {
    return ns.store.transact(async (tx) => {
      const r = await tx.get('expenses', id);
      if (!r.ok) return r;
      if (!r.value) return fail('not_found', say('ui.data.exp.none', { id: String(id) }));
      if (r.value.status !== 'posted' && r.value.status !== 'owed') return fail('invalid_transition', say('ui.data.exp.void'));
      const v = await tx.put('expenses', { ...r.value, status: 'void' }, { posting: true });
      if (!v.ok) return v;
      for (const src of [`expense:${id}:paid`, `expense:${id}`]) {
        const je = await tx.list('journal', { index: 'source', value: src, includeDeleted: true });
        if (!je.ok) return je;
        if (!je.value.length) continue;
        const rev = await ns.ledger.reverseIn(tx, je.value[0].id, { memo: `Void expense: ${r.value.supplier}` });
        if (!rev.ok) return rev;
      }
      return v;
    });
  }

  /** Pure: is a bill owed and past its due date on a day? */
  const overdue = (e, day) => e.status === 'owed' && !!e.dueDate && e.dueDate < day;

  /** Pure: totals of posted expenses and owed bills (void ones left out), in their own currencies:
   *  { count, amount, tax, owed, byAccount } (owed: what is still to pay). */
  function totals(list) {
    const out = { count: 0, amount: 0, tax: 0, owed: 0, byAccount: {} };
    for (const e of list || []) {
      if (e.status === 'void' || e.deletedAt) continue;
      out.count++; out.amount += e.amount; out.tax += e.tax || 0;
      if (e.status === 'owed') out.owed += e.amount;
      out.byAccount[e.account] = (out.byAccount[e.account] || 0) + e.amount;
    }
    return out;
  }

  ns.expenses = { expenseLines, record, recordIn, pay, voidExpense, overdue, totals };
})(typeof window !== 'undefined' ? window : globalThis);
