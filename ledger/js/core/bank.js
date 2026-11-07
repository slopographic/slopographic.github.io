// Slop Ledger: bank reconciliation, the pure part. A bank statement (CSV rows) becomes lines, each line is matched to the
// journal entry that moved the same account by the same amount, and what is left is for the person to record or set aside.
// Pure: no page and no storage; the Node tests load it after shared/data/readtext.js. Exposes SlopLedger.bank:
//   columns(header)                -> { date, description, amount } or { date, description, debit, credit } (column indexes)
//   linesOf(rows, { dayFirst })    -> { lines: [{ date, description, amount, key }], skipped, columns } (rows from a CSV parser)
//   linesFromStatement(model, { digits }) -> { lines, skipped } from an OFX, QIF, camt.053 or MT940 statement (shared/finance)
//   moves(entries, account)        -> [{ journalId, date, amount, memo }] what each journal entry did to the account
//   match(lines, moves, { days })  -> [{ line, move }] each open line paired with an unused move of the same amount, the
//                                     nearest date within `days` (default 5) first
(function (g) {
  'use strict';
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const RT = () => g.SlopData.readText;
  const NAMES = {
    date: /^(date|datum|booking ?date|transaction ?date|posted|value ?date|bokf(ö|o)ringsdag|transaktionsdag|buchungstag|valuta|fecha)/i,
    description: /^(description|details?|text|memo|payee|merchant|narrative|reference|beskrivning|meddelande|mottagare|verwendungszweck|beg(ü|u)nstigter|concepto)/i,
    amount: /^(amount|belopp|betrag|importe|montant|sum|value|transaction ?amount)/i,
    debit: /^(debit|withdrawals?|money ?out|paid ?out|uttag|soll|out)\b/i,
    credit: /^(credit|deposits?|money ?in|paid ?in|ins(ä|a)ttning|haben|in)\b/i,
  };
  const DAY = 86400000;
  const gap = (a, b) => Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY;

  /** The statement's columns from its header row; null when it has no date column or no amount. */
  function columns(header) {
    const at = (rx) => header.findIndex((h) => rx.test(String(h || '').trim()));
    const c = { date: at(NAMES.date), description: at(NAMES.description), amount: at(NAMES.amount), debit: at(NAMES.debit), credit: at(NAMES.credit) };
    if (c.date < 0) return null;
    if (c.amount >= 0) return { date: c.date, description: c.description, amount: c.amount };
    if (c.debit >= 0 && c.credit >= 0) return { date: c.date, description: c.description, debit: c.debit, credit: c.credit };
    return null;
  }

  /** Statement rows (the first is the header) as lines. A row without a date or an amount is skipped (a balance line,
   *  a blank line). key: date, amount, text and the line's place among identical lines, so a second import adds nothing. */
  function linesOf(rows, { dayFirst = true } = {}) {
    const all = (rows || []).filter((r) => r && r.some((c) => String(c || '').trim()));
    const head = all.findIndex((r) => columns(r));
    if (head < 0) return { lines: [], skipped: all.length, columns: null };
    const col = columns(all[head]), seen = new Map(), lines = [];
    let skipped = 0;
    for (const r of all.slice(head + 1)) {
      const date = RT().dateIn(r[col.date], dayFirst);
      let amount = null;
      if (col.amount !== undefined) amount = RT().amountOf(r[col.amount]);
      else {
        const out = RT().amountOf(r[col.debit]), inn = RT().amountOf(r[col.credit]);
        if (out || inn) amount = (inn ? Math.abs(inn) : 0) - (out ? Math.abs(out) : 0);
      }
      if (!date || !amount) { skipped++; continue; }
      const description = col.description >= 0 ? String(r[col.description] || '').trim().replace(/\s+/g, ' ').slice(0, 300) : '';
      const base = `${date}|${amount}|${description.toLowerCase()}`, n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      lines.push({ date, description, amount, key: `${base}|${n}` });
    }
    return { lines, skipped, columns: col };
  }

  /** A bank statement read by shared/finance (OFX, QIF, camt.053, MT940: the statement model) as lines, keyed the same way
   *  as CSV lines. Amounts become minor units with the currency's digits. Pending and information-only entries (camt Sts
   *  PDNG, INFO) are skipped: the bank has not booked them. */
  function linesFromStatement(model, { digits = 2 } = {}) {
    const seen = new Map(), lines = [];
    let skipped = 0;
    for (const t of (model && model.transactions) || []) {
      const amount = Math.round(Number(t.amount) * 10 ** digits);
      if (!t.date || !amount || /^(PDNG|INFO)$/i.test(t.status || '')) { skipped++; continue; }
      const who = String(t.counterparty || '').trim(), what = String(t.text || '').trim();
      const description = (who && !what.toLowerCase().includes(who.toLowerCase()) ? `${who} · ${what}` : what || who).replace(/\s+/g, ' ').replace(/ · $/, '').slice(0, 300);
      const base = `${t.date}|${amount}|${description.toLowerCase()}`, n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      lines.push({ date: t.date, description, amount, key: `${base}|${n}` });
    }
    return { lines, skipped };
  }

  /** What each journal entry did to one account (base minor units: debit is money in for a bank account). */
  function moves(entries, account) {
    const out = [];
    for (const e of entries || []) {
      let net = 0;
      for (const l of e.lines || []) if (l.account === account) net += (l.debit || 0) - (l.credit || 0);
      if (net) out.push({ journalId: e.id, date: e.date, amount: net, memo: e.memo || '' });
    }
    return out;
  }

  /** Open lines paired with unused moves of the same amount, the nearest date first. Lines already matched (journalId)
   *  keep their move: it is not offered again. */
  function match(lines, mv, { days = 5 } = {}) {
    const used = new Set((lines || []).filter((l) => l.journalId).map((l) => l.journalId));
    const pairs = [];
    const open = (lines || []).filter((l) => (l.status || 'open') === 'open' && !l.journalId);
    const cands = [];
    for (const line of open) for (const move of mv) {
      if (move.amount === line.amount && !used.has(move.journalId) && gap(line.date, move.date) <= days) cands.push({ line, move, d: gap(line.date, move.date) });
    }
    cands.sort((a, b) => a.d - b.d || (a.line.date < b.line.date ? -1 : 1));
    const done = new Set();
    for (const c of cands) {
      if (done.has(c.line) || used.has(c.move.journalId)) continue;
      done.add(c.line); used.add(c.move.journalId);
      pairs.push({ line: c.line, move: c.move });
    }
    return pairs;
  }

  NS.bank = { columns, linesOf, linesFromStatement, moves, match };
})(typeof window !== 'undefined' ? window : globalThis);
