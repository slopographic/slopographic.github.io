/* SIE files: the line reader and the checksum. Pure, ES module. Follows "SIE filformat, utgåva 4C" (SIE-Gruppen,
 * 2025-08-06; the file format itself is unchanged since 4B, 2008):
 *  - one record per line, starting with a label (#VER); fields are separated by one or more spaces or tabs (5.7);
 *  - a field may be quoted ("..."); a quote inside a field is written \" (5.7); "" is an empty field (12);
 *  - an object list is written in braces on the same line: {1 "0123" 6 "P1"}, {} or { } (8.21);
 *  - the transaction lines of a #VER are inside { and }, each brace alone on its own line (5.4);
 *  - blank lines are ignored (5.6); unknown labels are ignored by the reader (7.1).
 *   tokens(line)          -> [{ t: 'f', v }|{ t: 'list', v: [..] }|{ t: 'open' }], quoted fields keep q: true
 *   records(text)         -> [{ label, fields, line, sub? }] with a #VER's lines in sub (a block may also follow a
 *                            line that ends with a lone "{", and "}" may close it on the last transaction's line)
 *   crc32(bytes, crc?)    -> the CRC-32 the SIE checksum uses (polynomial EDB88320, start FFFFFFFF, inverted at the end)
 *   checksum(recs)        -> { present, expected, actual, ok } for #KSUMMA (chapter 10): the labels and the field texts of
 *                            every record between the two #KSUMMA, in code page 437, without spaces, quotes or braces. */
import { toCp437 } from './text.js';

/** The fields of one line. Text outside quotes is split at spaces and tabs; braces make an object list. */
export function tokens(line) {
  const out = [];
  let i = 0, list = null;
  const n = line.length;
  const push = (tok) => (list ? list.push(tok) : out.push(tok));
  while (i < n) {
    const c = line[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '"') {
      let v = '';
      i++;
      while (i < n && line[i] !== '"') {
        if (line[i] === '\\' && (line[i + 1] === '"' || line[i + 1] === '\\')) { v += line[i + 1]; i += 2; continue; }
        v += line[i++];
      }
      i++;   // the closing quote (a missing one ends the field at the end of the line)
      push({ t: 'f', v, q: true });
      continue;
    }
    if (c === '{') { if (list) { i++; continue; } list = []; i++; continue; }
    if (c === '}') { if (list) { out.push({ t: 'list', v: list.map((x) => x.v) }); list = null; } else out.push({ t: 'close' }); i++; continue; }
    let v = '';
    while (i < n && !/[\s"{}]/.test(line[i])) v += line[i++];
    push({ t: 'f', v });
  }
  if (list) out.push(list.length ? { t: 'list', v: list.map((x) => x.v) } : { t: 'open' });   // "{" left open: a block starts
  return out;
}

/** The records of a file, with each #VER's transaction lines in sub. */
export function records(text) {
  const lines = String(text).split(/\r?\n|\r/);
  const out = [];
  let owner = null, block = false, pending = null;
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    if (line === '{') { if (pending) { owner = pending; owner.sub = owner.sub || []; block = true; } pending = null; return; }
    if (line === '}') { block = false; owner = null; return; }
    let toks = tokens(line);
    let closes = false;
    if (toks.length && toks[toks.length - 1].t === 'close') { toks = toks.slice(0, -1); closes = true; }
    let opens = false;
    if (toks.length && toks[toks.length - 1].t === 'open') { toks = toks.slice(0, -1); opens = true; }
    const head = toks[0];
    if (!head || head.t !== 'f' || !head.v.startsWith('#')) return;   // not a record: ignored
    const rec = { label: head.v.toUpperCase(), fields: toks.slice(1), line: idx + 1, toks };
    if (block && owner && rec.label !== '#VER') owner.sub.push(rec);
    else { out.push(rec); block = false; owner = null; }
    pending = rec.label === '#VER' ? rec : null;
    if (opens && rec.label === '#VER') { rec.sub = []; owner = rec; block = true; pending = null; }
    if (closes) { block = false; owner = null; }
  });
  return out;
}

let TABLE = null;
/** CRC-32 of bytes, continued from crc (the running value before the final inversion). */
export function crc32(bytes, crc = 0xffffffff) {
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; TABLE[i] = c >>> 0; }
  }
  let c = crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = (TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return c >>> 0;
}

/** The #KSUMMA check: present when the file starts a checksum; ok when the closing #KSUMMA holds the same number. */
export function checksum(recs) {
  const start = recs.findIndex((r) => r.label === '#KSUMMA' && !r.fields.length);
  if (start < 0) return { present: false };
  const endAt = recs.findIndex((r, i) => i > start && r.label === '#KSUMMA' && r.fields.length);
  if (endAt < 0) return { present: true, expected: null, actual: null, ok: false };
  let crc = 0xffffffff;
  const feed = (s) => { if (s) crc = crc32(toCp437(s), crc); };
  const each = (r) => {
    for (const tk of r.toks) { if (tk.t === 'f') feed(tk.v); else if (tk.t === 'list') tk.v.forEach(feed); }
    (r.sub || []).forEach(each);
  };
  for (let i = start + 1; i < endAt; i++) each(recs[i]);
  const actual = (crc ^ 0xffffffff) >>> 0;
  const expected = Number(recs[endAt].fields[0].v);
  return { present: true, expected, actual, ok: expected === actual || expected === (actual | 0) };   // some writers print it signed
}
