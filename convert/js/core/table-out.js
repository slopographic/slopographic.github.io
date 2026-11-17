/* A table (rows of cells, from parseCsv in csv.js) written as a Markdown table or an HTML table. Pure (no DOM).
 *   rowsToMarkdown(rows, { header, align }) -> text   GitHub pipe table. header false: the columns are named Column 1, 2 …
 *                                                     align 'auto' right-aligns a column whose cells are all numbers.
 *                                                     | in a cell is escaped and a line break becomes <br>.
 *   rowsToHtml(rows, { header, standalone, title }) -> text   <table> with <thead> (header true) and <tbody>; standalone
 *                                                     wraps it in a small page with readable borders */
import { tr } from './i18n.js';
const width = (rows) => rows.reduce((n, r) => Math.max(n, r.length), 0);
const pad = (r, n) => Array.from({ length: n }, (_, i) => (r[i] ?? ''));
const NUM = /^[-+]?(\d{1,3}([,\s]\d{3})*|\d+)([.,]\d+)?%?$/;
export const isNumberCell = (s) => NUM.test(String(s).trim());

function split(rows, header) {
  const clean = rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  if (!clean.length) throw new Error(tr('convert.table.empty'));
  const n = width(clean);
  const head = header ? pad(clean[0], n).map((c, i) => String(c).trim() || `Column ${i + 1}`) : Array.from({ length: n }, (_, i) => `Column ${i + 1}`); // i18n-ignore: written into the table file
  return { head, body: (header ? clean.slice(1) : clean).map((r) => pad(r, n)) };
}

const mdCell = (s) => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, '<br>').trim();

export function rowsToMarkdown(rows, { header = true, align = 'auto' } = {}) {
  const { head, body } = split(rows, header);
  const right = head.map((_, i) => align === 'auto' && body.length > 0 && body.every((r) => String(r[i]).trim() === '' || isNumberCell(r[i])) && body.some((r) => String(r[i]).trim() !== ''));
  const line = (cells) => `| ${cells.map(mdCell).join(' | ')} |`;
  return [line(head), `| ${head.map((_, i) => (right[i] ? '---:' : '---')).join(' | ')} |`, ...body.map(line)].join('\n') + '\n';
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const htmlCell = (s) => esc(s).replace(/\r\n|\r|\n/g, '<br>');
const PAGE_CSS = 'body{font-family:system-ui,sans-serif;margin:24px;color:#111;background:#fff}table{border-collapse:collapse}'
  + 'th,td{border:1px solid #bbb;padding:4px 8px;text-align:left;vertical-align:top}th{background:#f0f0f0}';

export function rowsToHtml(rows, { header = true, standalone = true, title = 'Table' } = {}) { // i18n-ignore: written into the table file
  const { head, body } = split(rows, header);
  const tr = (cells, tag) => `    <tr>${cells.map((c) => `<${tag}>${htmlCell(c)}</${tag}>`).join('')}</tr>\n`;
  const table = `<table>\n${header ? `  <thead>\n${tr(head, 'th')}  </thead>\n` : ''}  <tbody>\n${body.map((r) => tr(r, 'td')).join('')}  </tbody>\n</table>\n`;
  if (!standalone) return table;
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n<style>${PAGE_CSS}</style>\n</head>\n<body>\n${table}</body>\n</html>\n`;
}
