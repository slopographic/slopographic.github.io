/* Slop Docs — io/sdoc: the native .sdoc file (the document JSON), plus plain text and Markdown in and out.
 * .sdoc is normalizeDoc(JSON), so an older or hand-edited file still opens. Markdown import covers headings,
 * lists, quotes, code blocks, **bold**, *italic* and __underline__; Markdown export (md-out.js) writes those, links and tables. */
import { newDoc, normalizeDoc, para, uid, paraText, docText, docBlocks } from '../model/doc.js';
import { bulletList, numberList } from '../model/styles.js';

export const SDOC_MIME = 'application/x-slop-doc';
export const TXT_MIME = 'text/plain';
export const MD_MIME = 'text/markdown';

/** Serialise a document as a .sdoc blob. */
export function sdocBlob(doc) {
  const out = { ...doc, meta: { ...doc.meta, modified: Date.now() } };
  return new Blob([JSON.stringify(out)], { type: SDOC_MIME });
}
/** Read a .sdoc (JSON) string. Throws when it is not a document. */
export function readSdoc(text) {
  const d = JSON.parse(text);
  if (!d || typeof d !== 'object' || !Array.isArray(d.blocks)) throw new Error('Not a Slop Docs file');
  return normalizeDoc(d);
}

/** Plain text, one line per paragraph. Tables are flattened. */
export function toText(doc) {
  return docText(doc).replace(/￼/g, '');
}
/** Plain text → document, one paragraph per line. */
export function fromText(text) {
  const d = newDoc();
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  d.blocks = lines.map((l) => para(l));
  return d;
}

/* ---------- Markdown ---------- */
const HEAD = { 1: 'H1', 2: 'H2', 3: 'H3', 4: 'H4', 5: 'H5', 6: 'H6' };

/** Inline markdown → runs. Handles **bold**, __underline__, *italic*, `code` and backslash escapes. */
const ESCAPED = /\\([\\`*_[\]<>~#+\-.!|(){}])/g, HIDE = 0xe000;   // a backslash escape (md-out.js writes them)
export function mdRuns(s) {
  const hidden = String(s).replace(ESCAPED, (m, c) => String.fromCharCode(HIDE + c.charCodeAt(0)));
  return mdRunsRaw(hidden).map((r) => ({ ...r, text: r.text.replace(/[\ue000-\ue07f]/g, (c) => String.fromCharCode(c.charCodeAt(0) - HIDE)) }));
}
function mdRunsRaw(s) {
  const runs = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|`([^`]+)`)/g;
  let last = 0, m;
  const push = (text, marks) => { if (text) runs.push({ ...marks, text }); };
  while ((m = re.exec(s))) {
    push(s.slice(last, m.index), {});
    if (m[2] !== undefined) push(m[2], { b: true });
    else if (m[3] !== undefined) push(m[3], { u: true });
    else if (m[4] !== undefined) push(m[4], { i: true });
    else push(m[5], { font: 'Cousine', size: 10 });
    last = re.lastIndex;
  }
  push(s.slice(last), {});
  return runs;
}
/** Markdown text → document. */
export function fromMarkdown(text) {
  const d = newDoc();
  const out = [];
  let code = null;
  for (const raw of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(raw)) { if (code) { out.push(...code); code = null; } else code = []; continue; }
    if (code) { code.push(para(raw, 'Code')); continue; }
    if (!raw.trim()) continue;
    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(raw))) { const p = para(); p.style = HEAD[m[1].length] || 'H6'; p.runs = mdRuns(m[2]); out.push(p); continue; }
    if ((m = /^\s*[-*+]\s+(.*)$/.exec(raw))) { const p = para(); p.props = { list: { id: 'bul', lvl: 0 } }; p.runs = mdRuns(m[1]); out.push(p); continue; }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(raw))) { const p = para(); p.props = { list: { id: 'num', lvl: 0 } }; p.runs = mdRuns(m[1]); out.push(p); continue; }
    if ((m = /^>\s?(.*)$/.exec(raw))) { const p = para(); p.style = 'Quote'; p.runs = mdRuns(m[1]); out.push(p); continue; }
    const p = para(); p.runs = mdRuns(raw); out.push(p);
  }
  if (code) out.push(...code);
  d.blocks = out.map((p) => ({ ...p, id: uid(), runs: (p.runs || []).filter((r) => r.text) }));
  if (d.blocks.some((b) => b.props && b.props.list && b.props.list.id === 'bul')) d.lists.bul = bulletList();
  if (d.blocks.some((b) => b.props && b.props.list && b.props.list.id === 'num')) d.lists.num = numberList();
  return d;
}
/** Document → Markdown: io/md-out.js (headings, lists, quotes, code, marks, links and tables). */
export { toMarkdown } from './md-out.js';

/** Text of the first heading or the first line, for a default file name. */
export function titleOf(doc) {
  if (doc.meta && doc.meta.title) return doc.meta.title;
  for (const b of docBlocks(doc)) if (b.type === 'p' && paraText(b).trim()) return paraText(b).trim().slice(0, 60);
  return 'Untitled document';
}
