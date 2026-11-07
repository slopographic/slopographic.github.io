/* SlopTour: Slop Gallery. Targets are ids in gallery/index.html. The words are keys in gallery/i18n (gallery.tour.title,
 * gallery.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'gallery',
  steps: [
    { id: 'import', target: '#topImport' },
    { id: 'library', target: '#side' },
    { id: 'views', target: '#sideNav' },
    { id: 'grid', target: '#grid' },
    { id: 'panel', target: '#gPanel' },
    { id: 'duplicates', target: '#btnDupes' },
    { id: 'backup', target: '#btnBackup' },
  ],
});
