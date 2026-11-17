// Round-up for Slop Compare (shape in index.mjs): free diff tools. Every fact about another tool is from its own page,
// listed in its sources, and dated.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/best-compare*.js (keys seo.best.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const ROUNDUPS = [
  {
    slug: 'free-diff-tools',
    app: 'diff',
    checked: '2026-10-24',
    tools: [
      { name: 'Slop Compare', ours: true, pros: [null, null, null, '@seo.install.pro'] },
      { name: 'Diffchecker', url: 'https://www.diffchecker.com/', sources: [{ url: 'https://www.diffchecker.com/' }] },
      { name: 'WinMerge', url: 'https://winmerge.org/', sources: [{ url: 'https://winmerge.org/' }] },
      {
        name: 'Meld',
        url: 'https://meldmerge.org/',
        cells: ['@seo.best.free-diff-tools.tools.2.cells.0'],
        pros: [null, null, '@seo.best.free-diff-tools.tools.2.cells.3'],
        sources: [{ url: 'https://meldmerge.org/' }],
      },
    ],
    matrix: [
      { values: ['yes', 'yes', 'yes', 'yes'] },
      { values: ['yes', 'partial', 'yes', 'unknown'] },
      { values: ['yes', 'unknown', 'unknown', 'no'] },
      { values: ['yes', 'yes', 'yes', 'no'] },
      { values: ['yes', 'yes', 'unknown', 'no'] },
      { values: ['yes', 'yes', 'yes', 'no'] },
      { values: ['no', 'partial', 'yes', 'yes'] },
      { values: ['no', 'partial', 'yes', 'yes'] },
      { values: ['no', 'unknown', 'unknown', 'yes'] },
      { values: ['yes', 'unknown', 'unknown', 'unknown'] },
      { values: ['yes', 'yes', 'no', 'no'] },
      { values: ['yes', 'yes', 'no', 'no'] },
    ],
  },
];
