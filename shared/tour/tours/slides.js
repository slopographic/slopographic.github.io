/* SlopTour: Slop Slides. Targets are ids in slides/index.html. The words are keys in slides/i18n (slides.tour.title,
 * slides.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'slides',
  steps: [
    { id: 'list', target: '#slides-list' },
    { id: 'insert', target: '#insText' },
    { id: 'stage', target: '#stage' },
    { id: 'layout', target: '#selLayout' },
    { id: 'theme', target: '#selTheme' },
    { id: 'present', target: '#btnPresent' },
  ],
});
