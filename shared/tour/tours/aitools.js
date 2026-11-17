/* SlopTour: Slop AI Tools. Targets are ids in aitools/index.html (a page without a header). The words are keys in aitools/i18n (aitools.tour.title,
 * aitools.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'aitools',
  steps: [
    { id: 'tools', target: '#toolList' },
    { id: 'models', target: '#modelList' },
    { id: 'storage', target: '#storeNote' },
    { id: 'status', target: '#status' },
  ],
});
