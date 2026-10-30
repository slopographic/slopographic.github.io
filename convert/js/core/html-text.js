/* HTML → plain text with line breaks at block elements, list bullets and tab-separated table cells.
 * Scripts, styles and the head are dropped. Browser only (DOMParser). */
const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'TR', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'NAV', 'HR', 'DL', 'DT', 'DD', 'FIGURE']);

export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  doc.querySelectorAll('script, style, noscript, template, head, svg').forEach((n) => n.remove());
  let out = '';
  const walk = (node) => {
    if (node.nodeType === 3) { out += node.nodeValue; return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (tag === 'BR') { out += '\n'; return; }
    if (tag === 'HR') { out += '\n----\n'; return; }
    const block = BLOCK.has(tag) || tag === 'LI';
    if (block) out += '\n';
    if (tag === 'LI') out += '- ';
    if (tag === 'TD' || tag === 'TH') out += '\t';
    for (const c of node.childNodes) walk(c);
    if (block) out += '\n';
  };
  walk(doc.body);
  const lines = out.split('\n').map((l) => l.replace(/[  \t]+/g, (m) => (m.includes('\t') ? '\t' : ' ')).replace(/^[ \t]+|[ \t]+$/g, ''));
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
