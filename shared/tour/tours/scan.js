/* SlopTour: Slop Scan. Targets are ids in scan/index.html. The words are keys in scan/i18n (scan.tour.title,
 * scan.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'scan',
  steps: [
    { id: 'camera', target: '#sc-empty-camera' },
    { id: 'page', target: '#sc-view' },
    { id: 'pages', target: '#sc-list' },
    { id: 'look', target: '#sc-panel' },
    { id: 'pdf', target: '#sc-panel' },
    { id: 'make', target: '#sc-panel' },
  ],
});
