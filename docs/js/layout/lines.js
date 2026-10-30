/* Slop Docs — layout/lines: greedy line breaking (like Word), tabs with leaders, alignment and
 * justification. Input: measured atoms (atoms.js) and resolved paragraph properties. Output: lines whose
 * frags have x positions relative to the content box's left edge. */
import { splitAtom, atomMetrics } from './atoms.js';
import { textWidth, vmetrics } from '../fonts/registry.js';
import { bidiLine } from './bidi.js';

export const DEFAULT_TAB = 36;
const EPS = 0.001;

function nextTab(x, tabs) {
  for (const t of tabs) if (t.pos > x + EPS) return t;
  return { pos: (Math.floor(x / DEFAULT_TAB + EPS) + 1) * DEFAULT_TAB, align: 'left' };
}
/** Width of the text after a tab up to the next tab or line break (for right/center/decimal tabs). */
function segWidth(atoms, j, decimal) {
  let w = 0;
  for (let k = j; k < atoms.length; k++) {
    const a = atoms[k];
    if (a.kind === 'tab' || a.kind === 'nl' || a.kind === 'pb') break;
    if (decimal && a.kind === 'text' && a.text.includes('.')) return w + textWidth(a.st.face, a.text.slice(0, a.text.indexOf('.')), a.st.size);
    w += a.w;
  }
  return w;
}

/**
 * P: { indL, indR, indF, align, tabs, line, lineExact, lineAtLeast, emptyStyle }
 * opts: { width, label: { text, st }, widthAt(lineTopY) → { left, right } extra insets, startAt, first }
 */
export function breakLines(atoms, P, opts) {
  const width = opts.width, tabs = (P.tabs || []).slice().sort((a, b) => a.pos - b.pos);
  const lines = [];
  let i = opts.startAt || 0, first = opts.first !== false, y = 0;
  let pending = opts.pending || null;
  const take = () => { if (pending) { const a = pending; pending = null; return a; } return atoms[i++]; };
  const peekDone = () => !pending && i >= atoms.length;
  do {
    const inset = opts.widthAt ? opts.widthAt(y) : { left: 0, right: 0 };
    const left = P.indL + (first ? P.indF : 0) + inset.left, right = width - P.indR - inset.right;
    const line = { atoms: [], first, reason: 'wrap' };
    let x = left;
    if (first && opts.label) {
      const lab = opts.label, lw = textWidth(lab.st.face, lab.text, lab.st.size);
      line.label = { kind: 'label', text: lab.text, st: lab.st, x, w: lw, start: 0, end: 0 };
      x += lw;
      const gap = x < P.indL - EPS ? P.indL : nextTab(x + 1, tabs).pos;
      x = Math.max(x, gap);
    }
    let lastBrk = -1, content = false;
    while (!peekDone()) {
      const a = take();
      if (a.kind === 'nl' || a.kind === 'pb') { line.atoms.push({ ...a, x, w: 0 }); line.reason = a.kind; break; }
      if (a.kind === 'tab') {
        const t = nextTab(x, tabs);
        let stop = t.pos;
        if (t.align === 'right' || t.align === 'center' || t.align === 'decimal') {
          const sw = segWidth(atoms, i, t.align === 'decimal');
          stop = t.align === 'center' ? t.pos - sw / 2 : t.pos - sw;
        }
        if (stop > right) stop = Math.max(x, Math.min(stop, right));
        const w = Math.max(0, stop - x);
        line.atoms.push({ ...a, x, w, leader: t.leader });
        x += w; lastBrk = line.atoms.length - 1;
        continue;
      }
      if (a.kind === 'space') { line.atoms.push({ ...a, x }); x += a.w; lastBrk = line.atoms.length - 1; continue; }
      if (a.kind === 'float') { line.atoms.push({ ...a, x }); continue; }
      if (x + a.w > right + EPS && content) {
        if (lastBrk >= 0) {
          // give back the atoms after the last break opportunity (never a split tail: those start a line)
          const back = line.atoms.splice(lastBrk + 1);
          if (back.length) { i = rewind(atoms, back[0]); pending = null; } else pending = a;
        } else if (a.kind === 'text' && !a.atomic) {
          const [head, tail] = splitAtom(a, right - x);
          if (head.w <= right - x + EPS && tail) { line.atoms.push({ ...head, x }); pending = tail; }
          else pending = a;
        } else pending = a;
        break;
      }
      if (x + a.w > right + EPS && !content && a.kind === 'text' && !a.atomic && a.text.length > 1) {
        const [head, tail] = splitAtom(a, right - x);
        line.atoms.push({ ...head, x }); x += head.w; content = true;
        if (tail) { pending = tail; break; }
        continue;
      }
      line.atoms.push({ ...a, x }); x += a.w; content = true;
      if (a.brk) lastBrk = line.atoms.length - 1;
    }
    if (peekDone() && line.reason === 'wrap') line.reason = 'end';
    finish(line, P, left, right, lines.length ? lines[lines.length - 1].end : (opts.paraStart || 0));
    bidiLine(line, !!P.rtl, width);
    line.top = y; y += line.h;
    line.next = i; line.pending = pending;
    lines.push(line);
    first = false;
    if (opts.maxLines && lines.length >= opts.maxLines) break;
  } while (!peekDone() || (lines.length && lines[lines.length - 1].reason === 'nl' && peekDone() && needsTrailingLine(lines)));
  return lines;
}
function needsTrailingLine(lines) {
  const l = lines[lines.length - 1];
  if (l._trail) return false;
  l._trail = true;
  return true;
}
/** Index of an atom (or of the atom a split tail came from) in the original list. */
function rewind(atoms, a) {
  for (let k = 0; k < atoms.length; k++) if (atoms[k].start === a.start) return k;
  return atoms.length;
}

function finish(line, P, left, right, prevEnd) {
  const at = line.atoms;
  // metrics
  let asc = 0, desc = 0, gap = 0;
  const all = line.label ? [line.label, ...at] : at;
  for (const a of all) { if ((a.kind === 'nl' && at.length > 1) || a.kind === 'float') continue; const m = atomMetrics(a); asc = Math.max(asc, m.asc); desc = Math.max(desc, m.desc); gap = Math.max(gap, m.gap); }
  if (!all.length || (asc === 0 && desc === 0)) { const v = vmetrics(P.emptyStyle && P.emptyStyle.face, (P.emptyStyle && P.emptyStyle.full) || 11); asc = v.asc; desc = v.desc; gap = v.gap; }
  const natural = asc + desc + gap;
  let h = P.lineExact ? P.lineExact : natural * (P.line || 1);
  if (P.lineAtLeast) h = Math.max(h, P.lineAtLeast);
  line.h = h; line.asc = asc; line.desc = desc;
  line.baseline = P.lineExact ? Math.min(h, (h - (asc + desc)) / 2 + asc) : gap / 2 + asc + (h - natural) * 0.5;
  // trailing spaces do not count for alignment
  let lastContent = at.length - 1;
  while (lastContent >= 0 && /^(space|nl|pb|float)$/.test(at[lastContent].kind)) lastContent--;
  const endX = lastContent >= 0 ? at[lastContent].x + at[lastContent].w : left;
  const free = right - endX;
  let shift = 0, extra = 0;
  const align = P.align || 'left';
  if (align === 'center') shift = free / 2;
  else if (align === 'right') shift = free;
  else if (align === 'justify' && line.reason === 'wrap') {
    let lastTab = -1;
    for (let k = 0; k <= lastContent; k++) if (at[k].kind === 'tab') lastTab = k;
    let n = 0;
    for (let k = lastTab + 1; k < lastContent; k++) if (at[k].kind === 'space') n += [...at[k].text].length;
    if (n > 0 && free > 0) { extra = free / n; line.justifyFrom = lastTab + 1; }
  }
  line.extra = extra;
  // frags
  const frags = [];
  if (line.label) frags.push({ ...line.label, x: line.label.x + shift });
  let add = 0, cur = null;
  for (let k = 0; k < at.length; k++) {
    const a = at[k], x = a.x + shift + add;
    if (a.kind === 'space') {
      const n = [...a.text].length;
      if (extra && k > (line.justifyFrom ?? 0) - 1 && k < lastContent) { add += extra * n; cur = null; frags.push({ kind: 'space', text: a.text, x, w: a.w + extra * n, start: a.start, end: a.end, st: a.st, run: a.run }); continue; }
      if (cur && cur.st === a.st && !extra) { cur.text += a.text; cur.end = a.end; cur.w += a.w; continue; }
      cur = { kind: 'text', text: a.text, x, w: a.w, start: a.start, end: a.end, st: a.st };
      frags.push(cur); continue;
    }
    if (a.kind === 'tab') { cur = null; frags.push({ kind: 'tab', text: '', x, w: a.w, start: a.start, end: a.end, st: a.st, leader: a.leader }); continue; }
    if (a.kind === 'nl' || a.kind === 'pb') { cur = null; frags.push({ kind: a.kind, text: '', x, w: 0, start: a.start, end: a.end, st: a.st }); continue; }
    if (a.kind === 'float') { cur = null; frags.push({ kind: 'float', text: '', x, w: 0, start: a.start, end: a.end, st: a.st, run: a.run }); continue; }
    if (a.kind === 'img') { cur = null; frags.push({ kind: 'img', text: '', x, w: a.w, h: a.h, start: a.start, end: a.end, st: a.st, run: a.run }); continue; }
    if (cur && cur.st === a.st && !a.atomic && !cur.atomic && cur.end === a.start) { cur.text += a.text; cur.end = a.end; cur.w += a.w; continue; }
    cur = { kind: 'text', text: a.text, x, w: a.w, start: a.start, end: a.end, st: a.st, atomic: a.atomic };
    frags.push(cur);
  }
  line.frags = frags;
  line.left = left; line.right = right; line.shift = shift;
  line.start = at.length ? at[0].start : prevEnd;
  line.end = at.length ? at[at.length - 1].end : line.start;
  line.w = endX - left;
  delete line.atoms;
}
