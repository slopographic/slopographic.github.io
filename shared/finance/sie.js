/* SIE (Standard Import och Export, the Swedish accounting file format) to the shared ledger model. Pure, ES module.
 * Reads SIE types 1, 2, 3, 4 (4E, export) and 4I (import): "SIE filformat, utgåva 4C" (2025-08-06, sie.se). 4C changed
 * the wording, not the format, so 4B files (2008) and older files read the same way. The line rules are in sie-lex.js.
 *   readSie(bytes | text) -> the ledger model (see model.js), format 'sie', with:
 *     type ('1' | '2' | '3' | '4' | '4I' | '4E'), flag, program, generated, chart (#KPTYP), currency (#VALUTA, else SEK),
 *     years [{ index, from, to }] (#RAR; index 0 is the current year, -1 the one before),
 *     accounts [{ number, name, type, sieType, sru, unit }], dimensions, objects,
 *     openingBalances / closingBalances / results [{ year, account, amount, quantity? }] (#IB, #UB, #RES),
 *     objectBalances [{ kind: 'opening'|'closing', year, account, objects, amount }] (#OIB, #OUB),
 *     periodBalances / budgets [{ year, period: 'YYYY-MM', account, objects, amount }] (#PSALDO, #PBUDGET),
 *     vouchers [{ series, number, date, text, regDate, sign, lines, removed, balanced }], checksum, warnings.
 * Signs as in the file: a debit is positive, a credit negative (5.9, #IB). Dates are YYYY-MM-DD.
 * #RTRANS (an added line) is read as a line and the #TRANS copy that must follow it is skipped (#RTRANS, 6); #BTRANS (a
 * removed line) is kept in removed, not in lines. Quirks read on purpose: UTF-8 or Windows-1252 files that say PC8, a
 * decimal comma, ISO dates, labels in lower case, a #TRANS without its object list, a "{" at the end of the #VER line. */
import { decodeBytes, parseAmount, ymd, cents, say } from './text.js';
import { records, checksum } from './sie-lex.js';

const KTYP = { T: 'asset', S: 'liability', K: 'expense', I: 'revenue' };

/** An account's type from the BAS chart when the file has no #KTYP: 1 assets, 20 equity, 2 liabilities, 3 revenue,
 *  4 to 7 expenses, 8 financial items (80 to 83 income, 84 to 89 costs, appropriations and tax). */
export function basType(number) {
  const s = String(number);
  if (!/^\d{4,}$/.test(s)) return 'expense';
  if (s[0] === '1') return 'asset';
  if (s[0] === '2') return s[1] === '0' ? 'equity' : 'liability';
  if (s[0] === '3') return 'revenue';
  if (s[0] === '8') return Number(s.slice(0, 2)) <= 83 ? 'revenue' : 'expense';
  return 'expense';
}

const text = (f) => (f && f.t === 'f' ? f.v : '');
const listOf = (f) => (f && f.t === 'list' ? f.v : null);
const pairs = (items) => {
  const out = [];
  for (let i = 0; i + 1 < (items || []).length; i += 2) out.push({ dim: String(items[i]), id: String(items[i + 1]) });
  return out;
};

export function readSie(input) {
  const src = typeof input === 'string' ? input : decodeBytes(input, { legacy: 'auto' }).text;
  const recs = records(src);
  const warnings = [];
  const warn = (line, msg) => { if (warnings.length < 200) warnings.push(line ? say('ui.fin.line', { line: String(line), message: msg }) : msg); };
  const m = {
    format: 'sie', type: '1', flag: null, program: '', generated: null, company: '', orgNo: '', companyId: '', address: null,
    chart: '', currency: 'SEK', taxYear: '', extent: null, years: [], accounts: [], dimensions: [], objects: [],
    openingBalances: [], closingBalances: [], results: [], objectBalances: [], periodBalances: [], budgets: [], vouchers: [],
    checksum: checksum(recs), warnings,
  };
  const acct = new Map();
  const accountOf = (number) => {
    const k = String(number);
    if (!acct.has(k)) { const a = { number: k, name: '', type: basType(k), sieType: '', sru: [], unit: '' }; acct.set(k, a); m.accounts.push(a); }
    return acct.get(k);
  };
  const amountOf = (f, r) => {
    const v = parseAmount(text(f));
    if (v === null) warn(r.line, say('ui.fin.sie_amount', { label: r.label, text: text(f) }));
    return v;
  };
  const yearOf = (f) => { const n = Number(text(f)); return Number.isInteger(n) ? n : 0; };
  const qty = (f) => { const q = parseAmount(text(f)); return q === null ? undefined : q; };
  const dateOf = (f, r, what) => {
    const s = text(f);
    if (!s) return null;
    const d = ymd(s);
    if (!d) warn(r.line, say(what, { text: s }));
    return d;
  };
  const balance = (r, list) => {
    const [y, a, amt, q] = r.fields;
    const amount = amountOf(amt, r);
    if (amount === null) return;
    accountOf(text(a));
    list.push({ year: yearOf(y), account: text(a), amount, ...(qty(q) !== undefined ? { quantity: qty(q) } : {}) });
  };
  const withObjects = (r, start) => {
    const f = r.fields.slice(start);
    const objs = listOf(f[0]);
    if (objs) return { objects: pairs(objs), rest: f.slice(1) };
    if (f[0] && f[0].q && f[0].v === '') return { objects: [], rest: f.slice(1) };   // "" written for an empty list
    return { objects: [], rest: f };   // no list at all: the amount comes next
  };
  const transLine = (r, ver) => {
    const account = text(r.fields[0]);
    const { objects, rest } = withObjects(r, 1);
    const amount = amountOf(rest[0], r);
    if (!account || amount === null) return null;
    accountOf(account);
    const line = { account, amount };
    const d = dateOf(rest[1], r, 'ui.fin.sie_date_trans');
    if (d && d !== ver.date) line.date = d;
    if (text(rest[2])) line.text = text(rest[2]);
    if (objects.length) line.objects = objects;
    if (qty(rest[3]) !== undefined) line.quantity = qty(rest[3]);
    if (text(rest[4])) line.sign = text(rest[4]);
    return line;
  };
  const voucher = (r) => {
    const [series, number, date, vtext, reg, sign] = r.fields;
    const v = { series: text(series), number: text(number), date: dateOf(date, r, 'ui.fin.sie_date_ver'), text: text(vtext), lines: [], removed: [] };
    if (text(reg)) v.regDate = dateOf(reg, r, 'ui.fin.sie_date_reg');
    if (text(sign)) v.sign = text(sign);
    if (!v.date) warn(r.line, say('ui.fin.sie_ver_date', { ver: v.series + v.number }));
    const sub = r.sub || [];
    for (let i = 0; i < sub.length; i++) {
      const s = sub[i];
      if (s.label === '#TRANS') { const l = transLine(s, v); if (l) v.lines.push(l); }
      else if (s.label === '#RTRANS') {
        const l = transLine(s, v);
        if (l) v.lines.push({ ...l, added: true });
        if (sub[i + 1] && sub[i + 1].label === '#TRANS') i++;   // the copy that keeps older readers right
      } else if (s.label === '#BTRANS') { const l = transLine(s, v); if (l) v.removed.push(l); }
    }
    const total = v.lines.reduce((t, l) => t + cents(l.amount), 0);
    v.balanced = total === 0;
    if (!v.balanced) warn(r.line, say('ui.fin.sie_ver_off', { ver: v.series + v.number, off: (total / 100).toFixed(2) }));
    if (!r.sub) warn(r.line, say('ui.fin.sie_ver_empty', { ver: v.series + v.number }));
    m.vouchers.push(v);
  };
  for (const r of recs) {
    const f = r.fields;
    switch (r.label) {
      case '#FLAGGA': m.flag = text(f[0]); break;
      case '#PROGRAM': m.program = [text(f[0]), text(f[1])].filter(Boolean).join(' '); break;
      case '#FORMAT': m.charset = text(f[0]); break;
      case '#GEN': m.generated = dateOf(f[0], r, 'The generation date'); if (text(f[1])) m.generatedBy = text(f[1]); break;
      case '#SIETYP': m.type = text(f[0]).toUpperCase() || '1'; break;
      case '#PROSA': m.note = text(f[0]); break;
      case '#FTYP': m.companyType = text(f[0]); break;
      case '#FNR': m.companyId = text(f[0]); break;
      case '#ORGNR': m.orgNo = text(f[0]); break;
      case '#BKOD': m.industry = text(f[0]); break;
      case '#ADRESS': m.address = { contact: text(f[0]), street: text(f[1]), postal: text(f[2]), phone: text(f[3]) }; break;
      case '#FNAMN': m.company = text(f[0]); break;
      case '#RAR': {
        const from = dateOf(f[1], r, 'The year start'), to = dateOf(f[2], r, 'The year end');
        if (from && to) m.years.push({ index: yearOf(f[0]), from, to });
        break;
      }
      case '#TAXAR': m.taxYear = text(f[0]); break;
      case '#OMFATTN': m.extent = dateOf(f[0], r, 'The extent date'); break;
      case '#KPTYP': m.chart = text(f[0]); break;
      case '#VALUTA': m.currency = text(f[0]).toUpperCase() || 'SEK'; break;
      case '#KONTO': if (text(f[0])) accountOf(text(f[0])).name = text(f[1]); break;
      case '#KTYP': {
        const a = accountOf(text(f[0])), k = text(f[1]).toUpperCase();
        if (KTYP[k]) { a.sieType = k; a.type = k === 'S' && basType(a.number) === 'equity' ? 'equity' : KTYP[k]; } else warn(r.line, say('ui.fin.sie_ktyp', { text: text(f[1]) }));
        break;
      }
      case '#ENHET': accountOf(text(f[0])).unit = text(f[1]); break;
      case '#SRU': accountOf(text(f[0])).sru.push(text(f[1])); break;
      case '#DIM': m.dimensions.push({ id: text(f[0]), name: text(f[1]) }); break;
      case '#UNDERDIM': m.dimensions.push({ id: text(f[0]), name: text(f[1]), parent: text(f[2]) }); break;
      case '#OBJEKT': m.objects.push({ dim: text(f[0]), id: text(f[1]), name: text(f[2]) }); break;
      case '#IB': balance(r, m.openingBalances); break;
      case '#UB': balance(r, m.closingBalances); break;
      case '#RES': balance(r, m.results); break;
      case '#OIB': case '#OUB': {
        const { objects, rest } = withObjects(r, 2);
        const amount = amountOf(rest[0], r);
        if (amount !== null) m.objectBalances.push({ kind: r.label === '#OIB' ? 'opening' : 'closing', year: yearOf(f[0]), account: text(f[1]), objects, amount });
        break;
      }
      case '#PSALDO': case '#PBUDGET': {
        const { objects, rest } = withObjects(r, 3);
        const amount = amountOf(rest[0], r), p = /^(\d{4})(\d{2})$/.exec(text(f[1]));
        if (amount !== null) (r.label === '#PSALDO' ? m.periodBalances : m.budgets).push({ year: yearOf(f[0]), period: p ? `${p[1]}-${p[2]}` : text(f[1]), account: text(f[2]), objects, amount });
        break;
      }
      case '#VER': voucher(r); break;
      default: break;   // #KSUMMA is checked above; unknown labels are ignored (7.1)
    }
  }
  m.years.sort((a, b) => b.index - a.index);
  if (!recs.length) warn(0, say('ui.fin.sie_none'));
  if (m.checksum.present && !m.checksum.ok) warn(0, say(m.checksum.expected === null ? 'ui.fin.sie_ksumma_open' : 'ui.fin.sie_ksumma_bad'));
  return m;
}

/** True when the text looks like an SIE file: a #FLAGGA, #SIETYP or #FORMAT PC8 record near the top. */
export function looksLikeSie(head) {
  return /(^|\n)\s*#(FLAGGA|SIETYP|FORMAT\s+PC8|PROGRAM|FNAMN)\b/i.test(String(head).slice(0, 2048)) && /(^|\n)\s*#[A-Z]+/i.test(String(head));
}
