/* Markdown to plain text for the .txt export. The marks are taken off, a link keeps its address in brackets, an image shows
 * its alt text, a table row becomes tab-separated cells, a delimiter row is dropped and a rule becomes a dashed line.
 * Code inside a fence is kept as it is. */
import { cellsOf } from './markdown.js';

const RULE = /^ {0,3}([-*_])( *\1){2,}\s*$/;
const DELIM = /^[\s|:-]+$/;

/** One line outside a code fence, with its marks taken off. */
function line(raw) {
  if (RULE.test(raw)) return '----------';
  if (raw.includes('|') && raw.includes('-') && DELIM.test(raw)) return null;
  let s = raw;
  if (/^\s*\|.*\|\s*$/.test(s)) s = cellsOf(s).join('\t');
  return s
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^(\s*)>\s?/, '$1')
    .replace(/^\s*\[!(?:NOTE|TIP|WARNING|VIDEO)\]\s*/i, '')
    .replace(/^(\s*)[-*+]\s+\[([ xX])\]\s+/, (m, ind, c) => ind + (c === ' ' ? '[ ] ' : '[x] '))
    .replace(/^(\s*)[-*+]\s+/, '$1- ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1$2');
}

/** The plain text of a Markdown source, ending with one newline. */
export function plainText(src) {
  const out = [];
  let fence = false;
  for (const raw of String(src || '').replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(raw)) { fence = !fence; continue; }
    if (fence) { out.push(raw); continue; }
    const s = line(raw);
    if (s !== null) out.push(s);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
