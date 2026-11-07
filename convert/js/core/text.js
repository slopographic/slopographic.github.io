/* Text encodings and line endings. Pure. */
import { tr } from './i18n.js';

/** Bytes → Base64 text. wrap: 0 for one line, or a line length such as 76 (MIME style). */
export function bytesToBase64(bytes, { wrap = 0 } = {}) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const s = btoa(bin);
  if (!wrap) return s;
  return s.match(new RegExp(`.{1,${wrap}}`, 'g')).join('\n');
}

/** Base64 text (standard or URL-safe, whitespace allowed, optional data: URL prefix) → bytes. Throws on bad input. */
export function base64ToBytes(text) {
  let s = String(text).trim();
  if (s.startsWith('data:')) { const i = s.indexOf(','); if (i < 0) throw new Error(tr('convert.text.data_url_empty')); s = s.slice(i + 1); }
  s = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const rem = s.length % 4;
  if (rem === 1) throw new Error(tr('convert.text.b64_length'));
  if (rem) s += '='.repeat(4 - rem);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error(tr('convert.text.b64_chars'));
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Percent-encode. full: keep URL punctuation (encodeURI); otherwise encode everything (encodeURIComponent). */
export function urlEncode(text, { full = false } = {}) {
  return full ? encodeURI(text) : encodeURIComponent(text);
}

export function urlDecode(text) {
  try { return decodeURIComponent(text); } catch (e) { throw new Error(tr('convert.text.bad_percent')); }
}

export const EOLS = { lf: '\n', crlf: '\r\n', cr: '\r' };

/** Rewrite every line ending (CRLF, LF or CR) as the chosen one. */
export function setLineEndings(text, eol = 'lf') {
  const e = EOLS[eol];
  if (!e) throw new Error(`Unknown line ending: ${eol}`); // i18n-ignore: for developers (the option has fixed values)
  return text.replace(/\r\n|\r|\n/g, e);
}

/** Decode bytes as UTF-8 text, dropping a leading BOM. */
export function decodeText(bytes) {
  const s = new TextDecoder('utf-8').decode(bytes);
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
