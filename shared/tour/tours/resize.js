/* SlopTour: Slop Resize. Targets are ids in resize/index.html. The words are keys in resize/i18n (resize.tour.title,
 * resize.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'resize',
  steps: [
    { id: 'open', target: '#rs-open' },
    { id: 'drop', target: '#rs-drop' },
    { id: 'preset', target: '#rs-preset' },
    { id: 'mode', target: '#rs-mode' },
    { id: 'run', target: '#rs-run' },
    { id: 'download', target: '#rs-zip' },
  ],
});
