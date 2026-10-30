// Round-up pages (/best/<slug>/): a fair comparison of one of our apps with well-known tools, drawn by
// tools/seo/roundups.mjs. One file per family of apps. A round-up:
//   { slug, app (ours), title (≤ 75), description (120–160), h1, crumb?, lead, checked: 'YYYY-MM-DD' (the day the facts were
//     checked), criteria: [≥ 3], columns: [table headings], tools: [3–8 of { name, ours?, url, bestFor, summary?, cells:
//     [one per column], pros, cons (≥ 1), sources: [{ label, url }] (required for every tool that is not ours) }],
//     matrix?: [≥ 5 of { feature, values: [one per tool: 'yes' | 'no' | 'partial' | 'unknown' | a short text] }] (the
//     feature table, also shown on the app's landing page), verdict?: paragraphs, faq: [[question, answer], ≥ 3] }
import { hydrate, seg } from '../i18n.mjs';
import { ROUNDUPS as creative } from './creative.mjs';
import { ROUNDUPS as creative2 } from './creative-2.mjs';
import { ROUNDUPS as creative3 } from './creative-3.mjs';
import { ROUNDUPS as creative4 } from './creative-4.mjs';
import { ROUNDUPS as documents } from './documents.mjs';
import { ROUNDUPS as documents2 } from './documents-2.mjs';
import { ROUNDUPS as documents3 } from './documents-3.mjs';
import { ROUNDUPS as documents4 } from './documents-4.mjs';
import { ROUNDUPS as business } from './business.mjs';
import { ROUNDUPS as business2 } from './business-2.mjs';
import { ROUNDUPS as business3 } from './business-3.mjs';
import { ROUNDUPS as compare } from './compare.mjs';
import { ROUNDUPS as colors } from './colors.mjs';
import { ROUNDUPS as recorder } from './recorder.mjs';

/** Our app comes first in every round-up: the tools, and each feature row's values with them (same order). The other
 *  tools keep the order they are written in. */
export function oursFirst(r) {
  const i = r.tools.findIndex((t) => t.ours);
  if (i <= 0) return r;
  const move = (list) => [list[i], ...list.slice(0, i), ...list.slice(i + 1)];
  return { ...r, tools: move(r.tools), matrix: r.matrix && r.matrix.map((m) => ({ ...m, values: move(m.values) })) };
}

const FACTS = [...creative, ...creative2, ...creative3, ...creative4, ...documents, ...documents2, ...documents3, ...documents4, ...business, ...business2, ...business3, ...compare, ...recorder, ...colors];
/** Every round-up in one language: the facts joined with its words, our app first. */
export const roundupsIn = (code = 'en') => FACTS.map((r) => oursFirst(hydrate(r, `seo.best.${seg(r.slug)}`, code)));
export const ROUNDUPS = roundupsIn('en');
