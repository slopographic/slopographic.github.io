/* Finance files: the two shared models every parser in shared/finance/ returns, and the helpers that build and check them.
 * Pure, ES module. Amounts are Numbers in the file's currency (two decimals for most currencies); dates are 'YYYY-MM-DD'.
 *
 * Ledger model (an accounting export: SIE, from sie.js):
 *   { format, company, orgNo, currency, years: [{ index, from, to }], accounts: [{ number, name, type }],
 *     openingBalances, closingBalances, results: [{ year, account, amount }],
 *     vouchers: [{ series, number, date, text, lines: [{ account, amount, date?, text?, objects?: [{ dim, id }] }] }],
 *     warnings: [text] }
 *   type is the ledger's word: asset, liability, equity, revenue or expense. A debit is positive, a credit negative.
 *   year: 0 is the file's current year, -1 the year before (SIE numbering).
 *
 * Statement model (a bank statement: OFX, QIF, camt.053, MT940):
 *   { format, account, currency, from, to, opening, closing, openingDate, closingDate,
 *     transactions: [{ date, valueDate?, amount, text, ref, counterparty, type?, status?, id?, account? }],
 *     statements?: [the same fields, one per statement when the file holds several], warnings: [text] }
 *   amount is signed from the account holder's side: money in is positive, money out negative. opening and closing are
 *   null when the file does not give them. id is the bank's own id for the line (OFX FITID, camt AcctSvcrRef);
 *   account is set on each transaction when the file holds several statements.      */
import { cents, say } from './text.js';

/** An empty statement model of a format. */
export function statementModel(format) {
  return { format, account: '', currency: '', from: null, to: null, opening: null, closing: null, openingDate: null, closingDate: null, transactions: [], warnings: [] };
}

/** One model from several statements of a file: the first account and opening, the last closing, every transaction.
 *  The statements stay in statements when there is more than one. */
export function mergeStatements(format, list, warnings = []) {
  const m = statementModel(format);
  m.warnings = warnings;
  if (!list.length) return m;
  const first = list[0], last = list[list.length - 1];
  Object.assign(m, { account: first.account, currency: first.currency || '', opening: first.opening, openingDate: first.openingDate,
    closing: last.closing, closingDate: last.closingDate });
  m.transactions = list.flatMap((s) => (list.length > 1 ? s.transactions.map((t) => ({ ...t, account: t.account || s.account })) : s.transactions));
  const dates = m.transactions.map((t) => t.date).filter(Boolean).sort();
  m.from = list.map((s) => s.from).filter(Boolean).sort()[0] || dates[0] || null;
  m.to = list.map((s) => s.to).filter(Boolean).sort().pop() || dates[dates.length - 1] || null;
  if (list.length > 1) m.statements = list;
  let told = false;   // the several-accounts note, once
  for (const s of list) {
    const acct = s.account && s.account !== first.account;
    if (acct && !told) { told = true; m.warnings.push(say('ui.fin.accounts', { first: first.account, other: s.account })); }
    const diff = checkBalance(s);
    if (diff) m.warnings.push(say('ui.fin.off', { id: s.id || s.account || '', expected: diff.expected.toFixed(2), closing: diff.closing.toFixed(2) }).replace(/ {2}/g, ' '));
  }
  return m;
}

/** Entry statuses that are not in the booked balance (camt.053 Sts): pending and information only. */
export const NOT_BOOKED = new Set(['PDNG', 'INFO']);

/** null when the opening balance plus the booked transactions equals the closing balance (or a balance is missing); else the
 *  two numbers that disagree. */
export function checkBalance(s) {
  if (s.opening == null || s.closing == null) return null;
  const booked = s.transactions.filter((x) => !NOT_BOOKED.has(String(x.status || '').toUpperCase()));
  const expected = (cents(s.opening) + booked.reduce((t, x) => t + cents(x.amount), 0)) / 100;
  return cents(expected) === cents(s.closing) ? null : { expected, closing: s.closing };
}

/** The totals of a statement: money in and money out of the booked lines, the count of all lines and of the pending. */
export function totals(s) {
  let inn = 0, out = 0, pending = 0;
  for (const t of s.transactions) {
    if (NOT_BOOKED.has(String(t.status || '').toUpperCase())) { pending++; continue; }
    if (t.amount > 0) inn += cents(t.amount); else out += cents(t.amount);
  }
  return { count: s.transactions.length, moneyIn: inn / 100, moneyOut: out / 100, pending };
}
