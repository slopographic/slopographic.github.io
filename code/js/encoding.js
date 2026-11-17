/* Slop Code: opening any text file. Text encoding detection (sniff), decoding, encoding, and line-ending helpers, as
 * pure functions (no DOM, no editor). TextDecoder knows every label below except UTF-32, which is done by hand. TextEncoder
 * only writes UTF-8, so the other encodings are written here: UTF-16 and UTF-32 directly, and the single-byte code pages
 * from a table that is read off the browser's own decoder (so a file saves back in the code page it was opened in).
 * The multi-byte East Asian encodings can be read and guessed but not written (encode returns null). */
import { CJK_CANDIDATES, rate } from './enc-tables.js';

/** The encodings a person can pick: id (a WHATWG label) and the label that is shown. */
export const ENCODINGS = [
  { id: 'utf-8', label: 'UTF-8' },
  { id: 'utf-16le', label: 'UTF-16 LE' }, { id: 'utf-16be', label: 'UTF-16 BE' },
  { id: 'utf-32le', label: 'UTF-32 LE' }, { id: 'utf-32be', label: 'UTF-32 BE' },
  { id: 'windows-1252', label: 'Windows-1252 (Western)' }, { id: 'iso-8859-2', label: 'ISO-8859-2 (Central European)' },   // i18n-ignore: an encoding name, not translated
  { id: 'iso-8859-15', label: 'ISO-8859-15 (Western, Euro)' }, { id: 'windows-1250', label: 'Windows-1250 (Central European)' },   // i18n-ignore: an encoding name, not translated
  { id: 'windows-1251', label: 'Windows-1251 (Cyrillic)' }, { id: 'koi8-r', label: 'KOI8-R (Cyrillic)' },   // i18n-ignore: an encoding name, not translated
  { id: 'ibm866', label: 'IBM866 (Cyrillic, DOS)' }, { id: 'macintosh', label: 'Macintosh (Mac Roman)' },   // i18n-ignore: an encoding name, not translated
  { id: 'shift_jis', label: 'Shift_JIS (Japanese)' }, { id: 'euc-jp', label: 'EUC-JP (Japanese)' },   // i18n-ignore: an encoding name, not translated
  { id: 'iso-2022-jp', label: 'ISO-2022-JP (Japanese)' }, { id: 'gbk', label: 'GBK (Simplified Chinese)' },   // i18n-ignore: an encoding name, not translated
  { id: 'gb18030', label: 'GB18030 (Chinese)' }, { id: 'big5', label: 'Big5 (Traditional Chinese)' },   // i18n-ignore: an encoding name, not translated
  { id: 'euc-kr', label: 'EUC-KR (Korean)' },
];

/** The line endings a person can pick. */
export const EOLS = [{ id: 'lf', label: 'LF' }, { id: 'crlf', label: 'CRLF' }, { id: 'cr', label: 'CR' }];

// How much of a file sniff looks at, and the thresholds that turn counts into a verdict.
const SAMPLE_BYTES = 64 * 1024;
const WIDE_PROBE_BYTES = 4096; // the part of the sample checked for UTF-16 and UTF-32 without a BOM
const UTF16_NUL_SHARE_MIN = 0.1; // pairs with a NUL in the high byte: at least this share of all pairs
const UTF16_WRONG_SIDE_MAX = 0.02; // NULs in the other byte of a pair: at most this share of the right-side NULs
const UTF16_PLAIN_MIN = 0.9; // of the pairs with a NUL high byte, how many have a printable ASCII low byte
const UTF32_VALID_MIN = 0.95; // of the 4-byte groups, how many are plausible text characters
const UTF32_BMP_MIN = 0.5; // ... and how many of them are below U+10000
const CONTROL_SHARE_MAX = 0.02; // control bytes (not tab, CR, LF, FF, BS, ESC) above this share of the sample: binary
const CONTROL_MIN = 3; // ... and at least this many
const COMMON_SHARE_MIN = 0.25; // CJK guess: share of the decoded non-ASCII characters that are common characters of the language
const COMMON_MIN = 2; // ... and at least this many of them (one lucky hit proves nothing)
const MOSTLY_HIGH_MIN = 0.5; // a file is "mostly high bytes" when they are this share of the high bytes plus ASCII letters
const HIGH_BYTES_MIN = 3; // ... and there are at least this many (fewer is too little to tell from Western text)
const CYRILLIC_SHARE_MIN = 0.8; // Cyrillic guess: share of the high bytes that decode to Cyrillic letters

const BOMS = [ // the 4-byte ones first: FF FE 00 00 is UTF-32 LE, not UTF-16 LE followed by a NUL
  { encoding: 'utf-32le', bytes: [0xFF, 0xFE, 0, 0] }, { encoding: 'utf-32be', bytes: [0, 0, 0xFE, 0xFF] },
  { encoding: 'utf-8', bytes: [0xEF, 0xBB, 0xBF] }, { encoding: 'utf-16le', bytes: [0xFF, 0xFE] },
  { encoding: 'utf-16be', bytes: [0xFE, 0xFF] },
];
// Windows-1252 from 0x80 to 0x9F. Browsers decode this range right; Node's TextDecoder gives C1 controls, so it is mapped here.
const CP1252_HIGH = '€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8DŽ\x8F\x90‘’“”•–—˜™š›œ\x9DžŸ';
const SINGLE_BYTE = ['windows-1252', 'iso-8859-2', 'iso-8859-15', 'windows-1250', 'windows-1251', 'koi8-r', 'ibm866', 'macintosh'];
const toBytes = (data) => (data instanceof Uint8Array ? data
  : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data || 0));

// ---- Sniffing -------------------------------------------------------------------------------------------------------

const found = (encoding, confidence, reason, extra) => ({ text: true, encoding, bom: false, ascii: false, confidence, reason, ...extra });
const binary = (reason) => ({ text: false, encoding: '', bom: false, ascii: false, confidence: 'likely', reason });

/** Look at the start of a file and say what it is: { text, encoding, bom, ascii, confidence, reason }. Never throws.
 * reason is a short code: empty, bom, utf16-nuls, utf32-nuls, nul, control, iso-2022-jp, ascii, utf-8, cjk, cyrillic, latin. */
export function sniff(bytes) {
  try { return sniffBytes(toBytes(bytes)); } catch (e) { return { ...binary('error'), confidence: 'guess' }; }
}

function sniffBytes(all) {
  if (!all.length) return found('utf-8', 'certain', 'empty', { ascii: true });
  const cut = all.length > SAMPLE_BYTES; // the cut may split a multi-byte character
  const b = cut ? all.subarray(0, SAMPLE_BYTES) : all;
  const bom = BOMS.find((m) => m.bytes.every((v, i) => b[i] === v));
  if (bom) return found(bom.encoding, 'certain', 'bom', { bom: true });
  const wide = sniffWide(b.subarray(0, WIDE_PROBE_BYTES));
  if (wide) return found(wide.encoding, 'likely', wide.reason);
  const st = scan(b);
  if (st.nul) return binary('nul');
  if (st.control >= CONTROL_MIN && st.control > b.length * CONTROL_SHARE_MAX) return binary('control');
  if (!st.high) return st.jis ? found('iso-2022-jp', 'likely', 'iso-2022-jp') : found('utf-8', 'certain', 'ascii', { ascii: true });
  if (strictDecode('utf-8', b, cut) !== null) return found('utf-8', 'certain', 'utf-8');
  return guessLegacy(b, cut, st);
}

/** A file that is not UTF-8: East Asian multi-byte, then Cyrillic, then (a file of mostly high bytes that is valid in some
 * East Asian encoding but has none of its common characters) the first valid one, and else Windows-1252. */
function guessLegacy(b, cut, st) {
  const cjk = guessCjk(b, cut);
  if (cjk.best) return found(cjk.best, 'guess', 'cjk');
  const mostlyHigh = st.high >= HIGH_BYTES_MIN && st.high >= (st.high + st.letters) * MOSTLY_HIGH_MIN; // accented Latin text has mostly ASCII letters
  const cyrillic = mostlyHigh ? guessCyrillic(b, st.high) : null;
  if (cyrillic) return found(cyrillic, 'guess', 'cyrillic');
  return mostlyHigh && cjk.weak ? found(cjk.weak, 'guess', 'cjk') : found('windows-1252', 'guess', 'latin');
}

/** One pass over the sample: NULs, odd control bytes, bytes >= 0x80, ASCII letters, and an ISO-2022-JP escape (ESC $ B / ESC $ @). */
function scan(b) {
  const st = { nul: 0, control: 0, high: 0, letters: 0, jis: false };
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c >= 0x80) st.high++;
    else if (c === 0) st.nul++;
    else if (c === 0x1B) { if (b[i + 1] === 0x24 && (b[i + 2] === 0x42 || b[i + 2] === 0x40)) st.jis = true; }
    else if (c === 0x7F || (c < 0x20 && c !== 8 && c !== 9 && c !== 10 && c !== 12 && c !== 13)) st.control++;
    else if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) st.letters++;
  }
  return st;
}

/** UTF-32 or UTF-16 without a BOM, told by where the NUL bytes sit. Returns { encoding, reason } or null. */
function sniffWide(p) {
  const n4 = p.length - (p.length % 4), n2 = p.length - (p.length % 2);
  if (n4 >= 8) for (const le of [true, false]) if (isUtf32(p, n4, le)) return { encoding: le ? 'utf-32le' : 'utf-32be', reason: 'utf32-nuls' };
  if (n2 >= 4) for (const le of [true, false]) if (isUtf16(p, n2, le)) return { encoding: le ? 'utf-16le' : 'utf-16be', reason: 'utf16-nuls' };
  return null;
}

/** True when nearly every 4-byte group is a plausible text character and most are below U+10000 (so two bytes are NUL). */
function isUtf32(p, n, le) {
  let good = 0, bmp = 0;
  for (let i = 0; i < n; i += 4) {
    const v = (le ? p[i] | p[i + 1] << 8 | p[i + 2] << 16 | p[i + 3] << 24 : p[i] << 24 | p[i + 1] << 16 | p[i + 2] << 8 | p[i + 3]) >>> 0;
    const printable = v >= 0x20 || v === 9 || v === 10 || v === 12 || v === 13;
    if (printable && v <= 0x10FFFF && !(v >= 0xD800 && v <= 0xDFFF)) { good++; if (v <= 0xFFFF) bmp++; }
  }
  return good >= (n / 4) * UTF32_VALID_MIN && bmp >= (n / 4) * UTF32_BMP_MIN;
}

/** True when NULs sit (almost) only in the high byte of the pairs, and the low byte beside them is printable ASCII. */
function isUtf16(p, n, le) {
  let right = 0, wrong = 0, plain = 0;
  for (let i = 0; i < n; i += 2) {
    const lo = le ? p[i] : p[i + 1], hi = le ? p[i + 1] : p[i];
    if (hi === 0) { right++; if ((lo >= 0x20 && lo < 0x7F) || lo === 9 || lo === 10 || lo === 13) plain++; }
    if (lo === 0) wrong++;
  }
  return right >= Math.max(1, (n / 2) * UTF16_NUL_SHARE_MIN) && wrong <= right * UTF16_WRONG_SIDE_MAX && plain >= right * UTF16_PLAIN_MIN;
}

/** Decode strictly (any invalid byte fails: null). When the sample was cut, a character split by the cut is not an error. */
function strictDecode(id, b, cut) {
  try { return new TextDecoder(id, { fatal: true }).decode(b, { stream: cut }); } catch (e) { return null; }
}

/** Among the multi-byte candidates: best is the one whose strict decode is mostly in its scripts and has the most common
 * characters; weak is the first one that is only mostly in its scripts. */
function guessCjk(b, cut) {
  let best = null, weak = null, bestShare = 0;
  for (const c of CJK_CANDIDATES) {
    const text = strictDecode(c.id, b, cut);
    if (text === null) continue;
    const { inScript, common, total } = rate(c, text);
    if (!inScript) continue;
    weak = weak || c.id;
    const share = common / total;
    if (common >= COMMON_MIN && share >= COMMON_SHARE_MIN && share > bestShare) { best = c.id; bestShare = share; } // a tie keeps the earlier one
  }
  return { best, weak };
}

/** Windows-1251 or KOI8-R when the high bytes are mostly Cyrillic letters: the one that makes lower-case letters dominate. */
function guessCyrillic(b, high) {
  let best = null, bestLower = -1;
  for (const id of ['windows-1251', 'koi8-r']) {
    let cyrillic = 0, lower = 0;
    for (const ch of new TextDecoder(id).decode(b)) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x400 && cp <= 0x4FF) { cyrillic++; if (cp >= 0x430 && cp <= 0x45F) lower++; }
    }
    if (cyrillic < high * CYRILLIC_SHARE_MIN) continue;
    if (lower / cyrillic > bestLower) { best = id; bestLower = lower / cyrillic; }
  }
  return best;
}

// ---- Decoding and encoding --------------------------------------------------------------------------------------------

/** The WHATWG name for a label; an unknown (or "replacement") label becomes utf-8. */
function resolve(label) {
  const id = String(label || '').trim().toLowerCase();
  if (id === 'utf-32le' || id === 'utf-32be') return id;
  try { const name = new TextDecoder(id).encoding; return name === 'replacement' ? 'utf-8' : name; } catch (e) { return 'utf-8'; }
}

/** Bytes to text. A BOM that matches the encoding is dropped and invalid sequences become U+FFFD (never an error). */
export function decode(bytes, encoding) {
  const b = toBytes(bytes), id = resolve(encoding);
  if (id === 'utf-32le' || id === 'utf-32be') return decodeUtf32(b, id === 'utf-32le');
  const text = new TextDecoder(id).decode(b); // utf-8 and utf-16 drop their BOM here
  return id === 'windows-1252' ? text.replace(/[\x80-\x9F]/g, (c) => CP1252_HIGH[c.charCodeAt(0) - 0x80]) : text;
}

/** UTF-32 by hand (TextDecoder has none): a bad code point, or a partial group at the end, becomes U+FFFD. */
function decodeUtf32(b, le) {
  const parts = [], whole = b.length - (b.length % 4);
  let chunk = [];
  for (let i = 0; i < whole; i += 4) {
    let cp = (le ? b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24 : b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]) >>> 0;
    if (cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) cp = 0xFFFD;
    chunk.push(cp);
    if (chunk.length === 8192) { parts.push(String.fromCodePoint(...chunk)); chunk = []; }
  }
  if (chunk.length) parts.push(String.fromCodePoint(...chunk));
  if (whole < b.length) parts.push('\uFFFD');
  const text = parts.join('');
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

/** Text to bytes in `encoding` (opts.bom writes a BOM for UTF-8, UTF-16, UTF-32). Returns null when the encoding cannot be
 * written here, or a character has no place in it (never a '?'). A lone surrogate is written as U+FFFD. */
export function encode(text, encoding, opts) {
  const s = String(text), bom = !!(opts && opts.bom), id = String(encoding || '').trim().toLowerCase();
  if (id === 'utf-8') return withBom(new TextEncoder().encode(s), [0xEF, 0xBB, 0xBF], bom);
  if (id === 'utf-16le' || id === 'utf-16be') return encodeUtf16(s, id === 'utf-16le', bom);
  if (id === 'utf-32le' || id === 'utf-32be') return encodeUtf32(s, id === 'utf-32le', bom);
  const table = SINGLE_BYTE.includes(id) ? reverseTable(id) : null;
  return table ? encodeSingle(s, table) : null;
}

function withBom(bytes, mark, bom) {
  if (!bom) return bytes;
  const out = new Uint8Array(mark.length + bytes.length);
  out.set(mark);
  out.set(bytes, mark.length);
  return out;
}

function encodeUtf16(s, le, bom) {
  const out = new Uint8Array((s.length + (bom ? 1 : 0)) * 2);
  let o = 0;
  const put = (u) => { out[o++] = le ? u & 255 : u >> 8; out[o++] = le ? u >> 8 : u & 255; };
  if (bom) put(0xFEFF);
  for (let i = 0; i < s.length; i++) {
    let u = s.charCodeAt(i);
    if (u >= 0xD800 && u <= 0xDFFF) { // keep a proper surrogate pair, replace a lone half
      const next = s.charCodeAt(i + 1);
      if (u <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) { put(u); u = next; i++; } else u = 0xFFFD;
    }
    put(u);
  }
  return out;
}

function encodeUtf32(s, le, bom) {
  const cps = Array.from(s, (ch) => { const cp = ch.codePointAt(0); return cp >= 0xD800 && cp <= 0xDFFF ? 0xFFFD : cp; });
  if (bom) cps.unshift(0xFEFF);
  const out = new Uint8Array(cps.length * 4); // the byte above bit 21 is always 0
  for (let i = 0, o = 0; i < cps.length; i++, o += 4) {
    const low = cps[i] & 255, mid = (cps[i] >> 8) & 255, high = cps[i] >> 16;
    if (le) { out[o] = low; out[o + 1] = mid; out[o + 2] = high; } else { out[o + 1] = high; out[o + 2] = mid; out[o + 3] = low; }
  }
  return out;
}

const reverseTables = new Map();
/** UTF-16 code unit -> byte for the high half (0x80-0xFF) of a single-byte code page, read off the browser's decoder. */
function reverseTable(id) {
  let table = reverseTables.get(id);
  if (!table) {
    const chars = decode(Uint8Array.from({ length: 128 }, (_, i) => 128 + i), id);
    table = new Map();
    for (let i = 127; i >= 0; i--) table.set(chars.charCodeAt(i), 128 + i); // the lowest byte wins a duplicate
    reverseTables.set(id, table);
  }
  return table;
}

function encodeSingle(s, table) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i), byte = u < 0x80 ? u : table.get(u);
    if (byte === undefined) return null;
    out[i] = byte;
  }
  return out;
}

// ---- Line endings -----------------------------------------------------------------------------------------------------

/** Count the line endings: { eol: 'lf'|'crlf'|'cr'|'mixed'|'none', lf, crlf, cr } (lf and cr count only the lone ones). */
export function detectEol(text) {
  const s = String(text);
  let lf = 0, crlf = 0, cr = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 10) lf++;
    else if (c === 13) { if (s.charCodeAt(i + 1) === 10) { crlf++; i++; } else cr++; }
  }
  const kinds = (lf ? 1 : 0) + (crlf ? 1 : 0) + (cr ? 1 : 0);
  return { eol: kinds === 0 ? 'none' : kinds > 1 ? 'mixed' : lf ? 'lf' : crlf ? 'crlf' : 'cr', lf, crlf, cr };
}

/** Every \n in `text` (which holds only \n) becomes the line ending asked for. */
export function applyEol(text, eol) {
  const s = String(text);
  return eol === 'crlf' ? s.replace(/\n/g, '\r\n') : eol === 'cr' ? s.replace(/\n/g, '\r') : s;
}

/** Every \r\n and lone \r becomes \n. */
export function normalizeEol(text) { return String(text).replace(/\r\n?/g, '\n'); }
