/* SWIFT MT940 (customer statement message) to the shared statement model. Pure, ES module. SWIFT's own standards text
 * is for members only, so the field layouts are those the banks publish in their MT940 guides (for example Westpac,
 * mBank, CSOB, UBB; checked 2026-10), which all follow the SWIFT layout:
 *   {1:...}{2:...}{4: ... -} blocks around each message (optional: many banks send the fields alone);
 *   :20: reference, :25: account, :28C: statement number, :60F: or :60M: opening balance, :61: statement line, :86:
 *   information for the line before it (after :62: it is about the whole statement), :62F: or :62M: closing balance,
 *   :64: closing available balance. A field runs on over the lines that follow it until the next ":NN:" tag.
 *   Balance (60, 62, 64): D or C, YYMMDD, currency, amount with a decimal comma: C261024SEK1234,50.
 *   :61: 6!n[4!n]2a[1!a]15d1!a3!c16x[//16x][34x]: value date YYMMDD, entry date MMDD (optional), mark C, D, RC (reversal
 *   of a credit: money out) or RD (reversal of a debit: money in), the funds code (one letter, optional), the amount,
 *   the transaction type (N, F or S and three characters, e.g. NTRF), the reference for the account owner, // and the
 *   bank's reference, and supplementary details on the next line.
 *   :86: is free text (up to 6 lines of 65). Two structured forms are read: the German one (a three-digit code and ?NN
 *   subfields: ?20 to ?29 and ?60 to ?63 purpose, ?32 and ?33 name, ?00 booking text) and the Dutch one (/NAME/, /REMI/,
 *   /EREF/ tags). Anything else is the line's text as it stands.
 *   readMt940(bytes | text) -> statement model, format 'mt940'; one statement per :20: message. date is the entry date
 *   when given (the year taken from the value date, across a new year), else the value date.                       */
import { decodeBytes, parseAmount, isoDate, squash, say } from './text.js';
import { statementModel, mergeStatements } from './model.js';

const year = (yy) => (Number(yy) < 70 ? 2000 : 1900) + Number(yy);
const yymmdd = (s) => { const m = /^(\d{2})(\d{2})(\d{2})$/.exec(s); return m ? isoDate(year(m[1]), m[2], m[3]) : null; };

/** A balance field: { amount, date, currency } or null. */
export function balanceOf(v) {
  const m = /^(C|D)(\d{6})([A-Z]{3})([\d.,]+)/.exec(String(v).replace(/\s+/g, ''));
  if (!m) return null;
  const a = parseAmount(m[4]);
  return a === null ? null : { amount: m[1] === 'D' ? -a : a, date: yymmdd(m[2]), currency: m[3] };
}

const LINE61 = /^(\d{6})(\d{4})?(RC|RD|C|D)([A-Z])?(\d[\d,.]*)([NSF][A-Z0-9]{3})?([^\n]*?)(?:\/\/([^\n]*))?(?:\n([\s\S]*))?$/;
/** A :61: field as { date, valueDate, amount, type, ref, bankRef, details } or null. */
export function line61(v) {
  const m = LINE61.exec(String(v).trim());
  if (!m) return null;
  const valueDate = yymmdd(m[1]);
  let date = valueDate;
  if (m[2] && valueDate) {
    const vy = Number(valueDate.slice(0, 4)), vm = Number(valueDate.slice(5, 7)), em = Number(m[2].slice(0, 2));
    const y = em - vm > 6 ? vy - 1 : vm - em > 6 ? vy + 1 : vy;
    date = isoDate(y, em, m[2].slice(2)) || valueDate;
  }
  const a = parseAmount(m[5]);
  if (a === null || !valueDate) return null;
  const out = m[3] === 'D' || m[3] === 'RC' ? -a : a;
  return { date, valueDate, amount: out, type: m[6] || '', ref: squash(m[7]).replace(/^NONREF$/i, ''), bankRef: squash(m[8]), details: squash(m[9]), reversal: m[3][0] === 'R' };
}

/** The :86: text as { text, counterparty, ref }. */
export function info86(v) {
  const raw = String(v || '');
  const flat = raw.replace(/\r?\n/g, '');
  if (/^\d{3}\?/.test(flat) || /^\?\d{2}/.test(flat)) {   // German ?NN subfields
    const f = {};
    for (const m of flat.matchAll(/\?(\d{2})([^?]*)/g)) (f[m[1]] = f[m[1]] || []).push(m[2]);
    const pick = (lo, hi) => Object.keys(f).filter((k) => Number(k) >= lo && Number(k) <= hi).sort().map((k) => f[k].join('')).join('');
    const purpose = squash(pick(20, 29) + pick(60, 63));
    // SEPA keywords in the purpose (EREF+ end-to-end reference, SVWZ+ the payer's text, ...), written one after another
    const kw = {};
    for (const m of purpose.matchAll(/(EREF|KREF|MREF|CRED|DEBT|SVWZ|ABWA|ABWE)\+(.*?)(?=(?:EREF|KREF|MREF|CRED|DEBT|SVWZ|ABWA|ABWE)\+|$)/g)) kw[m[1]] = m[2].trim();
    const svwz = kw.SVWZ !== undefined ? [null, kw.SVWZ] : null;
    const eref = kw.EREF ? [null, kw.EREF.replace(/^NOTPROVIDED$/i, '')] : null;
    // ?33 continues the name in ?32 (27 characters each): joined as written when ?32 is full, else with a space
    const n32 = f['32'] ? f['32'].join('') : '', n33 = f['33'] ? f['33'].join('') : '';
    const name = n32.length >= 27 ? n32 + n33 : [n32, n33].filter(Boolean).join(' ');
    return { text: squash(svwz ? svwz[1] : purpose) || squash(pick(0, 0)), counterparty: squash(name), ref: eref ? eref[1] : '' };
  }
  if (/\/(NAME|REMI|EREF|TRTP)\//.test(flat)) {   // Dutch /TAG/value tags
    const tags = {};
    for (const m of flat.matchAll(/\/(NAME|REMI|EREF|TRTP|IBAN|BIC|CSID|MARF|ADDR|USTD)\/((?:(?!\/(?:NAME|REMI|EREF|TRTP|IBAN|BIC|CSID|MARF|ADDR|USTD)\/).)*)/g)) tags[m[1]] = m[2].replace(/\/+$/, '');
    const remi = (tags.REMI || '').replace(/^USTD\/\//, '').replace(/^STRD\/CUR\/\//, '');
    return { text: squash(remi || tags.USTD || tags.TRTP || ''), counterparty: squash(tags.NAME), ref: squash(tags.EREF).replace(/^NOTPROVIDED$/i, '') };
  }
  return { text: squash(raw), counterparty: '', ref: '' };
}

/** The fields of the file in order: [{ tag, value }], with the block wrappers taken off. */
export function fields(text) {
  const out = [];
  const body = String(text).replace(/\{[1-3]:[^}]*\}/g, '\n').replace(/\{4:/g, '\n').replace(/\n-\}?\s*(?=\n|$)/g, '\n:-:\n').replace(/\{5:[^}]*\}/g, '');
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    const m = /^:(\d{2}[A-Z]?|-):(.*)$/.exec(line);
    if (m) out.push({ tag: m[1], value: m[2] });
    else if (out.length && line && line !== '-' && line !== '}') out[out.length - 1].value += `\n${line}`;
  }
  return out;
}

export function readMt940(input) {
  const text = typeof input === 'string' ? input : decodeBytes(input, { legacy: 'windows-1252' }).text;
  const warnings = [];
  const warn = (w) => { if (warnings.length < 200) warnings.push(w); };
  const list = [];
  let s = null, last = null, after62 = false;
  const start = (ref) => { s = statementModel('mt940'); s.id = ref; list.push(s); last = null; after62 = false; };
  for (const f of fields(text)) {
    if (f.tag === '-') { s = null; continue; }
    if (f.tag === '20') { start(squash(f.value)); continue; }
    if (!s) start('');
    switch (f.tag) {
      case '25': s.account = squash(f.value); break;
      case '28C': case '28': s.number = squash(f.value); break;
      case '60F': case '60M': {
        const b = balanceOf(f.value);
        if (b && s.opening === null) { s.opening = b.amount; s.openingDate = b.date; s.currency = b.currency; }
        break;
      }
      case '62F': case '62M': {
        const b = balanceOf(f.value);
        if (b) { s.closing = b.amount; s.closingDate = b.date; s.currency = s.currency || b.currency; }
        after62 = true;
        break;
      }
      case '61': {
        const l = line61(f.value);
        if (!l) { warn(say('ui.fin.mt940_line', { line: f.value.split('\n')[0] })); last = null; break; }
        last = { date: l.date, amount: l.amount, text: l.details, ref: l.ref || l.bankRef, counterparty: '', type: l.type };
        if (l.valueDate !== l.date) last.valueDate = l.valueDate;
        if (l.bankRef) last.id = l.bankRef;
        if (l.reversal) last.reversal = true;
        s.transactions.push(last);
        break;
      }
      case '86': {
        if (after62 || !last) { s.info = squash(f.value); break; }
        const i = info86(f.value);
        last.text = i.text || last.text;
        last.counterparty = i.counterparty;
        if (i.ref && !last.ref) last.ref = i.ref;
        last = null;
        break;
      }
      default: break;
    }
  }
  for (const st of list) {
    const ds = st.transactions.map((t) => t.date).filter(Boolean).sort();
    st.from = ds[0] || st.openingDate;
    st.to = ds[ds.length - 1] || st.closingDate;
  }
  const kept = list.filter((x) => x.transactions.length || x.opening !== null || x.closing !== null);
  if (!kept.length) warnings.push(say('ui.fin.mt940_none'));
  return mergeStatements('mt940', kept, warnings);
}

/** True when the text looks like MT940: a :20: field and an account (:25:) or a balance (:60F:), or a {2:...940} block. */
export const looksLikeMt940 = (head) => {
  const h = String(head).slice(0, 4096);
  return /\{2:[IO]940/.test(h) || (/(^|\n):20:/.test(h) && /(^|\n):(25|28C|60[FM]):/.test(h));
};
