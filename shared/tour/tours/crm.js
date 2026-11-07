/* SlopTour: Slop CRM. Targets are ids in crm/index.html. The words are keys in crm/i18n (crm.tour.title,
 * crm.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'crm',
  steps: [
    { id: 'views', target: '#tab-customers' },
    { id: 'search', target: '#cSearch' },
    { id: 'stage', target: '#cStage' },
    { id: 'groups', target: '#cSide' },
    { id: 'pipeline', target: '#tab-pipeline' },
    { id: 'import', target: '#cImport' },
  ],
});
