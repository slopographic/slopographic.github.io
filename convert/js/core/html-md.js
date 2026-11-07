/* HTML to Markdown (CommonMark with GitHub tables and ~~strike~~). Browser only (DOMParser); epub.js uses it for books.
 *   htmlToMarkdown(html) -> text     headings, paragraphs, bold, italic, strike, code spans and blocks (with the
 *        language-x class as the fence's language), links, images, lists (nested, numbered from their start), quotes,
 *        rules, line breaks and tables. Scripts, styles, forms and the head are left out; any other element gives its
 *        content. Markdown characters in the text are escaped so they stay text.
 *   nodeToMarkdown(node) -> text     the same for a parsed element (an EPUB chapter's body)
 * Link and image addresses are checked by SlopSanitize.url (shared/sanitize/sanitize.js): javascript: and the like go. */
import '../../../shared/sanitize/sanitize.js';
import { tr } from './i18n.js';

const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE',
  'HEADER', 'FOOTER', 'NAV', 'MAIN', 'ASIDE', 'HR', 'DL', 'DT', 'DD', 'FIGURE', 'FIGCAPTION', 'ADDRESS', 'DETAILS', 'SUMMARY', 'BODY', 'CENTER']);
const DROP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'SVG', 'MATH', 'IFRAME', 'OBJECT', 'FORM', 'BUTTON', 'SELECT', 'INPUT', 'TEXTAREA']);
const BR = '\u0001';   // a hard line break until the paragraph is finished
const SAFE = globalThis.SlopSanitize;
const tag = (n) => String(n.tagName || n.localName || '').toUpperCase();

const escText = (s) => s.replace(/([\\`*_[\]<>])/g, '\\$1');
const escLine = (s) => s.replace(/^(\s*)(#{1,6}\s|>|[-+*]\s|\d+[.)]\s)/, '$1\\$2');
const finish = (s) => escLine(s.replace(/[ \t\n\r\f]+/g, ' ').replace(new RegExp(` ?${BR} ?`, 'g'), BR).trim()).replace(new RegExp(BR, 'g'), '  \n').replace(/ {2}\n$/, '');

function wrap(mark, inner) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : inner;
}
function codeSpan(s) {
  const t = s.replace(/\s+/g, ' ');
  let fence = '`';
  while (t.includes(fence)) fence += '`';
  return t.startsWith('`') || t.endsWith('`') ? `${fence} ${t} ${fence}` : `${fence}${t}${fence}`;
}
const url = (u) => String(u || '').trim().replace(/[()\s]/g, (c) => encodeURIComponent(c));

function inlineAll(node) {
  let s = '';
  for (const c of node.childNodes) s += c.nodeType === 3 ? escText(c.nodeValue) : c.nodeType === 1 ? inline(c) : '';
  return s;
}
function inline(el) {
  const t = tag(el);
  if (DROP.has(t)) return '';
  if (t === 'BR') return BR;
  if (t === 'STRONG' || t === 'B') return wrap('**', inlineAll(el));
  if (t === 'EM' || t === 'I' || t === 'CITE' || t === 'VAR') return wrap('*', inlineAll(el));
  if (t === 'DEL' || t === 'S' || t === 'STRIKE') return wrap('~~', inlineAll(el));
  if (t === 'CODE' || t === 'KBD' || t === 'SAMP' || t === 'TT') return codeSpan(el.textContent);
  if (t === 'IMG') { const alt = escText(el.getAttribute('alt') || ''), src = SAFE.url(el.getAttribute('src'), 'image'); return src ? `![${alt}](${url(src)})` : alt; }
  if (t === 'A') {
    const href = SAFE.url(el.getAttribute('href'), 'link'), inner = inlineAll(el).trim();
    if (!href) return inlineAll(el);
    const title = el.getAttribute('title');
    return `[${inner || escText(href)}](${url(href)}${title ? ` "${title.replace(/[\\"]/g, '\\$&')}"` : ''})`;
  }
  if (t === 'SUP' || t === 'SUB' || t === 'U' || t === 'MARK' || t === 'SMALL' || t === 'SPAN' || t === 'ABBR' || t === 'Q') return inlineAll(el);
  return BLOCK.has(t) || t === 'LI' ? ` ${inlineAll(el)} ` : inlineAll(el);
}

/** The Markdown blocks inside an element: runs of inline content become paragraphs. */
function blocks(parent) {
  const out = [];
  let run = '';
  const flush = () => { const p = finish(run); if (p) out.push(p); run = ''; };
  for (const c of parent.childNodes) {
    if (c.nodeType === 3) run += escText(c.nodeValue);
    else if (c.nodeType === 1 && !DROP.has(tag(c))) {
      if (BLOCK.has(tag(c))) { flush(); out.push(...blockOf(c)); } else run += inline(c);
    }
  }
  flush();
  return out;
}
const indent = (s, pad) => s.split('\n').map((l, i) => (i && l ? pad + l : l)).join('\n');

function list(el, ordered) {
  let n = Number(el.getAttribute('start')) || 1;
  const items = [...el.children].filter((c) => tag(c) === 'LI').map((li) => {
    const marker = ordered ? `${n++}. ` : '- ';
    const parts = blocks(li);
    const loose = [...li.children].some((c) => tag(c) === 'P');
    return marker + indent(parts.join(loose ? '\n\n' : '\n') || '', ' '.repeat(marker.length));
  });
  return items.join('\n');
}
function table(el) {
  const rows = [...el.querySelectorAll('tr')].filter((tr) => tr.closest('table') === el)
    .map((tr) => [...tr.children].filter((c) => /^T[HD]$/.test(tag(c))).map((c) => finish(inlineAll(c)).replace(/ {2}\n/g, ' ').replace(/\|/g, '\\|')));
  if (!rows.length) return '';
  const w = Math.max(...rows.map((r) => r.length));
  const line = (r) => `| ${Array.from({ length: w }, (_, i) => r[i] || '').join(' | ')} |`;
  return [line(rows[0]), `| ${Array(w).fill('---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
}
function pre(el) {
  const code = el.querySelector('code');
  const lang = (/(?:^|\s)(?:language|lang)-(\S+)/.exec((code && code.getAttribute('class')) || el.getAttribute('class') || '') || [])[1] || '';
  const body = el.textContent.replace(/\n$/, '');
  let fence = '```';
  while (body.includes(fence)) fence += '`';
  return `${fence}${lang}\n${body}\n${fence}`;
}

function blockOf(el) {
  const t = tag(el);
  if (/^H[1-6]$/.test(t)) { const h = finish(inlineAll(el)).replace(/ {2}\n/g, ' '); return h ? [`${'#'.repeat(Number(t[1]))} ${h}`] : []; }
  if (t === 'P' || t === 'DT' || t === 'FIGCAPTION' || t === 'SUMMARY' || t === 'ADDRESS') { const p = finish(inlineAll(el)); return p ? [t === 'DT' ? `**${p}**` : p] : []; }
  if (t === 'UL' || t === 'OL') { const l = list(el, t === 'OL'); return l ? [l] : []; }
  if (t === 'PRE') return [pre(el)];
  if (t === 'HR') return ['---'];
  if (t === 'TABLE') { const tb = table(el); return tb ? [tb] : []; }
  if (t === 'BLOCKQUOTE') { const q = blocks(el).join('\n\n'); return q ? [q.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')] : []; }
  return blocks(el);
}

export function nodeToMarkdown(node) {
  const out = blocks(node).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  return out ? out + '\n' : '';
}

export function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  const md = nodeToMarkdown(doc.body);
  if (!md.trim()) throw new Error(tr('convert.html.no_text'));
  return md;
}
