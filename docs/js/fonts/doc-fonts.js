/* Slop Docs — fonts/doc-fonts: load every face a document's runs use (body, tables, headers, footers and footnotes),
 * with the style's marks applied, so the layout measures with the real faces. Used by the editor (bridge.js) and by
 * File convert (convert/js/core/doc-out.js, office.js), so both lay a document out the same way. */
import { docBlocks } from '../model/doc.js';
import { runMarks } from '../model/styles.js';
import { ensureFaces } from './registry.js';

export async function ensureDocFonts(doc) {
  const seen = new Map();
  for (const b of docBlocks(doc)) {
    if (b.type !== 'p') continue;
    for (const r of b.runs || []) {
      if (r.obj) continue;
      const m = runMarks(doc, b, r), k = `${m.font}|${!!m.b}|${!!m.i}`;
      if (!seen.has(k)) seen.set(k, { font: m.font, b: !!m.b, i: !!m.i });
    }
  }
  await ensureFaces([...seen.values()]);
}
