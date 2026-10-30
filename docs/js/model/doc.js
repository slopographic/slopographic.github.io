/* Slop Docs — model/doc: the document schema. Everything is plain JSON (the .sdoc file is this object).
 * Units are points. Blocks are treated as immutable: edits copy the path they change, so undo
 * snapshots and the layout cache can share unchanged blocks.
 *
 * doc = { v, meta, section, styles, lists, media, blocks, header, footer, footnotes, comments }
 * paragraph = { type: 'p', id, style, props, runs: [run], rm }   rm = marks for typing in an empty paragraph
 *   props: align left|center|right|justify, indL, indR, indF (first line; negative = hanging),
 *          before, after, line (multiple) | lineExact | lineAtLeast, keepNext, keepLines, pageBreakBefore,
 *          widow (default true), list { id, lvl }, tabs [{ pos, align left|center|right|decimal, leader none|dot|dash|line }],
 *          shade '#rrggbb', borderBottom { w, color }, borderTop, borderLeft, borderRight
 * run = { text, font, size, b, i, u, s, color, hl, va sup|sub, link, cm }
 *   objects use text '￼' and obj: img { src, w, h, alt, wrap inline|left|right } | field { f page|pages }
 *   | fn { id } (footnote reference) | pb (page break). '\t' is a tab, '\n' a line break.
 * table = { type: 'table', id, cols: [pt], rows: [{ header, cells: [{ blocks, span, vmerge restart|continue, shade, valign }] }],
 *   border { w, color } | null, align left|center }
 * toc = { type: 'toc', id, levels }   (a table of contents, filled in by the layout from the headings) */
export const OBJ = '￼';
let seq = 0;
export const uid = (p = 'b') => p + Date.now().toString(36).slice(-5) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

export const PAGE = { A4: [595.28, 841.89], Letter: [612, 792], Legal: [612, 1008], A5: [419.53, 595.28] };
export function defaultSection(size = 'Letter') {
  return { size, orient: 'portrait', margin: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 }, differentFirst: false, pageStart: 1, columns: 1 };
}
/** Page size [w, h] in points for a section. */
export function pageSize(sec) {
  const s = sec.size && typeof sec.size === 'object' ? [sec.size.w, sec.size.h] : (PAGE[sec.size] || PAGE.Letter);
  const [a, b] = [Math.min(s[0], s[1]), Math.max(s[0], s[1])];
  return sec.orient === 'landscape' ? [b, a] : [a, b];
}

export function para(text = '', style = 'Normal', props = {}, marks = {}) {
  return { type: 'p', id: uid(), style, props: { ...props }, runs: text ? [{ ...marks, text }] : [], rm: text ? undefined : (Object.keys(marks).length ? { ...marks } : undefined) };
}
export const run = (text, marks = {}) => ({ ...marks, text });
export function table(rows, cols, width = 468) {
  const cw = width / cols;
  return { type: 'table', id: uid('t'), cols: Array(cols).fill(cw), border: { w: 0.5, color: '#000000' },
    rows: Array.from({ length: rows }, (_, r) => ({ header: false, cells: Array.from({ length: cols }, () => ({ blocks: [para()] })) })) };
}

export function newDoc({ size = 'Letter' } = {}) {
  return {
    v: 1,
    meta: { title: '', author: '', created: Date.now(), modified: Date.now() },
    section: defaultSection(size),
    styles: {},
    lists: {},
    media: {},
    blocks: [para()],
    header: { default: [], first: [] },
    footer: { default: [], first: [] },
    footnotes: {},
    comments: {},
  };
}

/** Fill in missing fields (old files, imports) and make sure every block has an id. */
export function normalizeDoc(d) {
  const base = newDoc();
  const out = { ...base, ...d };
  out.meta = { ...base.meta, ...(d.meta || {}) };
  out.section = { ...base.section, ...(d.section || {}), margin: { ...base.section.margin, ...((d.section || {}).margin || {}) } };
  for (const k of ['styles', 'lists', 'media', 'footnotes', 'comments']) out[k] = { ...(d[k] || {}) };
  out.header = { default: fixBlocks((d.header || {}).default || []), first: fixBlocks((d.header || {}).first || []) };
  out.footer = { default: fixBlocks((d.footer || {}).default || []), first: fixBlocks((d.footer || {}).first || []) };
  out.blocks = fixBlocks(d.blocks || []);
  if (!out.blocks.length || out.blocks[out.blocks.length - 1].type !== 'p') out.blocks.push(para());
  for (const k of Object.keys(out.footnotes)) out.footnotes[k] = fixBlocks(out.footnotes[k]);
  return out;
}
function fixBlocks(list) {
  return list.map((b) => {
    if (!b || typeof b !== 'object') return para();
    if (b.type === 'table') {
      const rows = (b.rows || []).map((r) => ({ ...r, cells: (r.cells || []).map((c) => ({ ...c, blocks: c.blocks && c.blocks.length ? fixBlocks(c.blocks) : [para()] })) }));
      return { ...b, id: b.id || uid('t'), rows, cols: b.cols && b.cols.length ? b.cols : [468] };
    }
    if (b.type === 'toc') return { ...b, id: b.id || uid('c') };
    return { type: 'p', ...b, id: b.id || uid(), style: b.style || 'Normal', props: b.props || {}, runs: (b.runs || []).filter((r) => r && typeof r.text === 'string' && r.text.length) };
  });
}

/** Plain text of a paragraph (objects are U+FFFC). */
export const paraText = (p) => (p.runs || []).map((r) => r.text).join('');
export const paraLen = (p) => (p.runs || []).reduce((n, r) => n + r.text.length, 0);

/** Every run style that appears anywhere (for font preloading). */
export function* allBlocks(list) {
  for (const b of list || []) {
    yield b;
    if (b.type === 'table') for (const r of b.rows) for (const c of r.cells) yield* allBlocks(c.blocks);
  }
}
export function* docBlocks(doc) {
  yield* allBlocks(doc.blocks);
  for (const k of ['default', 'first']) { yield* allBlocks(doc.header[k]); yield* allBlocks(doc.footer[k]); }
  for (const k of Object.keys(doc.footnotes || {})) yield* allBlocks(doc.footnotes[k]);
}
/** Plain text of the whole body (paragraphs joined by \n). */
export function docText(doc) {
  const out = [];
  for (const b of allBlocks(doc.blocks)) if (b.type === 'p') out.push(paraText(b).replace(/￼/g, ''));
  return out.join('\n');
}
export function wordCount(doc) {
  const t = docText(doc);
  const words = (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length;
  return { words, chars: t.replace(/\n/g, '').length, charsNoSpaces: t.replace(/\s/g, '').length, paras: t.split('\n').filter((x) => x.trim()).length };
}
