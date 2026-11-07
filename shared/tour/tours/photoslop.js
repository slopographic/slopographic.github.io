/* SlopTour: PhotoSlop. Targets are ids in photoslop/index.html. The words are keys in photoslop/i18n (photoslop.tour.title,
 * photoslop.tour.<step>_title and _text), read when the tour shows them (shared/tour/HANDOFF.md). A button the top bar folds
 * into More ▾ when it is narrow (app/topbar-fit.js: .ps-fold) is pointed at through that menu: "#x:not(.ps-fold), #topMore"
 * finds the button, else More ▾. */
SlopTour.define({
  app: 'photoslop',
  steps: [
    { id: 'new', target: '#newBtn:not(.ps-fold), #topMore' },
    { id: 'menus', target: '#menubar' },
    { id: 'tools', target: '#toolbox' },
    { id: 'options', target: '#options' },
    { id: 'canvas', target: '#viewport' },
    { id: 'panels', target: '#panels' },
    { id: 'export', target: '#exportBtn' },
    { id: 'theme', target: '#themeToggle:not(.ps-fold), #topMore' },
  ],
});
