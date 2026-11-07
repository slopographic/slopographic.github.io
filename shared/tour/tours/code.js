/* SlopTour: Slop Code. Targets are ids in code/index.html. The words are keys in code/i18n (code.tour.title,
 * code.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'code',
  steps: [
    { id: 'open', target: '#cd-open' },
    { id: 'new', target: '#cd-new' },
    { id: 'save', target: '#cd-save' },
    { id: 'explorer', target: '#cd-tree' },
    { id: 'run', target: '#cd-run' },
    { id: 'commands', target: '#cd-cmd' },
  ],
});
