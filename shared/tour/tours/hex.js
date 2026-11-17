/* SlopTour: Slop Hex. Targets are ids in hex/index.html. The words are keys in hex/i18n (hex.tour.title,
 * hex.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'hex',
  steps: [
    { id: 'open', target: '#hx-open' },
    { id: 'drive', target: '#hx-drive' },
    { id: 'bytes', target: '#hx-main' },
    { id: 'goto', target: '#hx-goto' },
    { id: 'find', target: '#hx-q' },
    { id: 'save', target: '#hx-save' },
  ],
});
