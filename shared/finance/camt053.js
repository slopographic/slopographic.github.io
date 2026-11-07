/* ISO 20022 cash management statements to the shared statement model. Pure, ES module; the XML is read with the site's
 * one XML reader (shared/office/xml.js, the browser's DOMParser). Elements are matched by local name, so every version
 * of the message reads the same way: camt.053.001.02 (the one most banks still send) to .001.13 and later, and the
 * account report (camt.052) and notification (camt.054), which have the same entries.
 *   Document/BkToCstmrStmt/Stmt (camt.053), BkToCstmrAcctRpt/Rpt (052), BkToCstmrDbtCdtNtfctn/Ntfctn (054), one statement
 *   each: Acct/Id/IBAN (or Othr/Id), Acct/Ccy, FrToDt, Bal with Tp/CdOrPrtry/Cd OPBD or PRCD (opening) and CLBD
 *   (closing), each with Amt, CdtDbtInd and Dt/Dt (or Dt/DtTm).
 *   Each Ntry: Amt (Ccy), CdtDbtInd (CRDT money in, DBIT money out), BookgDt and ValDt (Dt or DtTm), Sts (BOOK, PDNG,
 *   INFO: text in .02, Sts/Cd from .08), AcctSvcrRef, AddtlNtryInf, and NtryDtls/TxDtls with Refs/EndToEndId,
 *   RmtInf/Ustrd and RmtInf/Strd/CdtrRefInf/Ref, and RltdPties: the debtor for money in, the creditor for money out
 *   (Dbtr/Nm in .02, Dbtr/Pty/Nm from .08).
 *   RvslInd true marks a reversal; CdtDbtInd already gives the reversal's own direction (ISO usage rule), so the sign is
 *   not flipped. A batch entry with several TxDtls stays one line with the entry's amount.
 *   readCamt(bytes | text) -> statement model, format 'camt053' (message: 'camt.053.001.02' and so on).          */
import { parseXml } from '../office/xml.js';
import { decodeBytes, parseAmount, ymd, squash, say } from './text.js';
import { statementModel, mergeStatements } from './model.js';

const isEl = (n) => n && n.nodeType === 1;
const kids = (el, name) => { const out = []; for (let n = el ? el.firstChild : null; n; n = n.nextSibling) if (isEl(n) && (!name || n.localName === name)) out.push(n); return out; };
const kid = (el, name) => kids(el, name)[0] || null;
const at = (el, ...path) => { let c = el; for (const p of path) { c = kid(c, p); if (!c) return null; } return c; };
const txt = (el, ...path) => { const c = at(el, ...path); return c ? squash(c.textContent) : ''; };
const date = (el) => (el ? ymd(txt(el, 'Dt') || txt(el, 'DtTm')) : null);
const signed = (amt, ind) => (amt === null ? null : ind === 'DBIT' ? -Math.abs(amt) : Math.abs(amt));
const partyName = (p) => (p ? txt(p, 'Nm') || txt(p, 'Pty', 'Nm') : '');

const ROOTS = { BkToCstmrStmt: 'Stmt', BkToCstmrAcctRpt: 'Rpt', BkToCstmrDbtCdtNtfctn: 'Ntfctn' };

function entry(n, warn) {
  const amtEl = kid(n, 'Amt');
  const ind = txt(n, 'CdtDbtInd');
  const amount = signed(parseAmount(amtEl ? amtEl.textContent : ''), ind);
  const booked = date(kid(n, 'BookgDt')), value = date(kid(n, 'ValDt'));
  if (amount === null || !(booked || value)) { warn(txt(n, 'AcctSvcrRef') || txt(n, 'NtryRef') ? say('ui.fin.camt_entry', { ref: txt(n, 'AcctSvcrRef') || txt(n, 'NtryRef') }) : say('ui.fin.camt_entry_noref')); return null; }
  const tx = kids(n, 'NtryDtls').flatMap((d) => kids(d, 'TxDtls'));
  const first = tx[0] || null;
  const ustrd = tx.flatMap((t) => kids(at(t, 'RmtInf'), 'Ustrd').map((u) => squash(u.textContent))).filter(Boolean);
  const strd = tx.map((t) => txt(t, 'RmtInf', 'Strd', 'CdtrRefInf', 'Ref')).filter(Boolean);
  const rp = first ? at(first, 'RltdPties') : null;
  const counterparty = rp ? (ind === 'CRDT' ? partyName(kid(rp, 'Dbtr')) || partyName(kid(rp, 'UltmtDbtr')) : partyName(kid(rp, 'Cdtr')) || partyName(kid(rp, 'UltmtCdtr'))) : '';
  const info = txt(n, 'AddtlNtryInf');
  const words = [...new Set([...ustrd, ...strd])].join(' ');
  const t = { date: booked || value, amount, text: words || info || counterparty, ref: (first && (txt(first, 'Refs', 'EndToEndId').replace(/^NOTPROVIDED$/i, '') || txt(first, 'Refs', 'InstrId'))) || txt(n, 'NtryRef'), counterparty };
  if (words && info && !words.includes(info)) t.info = info;
  if (value && value !== t.date) t.valueDate = value;
  const st = txt(n, 'Sts', 'Cd') || txt(n, 'Sts');
  if (st) t.status = st;
  if (txt(n, 'RvslInd') === 'true') t.reversal = true;
  if (txt(n, 'AcctSvcrRef')) t.id = txt(n, 'AcctSvcrRef');
  const code = txt(n, 'BkTxCd', 'Domn', 'Cd') ? [txt(n, 'BkTxCd', 'Domn', 'Cd'), txt(n, 'BkTxCd', 'Domn', 'Fmly', 'Cd'), txt(n, 'BkTxCd', 'Domn', 'Fmly', 'SubFmlyCd')].join('-') : txt(n, 'BkTxCd', 'Prtry', 'Cd');
  if (code) t.type = code;
  return t;
}

function statement(st, warn) {
  const s = statementModel('camt053');
  s.id = txt(st, 'Id');
  const acct = at(st, 'Acct');
  s.account = txt(acct, 'Id', 'IBAN') || txt(acct, 'Id', 'Othr', 'Id');
  s.currency = txt(acct, 'Ccy');
  s.from = ymd(txt(st, 'FrToDt', 'FrDtTm') || txt(st, 'FrToDt', 'FrDt'));
  s.to = ymd(txt(st, 'FrToDt', 'ToDtTm') || txt(st, 'FrToDt', 'ToDt'));
  for (const b of kids(st, 'Bal')) {
    const code = txt(b, 'Tp', 'CdOrPrtry', 'Cd') || txt(b, 'Tp', 'CdOrPrtry', 'Prtry');
    const amtEl = kid(b, 'Amt');
    const amount = signed(parseAmount(amtEl ? amtEl.textContent : ''), txt(b, 'CdtDbtInd'));
    if (amount === null) continue;
    if (!s.currency && amtEl && amtEl.getAttribute('Ccy')) s.currency = amtEl.getAttribute('Ccy');
    if ((code === 'OPBD' || code === 'PRCD') && s.opening === null) { s.opening = amount; s.openingDate = date(kid(b, 'Dt')); }
    if (code === 'CLBD') { s.closing = amount; s.closingDate = date(kid(b, 'Dt')); }
  }
  s.transactions = kids(st, 'Ntry').map((n) => entry(n, warn)).filter(Boolean);
  if (!s.currency) { const a = at(st, 'Ntry', 'Amt'); if (a) s.currency = a.getAttribute('Ccy') || ''; }
  return s;
}

export function readCamt(input) {
  const text = typeof input === 'string' ? input : decodeBytes(input, { legacy: 'windows-1252' }).text;
  const warnings = [];
  const warn = (w) => { if (warnings.length < 200) warnings.push(w); };
  let doc;
  try { doc = parseXml(text); } catch (e) { const m = statementModel('camt053'); m.warnings.push(say('ui.fin.camt_xml', { message: e.message })); return m; }
  const root = doc.documentElement;
  const ns = (root && root.namespaceURI) || '';
  const body = root && root.localName === 'Document' ? kids(root).find((k) => ROOTS[k.localName]) : root && ROOTS[root.localName] ? root : null;
  if (!body) { const m = statementModel('camt053'); m.warnings.push(say('ui.fin.camt_not')); return m; }
  const list = kids(body, ROOTS[body.localName]).map((st) => statement(st, warn));
  const res = mergeStatements('camt053', list, warnings);
  const v = /camt\.\d{3}\.\d{3}\.\d{2}/.exec(ns);
  res.message = v ? v[0] : body.localName;
  return res;
}

/** True when the text looks like an ISO 20022 statement, report or notification (camt.052, camt.053, camt.054). */
export const looksLikeCamt = (head) => /camt\.05[234]\.|<(\w+:)?BkToCstmr(Stmt|AcctRpt|DbtCdtNtfctn)\b/.test(String(head).slice(0, 4096));
