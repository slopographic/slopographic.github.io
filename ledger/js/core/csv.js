// CSV export for the trial balance and the journal. Plain decimal amounts (no symbols), RFC 4180 quoting.
// Each export returns { name, blob } so the page can offer it as a download.
(function (g) {
  'use strict';
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const U = NS.util;

  /** One CSV cell: quoted when it holds a comma, quote or line break. */
  function cell(v) {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  const toCsv = (rows) => `${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
  const blobOf = (rows) => new Blob([toCsv(rows)], { type: 'text/csv' });

  /** Trial balance in base currency, with the totals and the foreign totals as their own rows. */
  function trialCsv(tb, base, date) {
    const rows = [['Code', 'Account', 'Type', `Debit (${base})`, `Credit (${base})`, `Balance (${base})`]];   // i18n-ignore: CSV columns, a file format for other programs
    for (const r of tb.rows) rows.push([r.code, r.name, r.type, U.decimal(r.debit, base), U.decimal(r.credit, base), U.decimal(r.balance, base)]);
    rows.push(['', 'Total', '', U.decimal(tb.debit, base), U.decimal(tb.credit, base), '']);   // i18n-ignore: CSV columns, a file format for other programs
    rows.push(['', `Check: base totals ${tb.balanced ? 'agree' : 'DO NOT agree'}`, '', '', '', '']);   // i18n-ignore: CSV columns, a file format for other programs
    for (const f of tb.foreign) rows.push(['', `Foreign total ${f.currency} (original amounts)`, '', U.decimal(f.debit, f.currency), U.decimal(f.credit, f.currency), f.balanced ? 'balanced' : 'not balanced']);   // i18n-ignore: CSV columns, a file format for other programs
    return { name: `trial-balance-${date}.csv`, blob: blobOf(rows) };
  }

  /** The journal: one row per line. Foreign lines also carry the original amounts and the rate used. */
  function journalCsv(entries, accounts, base, date) {
    const names = new Map(accounts.map((a) => [a.code, a.name]));
    const rows = [['Date', 'Entry', 'Memo', 'Source', 'Account', 'Account name', `Debit (${base})`, `Credit (${base})`, 'Currency', 'Original debit', 'Original credit', 'Rate']];   // i18n-ignore: CSV columns, a file format for other programs
    for (const e of entries) {
      for (const l of e.lines) {
        const fx = !!e.rateId;
        rows.push([e.date, e.id, e.memo || '', e.source, l.account, names.get(l.account) || '', U.decimal(l.debit, base), U.decimal(l.credit, base),
          fx ? e.currency : base, fx ? U.decimal(l.origDebit || 0, e.currency) : '', fx ? U.decimal(l.origCredit || 0, e.currency) : '',
          fx ? (e.rate / 1e6).toFixed(6) : '']);
      }
    }
    return { name: `journal-${date}.csv`, blob: blobOf(rows) };
  }

  NS.csv = { cell, toCsv, trialCsv, journalCsv };
})(typeof window !== 'undefined' ? window : globalThis);
