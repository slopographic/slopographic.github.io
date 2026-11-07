/* Slop package: one seed makes a set of business files that share names, figures and a title.
 *   buildPackage(seed) → { seed, vars, doc, table, outline }
 *   doc      the Docs document (.sdoc), from shared/templates (generateTemplate), so Docs opens it as it is
 *   table    CSV text: an invoice-style table with the same client, person and amounts as the document
 *   outline  Markdown: one slide per "---" line, with the title, the agenda and a figures slide
 * Pure and deterministic: the same seed gives the same three files on every run (no Math.random, no Date).
 * Seed text is what the link carries (#seed=...). */
import { generateTemplate } from '../../shared/templates/generate.js';
import { rng } from '../../shared/templates/rng.js';
import { WORDS } from '../../shared/templates/choices.js';

export const SEED_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** Rows of the table: the same items as the document's design, with quantities and rates drawn from the seed. */
function tableRows(r) {
  const n = r.int(3, WORDS.item.length);
  const pool = [...WORDS.item];  // each item once per table: take it out of the pool when it is used
  const rows = [];
  for (let i = 0; i < n; i++) {
    const qty = r.int(1, 12), rate = r.int(8, 22) * 10;
    const item = pool.splice(r.int(0, pool.length - 1), 1)[0];
    rows.push({ item, qty, rate, amount: qty * rate });
  }
  return rows;
}

/** CSV with quoting for commas, quotes and line breaks. */
export function toCsv(rows) {
  const cell = (v) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Slide outline: the title, an agenda from the table's items, a figures slide and a closing slide. names: from generateTemplate. */
function outlineOf(names, rows) {
  const total = rows.reduce((t, r) => t + r.amount, 0);
  const figures = rows.map((r) => `- ${r.item}: ${r.qty} × £${r.rate} = £${r.amount}`).join('\n');
  return [
    `# ${names.title}`,
    `${names.company} for ${names.client}`,
    '---',
    '## Agenda',
    rows.map((r) => `- ${r.item}`).join('\n'),
    '---',
    '## Figures',
    figures,
    `Total: £${total}`,
    '---',
    '## Next steps',
    `- Confirm with ${names.recipient}`,
    `- Contact: ${names.person}, ${names.role}`,
    '',
  ].join('\n');
}

/** The three files for one seed. The table and the outline draw from their own generator, so they do not change the document. */
export function buildPackage(seed) {
  const t = generateTemplate(seed);
  const r = rng(seed + ':table');
  const rows = tableRows(r);
  const header = ['Item', 'Qty', 'Rate (£)', 'Amount (£)'];
  const csv = toCsv([header, ...rows.map((x) => [x.item, x.qty, x.rate, x.amount])]);
  const outline = outlineOf(t.names, rows);
  return { seed: t.seed, vars: t.vars, names: t.names, doc: t.doc, table: csv, outline };
}

/** A seed from a string in the link, or null when it is not a usable seed. */
export function seedFromHash(hash) {
  const m = /[#&]seed=([^&]*)/.exec(hash || '');
  if (!m) return null;
  let s = '';
  try { s = decodeURIComponent(m[1]); } catch (e) { return null; }
  return SEED_PATTERN.test(s) ? s : null;
}

/** A random seed: 24 characters from the browser's random source, so two seeds are effectively never the same. */
export function newPackageSeed(bytes) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 24; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}
