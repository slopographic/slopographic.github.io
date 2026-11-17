// Rule 7 of tools/check-rules.mjs: a script whose translator is called t (const t = SlopI18n.t, const t = (k) => ...t(k),
// var t = U.t, function t(key) ...) must not name anything else t: a parameter ((t) => t.x), a loop variable
// (for (const t of list)), a catch binding or another let/const/var t hides the translator in that scope, and t('key')
// there calls the wrong thing (or throws). It is a heuristic on the text with comments, strings and regular expressions
// blanked, and per file rather than per scope: rename the other binding (tab, item, tool, ...).
// Pure functions; no file system.

/** The source with comments, string and template literals and regular expressions replaced by spaces (newlines kept). */
export function blank(src) {
  let out = '', i = 0, last = '';
  const n = src.length;
  const keep = (s) => s.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { let j = i; while (j < n && src[j] !== '\n') j++; out += keep(src.slice(i, j)); i = j; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const j = e < 0 ? n : e + 2; out += keep(src.slice(i, j)); i = j; continue; }
    if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]|^$|return$|typeof$/.test(last)) {   // a regular expression literal
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n') { const ch = src[j]; if (ch === '\\') { j += 2; continue; } if (ch === '[') cls = true; else if (ch === ']') cls = false; else if (ch === '/' && !cls) break; j++; }
      j++; while (/[a-z]/.test(src[j] || '')) j++;
      out += keep(src.slice(i, j)); i = j; last = 'x'; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1, depth = 0;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (c === '`' && ch === '$' && src[j + 1] === '{') depth++;
        else if (depth && ch === '}') depth--;
        else if (!depth && ch === c) break;
        else if (ch === '\n' && c !== '`') break;
        j++;
      }
      out += c + keep(src.slice(i + 1, j)) + c; i = j + 1; last = 'x'; continue;
    }
    if (/[\w$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; last = src.slice(i, j); out += last; i = j; continue; }
    if (!/\s/.test(c)) last = c;
    out += c; i++;
  }
  return out;
}

// A translator binding: t is a function of a key that calls a translator ((k, v) => SlopI18n.t(k, v), (k) => U.t(k)),
// SlopI18n.t itself, or, in a file that asks for keys (t('pdf.menu.open')), another module's translator (S.t, U.t,
// SS.util.t), function t(key) or an imported t (import { t } from './i18n.js'). A file that never asks t for a key has no
// translator called t (TL.t(x) is a time). The binding may be a later declarator: const D = x, t = (k, v) => D.t(k, v).
const TRANSLATOR = /(?:\b(?:const|let|var)\s+|,\s*)t\s*=(?![=>])\s*([^;\n]*)|\bfunction\s+t\s*\(\s*(k|key|id|s|str|name)\b|\bimport\s*\{[^}]*?\bt\b(?!\s*as)[^}]*\}\s*from()/g;
const CALLS_T = /^\([^()]*\)\s*=>[^;\n]*(?:\bSlopI18n\b|\bSlopIn\b|\.t\(\s*k\b)|^[\w$.]*\bSlopI18n\.t\s*(?:[,;]|$)/;
const MEMBER_T = /^[\w$]+(?:\.[\w$]+)*\.t\s*(?:[,;]|$)/;
const ASKS = /(?:^|[^\w$.])t\(\s*['"`][\w-]+\.[\w.-]+['"`]/;
const lineOf = (s, at) => s.slice(0, at).split('\n').length;

/** The problems in one script's text: [{ line, why }]. Empty when the file has no translator called t. */
export function shadowProblems(src) {
  const code = blank(src), asks = ASKS.test(src);
  const ok = new Set();   // where the translator bindings are (other translator bindings in other scopes are fine)
  for (const m of code.matchAll(TRANSLATOR)) {
    const expr = (m[1] || '').trim();
    if (m[2] || m[3] != null ? asks : CALLS_T.test(expr) || (asks && MEMBER_T.test(expr))) ok.add(m.index);
  }
  if (!ok.size) return [];
  const out = [];
  const add = (at, what) => out.push({ line: lineOf(code, at), why: what === 'an assignment' ? 'an assignment to t replaces the translator t; use another name' : `${what} named t hides the translator t; rename it` });
  for (const m of code.matchAll(/\b(?:const|let|var)\s+t\b/g)) if (!ok.has(m.index)) add(m.index, /^\s*(?:of|in)\b/.test(code.slice(m.index + m[0].length)) ? 'a loop variable' : 'a variable');
  for (const m of code.matchAll(/,\s*t\s*=(?![=>])/g)) if (!ok.has(m.index)) add(m.index, 'a variable');   // const e = x, t = y
  for (const m of code.matchAll(/(?<![\w$.])t\s*=(?![=>])/g)) {   // t = setTimeout(...): the translator replaced
    if (!/(?:\b(?:const|let|var)|[,(])\s*$/.test(code.slice(Math.max(0, m.index - 12), m.index))) add(m.index, 'an assignment');
  }
  for (const m of code.matchAll(/\b(?:const|let|var)\s*[[{]([^=;]*?)[\]}]\s*(?:=|of\b|in\b)/g)) if (hasName(m[1], true)) add(m.index, 'a destructured variable');
  for (const m of code.matchAll(/\bfunction\s+t\s*\(/g)) if (!ok.has(m.index)) add(m.index, 'a function');
  for (const m of code.matchAll(/\bcatch\s*\(\s*t\s*\)/g)) add(m.index, 'a catch binding');
  for (const m of code.matchAll(/(?:^|[^\w$.])t\s*=>/g)) add(m.index + m[0].indexOf('t'), 'a parameter');
  for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) if (hasName(m[1])) add(m.index, 'a parameter');
  for (const m of code.matchAll(/\bfunction\b\s*[\w$]*\s*\(([^()]*)\)/g)) if (hasName(m[1])) add(m.index, 'a parameter');
  for (const m of code.matchAll(/(?:^|[\n;{},])\s*(?:async\s+|static\s+|get\s+|set\s+)*([\w$]+)\s*\(([^()]*)\)\s*\{/g)) {
    if (!/^(if|for|while|switch|catch|with|function|return)$/.test(m[1]) && hasName(m[2])) add(m.index, 'a parameter');
  }
  return out.sort((a, b) => a.line - b.line).filter((p, i, a) => !i || a[i - 1].line !== p.line || a[i - 1].why !== p.why);
}

/** True when a parameter list (or a destructuring pattern) binds the name t. */
function hasName(list, pattern = false) {
  for (const raw of list.split(',')) {
    let p = raw.trim().replace(/^\.\.\./, '').split('=')[0].trim();
    if (pattern && p.includes(':')) p = p.split(':')[1].trim();   // { key: t } binds t; { t: x } binds x
    if (p === 't' || /^[[{]\s*t\s*$/.test(p) || /^t\s*[\]}]$/.test(p)) return true;
  }
  return false;
}
