/* SlopTour: Slop Invoices. Targets are ids in invoices/index.html. The words are keys in invoices/i18n (invoices.tour.title,
 * invoices.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'invoices',
  steps: [
    { id: 'search', target: '#iSearch' },
    { id: 'new', target: '#iNew' },
    { id: 'from-order', target: '#iFromOrder' },
    { id: 'outstanding', target: '#iOutstanding' },
    { id: 'list', target: '#view-list' },
    { id: 'data', target: '#tab-data' },
  ],
});
