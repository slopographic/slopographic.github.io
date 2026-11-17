/* SlopTour: Slop Upscale. Targets are ids in upscale/index.html. The words are keys in upscale/i18n (upscale.tour.title,
 * upscale.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'upscale',
  steps: [
    { id: 'open', target: '#up-open' },
    { id: 'picture', target: '#up-stage-wrap' },
    { id: 'scale', target: '#up-scale-2' },
    { id: 'model', target: '#up-model' },
    { id: 'format', target: '#up-format' },
    { id: 'run', target: '#up-run' },
  ],
});
