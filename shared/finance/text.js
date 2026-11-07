/* Finance files: the shared text helpers. Pure (no DOM), ES module, used by every parser in shared/finance/.
 *   decodeBytes(bytes, { legacy }) -> { text, encoding }  UTF-8 when the bytes are valid UTF-8 (with or without a BOM),
 *                                    else the legacy code page: 'cp437' (SIE, "PC8"), 'windows-1252' (OFX 1.x, QIF, MT940),
 *                                    or 'auto' (CP437 or Windows-1252, whichever reads more Swedish and German letters).
 *   cp437(bytes) / toCp437(text)  -> IBM PC code page 437, both ways (SIE files and the SIE checksum).
 *   parseAmount(s, { thousands3 })-> a Number, or null. Decimal point or comma, a leading or trailing minus, + and spaces
 *                                    allowed; "1,234.50" and "1.234,50" both work. thousands3: "1,234" is 1234 (QIF).
 *   isoDate(y, m, d)              -> 'YYYY-MM-DD' for a real calendar date, else null.
 *   ymd(s)                        -> 'YYYY-MM-DD' from YYYYMMDD (SIE, OFX: the first 8 digits) or YYYY-MM-DD, else null.
 *   cents(n) / sum(list)          -> exact two-decimal arithmetic for checks (öre, cents).
 *   say(key, vars)                -> a warning in the chosen language (SlopI18n, shared/i18n/ui/<code>/data2.js); the key without it. */

export const say = (k, v) => { const I = globalThis.SlopI18n; return I && I.t ? I.t(k, v) : k; };

// Code page 437, bytes 0x80 to 0xFF (the lower half is ASCII). 0xFF is a no-break space.
const HIGH = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
export const CP437_HIGH = HIGH;
const BACK = new Map([...HIGH].map((c, i) => [c, 0x80 + i]));

/** Bytes in code page 437 as text. */
export function cp437(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) { const b = bytes[i]; s += b < 0x80 ? String.fromCharCode(b) : HIGH[b - 0x80]; }
  return s;
}

/** Text as code page 437 bytes; a character the code page does not have becomes '?'. */
export function toCp437(text) {
  const out = [];
  for (const c of String(text)) {
    const n = c.charCodeAt(0);
    out.push(n < 0x80 ? n : BACK.has(c) ? BACK.get(c) : 0x3f);
  }
  return Uint8Array.from(out);
}

// Windows-1252 differs from Latin-1 in 0x80..0x9F only. Written out so the decoder works where TextDecoder has no legacy
// code pages (a small Node build).
const W1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
export function windows1252(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) { const b = bytes[i]; s += b >= 0x80 && b < 0xa0 ? W1252[b - 0x80] : String.fromCharCode(b); }
  return s;
}

const utf8 = (bytes) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return null; } };

// Letters that tell the legacy code pages apart in Swedish, Danish, Norwegian and German text: åäöÅÄÖéüÜøØæÆ.
const CP437_LETTERS = new Set([0x86, 0x84, 0x94, 0x8f, 0x8e, 0x99, 0x82, 0x81, 0x9a, 0x91, 0x92, 0x9b, 0x9d]);
const W1252_LETTERS = new Set([0xe5, 0xe4, 0xf6, 0xc5, 0xc4, 0xd6, 0xe9, 0xfc, 0xdc, 0xf8, 0xd8, 0xe6, 0xc6]);

/** Bytes as text. UTF-8 wins when the bytes are valid UTF-8 (a BOM is dropped); otherwise the legacy code page. */
export function decodeBytes(bytes, { legacy = 'auto' } = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const bom = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
  const u = utf8(bom ? b.subarray(3) : b);
  if (u !== null) return { text: u, encoding: 'utf-8' };
  let page = legacy;
  if (page === 'auto') {
    let a = 0, w = 0;
    for (let i = 0; i < b.length; i++) { if (CP437_LETTERS.has(b[i])) a++; if (W1252_LETTERS.has(b[i])) w++; }
    page = a > w ? 'cp437' : 'windows-1252';
  }
  return { text: page === 'cp437' ? cp437(b) : windows1252(b), encoding: page };
}

/** A Number from amount text, or null. "1 234,50", "-12.5", "12.50-", "+3", "1.234,50", "1,234.50". */
export function parseAmount(s, { thousands3 = false } = {}) {
  let t = String(s == null ? '' : s).trim().replace(/[\s  ']/g, '').replace(/^\$/, '');
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/^[-−]/.test(t)) { neg = !neg; t = t.slice(1); } else if (t.startsWith('+')) t = t.slice(1);
  if (/[-−]$/.test(t)) { neg = !neg; t = t.slice(0, -1); }
  t = t.replace(/^\$/, '');
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const lastDot = t.lastIndexOf('.'), lastComma = t.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    t = t.split(dec === '.' ? ',' : '.').join('').replace(',', '.');
  } else if (lastComma >= 0) {
    const parts = t.split(',');
    if (parts.length > 2 || (thousands3 && parts[1].length === 3)) t = parts.join('');
    else t = t.replace(',', '.');
  } else if ((t.match(/\./g) || []).length > 1) t = t.split('.').join('');
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** 'YYYY-MM-DD' for a real calendar date, else null. */
export function isoDate(y, m, d) {
  const Y = Number(y), M = Number(m), D = Number(d);
  if (!Number.isInteger(Y) || !Number.isInteger(M) || !Number.isInteger(D) || M < 1 || M > 12 || D < 1 || D > 31) return null;
  const dt = new Date(Date.UTC(Y, M - 1, D));
  if (dt.getUTCMonth() !== M - 1) return null;
  return `${String(Y).padStart(4, '0')}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' from YYYYMMDD (also the start of an OFX date-time such as 20261024120000.000[-5:EST]) or YYYY-MM-DD. */
export function ymd(s) {
  const t = String(s == null ? '' : s).trim();
  let m = /^(\d{4})(\d{2})(\d{2})/.exec(t);
  if (m) return isoDate(m[1], m[2], m[3]);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? isoDate(m[1], m[2], m[3]) : null;
}

/** Whole cents (öre) of an amount, for exact checks. */
export const cents = (n) => Math.round(Number(n || 0) * 100);
/** The sum of amounts, exact to the cent. */
export const sum = (list) => list.reduce((t, n) => t + cents(n), 0) / 100;
/** Text with runs of white space (line breaks too) as one space. */
export const squash = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
