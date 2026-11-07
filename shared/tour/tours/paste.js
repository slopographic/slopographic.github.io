/* SlopTour: Slop Paste. Targets are ids in paste/index.html. The words are keys in paste/i18n (paste.tour.title,
 * paste.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'paste',
  steps: [
    { id: 'new', target: '#pb-new' },
    { id: 'search', target: '#pb-q' },
    { id: 'image', target: '#pb-add-img' },
    { id: 'items', target: '#pb-items' },
    { id: 'editor', target: '#pb-main' },
    { id: 'commands', target: '#pb-cmd' },
  ],
});
