/* Slop Reports: derived fields. A report names them in "enrich"; each one adds a field to every row of its source
 * collection and reads the other collections it needs from data (read-only). Pure. Classic script: sets
 * window.SlopReports.enrich. An enricher may also leave rows out. */
(function (g) {
  'use strict';
  const ns = (g.SlopReports = g.SlopReports || {});
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  ns.enrich = {
    /** Invoices: paid (the payments made, in the invoice's currency) and balance (an issued invoice's total less paid and its
     *  credit notes, plus what they paid back, as SlopData.billing.balanceDue; 0 otherwise). */
    invoiceBalance(rows, data) {
      const paid = new Map();
      for (const p of data.payments || []) paid.set(p.invoiceId, (paid.get(p.invoiceId) || 0) + num(p.amount));
      return rows.map((r) => {
        const got = paid.get(r.id) || 0;
        return { ...r, paid: got, balance: r.status === 'issued' ? Math.max(0, num(r.total) - got - num(r.credited) + num(r.refunded)) : 0 };
      });
    },
    /** Customers: value, the total of their issued and paid invoices in the base currency. An invoice in another currency
     * counts only with its amountBase; one with neither is left out, since it cannot be converted. */
    customerValue(rows, data) {
      const main = (data.settings || []).find((s) => s.id === 'main') || {};
      const baseCur = main.defaultCurrency || 'USD';
      const value = new Map();
      for (const inv of data.invoices || []) {
        if (inv.status !== 'issued' && inv.status !== 'paid') continue;
        let base;
        if (typeof inv.amountBase === 'number') base = inv.amountBase;
        else if (!inv.currency || inv.currency === baseCur) base = num(inv.total);
        else continue;
        value.set(inv.customerId, (value.get(inv.customerId) || 0) + base);
      }
      return rows.map((r) => ({ ...r, value: value.get(r.id) || 0 }));
    },
    /** Time entries: value, what the time is worth at its rate when billable, else 0 (SlopData.timesheets.amountOf,
     * shared/data/timesheets.js). */
    timeValue(rows) {
      const T = g.SlopData.timesheets;
      return rows.map((r) => ({ ...r, value: r.billable ? T.amountOf(r) : 0 }));
    },
    /** Journal entries: month, cashIn, cashOut and net, what the entry moved into or out of cash and the bank (the chart's
     * CASH and BANK accounts, SlopData.schemaDefs.ACCT), in the base currency. A move between cash and the bank is left
     * out, and so is an entry that does not touch either. */
    cash(rows) {
      const A = g.SlopData.schemaDefs.ACCT, money = new Set([A.CASH, A.BANK]), out = [];
      for (const r of rows) {
        let net = 0, touched = false;
        for (const l of r.lines || []) if (money.has(l.account)) { touched = true; net += num(l.debit) - num(l.credit); }
        if (touched && net) out.push({ ...r, month: String(r.date || '').slice(0, 7), cashIn: Math.max(0, net), cashOut: Math.max(0, -net), net });
      }
      return out;
    },
    /** Journal entries: quarter (2026-Q4), collected (sales tax credited on sales), reclaimed (tax debited on purchases and
     * expenses) and due (collected less reclaimed), on the chart's TAX_PAYABLE account, in the base currency. A reversal (a
     * void) takes its amount off the side its original entry was on, and a credit note off the tax collected. Entries without
     * tax are left out. */
    salesTax(rows) {
      const tax = g.SlopData.schemaDefs.ACCT.TAX_PAYABLE, out = [];
      for (const r of rows) {
        let collected = 0, reclaimed = 0;
        const credit = String(r.source || '').startsWith('credit:');
        for (const l of r.lines || []) {
          if (l.account !== tax) continue;
          // a reversal (a void) and a credit note (SlopData.credits: source credit:<id>) take tax back off what was collected
          if (r.reverses) { collected -= num(l.debit); reclaimed -= num(l.credit); } else if (credit) collected -= num(l.debit); else { collected += num(l.credit); reclaimed += num(l.debit); }
        }
        if (!collected && !reclaimed) continue;
        const d = String(r.date || '');
        out.push({ ...r, quarter: `${d.slice(0, 4)}-Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`, collected, reclaimed, due: collected - reclaimed });
      }
      return out;
    },
    /** Quotes: month, wins and losses (1 or 0), won (1 accepted, 0 declined, empty while draft or sent, so the win rate is
     * the average of the decided ones) and the value won (the total of an accepted quote). */
    quoteOutcome(rows) {
      return rows.map((r) => ({ ...r, month: String(r.date || '').slice(0, 7), wins: r.status === 'accepted' ? 1 : 0, losses: r.status === 'declined' ? 1 : 0,
        won: r.status === 'accepted' ? 1 : r.status === 'declined' ? 0 : null, wonValue: r.status === 'accepted' ? num(r.total) : 0 }));
    },
    /** Any dated rows: month, the YYYY-MM of their date. */
    month(rows) {
      return rows.map((r) => ({ ...r, month: typeof r.date === 'string' ? r.date.slice(0, 7) : undefined }));
    },
    /** Journal entries: month, income (revenue credits less debits), expense (expense debits less credits) and profit
     * (income less expense), all in the base currency. An entry that touches no revenue or expense account is left out. */
    profit(rows, data) {
      const type = new Map((data.accounts || []).map((a) => [a.code, a.type]));
      const out = [];
      for (const r of rows) {
        let income = 0, expense = 0;
        for (const l of r.lines || []) {
          const t = type.get(l.account), net = num(l.debit) - num(l.credit);
          if (t === 'revenue') income -= net;
          else if (t === 'expense') expense += net;
        }
        if (income || expense) out.push({ ...r, month: String(r.date || '').slice(0, 7), income, expense, profit: income - expense });
      }
      return out;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
