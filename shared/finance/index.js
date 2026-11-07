/* Finance files: which format a file is, and one call that reads any of them. Pure, ES module. Used by File convert
 * (convert/js/core/finance.js, convert/js/core/detect.js) and Slop Ledger (Import SIE, the Bank tab).
 *   sniffFinance(head)            -> 'sie' | 'ofx' | 'qif' | 'camt053' | 'mt940' | null, from what the text says
 *                                    (head: the first bytes as a Uint8Array, or text)
 *   FINANCE_EXT                   -> the file name extensions of each format (.se, .si, .sie, .ofx, .qfx, .qif, .sta, ...)
 *   formatOf(name, head)          -> the format from the content, else from the extension, else null
 *   readFinance(bytes, name?)     -> { kind: 'ledger' | 'statement', format, model } or throws a plain Error
 *   readStatement(bytes, name?)   -> the statement model (throws when the file is not a bank statement)            */
import { readSie, looksLikeSie } from './sie.js';
import { readOfx, looksLikeOfx } from './ofx.js';
import { readQif, looksLikeQif } from './qif.js';
import { readCamt, looksLikeCamt } from './camt053.js';
import { readMt940, looksLikeMt940 } from './mt940.js';

export const FINANCE_EXT = { se: 'sie', si: 'sie', sie: 'sie', ofx: 'ofx', qfx: 'ofx', qif: 'qif', sta: 'mt940', mt940: 'mt940', '940': 'mt940', camt: 'camt053', camt053: 'camt053' };
export const FORMAT_LABEL = { sie: 'SIE file', ofx: 'OFX statement', qif: 'QIF file', camt053: 'ISO 20022 statement (camt.053)', mt940: 'MT940 statement' };
export const STATEMENT_FORMATS = ['ofx', 'qif', 'camt053', 'mt940'];

// The head as text: ASCII is the same in every code page these formats use, which is all the sniff needs.
const asText = (head) => {
  if (typeof head === 'string') return head;
  if (!head || !head.length) return '';
  let s = '';
  for (let i = 0; i < Math.min(head.length, 4096); i++) s += String.fromCharCode(head[i]);
  return s.replace(/^ï»¿/, '');
};

export function sniffFinance(head) {
  const t = asText(head);
  if (!t) return null;
  if (looksLikeOfx(t)) return 'ofx';
  if (looksLikeCamt(t)) return 'camt053';
  if (looksLikeQif(t)) return 'qif';
  if (looksLikeSie(t)) return 'sie';
  if (looksLikeMt940(t)) return 'mt940';
  return null;
}

export function formatOf(name = '', head = null) {
  const said = sniffFinance(head);
  if (said) return said;
  const ext = String(name).includes('.') ? String(name).split('.').pop().toLowerCase() : '';
  return FINANCE_EXT[ext] || null;
}

const READERS = { sie: readSie, ofx: readOfx, qif: readQif, camt053: readCamt, mt940: readMt940 };

export function readFinance(bytes, name = '', opts = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const format = opts.format || formatOf(name, b.subarray(0, 4096));
  if (!format) throw new Error('This is not a file this reader knows. It reads SIE, OFX or QFX, QIF, camt.053 (ISO 20022 XML) and MT940.');
  const model = READERS[format](b, opts);
  if (format === 'sie' && !model.accounts.length && !model.vouchers.length) throw new Error(model.warnings[0] || 'No accounts or vouchers were found in this SIE file.');
  if (format !== 'sie' && !model.transactions.length && model.opening === null && model.closing === null) throw new Error(model.warnings[0] || `No transactions were found in this ${FORMAT_LABEL[format]}.`);
  return { kind: format === 'sie' ? 'ledger' : 'statement', format, model };
}

export function readStatement(bytes, name = '', opts = {}) {
  const r = readFinance(bytes, name, opts);
  if (r.kind !== 'statement') throw new Error('This is an accounting file (SIE), not a bank statement. Import it with Import SIE in the Journal tab.');
  return r.model;
}
