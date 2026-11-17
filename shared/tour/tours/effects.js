/* SlopTour: Slop Effects. Targets are ids in effects/index.html. The words are keys in effects/i18n (effects.tour.title,
 * effects.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'effects',
  steps: [
    { id: 'preview', target: '#fx-view' },
    { id: 'composition', target: '#fx-comp' },
    { id: 'layer', target: '#fx-layer' },
    { id: 'timeline', target: '#fx-timeline' },
    { id: 'panel', target: '#fx-panel' },
    { id: 'render', target: '#fx-render' },
  ],
});
