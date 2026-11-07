/* Slop Docs — model/build: blocks and whole documents from plain data, with the model's own makers (doc.js para and table,
 * styles.js lists, io/sdoc.js Markdown). Pure, so the assistant's commands (ui/ai-create.js), the headless operation
 * (shared/ops/create-docs.js) and the Node tests build the same document.
 *   outline = { title, subtitle, author, page: 'A4' | 'Letter' | 'Legal' | 'A5', landscape,
 *               blocks: [ { type: 'heading', text, level } | { type: 'paragraph', text, style, align }
 *                       | { type: 'bullets' | 'numbered', items: ['text' | { text, level }] } | { type: 'quote' | 'code', text }
 *                       | { type: 'table', rows: [[cell…]…], header: true } | { type: 'image', src (data URL), width, height, alt }
 *                       | { type: 'page_break' } ],
 *               sections: [{ heading, level, paragraphs: [..], bullets: [..], numbered: [..], table: { rows, header } }] }
 *   Markdown text works too (io/sdoc.js fromMarkdown), and so does JSON text of the outline.
 *     headingBlock(text, level)  paragraphBlocks(text, style, props)  listBlocks(items, 'bul' | 'num')
 *     tableBlock(rows, { header, width })  imageBlock(src, w, h, alt)  pageBreakBlock()
 *     blocksOf(item, width) → blocks for one outline item     withLists(doc) → the doc with the list definitions it uses
 *     parseOutline(input) → outline object                    buildDoc(input) → a new document */
import { newDoc, para, table, pageSize, OBJ, normalizeDoc } from './doc.js';
import { bulletList, numberList } from './styles.js';
import { fromMarkdown } from '../io/sdoc.js';

export const MAX_BLOCKS = 2000;
const str = (v, n = 20000) => (v == null ? '' : String(v)).slice(0, n);
const ALIGN = new Set(['left', 'center', 'right', 'justify']);

export function headingBlock(text, level = 1) {
  const l = Math.max(1, Math.min(6, Math.round(Number(level) || 1)));
  return para(str(text, 500).replace(/\s*\n\s*/g, ' '), 'H' + l);
}
/** One paragraph per line. */
export function paragraphBlocks(text, style = 'Normal', props = {}) {
  return str(text).split(/\r?\n/).map((t) => para(t, style, props));
}
export function listBlocks(items, id = 'bul') {
  return [].concat(items || []).map((it) => {
    const t = typeof it === 'object' && it ? str(it.text, 2000) : str(it, 2000);
    let lvl = typeof it === 'object' && it ? Number(it.level) || 0 : 0;
    const m = /^(\s*)/.exec(t);
    if (!lvl && m[1].length >= 2) lvl = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
    return para(t.trim().replace(/^[-*•]\s+/, ''), 'Normal', { list: { id, lvl: Math.max(0, Math.min(8, lvl)) } });
  }).filter((p) => p.runs.length);
}
/** A table from rows of cell texts; the first row is a header (bold, repeated on each page) unless header is false. */
export function tableBlock(rows, { header = true, width = 468 } = {}) {
  const list = [].concat(rows || []).map((r) => [].concat(r == null ? [] : r).map((c) => str(c, 2000)));
  const cols = Math.max(1, ...list.map((r) => r.length));
  if (!list.length) throw new Error('A table needs at least one row');
  const t = table(list.length, cols, width);
  t.rows = t.rows.map((row, r) => ({ ...row, header: !!header && r === 0,
    cells: row.cells.map((c, k) => ({ ...c, blocks: [para(list[r][k] || '', 'Normal', {}, header && r === 0 ? { b: true } : {})] })) }));
  return t;
}
export function imageBlock(src, w = 240, h = 160, alt = '') {
  const p = para('');
  p.runs = [{ text: OBJ, obj: 'img', src: String(src), w: Math.max(4, Number(w) || 240), h: Math.max(4, Number(h) || 160), alt: str(alt, 300), wrap: 'inline' }];
  p.rm = undefined;
  return p;
}
export function pageBreakBlock() { const p = para(''); p.runs = [{ text: OBJ, obj: 'pb' }]; p.rm = undefined; return p; }

/** Blocks for one outline item (see the header). width: the text column, for tables and images. */
export function blocksOf(item, width = 468) {
  if (typeof item === 'string') return paragraphBlocks(item);
  const it = item || {}, type = String(it.type || (it.items ? 'bullets' : it.rows ? 'table' : it.level ? 'heading' : 'paragraph')).toLowerCase();
  if (type === 'heading' || type === 'title' || type === 'subtitle') return [type === 'heading' ? headingBlock(it.text, it.level) : para(str(it.text, 500), type === 'title' ? 'Title' : 'Subtitle')];
  if (type === 'bullets' || type === 'list') return listBlocks(it.items, 'bul');
  if (type === 'numbered') return listBlocks(it.items, 'num');
  if (type === 'quote') return paragraphBlocks(it.text, 'Quote');
  if (type === 'code') return paragraphBlocks(it.text, 'Code');
  if (type === 'table') return [tableBlock(it.rows, { header: it.header !== false, width })];
  if (type === 'image') {
    const w = Math.min(width, Number(it.width) || width / 2);
    return [imageBlock(it.src, w, Number(it.height) || w * 0.66, it.alt)];
  }
  if (type === 'page_break' || type === 'pagebreak') return [pageBreakBlock()];
  const props = ALIGN.has(it.align) ? { align: it.align } : {};
  return paragraphBlocks(it.text, it.style || 'Normal', props);
}

/** The document with the bullet and number definitions its paragraphs use. */
export function withLists(doc) {
  const used = new Set();
  for (const b of doc.blocks) if (b.props && b.props.list) used.add(b.props.list.id);
  const lists = { ...doc.lists };
  if (used.has('bul') && !lists.bul) lists.bul = bulletList();
  if (used.has('num') && !lists.num) lists.num = numberList();
  return { ...doc, lists };
}

/** sections → blocks, for the outline's second shape. */
function sectionItems(sections) {
  const out = [];
  for (const s of [].concat(sections || [])) {
    if (!s) continue;
    if (s.heading) out.push({ type: 'heading', text: s.heading, level: s.level || 1 });
    for (const p of [].concat(s.paragraphs || (s.text ? [s.text] : []))) out.push({ type: 'paragraph', text: p });
    if (s.bullets) out.push({ type: 'bullets', items: s.bullets });
    if (s.numbered) out.push({ type: 'numbered', items: s.numbered });
    if (s.table) out.push({ type: 'table', rows: s.table.rows || s.table, header: s.table.header !== false });
    if (s.quote) out.push({ type: 'quote', text: s.quote });
  }
  return out;
}

export function parseOutline(input) {
  if (Array.isArray(input)) return { blocks: input };
  if (input && typeof input === 'object') return input;
  const s = str(input, 2e6).trim();
  if (!s) throw new Error('The outline is empty.');
  if (/^[[{]/.test(s)) {
    let j;
    try { j = JSON.parse(s); } catch (e) { throw new Error('The outline is not valid JSON: ' + e.message); }
    return parseOutline(j);
  }
  return { markdown: s };
}

export function buildDoc(input) {
  const o = parseOutline(input);
  const size = ['A4', 'Letter', 'Legal', 'A5'].find((k) => k.toLowerCase() === String(o.page || '').toLowerCase()) || 'A4';
  let doc;
  if (o.markdown) {
    doc = fromMarkdown(o.markdown);
    doc.section = { ...doc.section, size };
    const h = doc.blocks.find((b) => b.style === 'H1');
    doc.meta.title = h ? h.runs.map((r) => r.text).join('') : '';
  } else {
    doc = newDoc({ size });
    if (o.landscape) doc.section.orient = 'landscape';
    const [W] = pageSize(doc.section), width = W - doc.section.margin.left - doc.section.margin.right;
    const blocks = [];
    if (o.title) blocks.push(para(str(o.title, 500), 'Title'));
    if (o.subtitle) blocks.push(para(str(o.subtitle, 500), 'Subtitle'));
    for (const it of [].concat(o.blocks || [], sectionItems(o.sections))) { if (blocks.length >= MAX_BLOCKS) break; blocks.push(...blocksOf(it, width)); }
    doc.blocks = blocks.length ? blocks : [para()];
    doc.meta = { ...doc.meta, title: str(o.title, 200), author: str(o.author, 200) };
  }
  return normalizeDoc(withLists(doc));
}
