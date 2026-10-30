/* SlopTour: Slop Drive. Targets are ids in drive/index.html. The words are keys in drive/i18n (drive.tour.title,
 * drive.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'drive',
  steps: [
    { id: 'places', target: '#side' },
    { id: 'search', target: '#search' },
    { id: 'new', target: '#btnNew' },
    { id: 'files', target: '#pane' },
    { id: 'info', target: '#btnInfo' },
    { id: 'backup', target: '#btnBackup' },
  ],
});
