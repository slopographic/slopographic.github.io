// The head copy of File convert's converter pages that write.mjs writes (PAGES in copy.mjs): taken from the page lists
// in convert/js/core/ (the same title and description the page uses, and its label: the hub card's title, from the
// convert tables through core/page-words.js), so they are written once.
// Each becomes { title, crumb (the page's label), category, description } under 'convert/<slug>'.
import { PAGES } from '../../convert/js/core/pages.js';
import { THREED_PAGES } from '../../convert/js/core/threed-pages.js';
import { FINANCE_PAGES } from '../../convert/js/core/finance-pages.js';
import { RAW_PAGES } from '../../convert/js/core/raw-pages.js';
import { MORE_PAGES } from '../../convert/js/core/more-pages.js';
import { DATA_PAGES } from '../../convert/js/core/data-pages.js';
import { CHAIN_PAGES } from '../../convert/js/core/chain-pages.js';
import { PDF_LOCK_PAGES } from '../../convert/js/core/pdf-lock-pages.js';
import { OFFICE_PAGES } from '../../convert/js/core/office-pages.js';
import { MORE_PAGES_2 } from '../../convert/js/core/more-pages-2.js';
import { MORE_PAGES_3 } from '../../convert/js/core/more-pages-3.js';

/** { 'convert/<slug>': copy } for a list of pages, in its order. */
export const copyOf = (list, category = 'UtilitiesApplication') => Object.fromEntries(list.map((p) => [`convert/${p.slug}`,
  { title: p.title, crumb: p.label, category: p.appCat || category, description: p.description }]));

export const VCF_COPY = copyOf(PAGES.filter((p) => /(^|-)vcf(-|$)/.test(p.slug)));   // contacts (core/pages.js)
export const FINANCE_COPY = copyOf(FINANCE_PAGES, 'FinanceApplication');   // SIE files and bank statements
export const THREED_COPY = copyOf(THREED_PAGES);   // 3D models
export const CONVERT_PAGES = copyOf([...RAW_PAGES, ...MORE_PAGES, ...DATA_PAGES, ...CHAIN_PAGES, ...PDF_LOCK_PAGES, ...OFFICE_PAGES, ...MORE_PAGES_2, ...MORE_PAGES_3]);
