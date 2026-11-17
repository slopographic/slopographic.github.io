/* SlopTour: SlopCut (the slopcut folder). Targets are ids in slopcut/index.html. The words are keys in slopcut/i18n (slopedit.tour.title,
 * slopedit.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'slopcut',
  ns: 'slopedit',
  steps: [
    { id: 'bin', target: '#bin' },
    { id: 'monitor', target: '#monitor' },
    { id: 'inspector', target: '#insp' },
    { id: 'timeline', target: '#timeline' },
    { id: 'undo', target: '#btnUndo' },
    { id: 'export', target: '#btnExport' },
  ],
});
