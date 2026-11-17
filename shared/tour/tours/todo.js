/* SlopTour: Slop To-do. Targets are ids in todo/index.html. The words are keys in todo/i18n (todo.tour.title,
 * todo.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'todo',
  steps: [
    { id: 'lists', target: '#tSide' },
    { id: 'title', target: '#tTitle' },
    { id: 'add', target: '#tAdd' },
    { id: 'done', target: '#tDone' },
    { id: 'find', target: '#tSearch' },
    { id: 'tasks', target: '#tList' },
  ],
});
