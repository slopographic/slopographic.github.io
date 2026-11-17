/* Slop Code, Formatted view: the tolerant XML and HTML tokenizer. It never throws and never drops text: a '<' that does
 * not start a tag is text. Tokens carry offsets (a, b) into the source so the printer can quote it and errors can point. */

const SPACE = /\s/;
const NAME = /[^\s/>]+/y;
const ATTR = /[^\s=/>]+/y;
const UNQUOTED = /[^\s>]*/y;
const TAG_START = /[A-Za-z_:\u00c0-\uffff]/;
export const RAW_NAMES = ['pre', 'textarea', 'script', 'style'];   // their content is kept verbatim
const RAW_END = {};
for (const name of RAW_NAMES) RAW_END[name] = new RegExp('</' + name + '(?=[\\s/>])', 'gi');

/** The end offset of a start tag read at `i` (after its '<'), with its name, attributes and self-closing mark; null if unterminated. */
function readTag(text, i) {
  const n = text.length;
  NAME.lastIndex = i + 1;
  const name = NAME.exec(text)[0], attrs = [];
  let j = i + 1 + name.length;
  for (;;) {
    let k = j;
    while (k < n && SPACE.test(text[k])) k++;
    const spaced = k > j;
    j = k;
    if (j >= n) return null;
    if (text[j] === '>') return { name, attrs, self: false, sp: false, end: j + 1 };
    if (text[j] === '/' && text[j + 1] === '>') return { name, attrs, self: true, sp: spaced, end: j + 2 };
    ATTR.lastIndex = j;
    const m = ATTR.exec(text);
    if (!m) { j++; continue; }   // a stray '/' or '='
    j += m[0].length;
    k = j;
    while (k < n && SPACE.test(text[k])) k++;
    if (text[k] !== '=') { attrs.push({ n: m[0], v: null, q: '' }); continue; }
    k++;
    while (k < n && SPACE.test(text[k])) k++;
    const q = text[k];
    if (q === '"' || q === "'") {
      const e = text.indexOf(q, k + 1);
      if (e < 0) return null;
      attrs.push({ n: m[0], v: text.slice(k + 1, e), q });
      j = e + 1;
    } else {
      UNQUOTED.lastIndex = k;
      const v = UNQUOTED.exec(text)[0];
      attrs.push({ n: m[0], v, q: '' });
      j = k + v.length;
    }
  }
}

/** The end of a '<!...>' declaration at `i`: its '>' outside quotes and an internal [ ... ] subset. */
function declEnd(text, i) {
  let depth = 0, quote = '';
  for (let j = i + 2; j < text.length; j++) {
    const c = text[j];
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '[') depth++;
    else if (c === ']') depth = Math.max(0, depth - 1);
    else if (c === '>' && depth === 0) return j + 1;
  }
  return text.length;
}

/** Tokens: text, open (name, attrs, self, sp), close (name), comment, cdata, pi, decl and raw (verbatim element content).
 * In xml mode an unterminated tag is an error { err, at }; in html mode its '<' is text. */
export function lexMarkup(text, xml) {
  const toks = [], n = text.length;
  const push = (k, a, b, more) => {
    const last = toks[toks.length - 1];
    if (k === 'text' && last && last.k === 'text' && last.b === a) last.b = b;
    else toks.push({ k, a, b, ...more });
  };
  const span = (k, i, open, close) => {   // a construct that ends with `close`, or runs to the end of the text
    const e = text.indexOf(close, i + open);
    const b = e < 0 ? n : e + close.length;
    push(k, i, b);
    return b;
  };
  let i = 0;
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) { push('text', i, n); break; }
    if (lt > i) push('text', i, lt);
    i = lt;
    const c = text[i + 1];
    if (text.startsWith('<!--', i)) i = span('comment', i, 4, '-->');
    else if (text.startsWith('<![CDATA[', i)) i = span('cdata', i, 9, ']]>');
    else if (c === '?') i = span('pi', i, 2, '?>');
    else if (c === '!') { const b = declEnd(text, i); push('decl', i, b); i = b; }
    else if (c === '/' && text[i + 2] && TAG_START.test(text[i + 2])) {
      const e = text.indexOf('>', i + 2);
      if (e < 0) {
        if (xml) return { err: 'open_end_tag', at: i };
        push('text', i, n);
        i = n;
      } else {
        NAME.lastIndex = i + 2;
        push('close', i, e + 1, { name: NAME.exec(text)[0] });
        i = e + 1;
      }
    } else if (c && TAG_START.test(c)) {
      const tag = readTag(text, i);
      if (!tag) {
        if (xml) return { err: 'open_start_tag', at: i };
        push('text', i, i + 1);
        i++;
        continue;
      }
      push('open', i, tag.end, tag);
      i = tag.end;
      const re = RAW_END[tag.name.toLowerCase()];
      if (re && !tag.self) {   // verbatim content: up to the matching end tag
        re.lastIndex = i;
        const m = re.exec(text), e = m ? m.index : n;
        if (e > i) push('raw', i, e);
        i = e;
      }
    } else { push('text', i, i + 1); i++; }
  }
  return { toks };
}
