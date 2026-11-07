/* SlopTour: Slop Docs. Targets are ids in docs/index.html. The words are keys in docs/i18n (docs.tour.title,
 * docs.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'docs',
  steps: [
    { id: 'name', target: '#docName' },
    { id: 'menus', target: '#menus' },
    { id: 'formatting', target: '#toolbar' },
    { id: 'style', target: '#selStyle' },
    { id: 'page', target: '#stage' },
    { id: 'save', target: '#btnSave' },
  ],
});
