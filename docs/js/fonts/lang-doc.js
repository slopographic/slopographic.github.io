/* Slop Docs — fonts/lang-doc: the language fonts a document needs, and getting them through SlopFontJIT.
 *   langNeeds(doc) → Map pack → { bold, chars }   the packs for characters the document's own faces cannot set
 *   ensureDocLang(doc, { force }) → Promise<boolean>   asks (once per pack, unless the person chose "automatically"),
 *     downloads, and adds each face (fonts/lang.js); true when every needed face is ready. A pack the person declined is
 *     not asked about again until force (File ▸ Download PDF asks again). */
import { docBlocks, paraText } from '../model/doc.js';
import { runMarks } from '../model/styles.js';
import { familyOf, loadFace, defaultHan } from './registry.js';
import { addLangFace, hasPack, packOf } from './lang.js';

const LANG = { sc: 'zh-CN', tc: 'zh-TW', jp: 'ja', kr: 'ko' };
const declined = new Set();
const NON_LATIN = /[^\u0000-\u024f\u2000-\u206f\u20a0-\u20cf\u2100-\u214f\u2190-\u23ff\u25a0-\u27bf]/;

/** Quick test: could this document need a language font at all? */
export function mayNeedLang(doc) {
  for (const b of docBlocks(doc)) if (b.type === 'p' && NON_LATIN.test(paraText(b))) return true;
  return false;
}

export async function langNeeds(doc) {
  const need = new Map(), S = globalThis.SlopScripts;
  if (!S) return need;
  for (const b of docBlocks(doc)) {
    if (b.type !== 'p') continue;
    const text = paraText(b);
    if (!NON_LATIN.test(text)) continue;
    const han = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(text) ? S.hanFor(text, globalThis.navigator && navigator.language) : defaultHan();
    for (const r of b.runs || []) {
      if (r.obj || !NON_LATIN.test(r.text)) continue;
      const m = runMarks(doc, b, r);
      let f = null;
      try { f = await loadFace(familyOf(m.font), !!m.b, !!m.i); } catch (e) { /* not loadable: every character counts as missing */ }
      for (const ch of r.text) {
        const cp = ch.codePointAt(0);
        if (cp < 0x80 || (f && f.ttf.has(cp))) continue;
        const pack = packOf(cp, han);
        if (!pack) continue;
        const n = need.get(pack) || { bold: false, chars: '', han };
        n.bold = n.bold || !!m.b;
        if (!n.chars.includes(ch)) n.chars += ch;
        need.set(pack, n);
      }
    }
  }
  return need;
}

let running = null;
export function ensureDocLang(doc, opts = {}) {
  if (running) return running.then(() => ensureDocLang(doc, opts));
  running = run(doc, opts).finally(() => { running = null; });
  return running;
}
async function run(doc, { force = false } = {}) {
  const J = globalThis.SlopFontJIT;
  if (!J || !mayNeedLang(doc)) return true;
  await J.deps();
  const need = await langNeeds(doc);
  const missing = [...need].filter(([pack, n]) => !hasPack(pack, false) || (n.bold && !hasPack(pack, true)));
  if (!missing.length) return true;
  // SlopFontJIT picks the Chinese pack from the text and a language tag: one call per variant
  const groups = new Map();
  let all = true;
  for (const [pack, n] of missing) {
    if (!force && declined.has(pack)) { all = false; continue; }
    const g = groups.get(n.han) || { chars: '', packs: [] };
    g.chars += n.chars; g.packs.push(pack);
    groups.set(n.han, g);
  }
  for (const [han, g] of groups) {
    const ok = await J.ready(g.chars, null, { lang: LANG[han] || (globalThis.navigator && navigator.language) });
    if (!ok) { for (const p of g.packs) declined.add(p); all = false; continue; }
    for (const pack of g.packs) {
      declined.delete(pack);
      try {
        if (!hasPack(pack, false)) { const b = await J.bytes(pack, { bold: false }); if (b) await addLangFace(pack, false, b); else all = false; }
        if (need.get(pack).bold && !hasPack(pack, true)) { const b = await J.bytes(pack, { bold: true }); if (b) await addLangFace(pack, true, b); }
      } catch (e) { console.warn('Slop Docs: the ' + pack + ' font could not be read: ' + e.message); all = false; }
    }
  }
  return all;
}
