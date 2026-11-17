/* Slop Docs — layout/index: layoutDoc(doc) → { pages, headings, W, H }. One layout model feeds the
 * on-screen SVG pages, hit-testing, printing and the PDF writer, so they always agree.
 * page = { index, num, w, h, kind first|default, body { top, bottom, x, w }, items, fns }
 * items: line { story, path, pid, x, y, line } · rect · rule · img · cell (table cell box for hit-testing) */
import { pageSize, paraText } from '../model/doc.js';
import { headingLevel } from '../model/styles.js';
import { numberDoc } from './numbering.js';
import { flowBody } from './paginate.js';
import { flowStatic, shift } from './blocks.js';

const tocCache = new Map();
function tocPara(text, level, page, pid, width) {
  const k = `${text}|${level}|${page}|${pid}|${width}`;
  if (!tocCache.has(k)) {
    if (tocCache.size > 2000) tocCache.clear();
    tocCache.set(k, { type: 'p', id: 'toc-' + pid, style: 'Normal', toc: true, props: { indL: (level - 1) * 18, after: 3, tabs: [{ pos: width, align: 'right', leader: 'dot' }] },
      runs: [{ text, link: '#' + pid, color: '#000000', u: false }, { text: '\t' }, { text: String(page) }] });
  }
  return tocCache.get(k);
}
const TOC_TITLE = { type: 'p', id: 'toc-title', style: 'Normal', toc: true, props: { after: 8 }, runs: [{ text: 'Contents', size: 16, b: true }] }; // i18n-ignore: text written into the document (TOC title)

/** Headings of the body in order (for the outline, the TOC and PDF bookmarks). */
export function scanHeadings(doc) {
  const out = [];
  doc.blocks.forEach((b, i) => { if (b.type === 'p' && headingLevel(b.style)) out.push({ level: headingLevel(b.style), text: paraText(b).replace(/￼/g, '').trim(), pid: b.id, path: [i] }); });
  return out;
}

export function layoutDoc(doc, { tocPages } = {}) {
  const sec = doc.section, [W, H] = pageSize(sec), m = sec.margin;
  const bw = W - m.left - m.right;
  const L = { doc, pages: [], headings: [], num: numberDoc(doc), bx: m.left, bw, y: 0, floats: [], fnH: 0, fnIds: [] };
  const fnFirst = new WeakMap();
  const fnBlocks = (id) => {
    const list = doc.footnotes[id] || [];
    if (!list.length) return list;
    if (!fnFirst.has(list[0])) fnFirst.set(list[0], { ...list[0], props: { ...list[0].props, indL: 14, indF: -14 } });
    const first = fnFirst.get(list[0]);
    L.num.labels.set(first, String(L.num.fns.get(id) || '*'));
    return [first, ...list.slice(1)];
  };
  const fnH = new Map();
  L.fnBlockH = (id) => { if (!fnH.has(id)) fnH.set(id, flowStatic(L, fnBlocks(id), bw, 'fn.' + id, []).h + 2); return fnH.get(id); };
  // header / footer heights (with placeholder field values) decide the body box
  const hf = (kind) => ({ hdr: doc.header[kind] || [], ftr: doc.footer[kind] || [] });
  const heights = {};
  for (const kind of ['default', 'first']) {
    L.field = (f) => (f === 'pages' ? '99' : '9');
    heights[kind] = { hdr: flowStatic(L, hf(kind).hdr, bw, 'header.' + kind, []).h, ftr: flowStatic(L, hf(kind).ftr, bw, 'footer.' + kind, []).h };
  }
  L.makePage = (i) => {
    const kind = sec.differentFirst && i === 0 ? 'first' : 'default', hh = heights[kind];
    const top = Math.max(m.top, m.header + hh.hdr + 4), bottom = H - Math.max(m.bottom, m.footer + hh.ftr + 4);
    return { index: i, num: (sec.pageStart || 1) + i, w: W, h: H, kind, body: { top, bottom: Math.max(bottom, top + 72), x: m.left, w: bw }, items: [], fns: [] };
  };
  let tp = tocPages || new Map();
  L.tocBlocks = () => {
    const hs = scanHeadings(doc).filter((h) => h.level <= 3 && h.text);
    return { blocks: [TOC_TITLE, ...hs.map((h) => tocPara(h.text, h.level, tp.get(h.pid) ?? '…', h.pid, bw))] };
  };
  L.field = (f) => (f === 'pages' ? '99' : '9');
  flowBody(L);
  // a table of contents needs the final page numbers: lay out again until they settle
  const hasToc = doc.blocks.some((b) => b.type === 'toc');
  if (hasToc) {
    for (let pass = 0; pass < 3; pass++) {
      const got = new Map(L.headings.map((h) => [h.pid, (sec.pageStart || 1) + h.page]));
      if ([...got].every(([k, v]) => tp.get(k) === v) && got.size === tp.size) break;
      tp = got;
      L.pages = []; L.headings = []; L.force = false;
      flowBody(L);
    }
  }
  // headers, footers and footnotes per page, now that the page count is known
  const total = L.pages.length;
  for (const pg of L.pages) {
    L.field = (f) => String(f === 'pages' ? total + (sec.pageStart || 1) - 1 : pg.num);
    L.fieldKey = `${pg.num}/${total}`;
    const { hdr, ftr } = hf(pg.kind);
    if (hdr.length) for (const it of flowStatic(L, hdr, bw, 'header.' + pg.kind, []).items) pg.items.push(shift(it, m.left, m.header));
    if (ftr.length) { const f = flowStatic(L, ftr, bw, 'footer.' + pg.kind, []); for (const it of f.items) pg.items.push(shift(it, m.left, H - m.footer - f.h)); }
    if (pg.fns.length) {
      const hs = pg.fns.map((id) => L.fnBlockH(id)), tot = hs.reduce((a, b) => a + b, 0) + 14;
      let y = pg.body.bottom - tot;
      pg.items.push({ kind: 'rule', x1: m.left, y1: y + 6, x2: m.left + 144, y2: y + 6, w: 0.5, color: '#000000', fnsep: true });
      y += 14;
      pg.fns.forEach((id) => { const f = flowStatic(L, fnBlocks(id), bw, 'fn.' + id, []); for (const it of f.items) pg.items.push(shift(it, m.left, y)); y += f.h + 2; });
    }
    L.fieldKey = '';
  }
  return { pages: L.pages, headings: L.headings, W, H, tocPages: tp, fnNumbers: L.num.fns };
}
