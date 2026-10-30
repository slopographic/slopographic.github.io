/* SlopAIKit md: a small, safe Markdown renderer for chat replies (works on half-streamed text).
 * Classic script; adds SlopAIKit.md = { render(text) → HTML string, codeBlocks(text) → [{ lang, code, closed }] }.
 * Everything is escaped first; only http(s) links survive. Code blocks get a header with Copy (data-act="copy")
 * and, for HTML, Preview (data-act="preview"); the host page wires those buttons by event delegation. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);   // the words: shared/i18n/ui/<code>/ai.js
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = esc(s)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${esc(codes[+i])}</code>`);
  }

  function blocks(text) {
    const out = [], lines = text.split('\n');
    let para = [], list = null;
    const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
    const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
    for (const line of lines) {
      let m;
      if (!line.trim()) { flushPara(); flushList(); continue; }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flushPara(); flushList(); const n = Math.min(6, m[1].length + 2); out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushPara(); flushList(); out.push('<hr>'); continue; }
      if ((m = line.match(/^\s*>\s?(.*)$/))) { flushPara(); flushList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
      if ((m = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/))) {
        flushPara();
        const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push(m[2]); continue;
      }
      if (list && /^\s{2,}\S/.test(line)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
      flushList(); para.push(line);
    }
    flushPara(); flushList();
    return out.join('');
  }

  /** Split into prose and fenced code; an unclosed fence (still streaming) counts as code. */
  function codeBlocks(text) {
    const res = [], re = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)(```|$)/g;
    let m;
    while ((m = re.exec(text))) { res.push({ lang: (m[1] || '').toLowerCase(), code: m[2].replace(/\n$/, ''), closed: m[3] === '```', index: m.index, end: re.lastIndex }); if (!m[0]) re.lastIndex++; }
    return res;
  }

  function render(text) {
    text = String(text || '').replace(/\r\n?/g, '\n');
    const cbs = codeBlocks(text);
    let html = '', pos = 0, n = 0;
    for (const c of cbs) {
      html += blocks(text.slice(pos, c.index));
      const isHtml = c.lang === 'html' || (!c.lang && /^\s*<(!doctype|html)/i.test(c.code));
      html += `<div class="md-code" data-i="${n++}"><div class="md-code-h"><span>${esc(c.lang || T('ui.ai.md.code'))}</span>` +
        (isHtml && c.closed ? `<button type="button" data-act="preview">${esc(T('ui.ai.md.preview'))}</button>` : '') +
        `<button type="button" data-act="copy">${esc(T('ui.copy'))}</button></div><pre><code>${esc(c.code)}</code></pre></div>`;
      pos = c.end;
    }
    html += blocks(text.slice(pos));
    return html;
  }

  K.md = { render, codeBlocks, esc, inline };
})();
