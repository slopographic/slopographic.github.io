/* QIF (Quicken Interchange Format) to the shared statement model. Pure, ES module. Follows the Quicken QIF description
 * (Intuit, 1994; mirrored at w3.org/2000/10/swap/pim/qif-doc/QIF-doc.htm): a "!Type:" header line, then one item per
 * line, each starting with a letter code, and "^" ending each transaction.
 *   Bank, Cash, CCard, Oth A and Oth L sections are read: D date, T amount (U is the same amount in newer Quicken files,
 *   used when T is missing), P payee, M memo, N number (cheque or reference), L category, C cleared status. Split lines
 *   (S, E, $) are kept as one transaction with its total. "!Account" blocks name the account (N) for the sections after
 *   them. Category, class and memorised lists (!Type:Cat, Class, Memorized) and investment sections are skipped.
 *   QIF has no currency field, so currency is ''. Dates have no fixed order: month first is assumed (US Quicken) unless
 *   a date in the file has a first number above 12 (then day first) or opts.dayFirst says so. A year is written with
 *   two or four digits; an apostrophe before it marks 2000 and later (1/ 2'26), and a two-digit year below 70 is 20xx.
 *   readQif(bytes | text, { dayFirst? }) -> statement model, format 'qif'.                                          */
import { decodeBytes, parseAmount, isoDate, squash, say } from './text.js';
import { statementModel, mergeStatements } from './model.js';

const KEEP = /^(bank|cash|ccard|oth a|oth l)$/i;
const DATE = /^\s*(\d{1,4})\s*[/.-]\s*(\d{1,2})\s*(?:[/.-]|')\s*(\d{2,4})\s*$/;

/** The date text's three numbers and whether the apostrophe (2000 and later) was used. */
const parts = (s) => {
  const m = DATE.exec(String(s || '').replace(/\s+'/, "'"));
  return m ? { a: Number(m[1]), b: Number(m[2]), y: m[3], apos: /'/.test(s), iso: m[1].length === 4 } : null;
};
const fullYear = (y, apos) => {
  if (y.length === 4) return Number(y);
  const n = Number(y);
  return apos || n < 70 ? 2000 + n : 1900 + n;
};
export function qifDate(s, dayFirst) {
  const p = parts(s);
  if (!p) return null;
  if (p.iso) return isoDate(p.a, p.b, Number(p.y));   // 2026-10-24
  const [d, m] = dayFirst ? [p.a, p.b] : [p.b, p.a];
  return isoDate(fullYear(p.y, p.apos), m, d);
}

export function readQif(input, opts = {}) {
  const text = typeof input === 'string' ? input : decodeBytes(input, { legacy: 'windows-1252' }).text;
  const warnings = [];
  const warn = (w) => { if (warnings.length < 200) warnings.push(w); };
  const lines = text.replace(/^﻿/, '').split(/\r?\n|\r/);
  // day order: from the file's own dates when they say, else the option, else month first
  let dayFirst = opts.dayFirst;
  if (dayFirst === undefined) {
    dayFirst = false;
    for (const l of lines) {
      if (l[0] !== 'D') continue;
      const p = parts(l.slice(1));
      if (p && !p.iso && p.a > 12) { dayFirst = true; break; }
      if (p && !p.iso && p.b > 12) break;
    }
  }
  const list = [];
  let section = '', keep = false, cur = null, item = {}, inAccount = false, accountName = '', accountType = '';
  const startStatement = () => { cur = statementModel('qif'); cur.account = accountName; cur.kind = section; list.push(cur); };
  const finish = (lineNo) => {
    const it = item;
    item = {};
    if (inAccount) { if (it.N) accountName = it.N; if (it.T) accountType = it.T; return; }
    if (!keep || !Object.keys(it).length) return;
    const amount = parseAmount(it.T ?? it.U, { thousands3: true });
    const date = qifDate(it.D, dayFirst);
    if (amount === null || !date) { warn(say('ui.fin.qif_line', { line: String(lineNo) })); return; }
    const payee = squash(it.P), memo = squash(it.M);
    const t = { date, amount, text: [payee, memo && memo !== payee ? memo : ''].filter(Boolean).join(' · '), ref: squash(it.N), counterparty: payee };
    if (it.L) t.category = squash(it.L);
    if (it.C) t.status = it.C.trim() === 'X' || it.C.trim() === 'R' ? 'reconciled' : it.C.trim() === '*' || it.C.trim() === 'c' ? 'cleared' : '';
    if (!t.status) delete t.status;
    if (!cur) startStatement();
    cur.transactions.push(t);
  };
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    if (!line) return;
    if (line[0] === '!') {
      const h = line.slice(1).trim();
      if (/^account$/i.test(h)) { inAccount = true; item = {}; return; }
      if (/^(option|clear):/i.test(h)) return;   // !Option:AutoSwitch and similar
      const m = /^type\s*:\s*(.*)$/i.exec(h);
      inAccount = false;
      section = m ? m[1].trim() : h;
      keep = KEEP.test(section);
      if (keep) startStatement();
      else if (!/^(cat|class|memorized|prices|security)$/i.test(section)) warn(say('ui.fin.qif_section', { name: section }));
      return;
    }
    if (line[0] === '^') { finish(i + 1); return; }
    const code = line[0], value = line.slice(1);
    if (code === 'S' || code === 'E' || code === '$' || code === '%') return;   // split lines: the total is in T
    if (code === 'A') { item.A = item.A ? `${item.A}, ${value}` : value; return; }
    if (item[code] === undefined) item[code] = value;
  });
  if (Object.keys(item).length) finish(lines.length);
  const kept = list.filter((s) => s.transactions.length);
  if (!kept.length && !warnings.length) warnings.push(say('ui.fin.qif_none'));
  const res = mergeStatements('qif', kept, warnings);
  res.dayFirst = dayFirst;
  res.accountType = accountType;
  return res;
}

/** True when the text looks like QIF: a !Type:, !Account or !Option line at the top. */
export const looksLikeQif = (head) => /^﻿?\s*!(Type\s*:|Account|Option\s*:)/i.test(String(head));
