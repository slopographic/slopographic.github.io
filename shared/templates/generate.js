/* Slop templates — generate: seed → a business document design, in the Docs document schema (docs/js/model/doc.js).
 *   generateTemplate(seed) → { seed, vars, doc }
 * Pure and deterministic: the same seed gives the same JSON on every run. Every variable is drawn in a fixed order
 * from one seeded generator (rng.js). vars is the summary the UI shows and doc.meta.template records. The page
 * layout, fonts, colours, heading and table styles, margins, header and footer, and the logo placeholder are all
 * chosen here; the content is in content.js, the blocks in parts.js, the style sheet and header in design.js. */
import { rng } from './rng.js';
import { CHOICES, FONT_PAIRS, SCHEMES, WORDS, GENERATOR, KIND_TITLE } from './choices.js';
import { makeBuilder } from './parts.js';
import { KINDS } from './content.js';
import { sectionFor, pageBox, styleSheet, bulletList, headerFooter } from './design.js';

export { CHOICES, FONT_PAIRS, SCHEMES, GENERATOR } from './choices.js';
export { hashSeed, rng } from './rng.js';

const TITLE = {
  letter: (v) => `Letter to ${v.client}`,
  proposal: (v) => `Proposal for ${v.client}`,
  report: () => 'Quarterly report',
  memo: (v) => `Memo: ${v.subject}`,
  invoice: (v) => `Invoice ${v.ref}`,
  brief: (v) => `Project brief: ${v.subject}`,
};

/** Every choice, drawn in a fixed order. */
function drawVars(seed, r) {
  const v = { seed };
  v.kind = r.pick(CHOICES.kind);
  v.layout = r.pick(CHOICES.layout);
  v.fonts = r.pick(FONT_PAIRS);
  v.scheme = r.pick(SCHEMES).id;
  v.heading = r.pick(CHOICES.heading);
  v.table = r.pick(CHOICES.table);
  v.margins = r.pick(CHOICES.margins);
  v.scale = r.pick(CHOICES.scale);
  v.paper = r.chance(0.6) ? 'Letter' : 'A4';
  v.header = r.pick(CHOICES.header);
  v.footer = r.pick(CHOICES.footer);
  v.logo = r.chance(0.7);
  v.company = `${r.pick(WORDS.co1)} ${r.pick(WORDS.co2)}`;
  v.client = `${r.pick(WORDS.co1)} ${r.pick(WORDS.co2)}`;
  v.recipient = `${r.pick(WORDS.first)} ${r.pick(WORDS.last)}`;
  v.person = `${r.pick(WORDS.first)} ${r.pick(WORDS.last)}`;
  v.role = r.pick(WORDS.role);
  v.street = r.pick(WORDS.street);
  v.city = r.pick(WORDS.city);
  v.subject = r.pick(WORDS.subject);
  v.ref = `SL-${r.int(10, 99)}${r.int(100, 999)}`;
  v.date = `${r.int(1, 28)} ${r.pick(WORDS.month)} 2026`;
  v.due = `${r.int(1, 28)} ${r.pick(WORDS.month)} 2026`;
  v.amount = r.int(20, 90) * 100;
  v.docTitle = TITLE[v.kind](v);
  return v;
}

/** The choices as plain values, for the UI and doc.meta.template. */
export function summaryOf(v) {
  return {
    generator: GENERATOR, seed: v.seed, kind: v.kind, title: KIND_TITLE[v.kind], layout: v.layout,
    fonts: [v.fonts.heading, v.fonts.body], scheme: v.scheme, heading: v.heading, table: v.table,
    margins: v.margins, scale: v.scale, paper: v.paper, header: v.header, footer: v.footer, logo: v.logo,
  };
}

function buildDoc(v, r) {
  const sch = SCHEMES.find((s) => s.id === v.scheme);
  const section = sectionFor(v);
  const { bw } = pageBox(section);
  const B = makeBuilder(v, sch, bw);
  const body = KINDS[v.kind](B, v, r);
  const blocks = [...B.top(body), ...body.blocks];
  if (blocks[blocks.length - 1].type !== 'p') blocks.push(B.P(''));
  const hf = headerFooter(B, v, sch, bw);
  return {
    v: 1,
    meta: { title: v.docTitle, author: '', created: 0, modified: 0, template: summaryOf(v) },
    section,
    styles: styleSheet(v, sch),
    lists: { bul: bulletList() },
    media: {},
    blocks,
    header: hf.header,
    footer: hf.footer,
    footnotes: {},
    comments: {},
  };
}

/** A design for a seed. The same seed always returns the same result. */
export function generateTemplate(seed) {
  const s = String(seed);
  const r = rng(s);
  const v = drawVars(s, r);
  // names: the drawn names and title, so a package can reuse them in its other files (table, slides)
  const names = { title: v.docTitle, company: v.company, client: v.client, recipient: v.recipient, person: v.person, role: v.role };
  return { seed: s, vars: summaryOf(v), doc: buildDoc(v, r), names };
}

/** A new random seed: six characters of base 36. The caller supplies rand (Math.random by default). */
export function newSeed(rand = Math.random) {
  return Math.floor(rand() * 36 ** 6).toString(36).padStart(6, '0');
}
