/* SlopTour: Slop Isolate (the slopisolate folder). Targets are ids in slopisolate/index.html. The words are keys in slopisolate/i18n (cutout.tour.title,
 * cutout.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'slopisolate',
  ns: 'cutout',
  steps: [
    { id: 'stage', target: '#stage' },
    { id: 'undo', target: '#btnUndo' },
    { id: 'settings', target: '#props' },
    { id: 'download', target: '#btnDownload' },
  ],
});
