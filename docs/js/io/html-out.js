/* Slop Docs — io/html-out: a document as HTML. Pure (no DOM), like md-out.js.
 *   toHtml(doc, { title, standalone = true, lang })   headings (Title is an h1), paragraphs with their alignment,
 *     bullet and numbered lists nested by level, quotes, code paragraphs as <pre>, bold, italic, underline, strike,
 *     super- and subscript, code, colour, links (web and mail addresses only), pictures with a source, and tables (header
 *     rows as <th>, spanned and merged cells as colspan and rowspan). Every block has dir="auto", so Arabic and Hebrew
 *     paragraphs read right to left. standalone: a whole page with a small stylesheet; false: the body only.
 * Fields, footnotes, headers and footers are left out. */
import { spans, isCode } from './md-out.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);
const safeLink = (u) => /^(https?:|mailto:|tel:)/i.test(String(u || '').trim());
const TAG = { Title: 'h1', H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h4', H5: 'h5', H6: 'h6' };

function inline(p) {
  const pics = (p.runs || []).filter((r) => r.obj === 'img' && r.src && /^(data:image\/|https?:)/i.test(r.src))
    .map((r) => `<img src="${esc(r.src)}" alt="${esc(r.alt || '')}"${r.w ? ` width="${Math.round(r.w * 4 / 3)}"` : ''}>`);
  const html = spans(p.runs).map((sp) => {
    let t = esc(sp.text).replace(/\n/g, '<br>').replace(/\t/g, ' ');
    if (isCode(sp)) t = `<code>${t}</code>`;
    if (sp.b) t = `<strong>${t}</strong>`;
    if (sp.i) t = `<em>${t}</em>`;
    if (sp.u && !sp.link) t = `<u>${t}</u>`;
    if (sp.s) t = `<s>${t}</s>`;
    if (sp.va === 'sup' || sp.va === 'sub') t = `<${sp.va}>${t}</${sp.va}>`;
    if (sp.color && /^#[0-9a-f]{6}$/i.test(sp.color) && sp.color.toLowerCase() !== '#000000') t = `<span style="color:${sp.color}">${t}</span>`;
    if (sp.link && safeLink(sp.link)) t = `<a href="${esc(sp.link.trim())}">${t}</a>`;
    return t;
  });
  return html.join('') + pics.join('');
}
const align = (p) => (p.props && ['center', 'right', 'justify'].includes(p.props.align) ? ` style="text-align:${p.props.align}"` : '');

function table(t, doc) {
  const out = ['<table>'];
  t.rows.forEach((r, ri) => {
    out.push('<tr>');
    let col = 0;
    for (const c of r.cells) {
      const span = c.span || 1;
      if (c.vmerge !== 'continue') {
        let rows = 1;
        if (c.vmerge === 'restart') while (t.rows[ri + rows] && cellAt(t.rows[ri + rows], col)?.vmerge === 'continue') rows++;
        const tag = r.header ? 'th' : 'td';
        out.push(`<${tag}${span > 1 ? ` colspan="${span}"` : ''}${rows > 1 ? ` rowspan="${rows}"` : ''}>${blocks(c.blocks || [], doc).join('')}</${tag}>`);
      }
      col += span;
    }
    out.push('</tr>');
  });
  out.push('</table>');
  return out.join('');
}
function cellAt(row, col) {
  let at = 0;
  for (const c of row.cells) { if (at === col) return c; at += c.span || 1; if (at > col) return null; }
  return null;
}
const ordered = (doc, id) => ((doc.lists && doc.lists[id] && doc.lists[id].kind) || (id === 'num' ? 'number' : 'bullet')) !== 'bullet';

/** The HTML of a list of blocks. Consecutive list paragraphs become nested <ul>/<ol>; consecutive Code paragraphs one <pre>. */
function blocks(list, doc) {
  const out = [], stack = [];   // open lists: { tag, lvl }; a whole list is one entry of out
  const add = (s) => { if (stack.length && out.length) out[out.length - 1] += s; else out.push(s); };
  const close = (lvl) => { while (stack.length && stack[stack.length - 1].lvl >= lvl) { add(`</li></${stack[stack.length - 1].tag}>`); stack.pop(); } };
  let code = null;
  const endCode = () => { if (code) { out.push(`<pre><code>${code.join('\n')}</code></pre>`); code = null; } };
  for (const b of list) {
    if (b.type === 'p' && b.style === 'Code') { close(0); (code = code || []).push(esc(spans(b.runs).map((s) => s.text).join(''))); continue; }
    endCode();
    if (b.type === 'table') { close(0); out.push(table(b, doc)); continue; }
    if (b.type !== 'p') continue;
    const l = b.props && b.props.list, body = inline(b);
    if (l) {
      const lvl = Math.max(0, Math.min(8, l.lvl || 0)), tag = ordered(doc, l.id) ? 'ol' : 'ul';
      close(lvl + 1);
      const top = stack[stack.length - 1];
      if (top && top.lvl === lvl && top.tag !== tag) close(lvl);
      if (stack.length && stack[stack.length - 1].lvl === lvl) add('</li>');
      else { while (!stack.length || stack[stack.length - 1].lvl < lvl) { const at = stack.length ? stack[stack.length - 1].lvl + 1 : lvl; add(`<${tag}>`); stack.push({ tag, lvl: at }); if (at < lvl) add('<li>'); } }
      add(`<li dir="auto"${align(b)}>${body}`);
      continue;
    }
    close(0);
    if (!body) continue;
    const tag = TAG[b.style] || (b.style === 'Quote' ? 'blockquote' : 'p');
    const cls = b.style === 'Title' ? ' class="title"' : b.style === 'Subtitle' ? ' class="subtitle"' : '';
    out.push(`<${tag}${cls} dir="auto"${align(b)}>${body}</${tag}>`);
  }
  endCode();
  close(0);
  return out;
}

const CSS = 'body{font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:46em;margin:2em auto;padding:0 1em;color:#1a1a1a;background:#fff}' +
  'table{border-collapse:collapse;margin:1em 0}th,td{border:1px solid #999;padding:.3em .6em;vertical-align:top;text-align:start}th{background:#f2f2f2}' +
  'blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #ccc;color:#444}pre{background:#f5f5f5;padding:.8em;overflow:auto}.subtitle{color:#595959;font-size:1.2em}img{max-width:100%}';

export function toHtml(doc, { title = '', standalone = true, lang = '' } = {}) {
  const body = blocks(doc.blocks || [], doc).join('\n');
  if (!standalone) return body + '\n';
  const name = title || (doc.meta && doc.meta.title) || 'Document';
  return `<!doctype html>\n<html${lang ? ` lang="${esc(lang)}"` : ''}>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>${esc(name)}</title>\n<style>${CSS}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}
