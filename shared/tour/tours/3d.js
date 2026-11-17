/* SlopTour: Slop 3D (the 3d folder). Targets are ids in 3d/index.html. The words are keys in 3d/i18n (3d.tour.title,
 * 3d.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: '3d',
  steps: [
    { id: 'add', target: '#btnAdd' },
    { id: 'open', target: '#btnOpen' },
    { id: 'view', target: '#view' },
    { id: 'outliner', target: '#outliner' },
    { id: 'edit', target: '#btnEdit' },
    { id: 'export', target: '#btnExport' },
  ],
});
