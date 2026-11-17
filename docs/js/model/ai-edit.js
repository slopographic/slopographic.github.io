/* Slop Docs — model/ai-edit: pure block edits the assistant's commands need beyond ops.js: putting whole paragraphs
 * at the caret, the start or the end, and find and replace inside paragraphs. Copy-on-write like ops.js; positions are
 * { b, o }. Used by ui/ai-commands.js (loaded on demand), never at boot. */
import { paraText, paraLen } from './doc.js';
import { replaceText, marksAt, collapsed, ordered } from './ops.js';

const isEmptyPara = (p) => p && p.type === 'p' && !paraLen(p) && !(p.props && p.props.list);

/**
 * Put new paragraphs (paras, a non-empty list of blocks) at where: 'caret' (after the caret's paragraph), 'start' or 'end'.
 * An empty paragraph at that place is filled instead of keeping a blank line beside the new text.
 * Returns { blocks, pos } with pos at the end of the last new paragraph.
 */
export function insertParas(blocks, sel, paras, where = 'caret') {
  let at, fill = false;
  if (where === 'start') { at = 0; fill = isEmptyPara(blocks[0]); }
  else if (where === 'end') { at = blocks.length; fill = isEmptyPara(blocks[at - 1]); if (fill) at -= 1; }
  else {
    const b = Math.min(Math.max(0, ordered(sel)[1].b), blocks.length - 1);
    fill = isEmptyPara(blocks[b]);
    at = fill ? b : b + 1;
  }
  const out = blocks.slice(0, at).concat(paras, blocks.slice(fill ? at + 1 : at));
  const last = at + paras.length - 1;
  return { blocks: out, pos: { b: last, o: paraLen(paras[paras.length - 1]) } };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A global regular expression for find (plain text): matchCase, wholeWord (letters, digits and _ do not touch the match). */
export function findRe(find, { matchCase = false, wholeWord = false } = {}) {
  const core = escapeRe(String(find));
  const src = wholeWord ? `(?<![\\p{L}\\p{N}_])${core}(?![\\p{L}\\p{N}_])` : core;
  return new RegExp(src, 'gu' + (matchCase ? '' : 'i'));
}
/** Every match in the top-level paragraphs: [{ b, s, e }] in document order. Matches never cross paragraphs. */
export function findAll(blocks, find, opts = {}) {
  const out = [];
  if (!find) return out;
  const re = findRe(find, opts);
  blocks.forEach((p, b) => {
    if (!p || p.type !== 'p') return;
    const t = paraText(p);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t))) {
      if (!m[0].length) { re.lastIndex++; continue; }
      out.push({ b, s: m.index, e: m.index + m[0].length });
    }
  });
  return out;
}

/**
 * Replace matches of find with replace (one line: a line break becomes a space). all false replaces the first match at or
 * after from ({ b, o }), wrapping to the start. Each replacement keeps the marks of the text it replaces.
 * Returns { blocks, count, sel } — sel is the given selection kept inside the changed paragraphs (or around the single
 * replacement when all is false).
 */
export function replaceMatches(blocks, sel, find, replace, { matchCase = false, wholeWord = false, all = true } = {}) {
  let hits = findAll(blocks, find, { matchCase, wholeWord });
  const text = String(replace == null ? '' : replace).replace(/\r?\n/g, ' ');
  if (!hits.length) return { blocks, count: 0, sel };
  if (!all) {
    const from = collapsed(sel) ? sel.f : ordered(sel)[0];
    hits = [hits.find((h) => h.b > from.b || (h.b === from.b && h.s >= from.o)) || hits[0]];
  }
  let out = blocks;
  for (let i = hits.length - 1; i >= 0; i--) {     // from the end, so earlier offsets stay valid
    const h = hits[i], p = out[h.b];
    out = replaceText(out, { a: { b: h.b, o: h.s }, f: { b: h.b, o: h.e } }, text, marksAt(p, h.s + 1)).blocks;
  }
  if (!all) { const h = hits[0]; return { blocks: out, count: 1, sel: { a: { b: h.b, o: h.s }, f: { b: h.b, o: h.s + text.length } } }; }
  const clamp = (q) => ({ b: q.b, o: Math.min(q.o, out[q.b] && out[q.b].type === 'p' ? paraLen(out[q.b]) : 0) });
  return { blocks: out, count: hits.length, sel: { a: clamp(sel.a), f: clamp(sel.f) } };
}
