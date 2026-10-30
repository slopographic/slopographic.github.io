// Round-ups for Slop Colors (shape in index.mjs): colour palette and contrast tools. Every fact about another tool is from
// its own page, listed in its sources, and dated.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/best-colors*.js (keys seo.best.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const ROUNDUPS = [
  {
    slug: 'free-color-palette-tools',
    app: 'colors',
    checked: '2026-10-25',
    columns: [null, null, '@seo.best.free-color-palette-tools.criteria.1'],
    tools: [
      { name: 'Slop Colors', ours: true },
      { name: 'Coolors', url: 'https://coolors.co/', sources: [{ url: 'https://coolors.co/' }] },
      { name: 'Adobe Color', url: 'https://color.adobe.com/create/color-wheel', sources: [{ url: 'https://color.adobe.com/create/color-wheel' }] },
      {
        name: 'WebAIM Contrast Checker',
        url: 'https://webaim.org/resources/contrastchecker/',
        cells: ['@seo.best.free-color-palette-tools.tools.2.cells.0', '@seo.best.free-color-palette-tools.tools.2.cells.1'],
        sources: [{ url: 'https://webaim.org/resources/contrastchecker/' }],
      },
    ],
    matrix: [
      { feature: '@seo.best.free-color-palette-tools.criteria.1', values: ['yes', 'yes', 'yes', 'no'] },
      { values: ['yes', 'unknown', 'yes', 'no'] },
      { feature: '@seo.best.free-color-palette-tools.criteria.3', values: ['yes', 'yes', 'yes', 'yes'] },
      { values: ['yes', 'unknown', 'unknown', 'yes'] },
      { feature: '@seo.best.free-color-palette-tools.tools.2.pros.1', values: ['no', 'unknown', 'yes', 'no'] },
      { values: ['yes', 'yes', 'unknown', 'no'] },
      { values: ['yes', 'yes', 'unknown', 'no'] },
      { values: ['yes', 'yes', 'unknown', 'no'] },
      { values: ['yes', 'unknown', 'unknown', 'no'] },
      { values: ['yes', 'unknown', 'unknown', 'no'] },
      { values: ['yes', 'partial', 'partial', 'yes'] },
      { values: ['yes', 'unknown', 'unknown', 'yes'] },
    ],
  },
];
