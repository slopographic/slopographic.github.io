/* SlopTour: Slop Tables. Targets are ids in tables/index.html. The words are keys in tables/i18n (tables.tour.title,
 * tables.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'tables',
  steps: [
    { id: 'namebox', target: '#namebox' },
    { id: 'formula', target: '#fx' },
    { id: 'grid', target: '#grid' },
    { id: 'format', target: '#nf' },
    { id: 'side', target: '#side' },
    { id: 'save', target: '#btnSave' },
  ],
});
