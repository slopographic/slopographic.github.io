/* Slop Docs — model/ops: pure editing operations on the body blocks. Every function returns new blocks
 * (copy-on-write: unchanged blocks keep their identity, so the layout cache and undo share them).
 * A position is { b, o }: b = index in doc.blocks (a paragraph), o = offset in its text (UTF-16 units).
 * A selection is { a, f } (anchor, focus). A collapsed selection has a equal to f.
 * Tables and other non-paragraph blocks are never edited here; they are kept in place. */
import { uid, paraText, paraLen } from './doc.js';
import { nextStyle } from './styles.js';

export const MARK_KEYS = ['font', 'size', 'b', 'i', 'u', 's', 'color', 'hl', 'va', 'link', 'cm'];
export const CLEAR_MARKS = { font: null, size: null, b: null, i: null, u: null, s: null, color: null, hl: null, va: null, link: null, cm: null };

export const cmpPos = (x, y) => (x.b - y.b) || (x.o - y.o);
export const ordered = (sel) => (cmpPos(sel.a, sel.f) <= 0 ? [sel.a, sel.f] : [sel.f, sel.a]);
export const collapsed = (sel) => sel.a.b === sel.f.b && sel.a.o === sel.f.o;

/** The mark keys of a run (no text, no object fields). */
export function marksOf(r) {
  const m = {};
  for (const k of MARK_KEYS) if (r[k] !== undefined && r[k] !== null) m[k] = r[k];
  return m;
}
const sameMarks = (x, y) => MARK_KEYS.every((k) => x[k] === y[k]);

/** Split runs at offset o → [before, after]. A run that spans o is cut in two. */
export function splitRuns(runs, o) {
  const L = [], R = [];
  let k = 0;
  for (const r of runs) {
    const n = r.text.length;
    if (k + n <= o) L.push(r);
    else if (k >= o) R.push(r);
    else { L.push({ ...r, text: r.text.slice(0, o - k) }); R.push({ ...r, text: r.text.slice(o - k) }); }
    k += n;
  }
  return [L, R];
}
/** Drop empty runs and merge neighbours that carry the same marks. */
export function normRuns(runs) {
  const out = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && !r.obj && !last.obj && sameMarks(last, r)) out[out.length - 1] = { ...last, text: last.text + r.text };
    else out.push(r);
  }
  return out;
}
/** Runs with [s, e) removed. */
export function cutRuns(runs, s, e) {
  const [A] = splitRuns(runs, s);
  const [, B] = splitRuns(runs, e);
  return normRuns([...A, ...B]);
}

/** Marks in force at a position: the run before the caret, or the first run at the start, or the paragraph's typing marks. */
export function marksAt(p, o) {
  const runs = p.runs || [];
  if (!runs.length) return { ...(p.rm || {}) };
  const at = o > 0 ? o - 1 : 0;
  let k = 0;
  for (const r of runs) { if (at < k + r.text.length) return marksOf(r); k += r.text.length; }
  return marksOf(runs[runs.length - 1]);
}

const setAt = (arr, i, v) => { const out = arr.slice(); out[i] = v; return out; };
const isLow = (s, i) => { const c = s.charCodeAt(i); return c >= 0xdc00 && c <= 0xdfff; };
const isHigh = (s, i) => { const c = s.charCodeAt(i); return c >= 0xd800 && c <= 0xdbff; };

/** Remove the range [a, f) (a before f). Paragraphs at the ends join; paragraphs between are dropped. */
function removeRange(blocks, a, f) {
  const pa = blocks[a.b], pf = blocks[f.b];
  if (a.b === f.b) return { blocks: setAt(blocks, a.b, { ...pa, runs: cutRuns(pa.runs || [], a.o, f.o) }), pos: a };
  const head = cutRuns(pa.runs || [], a.o, paraLen(pa));
  const tail = cutRuns(pf.runs || [], 0, f.o);
  const merged = { ...pa, runs: normRuns([...head, ...tail]) };
  const out = [];
  blocks.forEach((b, i) => {
    if (i < a.b || i > f.b) out.push(b);
    else if (i === a.b) out.push(merged);
    else if (b.type !== 'p') out.push(b);
  });
  return { blocks: out, pos: a };
}

/**
 * Replace the selection with text (\n starts a new paragraph). marks style the inserted text.
 * Returns { blocks, pos } with pos just after the inserted text.
 */
export function replaceText(blocks, sel, text, marks = {}) {
  const [a, f] = ordered(sel);
  let out = blocks, pos = sel.f;
  if (!collapsed(sel)) ({ blocks: out, pos } = removeRange(blocks, a, f));
  const p = out[pos.b];
  if (!p || p.type !== 'p') return { blocks: out, pos };
  if (!text) return { blocks: out, pos };
  const parts = text.split('\n');
  const [L, R] = splitRuns(p.runs || [], pos.o);
  if (parts.length === 1) {
    const runs = normRuns([...L, { ...marks, text }, ...R]);
    return { blocks: setAt(out, pos.b, { ...p, runs }), pos: { b: pos.b, o: pos.o + text.length } };
  }
  const last = parts.length - 1;
  const head = { ...p, runs: normRuns([...L, { ...marks, text: parts[0] }]) };
  const created = [];
  for (let i = 1; i <= last; i++) {
    const body = [{ ...marks, text: parts[i] }];
    if (i === last) body.push(...R);
    const np = { ...p, id: uid(), runs: normRuns(body), rm: undefined };
    // Enter at the end of a heading or title starts the next style, as in Word
    if (i === last && !R.length) np.style = nextStyle(p.style || 'Normal');
    created.push(np);
  }
  const res = out.slice(0, pos.b).concat([head], created, out.slice(pos.b + 1));
  return { blocks: res, pos: { b: pos.b + last, o: parts[last].length } };
}

/** Backspace: delete the selection, or the character before the caret, or join with the paragraph above. */
export function deleteBackward(blocks, sel) {
  if (!collapsed(sel)) return replaceText(blocks, sel, '');
  const { b, o } = sel.f, p = blocks[b];
  if (o > 0) {
    const from = o > 1 && isLow(paraText(p), o - 1) && isHigh(paraText(p), o - 2) ? o - 2 : o - 1;
    return replaceText(blocks, { a: { b, o: from }, f: { b, o } }, '');
  }
  if (p.props && p.props.list) return { blocks: setAt(blocks, b, { ...p, props: { ...p.props, list: undefined } }), pos: sel.f };
  const prev = blocks[b - 1];
  if (b > 0 && prev && prev.type === 'p') return replaceText(blocks, { a: { b: b - 1, o: paraLen(prev) }, f: { b, o: 0 } }, '');
  return { blocks, pos: sel.f };
}

/** Delete: remove the selection, or the character after the caret, or join the next paragraph. */
export function deleteForward(blocks, sel) {
  if (!collapsed(sel)) return replaceText(blocks, sel, '');
  const { b, o } = sel.f, p = blocks[b], t = paraText(p);
  if (o < t.length) return replaceText(blocks, { a: { b, o }, f: { b, o: isHigh(t, o) && isLow(t, o + 1) ? o + 2 : o + 1 } }, '');
  const next = blocks[b + 1];
  if (next && next.type === 'p') return replaceText(blocks, { a: { b, o }, f: { b: b + 1, o: 0 } }, '');
  return { blocks, pos: sel.f };
}

/** Apply a mark change ({ key: value | null }) to the selected text. null removes the mark. */
export function setMarks(blocks, sel, change) {
  if (collapsed(sel)) return blocks;
  const [a, f] = ordered(sel);
  const apply = (r) => {
    const n = { ...r };
    for (const k in change) { if (change[k] === null || change[k] === undefined) delete n[k]; else n[k] = change[k]; }
    return n;
  };
  return blocks.map((b, i) => {
    if (i < a.b || i > f.b || b.type !== 'p') return b;
    const runs = b.runs || [];
    if (!runs.length) return { ...b, rm: apply({ ...(b.rm || {}) }) };
    const s = i === a.b ? a.o : 0, e = i === f.b ? f.o : paraLen(b);
    if (s === e) return b;
    const [pre, rest] = splitRuns(runs, s);
    const [mid, post] = splitRuns(rest, e - s);
    return { ...b, runs: normRuns([...pre, ...mid.map((r) => (r.obj ? r : apply(r))), ...post]) };
  });
}

/** Paragraph indexes touched by a selection. */
export function parasIn(blocks, sel) {
  const [a, f] = ordered(sel), out = [];
  for (let i = a.b; i <= f.b && i < blocks.length; i++) if (blocks[i].type === 'p') out.push(i);
  return out;
}
/** Change paragraph properties of every paragraph touched by the selection: fn(p) → new p. */
export function setParas(blocks, sel, fn) {
  const idx = new Set(parasIn(blocks, sel));
  return blocks.map((b, i) => (idx.has(i) ? fn(b) : b));
}
/** Toggle a list (id, e.g. 'bul' or 'num') on the selected paragraphs. */
export function toggleList(blocks, sel, id) {
  const idx = parasIn(blocks, sel);
  const allOn = idx.every((i) => blocks[i].props && blocks[i].props.list && blocks[i].props.list.id === id);
  return setParas(blocks, sel, (p) => {
    const cur = p.props && p.props.list;
    return { ...p, props: { ...(p.props || {}), list: allOn ? undefined : { id, lvl: cur ? cur.lvl || 0 : 0 } } };
  });
}

/** The plain text between two positions (paragraphs joined by \n). */
export function textBetween(blocks, sel) {
  const [a, f] = ordered(sel), out = [];
  for (let i = a.b; i <= f.b && i < blocks.length; i++) {
    const b = blocks[i];
    if (!b || b.type !== 'p') continue;
    const t = paraText(b);
    out.push(t.slice(i === a.b ? a.o : 0, i === f.b ? f.o : t.length));
  }
  return out.join('\n');
}

/** Word boundaries for Ctrl+arrows and double-click. */
const WORD = /[\p{L}\p{N}_'’]/u;
export function wordLeft(text, o) {
  let i = o;
  while (i > 0 && !WORD.test(text[i - 1])) i--;
  while (i > 0 && WORD.test(text[i - 1])) i--;
  return i;
}
export function wordRight(text, o) {
  let i = o;
  while (i < text.length && !WORD.test(text[i])) i++;
  while (i < text.length && WORD.test(text[i])) i++;
  return i;
}
export function wordAt(text, o) {
  let s = o, e = o;
  while (s > 0 && WORD.test(text[s - 1])) s--;
  while (e < text.length && WORD.test(text[e])) e++;
  return { s, e };
}
