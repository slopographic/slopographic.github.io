/* Markdown to HTML for Slop Notes (and the .html, .doc and print exports). Everything is escaped first, so typed HTML
 * shows as text. Supported: ATX headings, paragraphs, **bold**, *italic*, ~~strike~~, `code`, fenced code, > quotes,
 * - * 1. lists, - [ ] task items, --- rules, pipe tables (:--- alignment, \| for a pipe), callouts (a quote whose first
 * line is [!NOTE], [!TIP], [!WARNING] or [!VIDEO], with an optional title), [links](url) and ![images](data:image/…).
 * Links only use http, https, mailto, #, / and relative paths. Remote images are never loaded: they show their alt text.
 * Nested lists are not supported. Link addresses are checked by SlopSanitize.url (shared/sanitize/sanitize.js). */
import '../../shared/sanitize/sanitize.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FENCE = /^```/;
const HEAD = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^ {0,3}([-*_])( *\1){2,}\s*$/;
const QUOTE = /^>/;
const LIST = /^\s*([-*+]|\d+\.)\s+(.*)$/;
const CALLOUT = /^\[!(NOTE|TIP|WARNING|VIDEO)\](?:\s+(.*))?$/i;
const SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** A link target that is safe to put in href (the text is already escaped): web, mail, phone, in-page or relative. */
const safeHref = (u) => globalThis.SlopSanitize.url(u, 'link');

/** Inline Markdown on one line of text. Code spans are pulled out first so their contents stay literal. */
export function inline(raw) {
  const spans = [];
  let s = String(raw).replace(/`([^`\n]+)`/g, (_, c) => { spans.push('<code>' + esc(c) + '</code>'); return '\u0001' + (spans.length - 1) + '\u0001'; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(url) ? `<img alt="${alt}" src="${url}">` : alt));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    const h = safeHref(url);
    return h ? `<a href="${h}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
  });
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+?)__/g, '<strong>$1</strong>');
  s = s.replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');
  s = s.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>').replace(/(^|[^\w])_([^_\n]+?)_(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0001(\d+)\u0001/g, (m, i) => spans[+i]);
}

/** True when a line starts a block (so a paragraph stops before it). Same tests the block loop uses. */
const startsBlock = (l) => FENCE.test(l) || HEAD.test(l) || HR.test(l) || QUOTE.test(l) || LIST.test(l);

/** The cells of one pipe-table line. A leading and trailing pipe are optional; \| is a literal pipe. */
export function cellsOf(line) {
  let s = String(line).trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** A table starts at a line with a pipe, followed by a delimiter row with the same number of cells. */
function isTable(lines, i) {
  return i + 1 < lines.length && lines[i].includes('|') && SEP.test(lines[i + 1]) && cellsOf(lines[i]).length === cellsOf(lines[i + 1]).length;
}

function tableBlock(lines, i) {
  const head = cellsOf(lines[i]);
  const align = cellsOf(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : ''));
  const cell = (tag, text, j) => '<' + tag + (align[j] ? ' style="text-align:' + align[j] + '"' : '') + '>' + inline(text) + '</' + tag + '>';
  let html = '<div class="md-table"><table><thead><tr>' + head.map((c, j) => cell('th', c, j)).join('') + '</tr></thead><tbody>';
  i += 2;
  while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
    const row = cellsOf(lines[i++]);
    html += '<tr>' + head.map((_, j) => cell('td', row[j] || '', j)).join('') + '</tr>';
  }
  return { html: html + '</tbody></table></div>', next: i };
}

/** A callout from the lines of a quote, or '' when the first line is not a [!TYPE] marker. */
function callout(q) {
  const m = CALLOUT.exec(q[0] || '');
  if (!m) return '';
  const type = m[1].toUpperCase();
  const title = (m[2] || '').trim() || type[0] + type.slice(1).toLowerCase();
  return '<aside class="md-callout md-' + type.toLowerCase() + '"><p class="md-callout-title">' + inline(title) + '</p>' +
    render(q.slice(1).join('\n')) + '</aside>';
}

function listBlock(lines, i, out) {
  const ordered = /^\s*\d+\./.test(lines[i]);
  const items = [];
  while (i < lines.length) {
    const m = LIST.exec(lines[i]);
    if (!m || /\d/.test(m[1]) !== ordered) break;
    let text = m[2], task = '';
    const t = /^\[( |x|X)\]\s+(.*)$/.exec(text);
    if (t) { task = '<input type="checkbox" disabled' + (t[1] !== ' ' ? ' checked' : '') + '> '; text = t[2]; }
    items.push('<li>' + task + inline(text) + '</li>');
    i++;
  }
  const tag = ordered ? 'ol' : 'ul';
  out.push('<' + tag + '>' + items.join('') + '</' + tag + '>');
  return i;
}

/** Markdown source to an HTML string. */
export function render(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (FENCE.test(line)) {
      const lang = line.slice(3).trim().split(/\s/)[0] || '';
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push('<pre class="md-code"><code' + (lang ? ' class="language-' + esc(lang) + '"' : '') + '>' + esc(body.join('\n')) + '</code></pre>');
      continue;
    }
    if (!line.trim()) { i++; continue; }
    if ((m = HEAD.exec(line))) { const n = m[1].length; out.push('<h' + n + '>' + inline(m[2]) + '</h' + n + '>'); i++; continue; }
    if (HR.test(line)) { out.push('<hr>'); i++; continue; }
    if (QUOTE.test(line)) {
      const q = [];
      while (i < lines.length && QUOTE.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      out.push(callout(q) || '<blockquote>' + render(q.join('\n')) + '</blockquote>');
      continue;
    }
    if (LIST.test(line)) { i = listBlock(lines, i, out); continue; }
    if (isTable(lines, i)) { const t = tableBlock(lines, i); out.push(t.html); i = t.next; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i]) && !isTable(lines, i)) para.push(lines[i++]);
    out.push('<p>' + para.map(inline).join('<br>') + '</p>');
  }
  return out.join('\n');
}

export { esc };
