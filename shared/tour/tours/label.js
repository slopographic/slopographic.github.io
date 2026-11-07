/* SlopTour: SlopLabel. Targets are ids in label/index.html. The words are keys in label/i18n (label.tour.title,
 * label.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'label',
  steps: [
    { id: 'setup', target: '#cbLabel' },
    { id: 'tools', target: '#toolbox' },
    { id: 'label', target: '#workspace' },
    { id: 'zoom', target: '#zoomVal' },
    { id: 'panels', target: '#dock' },
    { id: 'print', target: '#btnPrint' },
  ],
});
