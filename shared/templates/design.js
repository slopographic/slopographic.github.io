/* Slop templates — design: the style sheet (fonts, colours, sizes and heading decoration), the page section
 * (paper, margins), the bullet list, and the header and footer (company name, title, page numbers). */
import { SCALE, MARGINS, KIND_TITLE } from './choices.js';

export const PAPER = { Letter: [612, 792], A4: [595.28, 841.89] };

/** Page size and body width in points for a section. */
export function pageBox(sec) {
  const [W, H] = PAPER[sec.size] || PAPER.Letter;
  return { W, H, bw: W - sec.margin.left - sec.margin.right };
}

export function sectionFor(v) {
  const M = MARGINS[v.margins];
  return {
    size: v.paper,
    orient: 'portrait',
    margin: { top: M.m, right: M.m, bottom: M.m, left: M.m, header: M.h, footer: M.h },
    differentFirst: v.layout === 'letterhead',
    pageStart: 1,
    columns: 1,
  };
}

/** Heading decoration per style: 'ruled' rules H1, 'bar' puts an accent bar at the left of H1 and H2. */
function deco(v, sch, level) {
  if (v.heading === 'ruled' && level === 1) return { borderBottom: { w: 0.75, color: sch.rule } };
  if (v.heading === 'bar') return { borderLeft: { w: 3, color: sch.accent }, indL: 10 };
  return {};
}

export function styleSheet(v, sch) {
  const { body, line } = SCALE[v.scale];
  const fh = v.fonts.heading, fb = v.fonts.body;
  return {
    Normal: { p: { after: 6, line }, r: { font: fb, size: body, color: sch.text } },
    Title: { p: { after: 4 }, r: { font: fh, size: body + 14, b: true, color: sch.head } },
    Subtitle: { p: { after: 12 }, r: { font: fb, size: body + 2, color: sch.muted } },
    H1: { p: { before: 14, after: 5, keepNext: true, keepLines: true, ...deco(v, sch, 1) }, r: { font: fh, size: body + 6, b: true, color: sch.head } },
    H2: { p: { before: 10, after: 4, keepNext: true, keepLines: true, ...deco(v, sch, 2) }, r: { font: fh, size: body + 3, b: true, color: sch.head } },
  };
}

export function bulletList() {
  const marks = ['•', '◦', '▪'];
  return { kind: 'bullet', levels: marks.map((text, i) => ({ fmt: 'bullet', text, start: 1, indent: 22 + 22 * i, hanging: 14 })) };
}

/** The header and footer for the section. The first page of a letterhead has a band with the company name. */
export function headerFooter(B, v, sch, bw) {
  const { body } = SCALE[v.scale];
  const title = KIND_TITLE[v.kind];
  const mark = { color: sch.muted, size: body - 2 };
  const rightTab = [{ pos: bw, align: 'right', leader: 'none' }];
  const headerLine = () => {
    if (v.header === 'company') return B.P(v.company, 'Normal', { after: 0, borderBottom: { w: 0.5, color: sch.rule } }, mark);
    if (v.header === 'title') return B.P(title, 'Normal', { after: 0, borderBottom: { w: 0.5, color: sch.rule } }, mark);
    return B.P(`${v.company}\t${title}`, 'Normal', { after: 0, tabs: rightTab, borderBottom: { w: 0.5, color: sch.rule } }, mark);
  };
  /** A paragraph with the given runs (a fresh id each time). */
  const line = (runs, props) => ({ ...B.P('', 'Normal', props), runs });
  const footerLine = () => {
    if (v.footer === 'page-of') return line([B.run('Page ', mark), B.field('page'), B.run(' of ', mark), B.field('pages')], { after: 0, align: 'right' });
    if (v.footer === 'page') return line([B.run('Page ', mark), B.field('page')], { after: 0, align: 'right' });
    return line([B.run(`${v.company}\tPage `, mark), B.field('page')], { after: 0, tabs: rightTab });
  };
  const header = { default: [headerLine()], first: [] };
  const footer = { default: [footerLine()], first: [] };
  if (v.layout === 'letterhead') {
    header.first = [B.P(v.company, 'Normal', { before: 6, after: 6, indL: 6, shade: sch.accent }, { b: true, size: body + 5, color: sch.onAccent })];
    footer.first = [footerLine()];
  }
  return { header, footer };
}
