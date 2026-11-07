/* Slop Compare: text compared line by line, with the changed words inside each changed line. Pure.
 *   splitLines(text) → { lines, newline }       \r\n and \r read as \n; newline: the text ends with a line break
 *   diffLines(a, b, { ignoreWs, ignoreCase }) → { rows, blocks, stats, a: lines, b: lines, exact, aNewline, bNewline }
 *     rows: [{ t: 'eq' | 'del' | 'ins' | 'mod', a, b }] (line indexes, -1 for none). A deleted line next to an inserted one
 *     is a 'mod' pair (shown on one row in the split view, with its changed words); blocks: [{ start, end }] row ranges of
 *     each change, in order (Next and Previous change walk them); stats: { added, removed, changed, same, blocks }.
 *   diffWords(a, b, opts) → { a: [{ text, ch }], b: [{ text, ch }], similarity }  ch: the piece changed
 *   keyOf(line, opts)  what a line is compared by: whitespace runs as one space and trimmed, lower case */
import { diffSeq, runs } from './myers.js';

export function splitLines(text) {
  const t = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  if (!t) return { lines: [], newline: false };
  const newline = t.endsWith('\n');
  const lines = (newline ? t.slice(0, -1) : t).split('\n');
  return { lines, newline };
}

export function keyOf(line, { ignoreWs = false, ignoreCase = false } = {}) {
  let s = line;
  if (ignoreWs) s = s.replace(/\s+/g, ' ').trim();
  if (ignoreCase) s = s.toLowerCase();
  return s;
}

/** Interns the keys of both sides as small numbers, so the diff compares numbers. */
function intern(la, lb, opts) {
  const map = new Map(), id = (l) => { const k = keyOf(l, opts); let v = map.get(k); if (v === undefined) { v = map.size; map.set(k, v); } return v; };
  return [la.map(id), lb.map(id)];
}

export function diffLines(textA, textB, opts = {}) {
  const A = splitLines(textA), B = splitLines(textB);
  const [ka, kb] = intern(A.lines, B.lines, opts);
  const { ops, exact } = diffSeq(ka, kb);
  const rows = [], blocks = [];
  const stats = { added: 0, removed: 0, changed: 0, same: 0, blocks: 0 };
  for (const r of runs(ops)) {
    if (r.eq) { for (const o of r.ops) rows.push({ t: 'eq', a: o.a, b: o.b }); stats.same += r.ops.length; continue; }
    const start = rows.length, pairs = Math.min(r.dels.length, r.ins.length);
    for (let i = 0; i < pairs; i++) rows.push({ t: 'mod', a: r.dels[i], b: r.ins[i] });
    for (let i = pairs; i < r.dels.length; i++) rows.push({ t: 'del', a: r.dels[i], b: -1 });
    for (let i = pairs; i < r.ins.length; i++) rows.push({ t: 'ins', a: -1, b: r.ins[i] });
    blocks.push({ start, end: rows.length });
    stats.changed += pairs; stats.removed += r.dels.length; stats.added += r.ins.length;
  }
  stats.blocks = blocks.length;
  // a file that differs only in its final line break still differs
  if (!blocks.length && A.newline !== B.newline && (A.lines.length || B.lines.length)) stats.newlineOnly = true;
  return { rows, blocks, stats, a: A.lines, b: B.lines, exact, aNewline: A.newline, bNewline: B.newline };
}

const WORD = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;
export const tokens = (s) => String(s).match(WORD) || [];

/** Joins neighbouring pieces with the same changed flag. */
function squash(list) {
  const out = [];
  for (const p of list) { const l = out[out.length - 1]; if (l && l.ch === p.ch) l.text += p.text; else out.push({ text: p.text, ch: p.ch }); }
  return out;
}

export function diffWords(a, b, opts = {}) {
  const ta = tokens(a), tb = tokens(b);
  const k = (t) => (opts.ignoreWs && /^\s+$/.test(t) ? ' ' : opts.ignoreCase ? t.toLowerCase() : t);
  const { ops } = diffSeq(ta.map(k), tb.map(k), undefined, { maxCost: 800 });
  const pa = [], pb = [];
  let same = 0, total = 0;
  for (const o of ops) {
    if (o.op === 'eq') { pa.push({ text: ta[o.a], ch: false }); pb.push({ text: tb[o.b], ch: false }); if (!/^\s+$/.test(ta[o.a])) same += 2 * ta[o.a].length; }
    else if (o.op === 'del') pa.push({ text: ta[o.a], ch: !(opts.ignoreWs && /^\s+$/.test(ta[o.a])) });
    else pb.push({ text: tb[o.b], ch: !(opts.ignoreWs && /^\s+$/.test(tb[o.b])) });
  }
  for (const t of ta.concat(tb)) if (!/^\s+$/.test(t)) total += t.length;
  return { a: squash(pa), b: squash(pb), similarity: total ? same / total : 1 };
}

/** The row index of each change's first row, and the change (block) a row is in. */
export function blockOf(blocks, row) {
  for (let i = 0; i < blocks.length; i++) if (row >= blocks[i].start && row < blocks[i].end) return i;
  return -1;
}

/** The rows to show: changes with `context` unchanged rows around them; longer unchanged runs fold to one 'fold' item
 *  { t: 'fold', from, to } (row range). context < 0 shows every row. */
export function visible(rows, blocks, context = 3) {
  if (context < 0 || !blocks.length) return context < 0 || !rows.length ? rows.map((r, i) => ({ ...r, i })) : [{ t: 'fold', from: 0, to: rows.length }];
  const keep = new Uint8Array(rows.length);
  for (const b of blocks) for (let i = Math.max(0, b.start - context); i < Math.min(rows.length, b.end + context); i++) keep[i] = 1;
  const out = [];
  for (let i = 0; i < rows.length;) {
    if (keep[i]) { out.push({ ...rows[i], i }); i++; continue; }
    let j = i; while (j < rows.length && !keep[j]) j++;
    out.push({ t: 'fold', from: i, to: j });
    i = j;
  }
  return out;
}
