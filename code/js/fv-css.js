/* Slop Code, Formatted view: CSS, SCSS and Less. One declaration per line, `selector {` ... `}`, nested rules indented.
 * Strings, comments, url(...) and #{...} interpolations are copied as written, so a ';' or '{' inside them never splits.
 * Minified input works. Nothing here can fail: odd input is printed as well as it can be read. */
import { pad } from './fv-util.js';

/** The offset after the string that starts at `i`. An unescaped line break ends it too (CSS strings are one line). */
function strEnd(s, i) {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') j++;
    else if (s[j] === s[i]) return j + 1;
    else if (s[j] === '\n') return j;
  }
  return s.length;
}

/** The offset after a token that is copied as written (string, block comment, url(...), #{...} or @{...}) at `i`, or -1. */
function verbatimEnd(s, i) {
  const c = s[i];
  if (c === '"' || c === "'") return strEnd(s, i);
  if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); return e < 0 ? s.length : e + 2; }
  if ((c === 'u' || c === 'U') && s.slice(i, i + 4).toLowerCase() === 'url(' && !/[\w-]/.test(s[i - 1] || '')) {
    let j = i + 4;
    while (s[j] === ' ') j++;
    if (s[j] === '"' || s[j] === "'") j = strEnd(s, j);
    const e = s.indexOf(')', j);
    return e < 0 ? s.length : e + 1;
  }
  if ((c === '#' || c === '@') && s[i + 1] === '{') {
    let depth = 1, j = i + 2;
    for (; j < s.length && depth; j++) {
      if (s[j] === '"' || s[j] === "'") j = strEnd(s, j) - 1;
      else if (s[j] === '{') depth++;
      else if (s[j] === '}') depth--;
    }
    return j;
  }
  return -1;
}

/** Offsets of the characters `ch` that are not inside a string, comment, url(...), parentheses or square brackets. */
function topLevel(s, ch) {
  const found = [];
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const e = verbatimEnd(s, i);
    if (e > 0) { i = e - 1; continue; }
    if (s[i] === '(' || s[i] === '[') depth++;
    else if (s[i] === ')' || s[i] === ']') depth = Math.max(0, depth - 1);
    else if (s[i] === ch && depth === 0) found.push(i);
  }
  return found;
}

/** Collapse white space to single spaces, put one space after each comma and before !important; keep verbatim tokens. */
function squash(s) {
  let out = '', space = false;
  const put = (t) => { if (space && out) out += ' '; space = false; out += t; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i], e = verbatimEnd(s, i);
    if (e > 0) { put(s.slice(i, e)); i = e - 1; }
    else if (/\s/.test(c)) space = true;
    else if (c === ',') { out += ','; space = true; }
    else if (c === '!') { space = true; put('!'); while (/\s/.test(s[i + 1] || '')) i++; }
    else if (c === ')') { space = false; out += c; }
    else if (c === '(') { put(c); space = false; }
    else put(c);
  }
  return out.trim();
}

/** A declaration or statement: `prop: value`, with a space after the colon. At-rules without a colon stay as they are. */
function statement(raw) {
  const s = squash(raw);
  const colons = topLevel(s, ':');
  if (colons.length && !/\s/.test(s.slice(0, colons[0]).trim())) {
    const value = s.slice(colons[0] + 1).trim();
    return s.slice(0, colons[0]).trim() + ':' + (value ? ' ' + value : '') + ';';
  }
  return s + ';';
}

/** Format CSS; `slash` is true for SCSS and Less, where // starts a comment. */
export function formatCss(text, slash) {
  const out = [], n = text.length;
  let buf = '', depth = 0, paren = 0, i = 0;
  let top = '', emptyOpen = false;   // the last top-level item: 'block' or 'stmt' ('' for a comment); the last line opened an empty block
  const emit = (s, opens) => {   // a blank line separates top-level blocks from what came before (not a comment from its rule)
    if (depth === 0 && (top === 'block' || (top === 'stmt' && opens))) out.push('');
    top = '';
    emptyOpen = false;
    const lines = s.split('\n');
    out.push(pad(depth) + lines[0], ...lines.slice(1));   // later lines of a comment stay as written
  };
  const flush = () => {
    if (buf.trim()) { emit(statement(buf)); if (depth === 0) top = 'stmt'; }
    buf = '';
  };
  const open = () => {
    const s = squash(buf);
    buf = '';
    const parts = s.startsWith('@') ? [] : topLevel(s, ',');
    let from = 0;
    for (const at of parts) { emit(s.slice(from, at).trim() + ',', true); from = at + 1; }
    emit(s.slice(from).trim() ? s.slice(from).trim() + ' {' : '{', true);
    emptyOpen = true;
    depth++;
  };
  const close = () => {
    flush();
    depth = Math.max(0, depth - 1);
    if (emptyOpen) { out[out.length - 1] += '}'; emptyOpen = false; } else emit('}');
    if (depth === 0) top = 'block';
  };
  while (i < n) {
    const c = text[i];
    if (slash && c === '/' && text[i + 1] === '/' && text[i - 1] !== ':') {
      const e = text.indexOf('\n', i);
      const end = e < 0 ? n : e;
      emit(text.slice(i, end).trimEnd());
      i = end;
      continue;
    }
    const e = verbatimEnd(text, i);
    if (e > 0) {
      const t = text.slice(i, e);
      if (t.startsWith('/*') && !buf.trim()) { buf = ''; emit(t); } else buf += t;
      i = e;
      continue;
    }
    if (c === '(') { paren++; buf += c; }
    else if (c === ')') { paren = Math.max(0, paren - 1); buf += c; }
    else if (c === ';' && paren === 0) flush();
    else if (c === '{') { paren = 0; open(); }
    else if (c === '}') { paren = 0; close(); }
    else buf += c;
    i++;
  }
  flush();
  return { ok: true, text: out.join('\n') };
}
