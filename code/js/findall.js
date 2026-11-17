/* Slop Code: the search engine behind Search in files. Pure: no DOM, no Drive. It builds one regular expression from the box and its
 * three switches (match case, whole word, regular expression), finds matches in a text with the line each one is on, and computes a
 * replacement as a list of changes (so an open document can take it as one editor transaction, undoable) and as the new text.
 * The text it works on has \n line breaks, the way the editor holds a file (openfile.js puts the file's own line ending back). */

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A letter, digit or _ in any language: what a whole word may not touch. */
const WORD = '[\\p{L}\\p{N}_]';

/** The regular expression for a search. q: { find, regexp?, caseSensitive?, wholeWord? }. Returns { re } (global, multiline) or
 * { error: 'empty' | 'regex', message? } so the caller can say what is wrong in the page's language. */
export function buildRegex(q) {
  const find = String(q && q.find != null ? q.find : '');
  if (!find) return { error: 'empty' };
  const body = q.regexp ? find : escapeRe(find);
  const flags = 'gm' + (q.caseSensitive ? '' : 'i');
  const tries = q.wholeWord ? [[`(?<!${WORD})(?:${body})(?!${WORD})`, flags + 'u'], [`\\b(?:${body})\\b`, flags]] : [[body, flags + 'u'], [body, flags]];
  let message = '';
  for (const [src, fl] of tries) { // a pattern that is only valid without the u flag (an old escape such as \_) still works
    try { return { re: new RegExp(src, fl) }; } catch (e) { message = message || e.message; }
  }
  return { error: 'regex', message };
}

/** Offsets where each line starts (so a match offset gives its line by a binary search). */
function lineStarts(text) {
  const out = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) out.push(i + 1);
  return out;
}
function lineAt(starts, pos) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
  return lo;
}

/** Every non-empty match as { from, to }, at most `limit` (the rest are only counted: `more`). */
function rawMatches(text, re, limit) {
  const out = [];
  let more = 0;
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[0] === '') { re.lastIndex++; continue; }
    if (out.length < limit) out.push({ from: m.index, to: m.index + m[0].length }); else more++;
  }
  return { list: out, more };
}

/** The matches in a text: { matches: [{ from, to, line, col, before, hit, after }], more }. `line` and `col` count from 1; `before`, `hit`
 * and `after` are the line's text around the match (long lines are cut to `context` characters each side) for a list of results. */
export function findIn(text, re, { limit = 500, context = 40 } = {}) {
  const { list, more } = rawMatches(text, re, limit);
  if (!list.length) return { matches: [], more };
  const starts = lineStarts(text);
  const matches = list.map((m) => {
    const ln = lineAt(starts, m.from), ls = starts[ln];
    let le = text.indexOf('\n', ls); if (le < 0) le = text.length;
    const hitEnd = Math.min(m.to, le);
    const a = Math.max(ls, m.from - context), b = Math.min(le, hitEnd + context);
    return { from: m.from, to: m.to, line: ln + 1, col: m.from - ls + 1,
      before: (a > ls ? '…' : '') + text.slice(a, m.from).replace(/^\s+/, (s) => (a === ls ? '' : s)),
      hit: text.slice(m.from, hitEnd), after: text.slice(hitEnd, b) + (b < le ? '…' : '') };
  });
  return { matches, more };
}

/** How many non-empty matches a text has. */
export function countIn(text, re) {
  const { list, more } = rawMatches(text, re, Infinity);
  return list.length + more;
}

/** A replacement string with $1, $&, $$ and $<name> read the way String.replace reads them (regular expression searches only). */
function expand(rep, match, groups, named) {
  return rep.replace(/\$(\$|&|\d{1,2}|<[^>]*>)/g, (s, k) => {
    if (k === '$') return '$';
    if (k === '&') return match;
    if (k[0] === '<') return named && named[k.slice(1, -1)] != null ? named[k.slice(1, -1)] : '';
    const n = Number(k);
    return n >= 1 && n <= groups.length ? (groups[n - 1] == null ? '' : groups[n - 1]) : s;
  });
}

/** Replace every non-empty match. `regexp` says the replacement may use $1 and $&. Returns { text, count, changes } where `changes`
 * is [{ from, to, insert }] against the original text (an editor applies them as one transaction). */
export function replaceIn(text, re, replacement, regexp = false) {
  const changes = [];
  const rep = String(replacement == null ? '' : replacement);
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[0] === '') { re.lastIndex++; continue; }
    let named = null, groups = m.slice(1);
    if (m.groups) named = m.groups;
    changes.push({ from: m.index, to: m.index + m[0].length, insert: regexp ? expand(rep, m[0], groups, named) : rep });
  }
  let out = '', at = 0;
  for (const c of changes) { out += text.slice(at, c.from) + c.insert; at = c.to; }
  return { text: out + text.slice(at), count: changes.length, changes };
}

/** A file-name filter from "*.js, src/*.css": the names (or paths) it lets through. Empty lets everything through. */
export function nameFilter(spec) {
  const parts = String(spec || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return () => true;
  const res = parts.map((p) => new RegExp('^' + p.split('*').map(escapeRe).join('.*') + '$', 'i'));
  return (path) => { const base = path.slice(path.lastIndexOf('/') + 1); return res.some((r) => r.test(path) || r.test(base)); };
}
