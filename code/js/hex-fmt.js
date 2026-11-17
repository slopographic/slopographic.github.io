/* Slop Code, hex view: how bytes, offsets and sizes are written, and how what a person types is read. Pure, except that the
 * size line uses the page's language (t from dom.js, Intl). */
import { t } from './dom.js';

/** Two hex digits for each byte value, and the character the ASCII column shows ('.' for what is not printable). */
export const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
export const CH = Array.from({ length: 256 }, (_, i) => (i >= 0x20 && i < 0x7f ? String.fromCharCode(i) : '.'));
/** An offset as the dump's first column writes it: eight hex digits (more past 4 GB). */
export const hex8 = (n) => n.toString(16).padStart(8, '0');
/** An offset as the byte line and the status write it: 0x1f40. */
export const offsetText = (n) => '0x' + n.toString(16);

/** A number in the page's language, with up to `max` decimals. */
function num(v, max) {
  const lang = window.SlopI18n && window.SlopI18n.get ? window.SlopI18n.get() : undefined;
  try { return new Intl.NumberFormat(lang, { maximumFractionDigits: max }).format(v); } catch (e) { return String(v); }
}

/** The size for the header: '512 bytes', or '12.4 KB (12,704 bytes)' once it is a kilobyte or more. */
export function sizeLine(size) {
  const bytes = t('code.hex.bytes', { n: size, bytes: num(size, 0) });
  if (size < 1024) return bytes;
  let v = size / 1024, u = 0;
  while (v >= 1024 && u < 3) { v /= 1024; u++; }
  return t('code.hex.size', { size: num(v, 1) + ' ' + ['KB', 'MB', 'GB', 'TB'][u], bytes });
}

/** What the Go to offset box holds: '0x1F40' (hex) or '8000' (decimal); spaces, commas and underscores are ignored. NaN if neither. */
export function parseOffset(text) {
  const s = String(text).replace(/[\s,_]/g, '');
  const n = /^0x[0-9a-f]+$/i.test(s) ? parseInt(s.slice(2), 16) : /^\d+$/.test(s) ? Number(s) : NaN;
  return Number.isSafeInteger(n) ? n : NaN;
}

/** What the Find box holds, as bytes: hex ('89 50 4e 47', '0x89 0x50' or '0x89504e47') or else the text as UTF-8. Null when empty. */
export function parseQuery(text) {
  const raw = String(text).trim();
  if (!raw) return null;
  const parts = raw.split(/[\s,]+/);
  const pair = /^(0x)?[0-9a-f]{2}$/i;
  if (parts.every((p) => pair.test(p)) && (parts.length > 1 || /^0x/i.test(parts[0]))) return Uint8Array.from(parts.map((p) => parseInt(p.replace(/^0x/i, ''), 16)));
  const run = /^0x((?:[0-9a-f]{2})+)$/i.exec(raw);
  if (run) return Uint8Array.from(run[1].match(/../g).map((p) => parseInt(p, 16)));
  return new TextEncoder().encode(raw);
}
