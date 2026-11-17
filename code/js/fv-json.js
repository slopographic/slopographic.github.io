/* Slop Code, Formatted view: JSON and JSON Lines. A token-based printer, not JSON.parse and stringify: a number keeps
 * its spelling (12345678901234567890, 1.0, 1e5), a string keeps its escapes and keys keep their order. Strict JSON:
 * a trailing comma, a single-quoted string or a comment is an error with the line and column of the problem. */
import { fail, pad } from './fv-util.js';

const MAX_DEPTH = 200;          // deeper nesting would make the indentation larger than the text
const LIST_ITEMS = 8, LIST_WIDTH = 60;  // an array of up to 8 primitives that fits in 60 characters stays on one line
const NUM = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const WORD = /[A-Za-z_$][\w$]*/y;
const END_OF_NUM = /[\s,\]}:]/;
const HEX4 = /^[0-9a-fA-F]{4}$/;

/** Split text into tokens { k, a, b }: k is a punctuation character, 's' (string) or 'p' (number, true, false, null). */
function lex(text) {
  const toks = [], n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r') { i++; continue; }
    if ('{}[]:,'.includes(c)) { toks.push({ k: c, a: i, b: i + 1 }); i++; continue; }
    if (c === '"') {
      const end = stringEnd(text, i);
      if (typeof end !== 'number') return end;
      toks.push({ k: 's', a: i, b: end });
      i = end;
      continue;
    }
    if (c === '-' || (c >= '0' && c <= '9')) {
      NUM.lastIndex = i;
      const m = NUM.exec(text), e = m ? i + m[0].length : i;
      if (!m || (e < n && !END_OF_NUM.test(text[e]))) return { err: 'invalid_number', at: i };
      toks.push({ k: 'p', a: i, b: e });
      i = e;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      WORD.lastIndex = i;
      const w = WORD.exec(text)[0];
      if (w !== 'true' && w !== 'false' && w !== 'null') return { err: 'unexpected_word', at: i, args: { word: w.slice(0, 20) } };
      toks.push({ k: 'p', a: i, b: i + w.length });
      i += w.length;
      continue;
    }
    if (c === "'") return { err: 'single_quote', at: i };
    if (c === '/') return { err: 'comment', at: i };
    return { err: 'unexpected_char', at: i, args: { char: c } };
  }
  return { toks };
}

/** The offset after the string that starts at `i`, or { err, at } when it is bad. */
function stringEnd(text, i) {
  const n = text.length;
  for (let j = i + 1; ; ) {
    if (j >= n) return { err: 'unterminated_string', at: i };
    const d = text.charCodeAt(j);
    if (d === 34) return j + 1;
    if (d === 10) return { err: 'unterminated_string', at: i };
    if (d < 32) return { err: 'control_char', at: j };
    if (d !== 92) { j++; continue; }
    const e = text[j + 1];
    if (e === 'u') {
      if (!HEX4.test(text.slice(j + 2, j + 6))) return { err: 'bad_unicode', at: j };
      j += 6;
    } else if (e !== undefined && '"\\/bfnrt'.includes(e)) j += 2;
    else return { err: 'bad_escape', at: j };
  }
}

/** True when the array opened at token `i` is a short list of primitives that can stay on one line. */
function shortList(toks, i) {
  let width = 2, count = 0;
  for (let j = i + 1; j < toks.length; j += 2) {
    const t = toks[j], next = toks[j + 1];
    if (t.k === ']') return count === 0;
    if (t.k !== 's' && t.k !== 'p') return false;
    count++;
    width += t.b - t.a + (count > 1 ? 2 : 0);
    if (count > LIST_ITEMS || width > LIST_WIDTH || !next) return false;
    if (next.k === ']') return true;
    if (next.k !== ',') return false;
  }
  return false;
}

/** Check the grammar and print in one pass over the tokens, with an explicit stack so nesting depth cannot overflow. */
function print(text, toks) {
  const out = [], stack = [];
  // state: V a value (top level or after a comma in an array), OV a value after a colon, AV after '[', AK after '{',
  // K a key after a comma, C a colon, N after a value (a comma, a closing bracket or the end)
  let state = 'V';
  const item = () => {   // start the next entry of the open container
    const f = stack[stack.length - 1];
    if (!f) return;
    out.push(f.inline ? (f.n ? ', ' : '') : (f.n ? ',\n' : '\n') + pad(stack.length));
    f.n++;
  };
  const close = () => {
    const f = stack.pop();
    if (f.n && !f.inline) out.push('\n' + pad(stack.length));
    out.push(f.obj ? '}' : ']');
    state = 'N';
  };
  const fault = (err, t, args) => ({ err, at: t.a, args });
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], k = t.k, f = stack[stack.length - 1];
    if (state === 'V' || state === 'AV' || state === 'OV') {
      if (k === ']' && state === 'AV') { close(); continue; }
      if (k === '{' || k === '[') {
        if (stack.length >= MAX_DEPTH) return fault('too_deep', t);
        if (state !== 'OV') item();
        out.push(k);
        stack.push({ obj: k === '{', n: 0, inline: k === '[' && shortList(toks, i) });
        state = k === '{' ? 'AK' : 'AV';
      } else if (k === 's' || k === 'p') {
        if (state !== 'OV') item();
        out.push(text.slice(t.a, t.b));
        state = 'N';
      } else if ((k === ']' || k === '}') && state === 'V' && f) return fault('trailing_comma', t);
      else return fault('expected_value', t, { char: k });
    } else if (state === 'AK' || state === 'K') {
      if (k === '}' && state === 'AK') close();
      else if (k === 's') { item(); out.push(text.slice(t.a, t.b)); state = 'C'; }
      else if (k === '}') return fault('trailing_comma', t);
      else return fault('expected_key', t, { char: k });
    } else if (state === 'C') {
      if (k !== ':') return fault('expected_colon', t);
      out.push(': ');
      state = 'OV';
    } else if (!f) return fault('extra_text', t);
    else if (k === ',') state = f.obj ? 'K' : 'V';
    else if (k === (f.obj ? '}' : ']')) close();
    else return fault(f.obj ? 'expected_comma_object' : 'expected_comma_array', t);
  }
  if (state !== 'N' || stack.length) return { err: 'unexpected_end', at: toks[toks.length - 1].b };
  return { text: out.join('') };
}

/** Pretty-print one JSON value. Blank input gives blank output. */
export function formatJson(text) {
  const lexed = lex(text);
  if (lexed.err) return fail(text, lexed.at, lexed.err, lexed.args);
  if (!lexed.toks.length) return { ok: true, text: '' };
  const done = print(text, lexed.toks);
  return done.err ? fail(text, done.at, done.err, done.args) : { ok: true, text: done.text };
}

/** JSON Lines: each non-empty line is one record, pretty-printed, records separated by a blank line. */
export function formatJsonl(text) {
  const lines = text.split('\n'), out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const r = formatJson(lines[i]);
    if (!r.ok) return { ...r, line: i + 1 };
    out.push(r.text);
  }
  return { ok: true, text: out.join('\n\n') };
}
