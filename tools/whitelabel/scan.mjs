#!/usr/bin/env node
// The leak scan: every file name and every file of a white-label build, searched for words the build must not carry
// (the source brand's stem and every other profile's brand terms; case-insensitive). Text files are read line by line,
// and also through the views of tools/content-check/spelled.mjs (a word spelled so a plain search misses it: joined
// quoted pieces, escapes, entities, character codes), reported as "(spelled)"; other files (images, fonts, archives) are
// searched as bytes, in ASCII and UTF-16, and so is what a file holds besides its bytes (tools/content-check/unpack.mjs:
// a WOFF2 font's tables, a zip's members, a PNG's compressed text, a PDF's text; a PDF that cannot be read is found,
// unless an allow entry names its exact bytes). English words that
// contain the stem (SCAN_KEEP: slope, sloped...) are allowed; the word rule is tools/content-check/words.mjs, which the
// mirrors' own content check uses too. An allowlist names vendor files that cannot change, each with the SHA-256 of its
// exact bytes: an entry allows nothing in a file with other bytes, or without its hash. Each allowed hit is reported,
// never silently skipped.
//   node tools/whitelabel/scan.mjs <dir> <term> [<term>...] [--allow=<file>:<term>:<sha256>]   exit 1 when something is found
// Node only. Tests: tests/node/whitelabel-scan.test.mjs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { unpack, isText, readings } from '../content-check/unpack.mjs';
import { spelledMatches } from '../content-check/spelled.mjs';
import { findWords } from '../content-check/words.mjs';

export { isText };

/** Words the scan allows: the slope family only (technical vocabulary: SVG's slope attribute, OpenType's caretSlopeRise,
 * the spreadsheet SLOPE function, LeakyReLU's negative_slope). Any other word with the stem fails, sloppy included. */
export const SCAN_KEEP = ['slope', 'slopes', 'sloped', 'sloping'];

/** Every file below dir, as posix paths relative to it (the .git folder left out). */
export function listFiles(dir, rel = '') {
  const out = [];
  for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (e.name === '.git' && !rel) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, r)); else out.push(r);
  }
  return out;
}

/** The matches of the terms in one string: [{ term, index, word }] (findWords with SCAN_KEEP). The build's own GitHub
 * account (opts.account) is skipped where it is part of a GitHub or jsDelivr address or an owner/repo name. */
const ACCOUNT_URL = /(?:github\\?\.com|githubusercontent\\?\.com|jsdelivr\\?\.net\\?\/gh|github:)\\?\/$/i;   // also inside a regular expression
const ACCOUNT_AFTER = /^(\.github\.io|\\?\/[\w.-]|@users\.noreply\.github\.com)/i;
export function findTerms(s, terms, opts = {}) {
  const own = (m) => m.term === opts.account && (ACCOUNT_URL.test(s.slice(Math.max(0, m.index - 30), m.index)) || ACCOUNT_AFTER.test(s.slice(m.index + m.term.length)));
  const out = findWords(s, terms, SCAN_KEEP);
  return opts.account ? out.filter((m) => !own(m)) : out;
}

/** Scans dir. allow: [{ file, term, why, sha256 }] (exact paths; sha256: the hex SHA-256 of the bytes the entry allows).
 * Returns { found: [{ file, line, term, word, text, note? }], allowed: [...] } (word: the whole word the term was found in;
 * note: why an allow entry for the file did not apply). */
export function scan(dir, terms, allow = [], opts = {}) {
  const found = [], allowed = [], hashes = new Map();
  const hash = (file) => { if (!hashes.has(file)) hashes.set(file, createHash('sha256').update(readFileSync(path.join(dir, file))).digest('hex')); return hashes.get(file); };
  const add = (hit) => {
    const entries = allow.filter((a) => a.file === hit.file && (!a.term || a.term === hit.term));
    const a = entries.find((e) => e.sha256 && String(e.sha256).toLowerCase() === hash(hit.file));
    if (a) allowed.push(Object.assign({ why: a.why }, hit));
    else if (!entries.length) found.push(hit);
    else found.push(Object.assign({ note: entries.some((e) => e.sha256) ? 'the allowed file changed: its SHA-256 is not the allow entry\'s' : 'its allow entry has no sha256' }, hit));
  };
  for (const file of listFiles(dir)) {
    for (const m of findTerms(file, terms, opts)) add({ file, line: 0, term: m.term, text: `(file name) ${file}` });
    const full = path.join(dir, file);
    if (statSync(full).size > 64 * 1024 * 1024) continue;
    const buf = readFileSync(full), find = (s) => findTerms(s, terms, opts);
    let parts = unpack(file, buf);
    if (isText(buf)) {
      const text = buf.toString('utf8'), lines = text.split('\n');
      lines.forEach((ln, i) => { for (const m of find(ln)) add({ file, line: i + 1, term: m.term, word: m.word, text: ln.slice(Math.max(0, m.index - 40), m.index + 60).trim() }); });
      for (const m of spelledMatches(text, find)) {
        add({ file, line: text.slice(0, m.index).split('\n').length, term: m.term, word: m.word, text: `(spelled) ${text.slice(m.index, m.index + 60).replace(/\s+/g, ' ').trim()}` });
      }
    } else {
      parts = [{ label: 'bytes', data: buf }].concat(parts);   // ASCII, and UTF-16 at both byte alignments
    }
    for (const part of parts) {                                 // and what the file holds besides its bytes
      if (part.unreadable) { add({ file, line: -1, term: '(unreadable)', text: `(${part.unreadable})` }); continue; }
      for (const s of readings(part)) {
        for (const m of find(s)) add({ file, line: -1, term: m.term, word: m.word, text: `(${part.label}) ${s.slice(Math.max(0, m.index - 20), m.index + 30).replace(/[^\x20-\x7e]/g, '.')}` });
      }
    }
  }
  return { found, allowed };
}

/** A short report: one line per hit, grouped by file, at most `max` lines. */
export function report({ found, allowed }, max = 200) {
  const lines = found.slice(0, max).map((h) => `  ${h.file}${h.line > 0 ? ':' + h.line : ''}  [${h.term}]  ${h.text}${h.note ? `  (${h.note})` : ''}`);
  if (found.length > max) lines.push(`  ... and ${found.length - max} more`);
  for (const a of allowed) lines.push(`  allowed: ${a.file} [${a.term}] ${a.why}`);
  return `${found.length} leftover match(es) in ${new Set(found.map((h) => h.file)).size} file(s)` + (lines.length ? '\n' + lines.join('\n') : '');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2), [dir, ...terms] = args.filter((a) => !a.startsWith('--'));
  if (!dir || !terms.length) { console.error('usage: scan.mjs <dir> <term> [<term>...] [--allow=<file>:<term>:<sha256>]...'); process.exit(2); }
  const allow = args.filter((a) => a.startsWith('--allow=')).map((a) => { const [file, term, sha256] = a.slice(8).split(':'); return { file, term, sha256, why: 'allowed on the command line' }; });
  const res = scan(dir, terms.map((t) => t.toLowerCase()), allow);
  console.log(report(res));
  process.exit(res.found.length ? 1 : 0);
}
