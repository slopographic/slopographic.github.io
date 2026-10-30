/* SlopTour: Slop Image to 3D (the img3d folder). Targets are ids in img3d/index.html. The words are keys in img3d/i18n (img3d.tour.title,
 * img3d.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). */
SlopTour.define({
  app: 'img3d',
  steps: [
    { id: 'picture', target: '#vp' },
    { id: 'drive', target: '#btnDrive' },
    { id: 'invert', target: '#invert' },
    { id: 'subject', target: '#subject' },
    { id: 'scale', target: '#scale' },
    { id: 'send', target: '#btnSend' },
  ],
});
