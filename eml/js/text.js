/* Slop EML: text helpers. Pure (no DOM). Classic script; exposes window.EmlText.
 *   htmlToText(html)        an HTML body reduced to text paragraphs: line breaks, list bullets and table cells kept,
 *                           links kept as "text (address)", images as [alt], scripts and styles dropped
 *   wrap(text, width, measure)  word wrap for one paragraph; a word longer than the width is broken by character
 *   decodeEntities(s)       the HTML entities an email uses (named and numeric) */
(function () {
  'use strict';
  const T = (window.EmlText = {});

  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·', euro: '€', pound: '£', yen: '¥', cent: '¢', times: '×', laquo: '«', raquo: '»', deg: '°', para: '¶', sect: '§' };
  /** Decodes &name; and &#n; / &#xh; entities. Unknown names are left as they are. */
  T.decodeEntities = function (s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : m;
      }
      const v = NAMED[e.toLowerCase()];
      return v === undefined ? m : v;
    });
  };

  const BLOCK = 'p|div|tr|h[1-6]|table|blockquote|ul|ol|section|article|header|footer|dl|dt|dd|pre|hr|address|center';
  /** HTML to text paragraphs. Output lines are trimmed; runs of blank lines collapse to one. */
  T.htmlToText = function (html) {
    let s = String(html || '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|head|title|noscript|template|xml)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<(script|style|head|title|noscript|template|xml)\b[^>]*\/?>/gi, '');
    s = s.replace(/[ \t\r\n\f]+/g, ' ');
    s = s.replace(/<a\b[^>]*?\bhref\s*=\s*["']?([^"'\s>]+)[^>]*>([\s\S]*?)<\/a\s*>/gi, (m, href, inner) => {
      const t = T.decodeEntities(inner.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      if (!/^(https?:|mailto:|tel:)/i.test(href)) return ' ' + t + ' ';
      const bare = href.replace(/^mailto:|^tel:/i, '');
      return t === '' || t === href || t === bare ? ' ' + (t || href) + ' ' : ' ' + t + ' (' + href + ') ';
    });
    s = s.replace(/<img\b[^>]*?\balt\s*=\s*["']([^"']+)["'][^>]*>/gi, ' [$1] ');
    s = s.replace(/<br\b[^>]*>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(new RegExp('</?(' + BLOCK + ')\\b[^>]*>', 'gi'), '\n')
      .replace(/<t[dh]\b[^>]*>/gi, '   ');
    s = T.decodeEntities(s.replace(/<[^>]+>/g, ''));
    const lines = s.replace(/ /g, ' ').split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
    const out = [];
    for (const l of lines) {
      if (l === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
      out.push(l);
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n');
  };

  /** Breaks a paragraph into lines no wider than width, as measured by measure(text). Keeps the paragraph's own spaces
   *  between words; a word wider than the line is split where it fills the line. Never returns an empty array. */
  T.wrap = function (text, width, measure) {
    const lines = [];
    const words = String(text).split(/ +/);
    let cur = '';
    const push = () => { lines.push(cur); cur = ''; };
    for (let w of words) {
      const next = cur === '' ? w : cur + ' ' + w;
      if (measure(next) <= width) { cur = next; continue; }
      if (cur !== '') { push(); }
      while (measure(w) > width && w.length > 1) {
        let k = w.length - 1;
        while (k > 1 && measure(w.slice(0, k)) > width) k--;
        lines.push(w.slice(0, k));
        w = w.slice(k);
      }
      cur = w;
    }
    lines.push(cur);
    return lines;
  };
})();
