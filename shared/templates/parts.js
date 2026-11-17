/* Slop templates — parts: the building blocks in the Docs schema (paragraphs, runs, headings, bullets, tables with
 * the chosen table style, the logo placeholder and the page-top layouts). makeBuilder(v, sch, bw) returns a builder
 * whose ids come from one counter, so the same seed gives the same ids. Pure: no Date, no Math.random. */
import { SCALE } from './choices.js';

const OBJ = '￼';

export function makeBuilder(v, sch, bw) {
  const sz = SCALE[v.scale].body;
  let n = 0, h1 = 0, h2 = 0;
  const nid = (k) => `${k}${++n}`;
  const run = (text, marks = {}) => ({ ...marks, text });
  const P = (text, style = 'Normal', props = {}, marks = {}) => ({ type: 'p', id: nid('p'), style, props: { ...props }, runs: text ? [run(text, marks)] : [] });
  const field = (f) => ({ text: OBJ, obj: 'field', f });

  /** Heading text in the chosen heading style: upper case, or numbered as 1. and 1.1. */
  const hText = (text, lvl) => {
    if (v.heading === 'caps') return text.toUpperCase();
    if (v.heading === 'numbered') return (lvl === 1 ? `${h1}. ` : `${h1}.${h2} `) + text;
    return text;
  };
  const H1 = (text) => { h1++; h2 = 0; return P(hText(text, 1), 'H1'); };
  const H2 = (text) => { h2++; return P(hText(text, 2), 'H2'); };
  const bullets = (items) => items.map((t) => ({ type: 'p', id: nid('p'), style: 'List', props: { list: { id: 'bul', lvl: 0 } }, runs: [run(t)] }));

  const cell = (blocks, shade) => (shade ? { blocks, span: 1, shade } : { blocks, span: 1 });
  /** A table of fractions of the body width. */
  const tbl = (fr, rows, border = null) => ({ type: 'table', id: nid('t'), cols: fr.map((f) => Math.round(f * bw * 10) / 10), border, align: 'left', rows });

  /** A borderless two-column table of label and value, for memo and invoice headers. */
  const kv = (rows) => tbl([0.28, 0.72], rows.map(([k, val]) => ({ header: false, cells: [cell([P(k, 'Normal', { after: 2 }, { b: true, color: sch.muted })]), cell([P(val, 'Normal', { after: 2 })])] })));

  /** A table in the chosen table style. spec: { fr, head, rows, right: [column indexes], total } */
  function styled(spec) {
    const T = v.table;
    const border = T === 'grid' || T === 'strong' ? { w: 0.5, color: sch.rule } : null;
    const headShade = { grid: sch.tint, plain: null, banded: sch.accent, strong: sch.head }[T];
    const headInk = T === 'banded' ? sch.onAccent : T === 'strong' ? '#ffffff' : sch.head;
    const right = (i) => (spec.right || []).includes(i);
    const cellP = (text, i, marks) => P(text, 'Normal', { before: 2, after: 2, align: right(i) ? 'right' : 'left' }, marks);
    const head = { header: true, cells: spec.head.map((t, i) => cell([cellP(t, i, { b: true, color: headInk })], headShade)) };
    const body = spec.rows.map((r, ri) => {
      const last = !!spec.total && ri === spec.rows.length - 1;
      const shade = T === 'banded' && ri % 2 === 1 ? sch.tint : null;
      return { header: false, cells: r.map((t, i) => cell([cellP(t, i, last ? { b: true } : {})], shade)) };
    });
    return tbl(spec.fr, [head, ...body], border);
  }

  /** The logo placeholder: a tinted box, 120 pt wide, inside a box of the given width. */
  const logo = (width, fill = sch.tint) => ({ type: 'p', id: nid('p'), style: 'Normal', props: { shade: fill, indR: Math.max(0, Math.round(width - 120)), before: 4, after: 8, align: 'center' }, runs: [run('LOGO', { b: true, size: 8, color: sch.muted })] });

  /** The blocks that open the page, before the body: the layout's header arrangement, or the title. */
  function top(body) {
    const L = v.layout, M = v.logo;
    if (L === 'twoColHeader') {
      const left = [...(M ? [logo(bw * 0.55)] : []), P(v.company, 'Normal', { after: 0 }, { b: true, size: sz + 2, color: sch.head }), P(v.street, 'Normal', { after: 0 }, { color: sch.muted }), P(v.city, 'Normal', { after: 0 }, { color: sch.muted })];
      const right = [P(`Ref ${v.ref}`, 'Normal', { after: 0, align: 'right' }, { color: sch.muted }), P(v.date, 'Normal', { after: 0, align: 'right' }, { color: sch.muted })];
      return [tbl([0.55, 0.45], [{ header: false, cells: [cell(left), cell(right)] }])];
    }
    if (L === 'sideRail') {
      const rail = [...(M ? [logo(bw * 0.34, '#ffffff')] : []), P(v.company, 'Normal', { after: 2 }, { b: true, color: sch.head }), P(v.client, 'Normal', { after: 2 }, { color: sch.muted }), P(`Ref ${v.ref}`, 'Normal', { after: 2 }, { color: sch.muted }), P(v.date, 'Normal', { after: 2 }, { color: sch.muted })];
      const title = [];
      if (body.title) title.push(P(body.title, 'Title'));
      if (body.subtitle) title.push(P(body.subtitle, 'Subtitle'));
      if (!title.length) title.push(P(''));
      return [tbl([0.34, 0.66], [{ header: false, cells: [cell(rail, sch.tint), cell(title)] }])];
    }
    const out = [];
    if (M) out.push(logo(bw));
    if (body.title) out.push(P(body.title, 'Title'));
    if (body.subtitle) out.push(P(body.subtitle, 'Subtitle'));
    return out;
  }

  return { P, H1, H2, bullets, styled, kv, top, field, run, nid, logo, sz };
}
