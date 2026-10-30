/* Slop Docs — layout/numbering: list labels and footnote numbers in document order. */
import { allBlocks } from '../model/doc.js';
import { listLabel } from '../model/styles.js';
import { resolvedProps } from './para.js';

/** Map(paragraph → label text) for every list paragraph in the body, and Map(fnId → number). */
export function numberDoc(doc) {
  const labels = new Map(), fns = new Map(), counters = new Map();
  let fn = 0;
  const visit = (blocks) => {
    for (const b of allBlocks(blocks)) {
      if (b.type !== 'p') continue;
      for (const r of b.runs || []) if (r.obj === 'fn' && !fns.has(r.id)) fns.set(r.id, ++fn);
      const P = resolvedProps(doc, b);
      if (!P.list || !doc.lists[P.list.id]) continue;
      const def = doc.lists[P.list.id], lvl = Math.max(0, Math.min(8, P.list.lvl || 0));
      if (!counters.has(P.list.id)) counters.set(P.list.id, new Array(9).fill(0));
      const c = counters.get(P.list.id);
      for (let k = 0; k < lvl; k++) if (!c[k]) c[k] = (def.levels[k] || {}).start || 1;
      c[lvl] = c[lvl] ? c[lvl] + 1 : (def.levels[lvl] || {}).start || 1;
      for (let k = lvl + 1; k < 9; k++) c[k] = 0;
      labels.set(b, listLabel(def, lvl, c));
    }
  };
  visit(doc.blocks);
  for (const k of ['default', 'first']) { visit(doc.header[k]); visit(doc.footer[k]); }
  for (const id of Object.keys(doc.footnotes || {})) visit(doc.footnotes[id]);
  return { labels, fns };
}
