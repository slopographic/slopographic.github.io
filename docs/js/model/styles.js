/* Slop Docs — model/styles: the built-in paragraph styles and list definitions, and how a paragraph's
 * effective properties are resolved: Normal → its style → the document's style overrides → the paragraph. */
export const STYLE_ORDER = ['Normal', 'Title', 'Subtitle', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'Quote', 'Code', 'List'];
export const STYLE_NAMES = { Normal: 'Normal text', Title: 'Title', Subtitle: 'Subtitle', H1: 'Heading 1', H2: 'Heading 2', H3: 'Heading 3', H4: 'Heading 4', H5: 'Heading 5', H6: 'Heading 6', Quote: 'Quote', Code: 'Code', List: 'List paragraph' };
const HC = '#1f3a5f';
export const BUILTIN = {
  Normal: { p: { align: 'left', indL: 0, indR: 0, indF: 0, before: 0, after: 6, line: 1.15, widow: true }, r: { font: 'Carlito', size: 11, color: '#000000' } },
  Title: { p: { after: 6, keepNext: true }, r: { size: 26, font: 'Caladea' }, next: 'Normal' },
  Subtitle: { p: { after: 12, keepNext: true }, r: { size: 15, color: '#595959' }, next: 'Normal' },
  H1: { p: { before: 18, after: 6, keepNext: true, keepLines: true }, r: { size: 20, b: true, color: HC }, level: 1, next: 'Normal' },
  H2: { p: { before: 14, after: 4, keepNext: true, keepLines: true }, r: { size: 16, b: true, color: HC }, level: 2, next: 'Normal' },
  H3: { p: { before: 12, after: 4, keepNext: true, keepLines: true }, r: { size: 14, b: true, color: '#333333' }, level: 3, next: 'Normal' },
  H4: { p: { before: 10, after: 3, keepNext: true, keepLines: true }, r: { size: 12, b: true, color: '#444444' }, level: 4, next: 'Normal' },
  H5: { p: { before: 10, after: 3, keepNext: true }, r: { size: 11, b: true, color: '#555555' }, level: 5, next: 'Normal' },
  H6: { p: { before: 10, after: 3, keepNext: true }, r: { size: 11, b: true, i: true, color: '#555555' }, level: 6, next: 'Normal' },
  Quote: { p: { indL: 36, indR: 36, before: 6, after: 10, borderLeft: { w: 2, color: '#c8c8c8' } }, r: { i: true, color: '#444444' } },
  Code: { p: { after: 0, line: 1, shade: '#f4f4f4' }, r: { font: 'Cousine', size: 10 } },
  List: { p: { after: 2 }, r: {} },
};
export const headingLevel = (style) => (BUILTIN[style] && BUILTIN[style].level) || 0;
export const nextStyle = (style) => (BUILTIN[style] && BUILTIN[style].next) || style;

/** Effective style parts for a style name in this document ({ p, r }). */
export function styleOf(doc, name) {
  const base = BUILTIN[name] || BUILTIN.Normal, o = (doc.styles && doc.styles[name]) || {}, n = (doc.styles && doc.styles.Normal) || {};
  return {
    p: { ...BUILTIN.Normal.p, ...(n.p || {}), ...(name === 'Normal' ? {} : base.p), ...(name === 'Normal' ? {} : o.p || {}) },
    r: { ...BUILTIN.Normal.r, ...(n.r || {}), ...(name === 'Normal' ? {} : base.r), ...(name === 'Normal' ? {} : o.r || {}) },
  };
}
/** Paragraph properties after the style cascade. */
export function paraProps(doc, p) {
  const s = styleOf(doc, p.style || 'Normal');
  return { ...s.p, ...(p.props || {}) };
}
/** Run marks after the style cascade (run marks win; null/undefined keeps the style's value). */
export function runMarks(doc, p, r) {
  const s = styleOf(doc, p.style || 'Normal').r, out = { ...s };
  for (const k in r) if (k !== 'text' && r[k] !== undefined && r[k] !== null) out[k] = r[k];
  return out;
}

/* ---------- lists ---------- */
const BULLETS = ['•', '◦', '▪', '•', '◦', '▪', '•', '◦', '▪'];
const NUMFMT = ['decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman'];
export function bulletList() {
  return { kind: 'bullet', levels: BULLETS.map((b, i) => ({ fmt: 'bullet', text: b, start: 1, indent: 36 * (i + 1), hanging: 18 })) };
}
export function numberList(style = 'multi') {
  return { kind: 'number', levels: NUMFMT.map((f, i) => ({ fmt: style === 'legal' ? 'decimal' : f, text: style === 'legal' ? Array.from({ length: i + 1 }, (_, k) => `%${k + 1}`).join('.') + '.' : `%${i + 1}.`, start: 1, indent: 36 * (i + 1), hanging: 18 })) };
}
const ROMAN = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
export function fmtNumber(n, fmt) {
  if (fmt === 'lowerLetter' || fmt === 'upperLetter') { let s = ''; let k = n; while (k > 0) { k--; s = String.fromCharCode(97 + (k % 26)) + s; k = Math.floor(k / 26); } return fmt === 'upperLetter' ? s.toUpperCase() : s; }
  if (fmt === 'lowerRoman' || fmt === 'upperRoman') { let s = '', k = n; for (const [v, r] of ROMAN) while (k >= v) { s += r; k -= v; } return fmt === 'upperRoman' ? s.toUpperCase() : s; }
  if (fmt === 'none') return '';
  return String(n);
}
/** Label text for a list item: counters is the array of current counts per level. */
export function listLabel(def, lvl, counters) {
  const L = def.levels[lvl] || def.levels[0];
  if (L.fmt === 'bullet') return L.text;
  return L.text.replace(/%(\d)/g, (_, d) => { const k = +d - 1; const lv = def.levels[k] || L; return fmtNumber(counters[k] || lv.start || 1, lv.fmt); });
}
