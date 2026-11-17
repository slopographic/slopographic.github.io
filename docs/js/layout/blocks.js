/* Slop Docs — layout/blocks: turning laid-out paragraph lines into page items, and a "static" flow
 * (no page breaks) used for table cells, headers, footers and footnotes. */
import { layoutPara } from './para.js';
import { layoutTable } from './table.js';
import { headingLevel } from '../model/styles.js';
import { paraText } from '../model/doc.js';

/** Context for paragraph layout (labels, fields, footnote numbers). */
export function paraCtx(L, p, extra = {}) {
  return { label: L.num.labels.get(p) || null, fnLabel: (id) => String(L.num.fns.get(id) || '*'), field: L.field || (() => '#'), key: L.fieldKey || '', ...extra };
}

/**
 * Items for lines [k, k+n) of a laid-out paragraph placed with its first line top at y.
 * Returns the y after the last line.
 */
export function emitLines(L, out, info, k, n, x, y, w, story, path, p) {
  const { lines, P } = info;
  const y0 = y;
  for (let j = k; j < k + n; j++) {
    const ln = lines[j];
    out.push({ kind: 'line', story, path, pid: p.id, x, y, line: ln, first: j === 0, last: j === lines.length - 1 });
    for (const f of ln.frags) if (f.kind === 'img' && f.run && f.run.src) out.push({ kind: 'img', x: x + f.x, y: y + ln.baseline - f.h, w: f.w, h: f.h, src: f.run.src, story, path, off: f.start, inline: true });
    y += ln.h;
  }
  const L0 = x + (P.indL || 0) + Math.min(0, P.indF || 0), R0 = x + w - (P.indR || 0);
  if (P.shade && n) out.unshift({ kind: 'rect', x: L0 - 3, y: y0, w: R0 - L0 + 6, h: y - y0, fill: P.shade, deco: true });
  if (P.borderLeft && n) out.push({ kind: 'rule', x1: L0 - 9, y1: y0, x2: L0 - 9, y2: y, w: P.borderLeft.w || 1, color: P.borderLeft.color || '#000' });
  if (P.borderTop && n && k === 0) out.push({ kind: 'rule', x1: L0, y1: y0, x2: R0, y2: y0, w: P.borderTop.w || 1, color: P.borderTop.color || '#000' });
  if (P.borderBottom && n && k + n === lines.length) out.push({ kind: 'rule', x1: L0, y1: y + 2, x2: R0, y2: y + 2, w: P.borderBottom.w || 1, color: P.borderBottom.color || '#000' });
  if (k === 0 && n && headingLevel(p.style) && L.headings && story === 'body' && path.length === 1) L.headings.push({ level: headingLevel(p.style), text: paraText(p).replace(/￼/g, '').trim(), page: L.pages ? L.pages.length - 1 : 0, y: y0, path, pid: p.id });
  return y;
}

/** Lay out blocks without page breaks at width w. Items are relative to (0, 0). Returns { items, h }. */
export function flowStatic(L, blocks, w, story, prefix) {
  const items = [];
  let y = 0;
  blocks.forEach((b, i) => {
    const path = [...prefix, i];
    if (b.type === 'table') {
      const T = layoutTable(L, b, w, story, path);
      for (const row of T.rows) { for (const it of row.items) items.push(shift(it, 0, y + row.y)); }
      y += T.h;
      return;
    }
    if (b.type !== 'p') return;
    const info = layoutPara(L.doc, b, w, paraCtx(L, b));
    y += i === 0 ? 0 : info.P.before || 0;
    y = emitLines(L, items, info, 0, info.lines.length, 0, y, w, story, path, b);
    y += info.P.after || 0;
  });
  return { items, h: y };
}

/** A copy of an item moved by (dx, dy). */
export function shift(it, dx, dy) {
  if (!dx && !dy) return it;
  if (it.kind === 'rule') return { ...it, x1: it.x1 + dx, x2: it.x2 + dx, y1: it.y1 + dy, y2: it.y2 + dy };
  return { ...it, x: it.x + dx, y: it.y + dy };
}
