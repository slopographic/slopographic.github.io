/* Slop Code: a small Markdown renderer for the rendered preview. It builds DOM nodes (never innerHTML), so the
 * file's text cannot inject markup. Supported: ATX headings, paragraphs, bullet and numbered lists, block quotes,
 * fenced code, horizontal rules, `code`, **bold**, __bold__, *italic*, _italic_ and [links](target). Images show
 * their alt text. Links are kept only for http, https, mailto, tel, in-page (#) and relative targets (SlopSanitize.url). */
import { el } from './dom.js';
import '../../shared/sanitize/sanitize.js';

const FENCE = /^\s*```/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const ITEM = /^\s*([-*+]|\d{1,9}[.)])\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const INLINE = /`([^`]+)`|!\[([^\]]*)\]\([^)]*\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|__(.+?)__|\*([^*\s](?:[^*]*[^*\s])?)\*|_([^_\s](?:[^_]*[^_\s])?)_/;

/** The inline pieces of one line of text, as nodes. */
export function inline(s) {
  const out = [];
  let rest = String(s);
  for (let m = INLINE.exec(rest); m; m = INLINE.exec(rest)) {
    if (m.index > 0) out.push(rest.slice(0, m.index));
    if (m[1] != null) out.push(el('code', null, m[1]));
    else if (m[2] != null) out.push(m[2]);
    else if (m[3] != null) { const href = globalThis.SlopSanitize.url(m[4], 'link'); out.push(href ? el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, inline(m[3])) : inline(m[3])); }
    else if (m[5] != null || m[6] != null) out.push(el('strong', null, inline(m[5] ?? m[6])));
    else out.push(el('em', null, inline(m[7] ?? m[8])));
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) out.push(rest);
  return out;
}

/** Blocks from the Markdown text. Returns an array of elements. */
export function renderMarkdown(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (FENCE.test(line)) {
      const code = [];
      for (i++; i < lines.length && !FENCE.test(lines[i]); i++) code.push(lines[i]);
      i++;
      out.push(el('pre', { class: 'cd-md-code' }, el('code', null, code.join('\n'))));
      continue;
    }
    const h = HEADING.exec(line);
    if (h) { out.push(el('h' + h[1].length, null, inline(h[2]))); i++; continue; }
    if (RULE.test(line)) { out.push(el('hr')); i++; continue; }
    if (QUOTE.test(line)) {
      const body = [];
      for (; i < lines.length && QUOTE.test(lines[i]); i++) body.push(QUOTE.exec(lines[i])[1]);
      out.push(el('blockquote', null, renderMarkdown(body.join('\n'))));
      continue;
    }
    if (ITEM.test(line)) {
      const ordered = /^\s*\d/.test(line), items = [];
      for (; i < lines.length && ITEM.test(lines[i]); i++) items.push(el('li', null, inline(ITEM.exec(lines[i])[2])));
      out.push(el(ordered ? 'ol' : 'ul', null, items));
      continue;
    }
    const para = [];
    for (; i < lines.length && lines[i].trim() && !startsBlock(lines[i]); i++) para.push(lines[i].trim());
    out.push(el('p', null, inline(para.join(' '))));
  }
  return out;
}

const startsBlock = (line) => FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line);
