/* The hub's conversion cards. One card per converter page in PAGES (core/pages.js, the single list), grouped by
 * category and filtered by the search box. Each card shows the file type on both sides of an arrow (SlopFlow), a one-line
 * description, the accepted types and a Convert link to the page. The card's label and summary are the page's own
 * (p.label, p.summary: the tables' convert.card.<slug>, the same text the SEO pages use), the category is groupLabel's;
 * the cards are redrawn on a language change, and the search reads the shown words, the slug and the category id. */
import { PAGES } from '../core/pages.js';
import { groupLabel } from '../core/catalog.js';
import { tr, onLang } from '../core/i18n.js';
import { h } from './dom.js';
import '../../../shared/ui/flow.js';   // window.SlopFlow: the same PDF → DOCX picture as the converter pages

// The order of the groups. A page whose category is not listed still gets a group (after these), so every page in
// PAGES has a card: the hub never drops a page because its category was not added here.
const ORDER = ['Documents', 'Images', 'Camera RAW', 'Audio and video', 'Data', 'Text & code', '3D models', 'Finance'];   // i18n-ignore: category ids (groupLabel)
export const CATEGORIES = [...new Set([...ORDER, ...PAGES.map((p) => p.cat)])];

const accepts = (p) => (p.from.length ? p.from.map((k) => k.toUpperCase()).join(', ') : tr('convert.card.any_file'));

function card(p) {
  const [from, to] = p.pair, label = p.label;
  const search = [label, p.slug.replace(/-/g, ' '), from, to, groupLabel(p.cat), p.cat, p.summary, accepts(p)].join(' ').toLowerCase();
  return h('article', { class: 'cv-pair', 'data-pair': p.slug, 'data-search': search },
    h('div', { class: 'cv-pair-path' }, window.SlopFlow.create({ from, to, label: tr('convert.card.flow', { from, to }) }).el),
    h('h3', { class: 'cv-pair-title' }, label),
    h('p', { class: 'cv-pair-desc' }, p.summary),
    h('p', { class: 'cv-pair-accepts' }, tr('convert.card.accepts') + ' ', h('span', null, accepts(p))),
    h('a', { class: 'cv-btn cv-primary cv-pair-go', href: `${p.slug}/`, 'aria-label': tr('convert.card.go_label', { label }) }, tr('convert.card.go')));
}

/** Draws the grouped cards into `root` and wires the search box `search` (an input) and the empty message `empty`. */
export function mountCards(root, { search = null, empty = null } = {}) {
  let groups = [];
  const draw = () => {
    groups = CATEGORIES.map((cat, i) => {
      const pages = PAGES.filter((p) => p.cat === cat);
      const id = `cv-cat-${i}`;
      return { cat, pages, section: h('section', { class: 'cv-cat', 'aria-labelledby': id, 'data-cat': cat },
        h('h3', { class: 'cv-cat-h', id }, groupLabel(cat)),
        h('div', { class: 'cv-pairs' }, pages.map(card))) };
    });
    root.replaceChildren(...groups.map((g) => g.section));
  };

  const apply = () => {
    const terms = (search ? search.value : '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const g of groups) {
      let n = 0;
      for (const c of g.section.querySelectorAll('.cv-pair')) {
        const ok = terms.every((t) => c.dataset.search.includes(t));
        c.hidden = !ok;
        if (ok) n++;
      }
      g.section.hidden = n === 0;
      shown += n;
    }
    if (empty) empty.hidden = shown > 0;
  };
  draw();
  if (search) search.addEventListener('input', apply);
  apply();
  onLang(() => { draw(); apply(); });
  return { apply, count: () => root.querySelectorAll('.cv-pair').length };
}
