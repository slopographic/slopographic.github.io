/* The words a converter page shares with its hub card: label (the card's title, the page's breadcrumb) and summary (the
 * card's line). They are not written in the page lists (core/*pages*.js): they are the tables' convert.card.<slug> and
 * convert.card.<slug>_sum (convert/i18n/<code>/cards*.js, the one source), read when used, so the hub follows the
 * language and the SEO generator (Node: English) writes the same text.
 *   cardKey(page)    the tables' key of the label ('_sum' added: the summary)
 *   withWords(list)  gives each page of a list its label and summary; returns the list */
import { tr } from './i18n.js';

export const cardKey = (p) => 'convert.card.' + p.slug.replace(/[^a-z0-9]+/g, '_');

export function withWords(list) {
  for (const p of list) {
    Object.defineProperties(p, {
      label: { enumerable: true, configurable: true, get: () => tr(cardKey(p)) },
      summary: { enumerable: true, configurable: true, get: () => tr(cardKey(p) + '_sum') },
    });
  }
  return list;
}
