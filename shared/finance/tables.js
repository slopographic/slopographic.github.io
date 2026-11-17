/* Finance files as tables: the rows File convert writes to CSV and XLSX (and that a viewer can show). Pure, ES module.
 * Values are strings and Numbers; dates stay 'YYYY-MM-DD' text (the XLSX writer turns the date columns into dates).
 *   sieSheets(model)        -> [{ name, rows, money: [col], dates: [col] }]: Info, Vouchers, Accounts, Balances and, when
 *                              the file has them, Periods (#PSALDO). The first row of each is the header.
 *   sieVoucherRows(model)   -> the Vouchers rows (header first): one row per transaction line, debit and credit apart
 *   sieBalanceRows(model)   -> the Balances rows: one row per account, opening, closing and result per year
 *   statementSheets(model)  -> [Transactions, Statement]
 *   statementRows(model)    -> the Transactions rows (header first)                                                   */
import { totals, checkBalance } from './model.js';

const TYPE_WORD = { asset: 'Asset', liability: 'Liability', equity: 'Equity', revenue: 'Revenue', expense: 'Expense' };
const r2 = (n) => Math.round(n * 100) / 100;

/** A year's short name: 2025 for a calendar year, 2025/26 for a broken one, "year -1" without dates. */
export function yearLabel(m, index) {
  const y = (m.years || []).find((x) => x.index === index);
  if (!y) return index === 0 ? 'current year' : `year ${index}`;
  const a = y.from.slice(0, 4), b = y.to.slice(0, 4);
  return a === b ? a : `${a}/${b.slice(2)}`;
}

const objectsText = (objs) => (objs || []).map((o) => `${o.dim}:${o.id}`).join(' ');

export function sieVoucherRows(m) {
  const names = new Map(m.accounts.map((a) => [a.number, a.name]));
  const rows = [['Series', 'Number', 'Date', 'Voucher text', 'Account', 'Account name', 'Debit', 'Credit', 'Amount', 'Line date', 'Line text', 'Objects', 'Quantity', 'Note']];
  for (const v of m.vouchers) {
    const base = [v.series, v.number, v.date || '', v.text];
    for (const l of v.lines) {
      rows.push([...base, l.account, names.get(l.account) || '', l.amount > 0 ? r2(l.amount) : '', l.amount < 0 ? r2(-l.amount) : '', r2(l.amount),
        l.date || '', l.text || '', objectsText(l.objects), l.quantity ?? '', [l.added ? 'Added line' : '', v.balanced ? '' : 'Voucher does not balance'].filter(Boolean).join('; ')]);
    }
    for (const l of v.removed) rows.push([...base, l.account, names.get(l.account) || '', '', '', '', l.date || '', l.text || '', objectsText(l.objects), '', `Removed line (was ${l.amount.toFixed(2)})`]);
    if (!v.lines.length && !v.removed.length) rows.push([...base, '', '', '', '', '', '', '', '', '', 'No transaction lines']);
  }
  return rows;
}

export function sieBalanceRows(m) {
  const idx = [...new Set([...m.openingBalances, ...m.closingBalances, ...m.results].map((b) => b.year))].sort((a, b) => b - a);
  const cols = [];
  for (const y of idx) {
    if (m.openingBalances.some((b) => b.year === y)) cols.push(['Opening', y, m.openingBalances]);
    if (m.closingBalances.some((b) => b.year === y)) cols.push(['Closing', y, m.closingBalances]);
    if (m.results.some((b) => b.year === y)) cols.push(['Result', y, m.results]);
  }
  const rows = [['Account', 'Name', 'Type', ...cols.map(([k, y]) => `${k} ${yearLabel(m, y)}`)]];
  const used = new Set(cols.flatMap(([, , list]) => list.map((b) => b.account)));
  for (const a of m.accounts.filter((x) => used.has(x.number))) {
    rows.push([a.number, a.name, TYPE_WORD[a.type] || '', ...cols.map(([, y, list]) => {
      const hit = list.filter((b) => b.year === y && b.account === a.number);
      return hit.length ? r2(hit.reduce((t, b) => t + b.amount, 0)) : '';
    })]);
  }
  return rows;
}

function infoRows(m) {
  const years = (m.years || []).map((y) => `${y.index === 0 ? 'Current' : `Year ${y.index}`}: ${y.from} to ${y.to}`).join('; ');
  const lines = m.vouchers.reduce((t, v) => t + v.lines.length, 0);
  const cs = !m.checksum || !m.checksum.present ? 'None in the file' : m.checksum.ok ? 'Matches (#KSUMMA)' : 'Does not match';
  const rows = [['Field', 'Value'], ['Company', m.company], ['Organisation number', m.orgNo], ['Program', m.program], ['Generated', m.generated || ''],
    ['SIE type', m.type], ['Currency', m.currency], ['Chart of accounts', m.chart], ['Financial years', years], ['Accounts', m.accounts.length],
    ['Vouchers', m.vouchers.length], ['Voucher lines', lines], ['Checksum', cs]];
  for (const w of m.warnings) rows.push(['Note', w]);
  return rows;
}

export function sieSheets(m) {
  const balances = sieBalanceRows(m);
  const sheets = [
    { name: 'Info', rows: infoRows(m), money: [], dates: [] },   // i18n-ignore: the sheet names written into the file
    { name: 'Vouchers', rows: sieVoucherRows(m), money: [6, 7, 8], dates: [2, 9] },   // i18n-ignore: the sheet names written into the file
    { name: 'Accounts', rows: [['Account', 'Name', 'Type', 'SIE type', 'SRU', 'Unit'], ...m.accounts.map((a) => [a.number, a.name, TYPE_WORD[a.type] || '', a.sieType, a.sru.join(' '), a.unit])], money: [], dates: [] },   // i18n-ignore: the sheet names written into the file
    { name: 'Balances', rows: balances, money: balances[0].map((_, i) => i).slice(3), dates: [] },   // i18n-ignore: the sheet names written into the file
  ];
  if (m.periodBalances.length) {
    const names = new Map(m.accounts.map((a) => [a.number, a.name]));
    sheets.push({ name: 'Periods', rows: [['Year', 'Period', 'Account', 'Name', 'Objects', 'Amount'], ...m.periodBalances.map((p) => [yearLabel(m, p.year), p.period, p.account, names.get(p.account) || '', objectsText(p.objects), r2(p.amount)])], money: [5], dates: [] });   // i18n-ignore: the sheet names written into the file
  }
  return sheets;
}

export function statementRows(m) {
  const multi = !!m.statements;
  const rows = [['Date', 'Value date', 'Amount', 'Currency', 'Text', 'Counterparty', 'Reference', 'Type', 'Status', 'Bank id', ...(multi ? ['Account'] : [])]];
  for (const t of m.transactions) {
    rows.push([t.date, t.valueDate || '', r2(t.amount), t.currency || m.currency || '', t.text || '', t.counterparty || '', t.ref || '', t.type || '',
      [t.status || '', t.reversal ? 'Reversal' : ''].filter(Boolean).join(' '), t.id || '', ...(multi ? [t.account || ''] : [])]);
  }
  return rows;
}

export function statementSheets(m) {
  const t = totals(m), diff = checkBalance(m);
  const info = [['Field', 'Value'], ['Format', m.message || m.format.toUpperCase()], ['Account', m.account], ['Currency', m.currency], ['From', m.from || ''], ['To', m.to || ''],
    ['Opening balance', m.opening ?? ''], ['Closing balance', m.closing ?? ''], ['Money in', t.moneyIn], ['Money out', t.moneyOut], ['Transactions', t.count],
    ['Check', m.opening == null || m.closing == null ? 'Opening or closing balance not in the file' : diff ? `Off by ${(diff.closing - diff.expected).toFixed(2)}` : 'Opening + transactions = closing']];
  for (const w of m.warnings) info.push(['Note', w]);
  return [{ name: 'Transactions', rows: statementRows(m), money: [2], dates: [0, 1] }, { name: 'Statement', rows: info, money: [], dates: [] }];   // i18n-ignore: the sheet names written into the file
}
