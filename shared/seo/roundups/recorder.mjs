// Round-up for Slop Recorder: free screen recorders. Every fact about another tool is from its own pages, listed in its
// sources, as they read on the checked date; what those pages do not say is 'unknown'.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/best-recorder*.js (keys seo.best.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const ROUNDUPS = [
  {
    slug: 'free-screen-recorders',
    app: 'recorder',
    checked: '2026-10-24',
    tools: [
      { name: 'Slop Recorder', ours: true },
      { name: 'OBS Studio', url: 'https://obsproject.com/', sources: [{ url: 'https://obsproject.com/' }] },
      {
        name: 'ShareX',
        url: 'https://getsharex.com/',
        cells: ['@seo.best.free-screen-recorders.tools.1.cells.0'],
        pros: [null, null, '@seo.best.free-screen-recorders.tools.1.pros.2'],
        sources: [{ url: 'https://getsharex.com/' }],
      },
      {
        name: 'Loom',
        url: 'https://www.loom.com/pricing',
        cells: [null, null, null, '@seo.best.free-screen-recorders.tools.1.cells.3'],
        sources: [{ url: 'https://www.loom.com/pricing' }],
      },
    ],
    matrix: [
      { values: ['yes', 'yes', 'yes', 'yes'] },
      { values: ['yes', 'yes', 'unknown', 'yes'] },
      { values: ['yes', 'yes', 'yes', 'yes'] },
      { feature: '@seo.best.free-screen-recorders.criteria.2', values: ['partial', 'yes', 'unknown', 'unknown'] },
      { values: ['yes', 'unknown', 'unknown', 'unknown'] },
      { values: ['yes', 'no', 'unknown', 'unknown'] },
      { values: ['yes', 'unknown', 'yes', 'unknown'] },
      { values: ['no', 'yes', 'no', 'no'] },
      { values: ['yes', 'no', 'no', 'partial'] },
      { values: ['yes', 'yes', 'yes', 'no'] },
      { values: ['yes', 'yes', 'partial', 'no'] },
      { values: ['yes', 'yes', 'no', 'unknown'] },
    ],
  },
];
