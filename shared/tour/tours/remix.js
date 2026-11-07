/* SlopTour: Reel Remix. Targets are ids in remix/index.html. The words are keys in remix/i18n (remix.tour.title,
 * remix.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'remix',
  steps: [
    { id: 'clips', target: '#rm-drop' },
    { id: 'preview', target: '#rm-stage' },
    { id: 'keys', target: '#rm-keys' },
    { id: 'layout', target: '#rm-base' },
    { id: 'export', target: '#rm-export' },
    { id: 'config', target: '#rm-config' },
  ],
});
