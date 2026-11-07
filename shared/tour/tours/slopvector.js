/* SlopTour: SlopVector. Targets are ids in slopvector/index.html. The words are keys in slopvector/i18n (vector.tour.title,
 * vector.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'slopvector',
  ns: 'vector',
  steps: [
    { id: 'menus', target: '#menus' },
    { id: 'controls', target: '#controlbar' },
    { id: 'tools', target: '#toolbar' },
    { id: 'artboard', target: '#workspace' },
    { id: 'panels', target: '#dock' },
    { id: 'status', target: '#statusbar' },
  ],
});
