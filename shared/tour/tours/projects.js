/* SlopTour: Slop Projects. Targets are ids in projects/index.html. The words are keys in projects/i18n (projects.tour.title,
 * projects.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'projects',
  steps: [
    { id: 'pick', target: '#pPick' },
    { id: 'views', target: '#tab-board' },
    { id: 'find', target: '#fText' },
    { id: 'new', target: '#pNew' },
    { id: 'board', target: '#board' },
  ],
});
