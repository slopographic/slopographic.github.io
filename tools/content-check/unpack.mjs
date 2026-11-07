// How the content checks read a file's bytes: text or binary (git's rule), the three readings of a binary, and what a
// file holds that its bytes do not show: a WOFF2 font's tables (Brotli: a name table is unreadable in the file itself),
// a zip's members (inflated, and unpacked again when a member is a font, a zip or a PDF), a PNG's compressed text chunks
// (zTXt, iTXt) and a PDF's text (pdf.mjs: every page, the document information and metadata). A PDF that cannot be read
// (a user password, a broken file) is a part marked unreadable, which the checks report as found. The white-label leak
// scan (tools/whitelabel/scan.mjs) and the repository content check (check.mjs) both read files through this module.
// Node only. Tests: tests/node/content-check-unpack.test.mjs, tests/node/whitelabel-scan.test.mjs, tests/node/whitelabel-font.test.mjs.
import { inflateSync } from 'node:zlib';
import { woff2Tables } from '../fonts/woff2.mjs';
import { zipMembers } from '../fonts/zip.mjs';
import { pdfTexts } from './pdf.mjs';

/** True when the bytes look like text: no NUL byte in the first 8 KB (git's rule). */
export const isText = (buf) => !buf.subarray(0, 8192).includes(0);

/** A binary's bytes as strings: Latin-1 (every byte one character, so ASCII words read as they are), and UTF-16 at both
 * byte alignments (a word stored as UTF-16 starts at an even or an odd offset). */
export const views = (b) => [b.toString('latin1'), b.toString('utf16le'), b.subarray(1).toString('utf16le')];

/** The strings to search in one part unpack() gives: its text, or its bytes' three readings (none when unreadable). */
export const readings = (part) => (part.text !== undefined ? [part.text] : part.data ? views(part.data) : []);

/** True for a PDF: by its name, or by its header at the start. */
export const isPdf = (file, buf) => /\.pdf$/i.test(file) || buf.toString('latin1', 0, 5) === '%PDF-';

/** A PNG's compressed text chunks, inflated: [{ label, data }] (tEXt and an uncompressed iTXt are plain in the bytes). */
export function pngTexts(buf) {
  const out = [];
  for (let at = 8; at + 12 <= buf.length;) {
    const len = buf.readUInt32BE(at), type = buf.toString('latin1', at + 4, at + 8), body = buf.subarray(at + 8, at + 8 + len);
    const key = body.indexOf(0);
    if (type === 'zTXt' && key >= 0) out.push({ label: 'PNG zTXt', data: inflateSync(body.subarray(key + 2)) });
    if (type === 'iTXt' && key >= 0 && body[key + 1] === 1) {   // keyword, flag, method, language, translated keyword, text
      const lang = body.indexOf(0, key + 3), translated = lang < 0 ? -1 : body.indexOf(0, lang + 1);
      if (translated >= 0) out.push({ label: 'PNG iTXt', text: inflateSync(body.subarray(translated + 1)).toString('utf8') });
    }
    if (type === 'IEND') break;
    at += 12 + len;
  }
  return out;
}

/** [{ label, data } | { label, text } | { label, unreadable }]: what a file holds besides its own bytes (empty for a
 * file that holds nothing more). file: its name, when known (the format is also told by the first bytes). */
export function unpack(file, buf, depth = 0) {
  if (depth > 2) return [];
  const head = buf.length >= 4 ? buf.readUInt32BE(0) : 0;
  try {
    if (/\.woff2$/i.test(file) || head === 0x774f4632) {   // wOF2
      return Object.entries(woff2Tables(buf)).map(([tag, data]) => ({ label: `table ${tag}`, data }));
    }
    if (/\.zip$/i.test(file) || head === 0x504b0304) {     // PK\3\4
      return zipMembers(buf).flatMap((m) => [{ label: m.name, data: m.data }, ...unpack(m.name, m.data, depth + 1).map((x) => Object.assign({}, x, { label: `${m.name}: ${x.label}` }))]);
    }
    if (head === 0x89504e47) return pngTexts(buf);        // \x89PNG
  } catch (e) {
    return [{ label: `(could not unpack: ${e.message})`, data: Buffer.alloc(0) }];
  }
  if (isPdf(file, buf)) {
    const r = pdfTexts(buf);
    return r.error ? [{ label: 'PDF', unreadable: `unreadable PDF: ${r.error}` }] : r.texts.map((t) => ({ label: `PDF ${t.label}`, text: t.text }));
  }
  return [];
}
