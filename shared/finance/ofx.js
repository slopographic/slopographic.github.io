/* OFX and QFX bank and credit card statements to the shared statement model. Pure, ES module.
 * Reads OFX 1.x (SGML: a "OFXHEADER:100 / DATA:OFXSGML" header, leaf elements without end tags) and OFX 2.x (XML: an
 * <?OFX OFXHEADER="200" ...?> header, every element closed), as described in the OFX 2.2 specification (Financial Data
 * Exchange, 2017; 2.8 "Changes from 1.x", 11.4.2.2 <STMTRS>, 11.4.4.1 <STMTTRN>, 3.2.8 dates, 3.2.9 amounts). QFX is
 * Quicken's name for the same format. One reader serves both: an element whose text is followed by another tag is a leaf.
 *   readOfx(bytes | text) -> statement model (model.js), format 'ofx'; one statement per <STMTRS> (bank) or <CCSTMTRS>
 *                            (credit card). Account: ACCTID (with BANKID in front when given); currency: CURDEF; the
 *                            period: BANKTRANLIST DTSTART and DTEND; closing: LEDGERBAL (OFX has no opening balance).
 *   Each <STMTTRN>: date DTPOSTED (the date as written, its time and zone dropped), valueDate DTAVAIL, amount TRNAMT
 *   (signed by the spec from the customer's side; TRNTYPE does not change the sign), text NAME (or EXTDNAME, PAYEE NAME)
 *   and MEMO, ref CHECKNUM or REFNUM, id FITID, type TRNTYPE. Pending <STMTTRNP> lines are left out (not settled).
 *   Quirks read on purpose: a decimal comma, a "+" sign, CRLF or no line breaks, a missing end tag at the end. */
import { decodeBytes, parseAmount, ymd, squash, say } from './text.js';
import { statementModel, mergeStatements } from './model.js';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unescape = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m));

/** The OFX body as a tree of { name, kids, value }. Works for SGML (unclosed leaves) and XML. */
export function ofxTree(body) {
  const root = { name: '#root', kids: [] };
  const stack = [root];
  const re = /<(\/?)([A-Za-z0-9_.]+)[^>]*>|([^<]+)/g;
  const toks = [];
  let m;
  while ((m = re.exec(body))) {
    if (m[3] !== undefined) { const t = m[3].trim(); if (t) toks.push({ text: unescape(t) }); } else toks.push({ close: !!m[1], name: m[2].toUpperCase() });
  }
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], top = stack[stack.length - 1];
    if (t.text !== undefined) continue;   // text not right after an opening tag (stray): ignored
    if (t.close) {
      const at = stack.map((s) => s.name).lastIndexOf(t.name);
      if (at > 0) stack.length = at;   // closes the aggregate and any SGML element left open inside it
      continue;
    }
    const next = toks[i + 1];
    if (next && next.text !== undefined) {   // a leaf: <TAG>value, with or without </TAG>
      top.kids.push({ name: t.name, value: next.text, kids: [] });
      i++;
      if (toks[i + 1] && toks[i + 1].close && toks[i + 1].name === t.name) i++;
      continue;
    }
    const el = { name: t.name, kids: [] };
    top.kids.push(el);
    stack.push(el);
  }
  return root;
}

const kid = (el, name) => (el ? el.kids.find((k) => k.name === name) || null : null);
const val = (el, ...path) => { let c = el; for (const p of path) c = kid(c, p); return c && c.value !== undefined ? c.value : ''; };
const all = (el, name, out = []) => { for (const k of (el ? el.kids : [])) { if (k.name === name) out.push(k); else all(k, name, out); } return out; };

/** The header fields of an OFX 1.x file (KEY:VALUE lines before the first tag) or of the <?OFX ...?> instruction. */
export function ofxHeader(text) {
  const h = {};
  const at = text.search(/<OFX>/i);
  const head = text.slice(0, at > 0 ? at : 2000);
  for (const m of head.matchAll(/^\s*([A-Z]+):(.*)$/gm)) h[m[1].toUpperCase()] = m[2].trim();
  const pi = /<\?OFX([^?]*)\?>/i.exec(head);
  if (pi) for (const m of pi[1].matchAll(/([A-Z]+)="([^"]*)"/gi)) h[m[1].toUpperCase()] = m[2];
  const enc = /<\?xml[^>]*encoding="([^"]+)"/i.exec(head);
  if (enc) h.XMLENCODING = enc[1];
  return h;
}

// UTF-8 when the bytes are valid UTF-8 (OFX 2.x, ENCODING:UTF-8), else Windows-1252 (CHARSET:1252, the usual 1.x case).
const decode = (input) => (typeof input === 'string' ? input : decodeBytes(input, { legacy: 'windows-1252' }).text);

function account(stmt) {
  const b = kid(stmt, 'BANKACCTFROM') || kid(stmt, 'CCACCTFROM') || kid(stmt, 'INVACCTFROM');
  if (!b) return '';
  const id = val(b, 'ACCTID'), bank = val(b, 'BANKID'), branch = val(b, 'BRANCHID');
  return [bank, branch, id].filter(Boolean).join(' ');
}

function transaction(t, warn) {
  const amount = parseAmount(val(t, 'TRNAMT'));
  const date = ymd(val(t, 'DTPOSTED')) || ymd(val(t, 'DTUSER'));
  if (amount === null || !date) { warn(val(t, 'FITID') || val(t, 'NAME') ? say('ui.fin.ofx_tx', { id: val(t, 'FITID') || val(t, 'NAME') }) : say('ui.fin.ofx_tx_noid')); return null; }
  const payee = kid(t, 'PAYEE');
  const name = squash(val(t, 'NAME') || val(t, 'EXTDNAME') || (payee ? val(payee, 'NAME') : ''));
  const memo = squash(val(t, 'MEMO'));
  const out = { date, amount, text: [name, memo && memo !== name ? memo : ''].filter(Boolean).join(' · '), ref: val(t, 'CHECKNUM') || val(t, 'REFNUM'), counterparty: name, type: val(t, 'TRNTYPE') };
  const avail = ymd(val(t, 'DTAVAIL'));
  if (avail && avail !== date) out.valueDate = avail;
  if (val(t, 'FITID')) out.id = val(t, 'FITID');
  const cur = kid(t, 'CURRENCY') || kid(t, 'ORIGCURRENCY');
  if (cur && val(cur, 'CURSYM')) out.currency = val(cur, 'CURSYM');
  return out;
}

export function readOfx(input) {
  const text = decode(input);
  const warnings = [];
  const warn = (w) => { if (warnings.length < 200) warnings.push(w); };
  const at = text.search(/<OFX[\s>]/i);
  if (at < 0) { const m = statementModel('ofx'); m.warnings.push(say('ui.fin.ofx_not')); return m; }
  const tree = ofxTree(text.slice(at));
  const stmts = [...all(tree, 'STMTRS'), ...all(tree, 'CCSTMTRS')];
  const list = stmts.map((st) => {
    const s = statementModel('ofx');
    s.account = account(st);
    s.currency = val(st, 'CURDEF').toUpperCase();
    const tl = kid(st, 'BANKTRANLIST');
    s.from = ymd(val(tl, 'DTSTART'));
    s.to = ymd(val(tl, 'DTEND'));
    s.transactions = (tl ? tl.kids.filter((k) => k.name === 'STMTTRN') : []).map((t) => transaction(t, warn)).filter(Boolean);
    const bal = kid(st, 'LEDGERBAL');
    if (bal && parseAmount(val(bal, 'BALAMT')) !== null) { s.closing = parseAmount(val(bal, 'BALAMT')); s.closingDate = ymd(val(bal, 'DTASOF')); }
    return s;
  });
  if (!list.length) warn(say('ui.fin.ofx_none'));
  const res = mergeStatements('ofx', list, warnings);
  res.version = ofxHeader(text).VERSION || '';   // 102, 103, 151, 160 (SGML) or 200, 211, 220 (XML)
  return res;
}

/** True when the text looks like OFX or QFX. */
export const looksLikeOfx = (head) => /OFXHEADER\s*[:=]\s*"?\d|<\?OFX\b|<OFX>/i.test(String(head).slice(0, 4096));
