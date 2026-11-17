/* Slop Docs — model/hf: headers and footers as editable text. The document keeps them as blocks (doc.header.default,
 * doc.header.first, doc.footer.default, doc.footer.first; section.differentFirst), laid out on every page by
 * layout/index.js with the page number and page count fields filled in per page. The editor shows each area as lines
 * of text where {page} and {pages} stand for the two fields. Pure, no DOM.
 *   hfText(blocks) → { text, align }        hfBlocks(text, { align, marks }) → blocks ([] for an empty area)
 *   applyHF(doc, { header, footer, headerFirst, footerFirst, differentFirst, headerGap, footerGap }) → a new doc
 *     (each area is { text, align }; an area left out keeps its blocks; an unchanged text keeps its formatting) */
import { para, OBJ } from './doc.js';

export const FIELDS = { page: '{page}', pages: '{pages}' };
const TOKEN = /(\{page\}|\{pages\})/;

export function hfText(blocks) {
  const lines = [];
  let align = 'center';
  (blocks || []).forEach((b, i) => {
    if (b.type !== 'p') return;
    if (i === 0 || !lines.length) align = (b.props && b.props.align) || 'left';
    lines.push((b.runs || []).map((r) => (r.obj === 'field' ? FIELDS[r.f] || '' : r.obj ? '' : r.text)).join(''));
  });
  return { text: lines.join('\n'), align: lines.length ? align : 'center' };
}

/** The marks the text of an area is set in: the first text run's, or 10 pt grey for a new area. */
function marksOf(blocks) {
  for (const b of blocks || []) for (const r of b.runs || []) if (!r.obj) { const { text, ...m } = r; return m; }
  return { size: 10, color: '#555555' };
}

export function hfBlocks(text, { align = 'center', marks = { size: 10, color: '#555555' } } = {}) {
  const src = String(text || '').replace(/\r\n?/g, '\n');
  if (!src.trim()) return [];
  return src.split('\n').map((line) => {
    const p = para('', 'Normal', { align, after: 0, before: 0 }, marks);
    p.runs = line.split(TOKEN).filter((s) => s !== '').map((s) => (s === FIELDS.page ? { ...marks, obj: 'field', f: 'page', text: OBJ }
      : s === FIELDS.pages ? { ...marks, obj: 'field', f: 'pages', text: OBJ } : { ...marks, text: s }));
    if (p.runs.length) p.rm = undefined;
    return p;
  });
}

function area(old, next) {
  if (!next) return old || [];
  const cur = hfText(old);
  if (cur.text === next.text && cur.align === (next.align || cur.align)) return old || [];
  return hfBlocks(next.text, { align: next.align || 'center', marks: marksOf(old) });
}

export function applyHF(doc, o) {
  const header = { default: area(doc.header.default, o.header), first: area(doc.header.first, o.headerFirst) };
  const footer = { default: area(doc.footer.default, o.footer), first: area(doc.footer.first, o.footerFirst) };
  const margin = { ...doc.section.margin };
  if (Number.isFinite(o.headerGap)) margin.header = Math.max(0, o.headerGap);
  if (Number.isFinite(o.footerGap)) margin.footer = Math.max(0, o.footerGap);
  const section = { ...doc.section, margin, differentFirst: o.differentFirst === undefined ? !!doc.section.differentFirst : !!o.differentFirst };
  return { ...doc, header, footer, section, meta: { ...doc.meta, modified: Date.now() } };
}

/** Whether the document shows anything above or below its pages' text. */
export const hasHF = (doc) => ['default', 'first'].some((k) => (doc.header[k] || []).length || (doc.footer[k] || []).length);
