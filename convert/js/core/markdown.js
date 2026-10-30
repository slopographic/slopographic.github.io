/* Markdown → HTML for common syntax: headings, paragraphs, emphasis, code, links, images, lists,
 * block quotes, rules and fenced code. Raw HTML in the source is shown as text (escaped), so the output
 * is safe to embed. Not supported: tables, nested lists, footnotes, HTML blocks. Pure. Link and image addresses are
 * checked by SlopSanitize.url (shared/sanitize/sanitize.js). */
import '../../../shared/sanitize/sanitize.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Only web, mail, phone, fragment and relative links are kept (images may also be data:image); anything else
 *  (javascript:, data:text/html, with tabs or control characters in it or not) becomes "#". */
function safeUrl(u, kind = 'link') {
  const ok = globalThis.SlopSanitize.url(u.replace(/&amp;/g, '&'), kind);
  return ok ? esc(ok) : '#';
}

function inline(src) {
  const codes = [];
  let s = esc(src).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, url, title) => `<img src="${safeUrl(url, 'image')}" alt="${alt}"${title ? ` title="${title}"` : ''}>`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, t, url, title) => `<a href="${safeUrl(url)}"${title ? ` title="${title}"` : ''}>${t}</a>`);
  s = s.replace(/&lt;((?:https?|mailto):[^\s&]+)&gt;/g, (_, u) => `<a href="${safeUrl(u)}">${u}</a>`);
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`);
  s = s.replace(/\*(?=\S)([\s\S]*?\S)\*|(?<![\w])_(?=\S)([\s\S]*?\S)_(?![\w])/g, (_, a, b) => `<em>${a ?? b}</em>`);
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
  s = s.replace(/ {2,}$/gm, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

const RULE = /^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/;
const HEAD = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w-]*)/;

/** Convert Markdown text to an HTML fragment (or a full page with standalone: true). */
export function markdownToHtml(md, { standalone = false, title = 'Document' } = {}) { // i18n-ignore: the title written into the HTML file
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if ((m = FENCE.exec(line))) {
      const fence = m[1], lang = m[2] ? ` class="language-${esc(m[2])}"` : '';
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) body.push(lines[i++]);
      i++;
      out.push(`<pre><code${lang}>${esc(body.join('\n'))}</code></pre>`);
    } else if (!line.trim()) {
      i++;
    } else if ((m = HEAD.exec(line))) {
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
      i++;
    } else if (RULE.test(line)) {
      out.push('<hr>');
      i++;
    } else if (/^\s{0,3}>/.test(line)) {
      const q = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) q.push(lines[i++].replace(/^\s{0,3}> ?/, ''));
      out.push(`<blockquote>\n${markdownToHtml(q.join('\n'))}</blockquote>`);
    } else if ((m = ITEM.exec(line))) {
      const ordered = /\d/.test(m[2]);
      const tag = ordered ? 'ol' : 'ul';
      const items = [];
      while (i < lines.length && (m = ITEM.exec(lines[i])) && /\d/.test(m[2]) === ordered) {
        i++;
        const text = [m[3]];
        while (i < lines.length && lines[i].trim() && !ITEM.test(lines[i]) && !HEAD.test(lines[i])) text.push(lines[i++].trim());
        items.push(`<li>${inline(text.join('\n'))}</li>`);
      }
      out.push(`<${tag}>\n${items.join('\n')}\n</${tag}>`);
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !HEAD.test(lines[i]) && !ITEM.test(lines[i]) && !RULE.test(lines[i]) && !/^\s{0,3}>/.test(lines[i])) para.push(lines[i++]);
      out.push(`<p>${inline(para.join('\n'))}</p>`);
    }
  }
  const body = out.join('\n') + '\n';
  if (!standalone) return body;
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n</head>\n<body>\n${body}</body>\n</html>\n`;
}
