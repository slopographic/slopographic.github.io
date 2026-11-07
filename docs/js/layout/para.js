/* Slop Docs — layout/para: lay out one paragraph at a width (cached per block object, width and
 * dynamic context such as its list label or page-number fields). */
import { atomsOf, styleFor } from './atoms.js';
import { breakLines } from './lines.js';
import { paraProps } from '../model/styles.js';
import { paraText } from '../model/doc.js';
import { paraRtl } from './bidi.js';

const cache = new WeakMap();
export function clearParaCache() { /* WeakMap entries die with their blocks; fonts loading call this */ gen++; }
let gen = 0;

const hasDynamic = (p) => (p.runs || []).some((r) => r.obj === 'field' || r.obj === 'fn');

/** Effective paragraph properties (style cascade + list indents). */
export function resolvedProps(doc, p) {
  const P = paraProps(doc, p);
  if (P.list && doc.lists[P.list.id]) {
    const L = doc.lists[P.list.id].levels[P.list.lvl || 0] || doc.lists[P.list.id].levels[0];
    if (!p.props || p.props.indL === undefined) P.indL = L.indent;
    if (!p.props || p.props.indF === undefined) P.indF = -L.hanging;
  }
  return P;
}

/**
 * Lay out a paragraph. ctx: { label: string|null, field(f), fnLabel(id), widthAt, startAt, first, key }
 * Returns { lines, P, atoms }.
 */
export function layoutPara(doc, p, width, ctx = {}) {
  const dyn = hasDynamic(p);
  const key = `${gen}|${width.toFixed(2)}|${ctx.label || ''}|${dyn ? ctx.key || '' : ''}`;
  const canCache = !ctx.widthAt && !ctx.startAt && !ctx.pending;
  if (canCache) {
    const m = cache.get(p);
    if (m && m.key === key && m.doc === doc.styles && m.lists === doc.lists) return m.out;
  }
  const P = resolvedProps(doc, p);
  // a right-to-left paragraph is laid out from the right (bidi.js mirrors the line): its default alignment is the start
  // (the right), and an alignment set on the paragraph keeps its visual meaning
  P.rtl = paraRtl(paraText(p));
  if (P.rtl && p.props && (p.props.align === 'left' || p.props.align === 'right')) P.align = p.props.align === 'left' ? 'right' : 'left';
  const atoms = ctx.atoms || atomsOf(doc, p, ctx);
  const first = (p.runs || [])[0];
  P.emptyStyle = styleFor(doc, p, first && !first.obj ? first : (p.rm || {}));
  let label = null;
  if (ctx.label) {
    const st = styleFor(doc, p, { ...(first && !first.obj ? first : p.rm || {}), u: false, s: false, link: undefined, hl: undefined, va: undefined });
    label = { text: ctx.label, st };
  }
  const lines = breakLines(atoms, P, { width, label, widthAt: ctx.widthAt, startAt: ctx.startAt, pending: ctx.pending, first: ctx.first, paraStart: 0 });
  const out = { lines, P, atoms };
  if (canCache) cache.set(p, { key, doc: doc.styles, lists: doc.lists, out });
  return out;
}
