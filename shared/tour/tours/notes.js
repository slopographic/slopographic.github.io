/* SlopTour: Slop Notes. Targets are ids in notes/index.html. The words are keys in notes/i18n (notes.tour.title,
 * notes.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'notes',
  steps: [
    { id: 'notebooks', target: '#nt-side' },
    { id: 'new', target: '#nt-new' },
    { id: 'search', target: '#nt-q' },
    { id: 'list', target: '#nt-notes' },
    { id: 'editor', target: '#nt-main' },
    { id: 'commands', target: '#nt-cmd' },
  ],
});
