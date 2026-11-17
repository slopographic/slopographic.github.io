// Customer statements: one customer's issued invoices, payments and credit notes (and the refunds paid with them) in one
// currency, oldest first, with a running balance,
// what was owed before the period (opening) and at its end (closing), and how old the amount still owed is (ageing by days
// past the due date: not yet due, 1-30, 31-60, 61-90, over 90). Pure: the invoices and payments come in, nothing is stored.
// Drafts, void and deleted invoices are left out (a void invoice owes nothing). Exposes SlopData.statement.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const DAY = 86400000;
  const KIND = { invoice: 'Invoice', payment: 'Payment', credit: 'Credit note', refund: 'Refund' };
  const days = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
  const counts = (inv) => (inv.status === 'issued' || inv.status === 'paid' || inv.status === 'credited') && !inv.deletedAt;

  /** The currencies a customer has issued invoices in, most used first. */
  function currencies(invoices, customerId) {
    const n = new Map();
    for (const inv of invoices) if (inv.customerId === customerId && counts(inv)) n.set(inv.currency, (n.get(inv.currency) || 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([c]) => c);
  }

  /** The statement. opts: { currency, from (YYYY-MM-DD, '' = from the start), today, credits (credit notes, optional) }.
   *  Result: { currency, from, today, opening, lines: [{ date, kind: 'invoice' | 'payment' | 'credit' | 'refund', ref, due,
   *  debit, credit, balance }], closing, owed: [{ ref, date, due, left, late }], ageing: { current, d30, d60, d90, over90 } }.
   *  Money is minor units. */
  function build(invoices, payments, customerId, { currency, from = '', today, credits = [] }) {
    const mine = invoices.filter((inv) => inv.customerId === customerId && inv.currency === currency && counts(inv));
    const byId = new Map(mine.map((inv) => [inv.id, inv]));
    const events = [];
    for (const inv of mine) events.push({ date: inv.date, kind: 'invoice', ref: inv.number || '', due: inv.dueDate || inv.date, debit: inv.total, credit: 0, at: 0 });
    for (const p of payments) {
      const inv = byId.get(p.invoiceId);
      if (inv) events.push({ date: p.date, kind: 'payment', ref: inv.number || '', due: '', debit: 0, credit: p.amount, at: 1 });
    }
    for (const c of credits) {
      if (!byId.has(c.invoiceId)) continue;
      events.push({ date: c.date, kind: 'credit', ref: c.number, due: '', debit: 0, credit: c.amount, at: 2 });
      if (c.refund) events.push({ date: c.date, kind: 'refund', ref: c.number, due: '', debit: c.refund, credit: 0, at: 3 });
    }
    events.sort((a, b) => (a.date === b.date ? a.at - b.at : a.date < b.date ? -1 : 1));
    let opening = 0, balance = 0;
    const lines = [];
    for (const e of events) {
      balance += e.debit - e.credit;
      if (from && e.date < from) { opening = balance; continue; }
      lines.push({ date: e.date, kind: e.kind, ref: e.ref, due: e.due, debit: e.debit, credit: e.credit, balance });
    }
    const paid = new Map();
    for (const p of payments) if (byId.has(p.invoiceId)) paid.set(p.invoiceId, (paid.get(p.invoiceId) || 0) + p.amount);
    const ageing = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 }, owed = [];
    for (const inv of mine) {
      const left = inv.total - (paid.get(inv.id) || 0) - (inv.credited || 0) + (inv.refunded || 0);
      if (left <= 0) continue;
      const late = Math.max(0, days(inv.dueDate || inv.date, today));
      owed.push({ ref: inv.number || '', date: inv.date, due: inv.dueDate || inv.date, left, late });
      ageing[late === 0 ? 'current' : late <= 30 ? 'd30' : late <= 60 ? 'd60' : late <= 90 ? 'd90' : 'over90'] += left;
    }
    owed.sort((a, b) => (a.due < b.due ? -1 : 1));
    return { currency, from, today, opening, lines, closing: balance, owed, ageing };
  }

  /** Pure: the statement as CSV (a header, then one line per event, with plain amounts through plain(minor)). */
  function csv(st, plain) {
    const cell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const out = [['Date', 'What', 'Invoice', 'Due', 'Charged', 'Paid', 'Balance'].join(',')];
    if (st.from) out.push(['', 'Opening balance', '', '', '', '', plain(st.opening)].map(cell).join(','));
    for (const l of st.lines) out.push([l.date, KIND[l.kind], l.ref, l.due, l.debit ? plain(l.debit) : '', l.credit ? plain(l.credit) : '', plain(l.balance)].map(cell).join(','));
    return out.join('\r\n') + '\r\n';
  }

  /** Pure: a payment reminder for a statement's open invoices: { tone: 'none' | 'friendly' | 'firm' | 'final', subject, body }.
   *  The tone follows the most overdue invoice: due or up to 30 days late is friendly, up to 60 firm, beyond that final.
   *  who: { customer, company }; money(minor) formats an amount; words: the document language's words (SlopBiz.docLang.words:
   *  t(key, vars) for the biz.pr.rm_* texts and day(iso) for the dates; default SlopI18n's, dates as stored).
   *  Nothing owed: tone none and no text. */
  function reminder(st, { customer, company }, money, words) {
    if (!st.owed.length || st.closing <= 0) return { tone: 'none', subject: '', body: '' };
    const tx = words ? words.t : (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k), day = words && words.day ? words.day : (d) => d;
    const late = Math.max(...st.owed.map((o) => o.late));
    const tone = late <= 30 ? 'friendly' : late <= 60 ? 'firm' : 'final';
    const list = st.owed.map((o) => tx(o.late ? 'biz.pr.rm_line_late' : 'biz.pr.rm_line', { ref: o.ref, due: day(o.due), amount: money(o.left), n: o.late })).join('\n');
    const subject = tx(`biz.pr.rm_subject_${tone}`, { amount: money(st.closing) });
    const sign = company && company.trim() ? tx('biz.pr.rm_sign', { company: company.trim() }) : tx('biz.pr.rm_thanks');   // no company name: no name line
    const body = [tx('biz.pr.rm_hello', { name: customer }), tx(`biz.pr.rm_open_${tone}`), list, tx('biz.pr.rm_balance', { amount: money(st.closing) }), sign].join('\n\n');
    return { tone, subject, body };
  }

  ns.statement = { currencies, build, csv, reminder, KIND };
})(typeof window !== 'undefined' ? window : globalThis);
