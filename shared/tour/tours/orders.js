/* SlopTour: Slop Orders. Targets are ids in orders/index.html. The words are keys in orders/i18n (orders.tour.title,
 * orders.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'orders',
  steps: [
    { id: 'search', target: '#oSearch' },
    { id: 'new', target: '#oNew' },
    { id: 'status', target: '#oStatus' },
    { id: 'list', target: '#view-list' },
    { id: 'summary', target: '#oSummary' },
    { id: 'samples', target: '#oSamples' },
  ],
});
