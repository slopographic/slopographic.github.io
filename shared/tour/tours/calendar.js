/* SlopTour: Slop Calendar. Targets are ids in calendar/index.html. The words are keys in calendar/i18n (calendar.tour.title,
 * calendar.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'calendar',
  steps: [
    { id: 'period', target: '#cTitle' },
    { id: 'new', target: '#cNew' },
    { id: 'todos', target: '#cTasks' },
    { id: 'zone', target: '#cZone' },
    { id: 'ics', target: '#cExport' },
    { id: 'config', target: '#cConfig' },
  ],
});
