/* SlopLabel — barcode/symbols: symbology table, check digits and GS1 application identifiers. */
'use strict';

/* ---------------- symbology table ---------------- */
const SYMBOLOGIES = [
  { id: 'code128', name: 'Code 128 (auto subset)', kind: '1d', quiet: [10, 10], hint: 'Any ASCII text' },
  { id: 'gs1-128', name: 'GS1-128 (UCC/EAN-128)', kind: '1d', quiet: [10, 10], hint: '(AI)value…, e.g. (01)09501101530003(10)LOT1' },
  { id: 'ean13', name: 'EAN-13', kind: '1d', bcid: 'ean13', quiet: [11, 7], hint: '12 digits (+ check digit)', ean: true },
  { id: 'ean8', name: 'EAN-8', kind: '1d', bcid: 'ean8', quiet: [7, 7], hint: '7 digits (+ check digit)', ean: true },
  { id: 'upca', name: 'UPC-A', kind: '1d', bcid: 'upca', quiet: [9, 9], hint: '11 digits (+ check digit)', ean: true },
  { id: 'upce', name: 'UPC-E', kind: '1d', bcid: 'upce', quiet: [9, 7], hint: '0/1 + 6 digits (+ check digit)', ean: true },
  { id: 'code39', name: 'Code 39', kind: '1d', bcid: 'code39', quiet: [10, 10], hint: 'A–Z 0–9 - . space $ / + %' },
  { id: 'code93', name: 'Code 93', kind: '1d', bcid: 'code93', quiet: [10, 10], hint: 'A–Z 0–9 - . space $ / + %' },
  { id: 'itf14', name: 'ITF-14 (GTIN-14)', kind: '1d', bcid: 'itf14', quiet: [10, 10], hint: '13 digits (+ check digit)' },
  { id: 'i2of5', name: 'Interleaved 2 of 5', kind: '1d', bcid: 'interleaved2of5', quiet: [10, 10], hint: 'Even number of digits' },
  { id: 'codabar', name: 'Codabar', kind: '1d', bcid: 'rationalizedCodabar', quiet: [10, 10], hint: 'A…A start/stop, digits - $ : / . +' },
  { id: 'qrcode', name: 'QR Code', kind: '2d', bcid: 'qrcode', quiet: [4, 4], hint: 'Any text or URL' },
  { id: 'gs1qrcode', name: 'GS1 QR Code', kind: '2d', bcid: 'gs1qrcode', quiet: [4, 4], hint: '(AI)value…' },
  { id: 'datamatrix', name: 'Data Matrix', kind: '2d', bcid: 'datamatrix', quiet: [1, 1], hint: 'Any text' },
  { id: 'gs1datamatrix', name: 'GS1 DataMatrix', kind: '2d', bcid: 'gs1datamatrix', quiet: [1, 1], hint: '(AI)value…' },
  { id: 'pdf417', name: 'PDF417', kind: '2d', bcid: 'pdf417', quiet: [2, 2], hint: 'Any text' },
  { id: 'aztec', name: 'Aztec Code', kind: '2d', bcid: 'azteccode', quiet: [0, 0], hint: 'Any text' },
];
const SYM = Object.fromEntries(SYMBOLOGIES.map((s) => [s.id, s]));

/* ---------------- check digits ---------------- */
const isDigits = (s) => /^\d+$/.test(s);
/** GS1 mod-10 check digit for any GTIN/SSCC/GLN body (weights 3,1 from the right). */
function gs1Check(body) {
  if (!isDigits(body)) throw new Error('Digits only');
  let sum = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i--, w = 4 - w) sum += (+body[i]) * w;
  return String((10 - (sum % 10)) % 10);
}
const ean13Check = (d12) => gs1Check(d12);
const ean8Check = (d7) => gs1Check(d7);
const upcaCheck = (d11) => gs1Check(d11);
const itf14Check = (d13) => gs1Check(d13);
const ssccCheck = (d17) => gs1Check(d17);
/** UPC-E (with number system 0/1) → UPC-A 11-digit body. */
function upceToUpca(d7) {
  const ns = d7[0], m = d7.slice(1), last = m[5];
  let body;
  if (last <= '2') body = m.slice(0, 2) + last + '0000' + m.slice(2, 5);
  else if (last === '3') body = m.slice(0, 3) + '00000' + m.slice(3, 5);
  else if (last === '4') body = m.slice(0, 4) + '00000' + m[4];
  else body = m.slice(0, 5) + '0000' + last;
  return ns + body;
}
function upceCheck(d7) { return gs1Check(upceToUpca(d7)); }
const C39 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
function code39Mod43(s) { let t = 0; for (const c of s) { const i = C39.indexOf(c); if (i < 0) throw new Error(`"${c}" is not allowed in Code 39`); t += i; } return C39[t % 43]; }

/* ---------------- GS1 application identifiers ---------------- */
// [ai, format, title]; n = numeric, an = alphanumeric; fixed lengths "n6", variable "an..20"; check = true for mod-10.
const GS1_AI = {
  '00': ['n18', 'SSCC', true], '01': ['n14', 'GTIN', true], '02': ['n14', 'CONTENT', true],
  '10': ['an..20', 'BATCH/LOT'], '11': ['n6', 'PROD DATE'], '12': ['n6', 'DUE DATE'], '13': ['n6', 'PACK DATE'], '15': ['n6', 'BEST BEFORE'], '16': ['n6', 'SELL BY'], '17': ['n6', 'USE BY / EXPIRY'],
  '20': ['n2', 'VARIANT'], '21': ['an..20', 'SERIAL'], '22': ['an..20', 'CPV'], '30': ['n..8', 'VAR. COUNT'], '37': ['n..8', 'COUNT'],
  '240': ['an..30', 'ADDITIONAL ID'], '241': ['an..30', 'CUST. PART No.'], '250': ['an..30', 'SECONDARY SERIAL'], '251': ['an..30', 'REF. TO SOURCE'],
  '400': ['an..30', 'ORDER NUMBER'], '401': ['an..30', 'GINC'], '402': ['n17', 'GSIN', true], '403': ['an..30', 'ROUTE'],
  '410': ['n13', 'SHIP TO LOC', true], '411': ['n13', 'BILL TO', true], '412': ['n13', 'PURCHASE FROM', true], '413': ['n13', 'SHIP FOR LOC', true], '414': ['n13', 'LOC No.', true], '415': ['n13', 'PAY TO', true],
  '420': ['an..20', 'SHIP TO POST'], '421': ['an..12', 'SHIP TO POST (ISO)'], '422': ['n3', 'ORIGIN'], '7003': ['n10', 'EXPIRY TIME'], '8004': ['an..30', 'GIAI'], '8008': ['n..12', 'PROD TIME'],
};
for (let i = 310; i <= 369; i++) for (let d = 0; d <= 9; d++) GS1_AI[String(i) + d] = ['n6', 'MEASURE'];
for (let i = 90; i <= 99; i++) GS1_AI[String(i)] = ['an..90', i === 90 ? 'INTERNAL' : 'COMPANY INTERNAL'];
// AIs whose length is predefined by the first two digits: no FNC1 separator needed after them.
const GS1_FIXED2 = new Set(['00', '01', '02', '03', '04', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '31', '32', '33', '34', '35', '36', '41']);
function gs1AiInfo(ai) { return GS1_AI[ai] || null; }
/** Parse "(01)09501101530003(10)ABC" into [{ai, value}] with validation; autoCheck appends missing mod-10 digits. */
function parseGS1(str, autoCheck = true) {
  const s = String(str).trim();
  if (!s) throw new Error('GS1 data is empty');
  if (s[0] !== '(') throw new Error('GS1 data must use (AI) brackets, e.g. (01)09501101530003');
  const out = [], re = /\((\d{2,4})\)([^(]*)/g;
  let m, pos = 0;
  while ((m = re.exec(s))) {
    if (m.index !== pos) throw new Error('Unexpected text before (' + m[1] + ')');
    pos = re.lastIndex;
    const ai = m[1]; let v = m[2];
    const info = gs1AiInfo(ai);
    if (!info) throw new Error(`Unknown GS1 AI (${ai})`);
    const [fmt, , chk] = info, numeric = fmt[0] === 'n' && fmt[1] !== '.' ? true : fmt.startsWith('n');
    const fixed = /^n(\d+)$/.exec(fmt), varlen = /\.\.(\d+)$/.exec(fmt);
    if (numeric && !isDigits(v)) throw new Error(`AI (${ai}) ${info[1]} must be digits only`);
    if (fixed) {
      const n = +fixed[1];
      if (chk && autoCheck && v.length === n - 1) v += gs1Check(v);
      if (v.length !== n) throw new Error(`AI (${ai}) ${info[1]} needs ${n} digits, got ${v.length}`);
      if (chk) { const c = gs1Check(v.slice(0, -1)); if (c !== v.slice(-1)) throw new Error(`AI (${ai}) check digit should be ${c}, not ${v.slice(-1)}`); }
      if (/^1[1-7]$/.test(ai)) { const mm = +v.slice(2, 4), dd = +v.slice(4, 6); if (mm < 1 || mm > 12 || dd > 31) throw new Error(`AI (${ai}) date must be YYMMDD`); }
    } else if (varlen) {
      if (!v.length) throw new Error(`AI (${ai}) is empty`);
      if (v.length > +varlen[1]) throw new Error(`AI (${ai}) is limited to ${varlen[1]} characters`);
      if (!/^[\x21-\x22\x25-\x3f\x41-\x5a\x5f\x61-\x7a]+$/.test(v)) throw new Error(`AI (${ai}) contains characters outside the GS1 set`);
    }
    out.push({ ai, value: v });
  }
  if (pos !== s.length) throw new Error('Could not parse GS1 data near "' + s.slice(pos, pos + 10) + '"');
  return out;
}
const gs1Text = (els) => els.map((e) => `(${e.ai})${e.value}`).join('');
/** Raw element string with FNC1 marked as \x1d (GS) after variable-length fields. */
function gs1Raw(els) { return els.map((e, i) => e.ai + e.value + (i < els.length - 1 && !GS1_FIXED2.has(e.ai.slice(0, 2)) ? '\x1d' : '')).join(''); }
/** Raw GS1 element string (FNC1 as \x1d) → [{ai, value}] using the AI table (for ZPL import). */
function gs1FromRaw(raw) {
  const s = String(raw).replace(/^\x1d/, ''), out = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\x1d') { i++; continue; }
    let ai = null;
    for (const n of [2, 3, 4]) if (GS1_AI[s.substr(i, n)]) { ai = s.substr(i, n); break; }
    if (!ai) throw new Error('Unknown GS1 AI at "' + s.slice(i, i + 4) + '"');
    i += ai.length;
    const fx = /^n(\d+)$/.exec(GS1_AI[ai][0]);
    let v;
    if (fx) { v = s.substr(i, +fx[1]); i += +fx[1]; }
    else { const e = s.indexOf('\x1d', i); v = s.slice(i, e < 0 ? s.length : e); i = e < 0 ? s.length : e + 1; }
    out.push({ ai, value: v });
  }
  return out;
}
