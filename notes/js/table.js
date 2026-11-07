/* Markdown tables for Slop Notes: the Table block (a blank table of any size) and the paste of an HTML table (from a web
 * page or a spreadsheet). Pasted HTML is read with DOMParser, which builds an inert document (no script runs, no image
 * loads); nothing is put in with innerHTML. Colspan and rowspan are spread over a grid. The first row is the header,
 * because a Markdown table needs one. Bold, italic, strike, code and http links in a cell are kept. */

const BLOCK = /^(P|DIV|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE|TR|TD|TH|SECTION|ARTICLE|HEADER|FOOTER|DT|DD|TABLE|THEAD|TBODY|TFOOT)$/;
const MAX_SPAN = 50;

/** Wraps the text of s in a Markdown mark, keeping its outer spaces outside the mark. */
const wrap = (mark, s) => (s.trim() ? s.replace(/^(\s*)([\s\S]*?)(\s*)$/, (m, a, b, c) => a + mark + b + mark + c) : s);

/** The text of a node as Markdown on one line: block ends and <br> become spaces. */
function inlineOf(node) {
  let s = '';
  for (const c of node.childNodes) {
    if (c.nodeType === 3) { s += c.nodeValue; continue; }
    if (c.nodeType !== 1) continue;
    const t = c.tagName.toUpperCase();
    if (t === 'SCRIPT' || t === 'STYLE') continue;
    if (t === 'BR') { s += ' '; continue; }
    const inner = inlineOf(c);
    if (BLOCK.test(t)) s += ' ' + inner + ' ';
    else if (t === 'STRONG' || t === 'B') s += wrap('**', inner);
    else if (t === 'EM' || t === 'I') s += wrap('*', inner);
    else if (t === 'DEL' || t === 'S' || t === 'STRIKE') s += wrap('~~', inner);
    else if (t === 'CODE') s += wrap('`', inner);
    else if (t === 'A') {
      const h = (c.getAttribute('href') || '').trim();
      s += /^https?:\/\//i.test(h) && inner.trim() ? '[' + inner.trim().replace(/[[\]]/g, '') + '](' + h.replace(/[()\s]/g, encodeURIComponent) + ')' : inner;
    } else s += inner;
  }
  return s;
}

/** One cell: a single line, with pipes escaped as \| so they do not end the cell. */
const cellText = (td) => inlineOf(td).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');

/** 'left', 'right' or 'center' from the align attribute or text-align in the style; '' when none. */
export function alignOf(td) {
  const s = /text-align\s*:\s*(left|right|center)/i.exec(td.getAttribute('style') || '');
  const v = (s ? s[1] : td.getAttribute('align') || '').toLowerCase();
  return ['left', 'right', 'center'].includes(v) ? v : '';
}

const span = (v) => Math.max(1, Math.min(MAX_SPAN, parseInt(v, 10) || 1));

/** A Markdown table: head is the header cells, rows the body rows, aligns one of 'left' | 'right' | 'center' | '' per column. */
export function markdownTable(head, rows, aligns = []) {
  const line = (cells) => '| ' + cells.join(' | ') + ' |';
  const sep = head.map((_, j) => ({ left: ':---', right: '---:', center: ':---:' })[aligns[j]] || '---');
  return [line(head), line(sep), ...rows.map(line)].join('\n');
}

/** A blank table of rows under the header and cols columns (the Table block). */
export function blankTable(rows, cols) {
  const head = Array.from({ length: cols }, (_, j) => 'Column ' + (j + 1));
  return markdownTable(head, Array.from({ length: rows }, () => Array(cols).fill('')));
}

/** The Markdown of one <table> element, or '' when it has no rows. Rows of nested tables are left to the nested table. */
export function tableToMarkdown(table) {
  const rows = [...table.querySelectorAll('tr')].filter((tr) => tr.closest('table') === table);
  const grid = [];
  rows.forEach((tr, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    for (const td of [...tr.children].filter((x) => /^(TD|TH)$/i.test(x.tagName))) {
      while (grid[r][c] !== undefined) c++;
      const cs = span(td.getAttribute('colspan')), rs = span(td.getAttribute('rowspan'));
      const cell = { text: cellText(td), align: alignOf(td) };
      for (let dr = 0; dr < rs && r + dr < rows.length; dr++) {
        grid[r + dr] = grid[r + dr] || [];
        for (let dc = 0; dc < cs; dc++) grid[r + dr][c + dc] = dr === 0 && dc === 0 ? cell : { text: '', align: cell.align };
      }
      c += cs;
    }
  });
  const width = Math.max(0, ...grid.map((row) => row.length));
  if (!width) return '';
  const body = grid.map((row) => Array.from({ length: width }, (_, j) => (row[j] ? row[j].text : '')));
  const aligns = Array.from({ length: width }, (_, j) => grid.map((row) => row[j] && row[j].align).find(Boolean) || '');
  return markdownTable(body[0], body.slice(1), aligns);
}

/** The Markdown of every outermost table in an HTML string (clipboard HTML), in order. Parsed inertly with DOMParser. */
export function tablesFromHtml(html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  return [...doc.querySelectorAll('table')].filter((t) => !t.parentElement.closest('table')).map(tableToMarkdown).filter(Boolean);
}
