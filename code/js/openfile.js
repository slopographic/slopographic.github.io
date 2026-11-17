/* Slop Code: reading and writing a Slop Drive file whatever it is. The first bytes decide: text in any encoding (a byte order mark,
 * UTF-16 without one, UTF-8, or a guess among the old national ones) opens in the editor with its encoding and line endings
 * remembered, and is written back the same way. Anything else, and a text file too big for the editor, opens as bytes in a read-only
 * hex view with what the first bytes say it is. Nothing here changes a file the person did not save. */
import { sniff, decode, encode, detectEol, normalizeEol, applyEol, ENCODINGS } from './encoding.js';
import { identify } from './magic.js';

/** A text file bigger than this opens as bytes (read only) instead of in the editor. */
export const MAX_TEXT = 8 * 1024 * 1024;
const NONTEXT = new Set(['image', 'audio', 'video', 'archive', 'executable', 'database', 'font', '3d']);

/** What a file is, from its first 64 KB: { text: true, encoding, bom, ascii, confidence, info } or { text: false, info, large? }.
 * `info` is what the signatures say ({ id, label, mime, category }) or null. */
export async function inspect(blob, name) {
  const head = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
  const info = identify(head, name);
  const s = sniff(head);
  // a guess at an old encoding is not trusted over a signature that says picture, archive, program...
  if (!s.text || (s.confidence === 'guess' && info && NONTEXT.has(info.category))) return { text: false, info };
  if (blob.size > MAX_TEXT) return { text: false, info, large: true };
  return { text: true, encoding: s.encoding, bom: s.bom, ascii: s.ascii, confidence: s.confidence, info };
}

/** The line ending a file mostly uses ('lf' when it has none). */
export function dominantEol(raw) {
  const e = detectEol(raw);
  if (e.eol === 'none') return 'lf';
  if (e.eol !== 'mixed') return e.eol;
  return e.crlf >= e.lf && e.crlf >= e.cr ? 'crlf' : e.lf >= e.cr ? 'lf' : 'cr';
}

/** The whole file as text in `encoding`: { text, eol }. Every line break in `text` is \n (that is what the editor holds); `eol` is
 * the line ending to write back. Bytes that do not fit the encoding show as U+FFFD (the file is not changed until saved). */
export async function readAs(blob, encoding, bom) {
  const raw = decode(new Uint8Array(await blob.arrayBuffer()), encoding, { bom });
  return { text: normalizeEol(raw), eol: dominantEol(raw) };
}

/** The bytes to write for a document's text: its line ending and encoding put back. `fell` is true when the encoding cannot hold the
 * text (it falls back to UTF-8, and the caller says so). */
export function bytesFor(doc, text) {
  const body = applyEol(text, doc.eol || 'lf');
  const out = encode(body, doc.encoding || 'utf-8', { bom: !!doc.bom });
  if (out) return { bytes: out, fell: false };
  return { bytes: encode(body, 'utf-8', { bom: false }), fell: true };
}

/** The name a person reads for an encoding id ('UTF-8', 'Windows-1252 (Western)'...). */
export const encodingLabel = (id) => (ENCODINGS.find((e) => e.id === id) || { label: String(id || 'UTF-8') }).label;
