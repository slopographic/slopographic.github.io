#!/usr/bin/env node
// Browser compatibility check: our scripts may only use what the support target has (tools/compat/features.mjs, the one
// list: Safari 16.4 and its MDN/caniuse versions). It reads every script (and the inline scripts of every page) with
// comments and string contents blanked, so a word in a comment or a message never counts, and flags each use of a
// feature newer than the target. A use that is feature-detected passes with a "compat-ok: <why or the fallback>" comment
// on its line or the line above (a feature with a guard pattern, such as requestIdleCallback, also passes on a line that
// tests for it). Vendored and minified code, tests and the Node tools are not checked: vendor/pdfjs is the legacy build
// with core-js polyfills, and its one gap (async iteration of streams) is filled by shared/compat/stream.js.
//   node tools/compat-check.mjs            every tracked file
//   node tools/compat-check.mjs a.js b.js  the files named
// Also rule 6 of tools/check-rules.mjs (pre-commit, pre-push and CI).
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flagged, TARGET } from './compat/features.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = /^vendor\/|(^|\/)node_modules\/|\.min\.(js|mjs)$|^sw-precache(-\d+)?\.js$|^tests\/|^tools\/|\.test\.mjs$|^\.github\//;
/** Files the check reads: our browser scripts and pages. */
export const inScope = (f) => /\.(m?js|html)$/.test(f) && !SKIP.test(f);

const REGEX_BEFORE = /[(,=:[!&|?{};+\-*%<>~^]$/;
const REGEX_WORDS = /\b(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/;
/** The code with comments and the contents of strings and template text replaced by spaces (newlines kept, so lines
 * still match), regular-expression literals kept as they are. A light tokenizer: enough for our own scripts. */
export function blank(src) {
  let out = '', i = 0, last = '';
  const n = src.length, sp = (s) => s.replace(/[^\n]/g, ' ');
  const tpl = [];   // the brace depth of each open ${ … } in a template literal
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); const j = e < 0 ? n : e; out += sp(src.slice(i, j)); i = j; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const j = e < 0 ? n : e + 2; out += sp(src.slice(i, j)); i = j; continue; }
    if (c === '"' || c === "'" || (c === '`') || (c === '}' && tpl.length && tpl[tpl.length - 1] === 0)) {
      const q = c === '}' ? '`' : c; if (c === '}') tpl.pop();
      let j = i + 1;
      while (j < n && src[j] !== q) {
        if (src[j] === '\\') j++;
        else if (q === '`' && src[j] === '$' && src[j + 1] === '{') break;
        else if (q !== '`' && src[j] === '\n') break;
        j++;
      }
      if (q === '`' && src[j] === '$') { out += c + sp(src.slice(i + 1, j)) + '${'; tpl.push(0); i = j + 2; last = '{'; continue; }
      out += c + sp(src.slice(i + 1, j)) + (j < n ? src[j] : ''); i = j + 1; last = q; continue;
    }
    if (c === '/' && (last === '' || REGEX_BEFORE.test(last) || REGEX_WORDS.test(out.slice(-12).trimEnd()))) {
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n' && (cls || src[j] !== '/')) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      while (j + 1 < n && /[a-z]/i.test(src[j + 1])) j++;
      out += src.slice(i, j + 1); i = j + 1; last = 'a'; continue;
    }
    if (tpl.length) { if (c === '{') tpl[tpl.length - 1]++; else if (c === '}') tpl[tpl.length - 1]--; }
    out += c; if (!/\s/.test(c)) last = c; i++;
  }
  return out;
}

/** The inline scripts of a page, at their own lines (everything else blank). */
export function scriptsOf(html) {
  let out = '', at = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const body = /\bsrc=|type=["'](?!module|text\/javascript)/i.test(m[1]) ? '' : m[2];
    const start = m.index + m[0].indexOf('>') + 1;
    out += html.slice(at, start).replace(/[^\n]/g, ' ') + (body || m[2].replace(/[^\n]/g, ' '));
    at = start + m[2].length;
  }
  return out + html.slice(at).replace(/[^\n]/g, ' ');
}

/** The problems in one file's text: [{ line, id, what, fallback, safari }]. */
export function compatProblems(file, text, features = flagged()) {
  const raw = (file.endsWith('.html') ? scriptsOf(text) : text);
  const code = blank(raw).split('\n'), lines = raw.split('\n'), out = [];
  code.forEach((line, i) => {
    for (const f of features) {
      if (!f.re.test(line)) continue;
      if (f.guard && f.guard.test(line)) continue;
      if (/compat-ok:/.test(lines[i]) || (i > 0 && /compat-ok:/.test(lines[i - 1]))) continue;
      out.push({ line: i + 1, id: f.id, what: f.what, fallback: f.fallback, safari: f.safari });
    }
  });
  return out;
}
/** One problem as a message line. */
export const message = (file, p) => `${file}:${p.line}: ${p.what} needs ${p.safari ? 'Safari ' + p.safari : 'a browser Safari is not yet'} (the target is Safari ${TARGET.safari}). Use ${p.fallback}, or feature-detect it and say so with a "compat-ok:" comment.`;

function main(argv) {
  const files = (argv.length ? argv : execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n')).filter((f) => f && inScope(f));
  let count = 0;
  for (const f of files) {
    const p = path.join(ROOT, f);
    if (!existsSync(p)) continue;
    for (const x of compatProblems(f, readFileSync(p, 'utf8'))) { console.error(message(f, x)); count++; }
  }
  console.log(`compat-check: ${files.length} files, ${count} problem${count === 1 ? '' : 's'} (target Safari ${TARGET.safari})`);
  return count ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
