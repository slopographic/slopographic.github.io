/* Slop Code, Formatted view: JavaScript and TypeScript. The indentation comes from format.js (formatText). Before that,
 * a line longer than 200 characters (minified code) is split at ; { and } by a scanner that knows strings, template
 * literals, regular expressions (a guess from the token before the slash) and comments, so what is inside them is never
 * changed. Lines of ordinary length are left alone. */
import { formatText } from './format.js';

const LONG = 200;
const WORD = /[\w$\u0080-\uFFFF]+/y;
const IDENT = /[\w$\u0080-\uFFFF]/;
const EOL = /[ \t]*(?:\n|$)/y;
const EMPTY_BLOCK = /\s*}/y;
const REGEX_AFTER = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const NO_BREAK_AFTER_CLOSE = /[)\],;.:?=+\-*%|&<>(]|(?:else|catch|finally)\b/y;

/** The offset after the quoted string at `i`; an unescaped line break ends an unterminated one. */
function quoted(s, i) {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') j++;
    else if (s[j] === s[i]) return j + 1;
    else if (s[j] === '\n') return j;
  }
  return s.length;
}

/** The offset after the template literal at `i`, with its ${ } placeholders (which may hold strings and templates). */
function template(s, i) {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') j++;
    else if (s[j] === '`') return j + 1;
    else if (s[j] === '$' && s[j + 1] === '{') j = placeholder(s, j + 2) - 1;
  }
  return s.length;
}

/** The offset after the '}' that closes a placeholder whose content starts at `i`. */
function placeholder(s, i) {
  let depth = 1;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '"' || c === "'") j = quoted(s, j) - 1;
    else if (c === '`') j = template(s, j) - 1;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return j + 1;
  }
  return s.length;
}

/** The offset after the regular expression literal at `i` (character classes may hold a slash), or -1 on the same line. */
function regexEnd(s, i) {
  let inClass = false;
  for (let j = i + 1; j < s.length && s[j] !== '\n'; j++) {
    if (s[j] === '\\') j++;
    else if (s[j] === '[') inClass = true;
    else if (s[j] === ']') inClass = false;
    else if (s[j] === '/' && !inClass) return j + 1;
  }
  return -1;
}

/** Insert line breaks into every line longer than LONG characters. */
export function splitLongLines(s) {
  const n = s.length, out = [], stack = [];
  let from = 0, i = 0, prev = '', word = '', lineEnd = -1, long = false;
  const operand = () => { prev = 'a'; word = ''; };   // after a string, template or regex a slash divides
  const atEol = (at) => { EOL.lastIndex = at; return EOL.test(s); };
  const after = (end) => {   // break after offset `end` unless the line already ends there
    out.push(s.slice(from, end));
    from = end;
    if (!atEol(end)) out.push('\n');
  };
  const before = (at) => {   // break before offset `at` unless only white space came before it
    if (!s.slice(from, at).trim()) return;
    out.push(s.slice(from, at), '\n');
    from = at;
  };
  const afterClose = (at) => {   // after '}': a new line, unless the code goes on (`})`, `},`, `} else`)
    let k = at;
    while (s[k] === ' ' || s[k] === '\t') k++;
    NO_BREAK_AFTER_CLOSE.lastIndex = k;
    if (k < n && !NO_BREAK_AFTER_CLOSE.test(s)) after(at);
  };
  while (i < n) {
    if (i > lineEnd) {   // a new line: is it a long one?
      const start = s.lastIndexOf('\n', i - 1) + 1;
      lineEnd = s.indexOf('\n', i);
      if (lineEnd < 0) lineEnd = n;
      long = lineEnd - start > LONG;
    }
    const c = s[i], d = s[i + 1];
    if (c === ' ' || c === '\t' || c === '\n') i++;
    else if (c === '/' && d === '/') { const e = s.indexOf('\n', i); i = e < 0 ? n : e; }
    else if (c === '/' && d === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; }
    else if (c === '"' || c === "'") { i = quoted(s, i); operand(); }
    else if (c === '`') { i = template(s, i); operand(); }
    else if (c === '/' && (REGEX_AFTER.has(prev) || (prev === 'a' && KEYWORDS.has(word))) && regexEnd(s, i) > 0) { i = regexEnd(s, i); operand(); }
    else if (IDENT.test(c)) {
      WORD.lastIndex = i;
      word = WORD.exec(s)[0];
      i += word.length;
      prev = 'a';
    } else {
      const last = prev;
      i++;
      prev = c;
      if (c === '(' || c === '[') stack.push(c);
      else if (c === ')' || c === ']') stack.pop();
      else if (c === '{') {
        stack.push(c);
        EMPTY_BLOCK.lastIndex = i;
        if (long && !EMPTY_BLOCK.test(s)) after(i);
      } else if (c === '}') {
        stack.pop();
        if (long) { if (last !== '{') before(i - 1); afterClose(i); }
      } else if (c === ';' && long && (!stack.length || stack[stack.length - 1] === '{')) after(i);
    }
  }
  out.push(s.slice(from));
  return out.join('');
}

/** Format JavaScript or TypeScript for the view: split minified lines, then indent with formatText. No final newline. */
export function formatJs(text) {
  return { ok: true, text: formatText(splitLongLines(text), 'javascript').replace(/\n$/, '') };
}
