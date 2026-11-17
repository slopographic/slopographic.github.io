/* Slop Code, Formatted view: XML and HTML. The tokens (fv-markup-lex.js) become a tree, which is printed with two-space
 * indents. Text is trimmed and its inner whitespace collapsed, except in pre, textarea, script and style, which keep
 * their content as written. An element that holds only text and inline elements stays on one line when it is short.
 * XML is strict about end tags; HTML tolerates unbalanced tags (void elements, omitted end tags, stray end tags). */
import { lexMarkup } from './fv-markup-lex.js';
import { fail, pad } from './fv-util.js';

const VOID = new Set(['br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'wbr', 'area', 'base', 'col', 'embed', 'param', 'track']);
const INLINE = new Set(['a', 'span', 'b', 'i', 'em', 'strong', 'code', 'small', 'sub', 'sup', 'label', 'abbr', 'mark', 'kbd', 'time']);
// HTML end tags that may be left out: an element of this name closes an open one from its list (li closes li, tr closes td...)
const ROW = ['tr', 'td', 'th'], SECTION = ['thead', 'tbody', 'tfoot', ...ROW];
const AUTO = { li: ['li'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], p: ['p'], option: ['option'], optgroup: ['option', 'optgroup'],
  tr: ROW, td: ['td', 'th'], th: ['td', 'th'], thead: SECTION, tbody: SECTION, tfoot: SECTION };
const WIDTH = 100;       // a start tag or a one-line element wider than this breaks
const RUN_WIDTH = 400;   // an inline element in a line of text is kept whole up to this width
const MAX_DEPTH = 400;   // open elements; deeper nesting is refused

/** Build the tree from the tokens: { root } or { err, at }. An element has k 'el', tag (its open token), kids, end (it has
 * an end tag) and leaf (void or self-closing); other nodes are text, rawtext, comment, cdata, pi, decl and stray. */
function build(text, toks, xml) {
  const root = { kids: [] }, stack = [root];
  const key = (name) => (xml ? name : name.toLowerCase());
  const top = () => stack[stack.length - 1];
  for (const t of toks) {
    if (t.k === 'open') {
      const name = key(t.name), list = xml ? null : AUTO[name];
      while (list && stack.length > 1 && list.includes(top().key)) stack.pop();   // an omitted end tag
      const el = { k: 'el', key: name, tag: t, kids: [], end: false, leaf: false };
      top().kids.push(el);
      if (t.self || (!xml && VOID.has(name))) { el.end = true; el.leaf = true; continue; }
      if (stack.length > MAX_DEPTH) return { err: 'too_deep', at: t.a };
      stack.push(el);
    } else if (t.k === 'close') {
      const name = key(t.name);
      let at = -1;
      for (let j = stack.length - 1; j > 0 && at < 0; j--) {
        if (stack[j].key === name) at = j;
        else if (xml) break;   // XML: only the innermost open element can be closed
      }
      if (at > 0) { stack[at].end = true; stack.length = at; }
      else if (!xml) top().kids.push({ k: 'stray', s: text.slice(t.a, t.b) });
      else if (stack.length > 1) return { err: 'mismatched_end', at: t.a, args: { found: t.name, expected: top().tag.name } };
      else return { err: 'unexpected_end_tag', at: t.a, args: { found: t.name } };
    } else top().kids.push({ k: t.k === 'raw' ? 'rawtext' : t.k, s: text.slice(t.a, t.b) });
  }
  if (xml && stack.length > 1) return { err: 'missing_end_tag', at: top().tag.a, args: { name: top().tag.name } };
  return { root };
}

const collapse = (s) => s.replace(/\s+/g, ' ');

/** The start tag of an element; each attribute goes on its own line when the tag is longer than 100 characters. */
function startTag(el, level) {
  const t = el.tag;
  const attrs = t.attrs.map((a) => (a.v === null ? a.n : a.n + '=' + a.q + a.v + a.q));
  const end = t.self ? (t.sp ? ' />' : '/>') : '>';
  const one = '<' + t.name + attrs.map((a) => ' ' + a).join('') + end;
  if (one.length <= WIDTH || !attrs.length) return one;
  return '<' + t.name + attrs.map((a) => '\n' + pad(level + 1) + a).join('') + end;
}

/** The element on one line (start tag, content, end tag), or null when it has to break: it holds anything but text and
 * inline elements, has a broken start tag, or does not fit in `room` characters. An end tag that is not there is not added. */
function oneLine(el, room) {
  if (el.kids.some((k) => k.k === 'rawtext')) return null;
  const open = startTag(el, 0);
  if (open.includes('\n')) return null;
  let body = '';
  for (const k of el.kids) {
    let s = null;
    if (k.k === 'text') s = collapse(k.s);
    else if (k.k === 'cdata') s = k.s;
    else if (k.k === 'el' && INLINE.has(k.key) && !k.leaf) s = oneLine(k, room - body.length);
    if (s === null) return null;
    body += s;
    if (body.length > room) return null;
  }
  const all = open + body.trim() + (el.end ? '</' + el.tag.name + '>' : '');
  return all.length <= room && !all.includes('\n') ? all : null;
}

/** Print one element: verbatim content, a leaf, one line, or start tag, children and end tag. */
function printEl(el, level, out) {
  const ind = pad(level), open = startTag(el, level);
  if (el.leaf) { out.push(ind + open); return; }
  if (el.kids.length && el.kids[0].k === 'rawtext') {
    const name = el.tag.name.toLowerCase(), raw = el.kids[0].s;
    const body = (name === 'script' || name === 'style') && !raw.trim() ? '' : raw;
    out.push(ind + open + body + (el.end ? '</' + el.tag.name + '>' : ''));
    return;
  }
  const line = oneLine(el, WIDTH - ind.length);
  if (line !== null) { out.push(ind + line); return; }
  out.push(ind + open);
  printKids(el.kids, level + 1, out);
  if (el.end) out.push(ind + '</' + el.tag.name + '>');
}

/** Print the children of an element: text and short inline elements that follow one another share a line (as in the
 * source: a space only where white space was), and every other node has its own line. */
function printKids(kids, level, out) {
  let run = '', space = false;   // the line being built, and whether white space came after its last piece
  const flush = () => { if (run) out.push(pad(level) + run); run = ''; space = false; };
  for (const k of kids) {
    if (k.k === 'text') {
      const s = collapse(k.s), piece = s.trim();
      if (!piece) { space = true; continue; }
      run += (run && (space || s[0] === ' ') ? ' ' : '') + piece;
      space = s.endsWith(' ');
      continue;
    }
    const line = k.k === 'el' && INLINE.has(k.key) && !k.leaf ? oneLine(k, RUN_WIDTH) : null;
    if (line === null) { flush(); printNode(k, level, out); continue; }
    run += (run && space ? ' ' : '') + line;
    space = false;
  }
  flush();
}

function printNode(n, level, out) {
  if (n.k === 'el') printEl(n, level, out);
  else if (n.k === 'text' || n.k === 'rawtext') {
    const s = collapse(n.s).trim();
    if (s) out.push(pad(level) + s);
  } else out.push(pad(level) + n.s);   // a comment, CDATA section, declaration, processing instruction or stray end tag
}

/** Pretty-print XML (xml true: strict end tags, case-sensitive names) or HTML. */
export function formatMarkup(text, xml) {
  const lexed = lexMarkup(text, xml);
  if (lexed.err) return fail(text, lexed.at, lexed.err);
  const tree = build(text, lexed.toks, xml);
  if (tree.err) return fail(text, tree.at, tree.err, tree.args);
  const out = [];
  printKids(tree.root.kids, 0, out);
  return { ok: true, text: out.join('\n') };
}
