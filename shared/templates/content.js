/* Slop templates — content: the placeholder text for each kind of business document (letter, proposal, report,
 * memo, invoice, brief). Every sentence is drawn from the word banks in choices.js with the seeded generator, so
 * the same seed gives the same words. Each kind returns { title, subtitle, blocks }; the page-top layout (generate.js)
 * places the title. */
import { WORDS } from './choices.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const sentence = (r) => cap(`${r.pick(WORDS.subj)} ${r.pick(WORDS.verb)} ${r.pick(WORDS.obj)} ${r.pick(WORDS.when)}.`);
export const para = (r, n) => Array.from({ length: n }, () => sentence(r)).join(' ');
/** Money as a plain string with thousands separators (no locale, so the output is the same everywhere). */
export const money = (n) => '£' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** n distinct items from a list, in list order, drawn with the seeded generator. */
function someOf(r, list, n) {
  const idx = list.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = r.int(0, i); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx.slice(0, n).sort((a, b) => a - b).map((i) => list[i]);
}

function letter(B, v, r) {
  const blocks = [];
  if (v.layout !== 'twoColHeader') blocks.push(B.P(v.date));
  blocks.push(B.P(v.recipient, 'Normal', { after: 0 }), B.P(v.client, 'Normal', { after: 0 }), B.P(v.street, 'Normal', { after: 0 }), B.P(v.city, 'Normal', { after: 12 }));
  blocks.push(B.P(`Dear ${v.recipient.split(' ')[0]},`));
  blocks.push(B.P(para(r, 3)), B.P(para(r, 2)), B.P(para(r, 2)));
  blocks.push(B.P('Yours sincerely,', 'Normal', { before: 6, after: 28 }));
  blocks.push(B.P(v.person, 'Normal', { after: 0 }, { b: true }), B.P(v.role, 'Normal', { after: 0 }));
  return { title: null, subtitle: `Re: ${v.subject}`, blocks };
}

function proposal(B, v, r) {
  const phases = WORDS.phase.slice(0, 3);
  return {
    title: v.docTitle, subtitle: v.subject,
    blocks: [
      B.H1('Summary'), B.P(para(r, 2)),
      B.H1('Scope'), ...B.bullets(someOf(r, WORDS.action, 3)),
      B.H1('Timeline'), B.P(para(r, 1)),
      B.styled({ fr: [0.3, 0.2, 0.5], head: ['Phase', 'Weeks', 'Output'], rows: phases.map((p, i) => [p, String(r.int(1, 4)), WORDS.output[i]]) }),
      B.H1('Fees'), B.P(`The fixed fee is ${money(v.amount)} plus VAT, invoiced in two stages. ${sentence(r)}`),
    ],
  };
}

function memo(B, v, r) {
  return {
    title: v.docTitle, subtitle: null,
    blocks: [
      B.kv([['To', v.recipient], ['From', v.person], ['Date', v.date], ['Subject', v.subject]]),
      B.H1('Purpose'), B.P(para(r, 2)),
      B.H1('Decision needed'), ...B.bullets(someOf(r, WORDS.objective, 2)),
      B.P(para(r, 1)),
    ],
  };
}

function report(B, v, r) {
  const figures = WORDS.metric.map((m) => [m, String(r.int(120, 990)), String(r.int(120, 990))]);
  return {
    title: v.docTitle, subtitle: `${v.company}, ${v.date}`,
    blocks: [
      B.H1('Introduction'), B.P(para(r, 2)),
      B.H1('Method'), B.P(para(r, 2)),
      B.H1('Findings'), B.P(para(r, 2)),
      B.H2('Key figures'),
      B.styled({ fr: [0.5, 0.25, 0.25], head: ['Metric', 'This year', 'Last year'], rows: figures, right: [1, 2] }),
      B.H1('Next steps'), ...B.bullets(someOf(r, WORDS.action, 3)),
    ],
  };
}

function invoice(B, v, r) {
  const items = WORDS.item.map((d) => { const qty = r.int(1, 12), rate = r.int(12, 28) * 5; return { d, qty, rate, amount: qty * rate }; });
  const total = items.reduce((a, it) => a + it.amount, 0);
  return {
    title: v.docTitle, subtitle: null,
    blocks: [
      B.kv([['Invoice no.', v.ref], ['Issued', v.date], ['Due', v.due], ['Bill to', v.client]]),
      B.styled({
        fr: [0.5, 0.12, 0.18, 0.2], head: ['Description', 'Qty', 'Rate', 'Amount'], right: [1, 2, 3], total: true,
        rows: [...items.map((it) => [it.d, String(it.qty), money(it.rate), money(it.amount)]), ['Total', '', '', money(total)]],
      }),
      B.P(`Payment terms: 30 days by bank transfer. ${sentence(r)}`),
    ],
  };
}

function brief(B, v, r) {
  return {
    title: v.docTitle, subtitle: v.subject,
    blocks: [
      B.H2('Objective'), B.P(para(r, 2)),
      B.H2('Audience'), B.P(sentence(r)),
      B.H2('Key messages'), ...B.bullets(someOf(r, WORDS.message, 3)),
      B.H2('Constraints'), B.P(para(r, 1)),
    ],
  };
}

export const KINDS = { letter, proposal, memo, report, invoice, brief };
