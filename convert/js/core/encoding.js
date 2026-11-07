/* Text in an old or foreign encoding (Windows-1252, Latin-1, UTF-16, Shift_JIS …) rewritten as UTF-8. Pure: TextDecoder
 * only, which browsers and Node both have.
 *   ENCODINGS                                 [value, label] for the option: 'auto' first
 *   sniffEncoding(bytes) -> label             a byte-order mark says UTF-8 or UTF-16; text that decodes as UTF-8 is UTF-8;
 *                                             UTF-16 without a mark is told by its zero bytes; else Windows-1252 (which
 *                                             reads every byte, so a Latin-1 file comes out right too)
 *   toUtf8(bytes, { from, bom }) -> { text, from }   from: an ENCODINGS value; bom: start the text with a UTF-8 mark */
import { tr } from './i18n.js';

// The encodings the option offers ('auto' first); each label is convert.enc.<value> (- as _) in the tables.
const ENC = [
  'auto', 'windows-1252', 'iso-8859-1', 'iso-8859-15', 'macintosh', 'windows-1250', 'iso-8859-2', 'windows-1251',
  'koi8-r', 'windows-1253', 'windows-1254', 'windows-1255', 'windows-1256', 'windows-874', 'shift_jis', 'euc-jp',
  'gb18030', 'big5', 'euc-kr', 'utf-16le', 'utf-16be', 'utf-8',
];
const keyOf = (v) => 'convert.enc.' + v.replace(/-/g, '_');
/** [value, label] pairs; the label (index 1) is read when it is shown, so it follows the language. */
export const ENCODINGS = ENC.map((v) => {
  const pair = [v];
  Object.defineProperty(pair, 1, { enumerable: true, get: () => tr(keyOf(v)) });
  return pair;
});

export function sniffEncoding(b) {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return 'utf-8';
  if (b[0] === 0xff && b[1] === 0xfe) return 'utf-16le';
  if (b[0] === 0xfe && b[1] === 0xff) return 'utf-16be';
  const n = Math.min(b.length, 4096);
  let evenZero = 0, oddZero = 0;
  for (let i = 0; i < n; i++) if (b[i] === 0) (i % 2 ? oddZero++ : evenZero++);
  if (n >= 4 && oddZero > n / 8 && evenZero === 0) return 'utf-16le';
  if (n >= 4 && evenZero > n / 8 && oddZero === 0) return 'utf-16be';
  try { new TextDecoder('utf-8', { fatal: true }).decode(b); return 'utf-8'; } catch (e) { return 'windows-1252'; }
}

export function toUtf8(bytes, { from = 'auto', bom = false } = {}) {
  const enc = !from || from === 'auto' ? sniffEncoding(bytes) : String(from).toLowerCase();
  let dec;
  try { dec = new TextDecoder(enc); } catch (e) { throw new Error(tr('convert.enc.cannot_read', { name: encodingLabel(enc) })); }
  let text = dec.decode(bytes);   // the decoder drops a byte-order mark of its own encoding
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text: (bom ? '\uFEFF' : '') + text, from: enc };
}

export const encodingLabel = (v) => (ENC.includes(v) ? tr(keyOf(v)) : v);
