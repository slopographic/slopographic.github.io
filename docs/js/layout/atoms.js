/* Slop Docs — layout/atoms: a paragraph becomes a list of measured atoms (words, spaces, tabs, line
 * breaks, objects). Atoms carry their model offsets (start, end) so the editor can map x ↔ offset.
 * Widths come from the font's own advance widths (fonts/registry.js), the same numbers the PDF uses. */
import { bestFace, textWidth, textVm, charWidth, withHan, defaultHan } from '../fonts/registry.js';
import { runMarks } from '../model/styles.js';
import { paraText } from '../model/doc.js';

export const LINK_COLOR = '#1155cc';
const SPLIT = /(\t|\n|[  - 　]+|[^\t\n  - 　]+)/g;

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/;
const hans = new WeakMap();
/** Which Chinese-character font a paragraph takes ('jp' beside kana, 'kr' beside hangul, else the browser's choice). */
function hanOf(p) {
  if (!hans.has(p)) { const t = paraText(p), S = globalThis.SlopScripts; hans.set(p, S && CJK.test(t) ? S.hanFor(t, globalThis.navigator && navigator.language) : defaultHan()); }
  return hans.get(p);
}
/** Resolved style for a run: marks + face + render size + baseline shift. */
export function styleFor(doc, p, r) {
  const m = runMarks(doc, p, r || {});
  if (m.link && !(r && r.color)) m.color = LINK_COLOR;
  if (m.link && (!r || r.u === undefined)) m.u = true;
  const size = m.va ? m.size * 0.65 : m.size;
  const dy = m.va === 'sup' ? -m.size * 0.35 : m.va === 'sub' ? m.size * 0.14 : 0;
  return { m, face: withHan(bestFace(m.font, m.b, m.i), hanOf(p)), size, dy, full: m.size };
}

/** ctx: { field(f) → string, fnLabel(id) → string } for dynamic objects. */
export function atomsOf(doc, p, ctx = {}) {
  const atoms = [];
  let off = 0;
  for (const r of p.runs || []) {
    const st = styleFor(doc, p, r), len = r.text.length;
    if (r.obj) {
      const base = { start: off, end: off + len, st, run: r, brk: true };
      if (r.obj === 'img' && (r.wrap === 'left' || r.wrap === 'right')) atoms.push({ ...base, kind: 'float', w: 0, fw: r.w || 100, fh: r.h || 100, text: '' });
      else if (r.obj === 'img') atoms.push({ ...base, kind: 'img', w: r.w || 100, h: r.h || 100, text: '' });
      else if (r.obj === 'pb') atoms.push({ ...base, kind: 'pb', w: 0, text: '' });
      else if (r.obj === 'field' || r.obj === 'fn') {
        const text = r.obj === 'fn' ? (ctx.fnLabel ? ctx.fnLabel(r.id) : '*') : (ctx.field ? ctx.field(r.f) : '#');
        const fst = r.obj === 'fn' ? { ...st, size: st.full * 0.65, dy: -st.full * 0.35, m: { ...st.m, va: 'sup' } } : st;
        atoms.push({ ...base, kind: 'text', text, w: textWidth(fst.face, text, fst.size), st: fst, atomic: true, brk: false });
      }
      if (atoms.length > 1 && atoms[atoms.length - 1].kind === 'img') atoms[atoms.length - 2].brk = true;
      off += len;
      continue;
    }
    SPLIT.lastIndex = 0;
    let m;
    while ((m = SPLIT.exec(r.text))) {
      const t = m[0], s = off + m.index;
      if (t === '\t') atoms.push({ kind: 'tab', text: '\t', start: s, end: s + 1, st, w: 0, brk: true });
      else if (t === '\n') atoms.push({ kind: 'nl', text: '', start: s, end: s + 1, st, w: 0, brk: true });
      else if (/^[  - 　]/.test(t)) atoms.push({ kind: 'space', text: t, start: s, end: s + t.length, st, w: textWidth(st.face, t, st.size), brk: true });
      else {
        // allow a break after a hyphen or slash inside a word
        const parts = t.split(/(?<=[-–—/])(?=[^-–—/])/);
        let k = s;
        for (const part of parts) {
          atoms.push({ kind: 'text', text: part, start: k, end: k + part.length, st, w: textWidth(st.face, part, st.size), brk: /[-–—/]$/.test(part) });
          k += part.length;
        }
      }
    }
    off += len;
  }
  return atoms;
}

/** Split a text atom so the head fits in maxW (at least one character). */
export function splitAtom(a, maxW) {
  let w = 0, i = 0;
  const chars = [...a.text];
  let units = 0;
  for (; i < chars.length; i++) {
    const cw = charWidth(a.st.face, chars[i].codePointAt(0), a.st.size);
    if (i > 0 && w + cw > maxW) break;
    w += cw; units += chars[i].length;
  }
  if (units >= a.text.length) return [a, null];
  const head = { ...a, text: a.text.slice(0, units), end: a.start + units, w, brk: true };
  const tailText = a.text.slice(units);
  const tail = { ...a, text: tailText, start: a.start + units, w: textWidth(a.st.face, tailText, a.st.size) };
  return [head, tail];
}

/** Vertical metrics of an atom: { asc, desc, gap }. */
export function atomMetrics(a) {
  if (a.kind === 'img') return { asc: a.h, desc: 0, gap: 0 };
  const v = textVm(a.st.face, a.text, a.st.full);
  return { asc: v.asc - Math.min(0, a.st.dy), desc: v.desc + Math.max(0, a.st.dy), gap: v.gap };
}
