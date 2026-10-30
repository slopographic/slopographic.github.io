#!/usr/bin/env node
// The leak scan: every file name and every file of a white-label build, searched for words the build must not carry
// (the source brand's stem and every other profile's brand terms; case-insensitive). Text files are read line by line;
// other files (images, fonts, archives) are searched as bytes, in ASCII and UTF-16, and so are the contents of a WOFF2
// font or a zip (unpack.mjs: a font's name table is compressed in the file). English words that contain the stem
// (rename.mjs KEEP: slope, sloppy...) are allowed. An allowlist names vendor files that cannot change; each entry is
// reported, never silently skipped.
//   node tools/whitelabel/scan.mjs <dir> <term> [<term>...] [--allow=<file>:<term>]   exit 1 when something is found
// Node only. Tests: tests/node/whitelabel-scan.test.mjs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { unpack } from './unpack.mjs';
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

/** True when the bytes look like text: no NUL byte in the first 8 KB (git's rule). */
export const isText = (buf) => !buf.subarray(0, 8192).includes(0);

/** The matches of the terms in one string: [{ term, index, word }]. A stem match inside a KEEP word is skipped, and so is
 * the build's own GitHub account (opts.account) where it is part of a GitHub or jsDelivr address or an owner/repo name. */
const ACCOUNT_URL = /(?:github\\?\.com|githubusercontent\\?\.com|jsdelivr\\?\.net\\?\/gh|github:)\\?\/$/i;   // also inside a regular expression
export function findTerms(s, terms, opts = {}) {
  const out = [];
  const lower = s.replace(/[A-Z]+/g, (c) => c.toLowerCase());   // ASCII only: the same length, so indices match s
  for (const t of terms) {
    let i = -1;
    while ((i = lower.indexOf(t, i + 1)) >= 0) {
      let a = i, b = i + t.length;              // the word: letters to the left, lower-case letters to the right (slopeX)
      const m = s.slice(i, i + t.length), head = m === m.toUpperCase() ? /[A-Z]/ : m[0] === m[0].toUpperCase() ? null : /[a-z]/;
      while (head && a > 0 && head.test(s[a - 1])) a--;
      const tail = s.slice(i, i + t.length) === s.slice(i, i + t.length).toUpperCase() ? /[A-Z]/ : /[a-z]/;
      while (b < s.length && tail.test(s[b])) b++;
      const word = s.slice(a, b);
      if (SCAN_KEEP.includes(word.toLowerCase())) continue;
      if (opts.account && t === opts.account && (ACCOUNT_URL.test(s.slice(Math.max(0, i - 30), i)) || /^(\.github\.io|\\?\/[\w.-]|@users\.noreply\.github\.com)/i.test(s.slice(i + t.length)))) continue;
      out.push({ term: t, index: i, word });
    }
  }
  return out;
}

/** Scans dir. allow: [{ file, term, why }] (exact paths). Returns { found: [{ file, line, term, word, text }], allowed: [...] }
 * (word: the whole word the term was found in). */
export function scan(dir, terms, allow = [], opts = {}) {
  const found = [], allowed = [];
  const isAllowed = (file, term) => allow.find((a) => a.file === file && (!a.term || a.term === term));
  const add = (hit) => { const a = isAllowed(hit.file, hit.term); (a ? allowed : found).push(a ? Object.assign({ why: a.why }, hit) : hit); };
  for (const file of listFiles(dir)) {
    for (const m of findTerms(file, terms, opts)) add({ file, line: 0, term: m.term, text: `(file name) ${file}` });
    const full = path.join(dir, file);
    if (statSync(full).size > 64 * 1024 * 1024) continue;
    const buf = readFileSync(full);
    if (isText(buf)) {
      const lines = buf.toString('utf8').split('\n');
      lines.forEach((ln, i) => { for (const m of findTerms(ln, terms, opts)) add({ file, line: i + 1, term: m.term, word: m.word, text: ln.slice(Math.max(0, m.index - 40), m.index + 60).trim() }); });
    } else {
      // ASCII, and UTF-16 at both byte alignments, of the file and of what it holds compressed
      for (const part of [{ label: 'bytes', data: buf }, ...unpack(file, buf)]) {
        const b = part.data;
        for (const s of [b.toString('latin1'), b.toString('utf16le'), b.subarray(1).toString('utf16le')]) {
          for (const m of findTerms(s, terms, opts)) add({ file, line: -1, term: m.term, word: m.word, text: `(${part.label}) ${s.slice(Math.max(0, m.index - 20), m.index + 30).replace(/[^\x20-\x7e]/g, '.')}` });
        }
      }
    }
  }
  return { found, allowed };
}

/** A short report: one line per hit, grouped by file, at most `max` lines. */
export function report({ found, allowed }, max = 200) {
  const lines = found.slice(0, max).map((h) => `  ${h.file}${h.line > 0 ? ':' + h.line : ''}  [${h.term}]  ${h.text}`);
  if (found.length > max) lines.push(`  ... and ${found.length - max} more`);
  for (const a of allowed) lines.push(`  allowed: ${a.file} [${a.term}] ${a.why}`);
  return `${found.length} leftover match(es) in ${new Set(found.map((h) => h.file)).size} file(s)` + (lines.length ? '\n' + lines.join('\n') : '');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2), [dir, ...terms] = args.filter((a) => !a.startsWith('--'));
  if (!dir || !terms.length) { console.error('usage: scan.mjs <dir> <term> [<term>...] [--allow=<file>:<term>]...'); process.exit(2); }
  const allow = args.filter((a) => a.startsWith('--allow=')).map((a) => { const [file, term] = a.slice(8).split(':'); return { file, term, why: 'allowed on the command line' }; });
  const res = scan(dir, terms.map((t) => t.toLowerCase()), allow);
  console.log(report(res));
  process.exit(res.found.length ? 1 : 0);
}
