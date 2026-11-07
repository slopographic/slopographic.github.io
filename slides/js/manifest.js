/* Slop Slides: every app script in load order, by package (paths relative to the site root). anim lists the shared motion engine first.
   index.html, the tests and the offline build all follow this list. */
window.SS_MANIFEST = {
  core: ['shared/transform/aspect.js', 'slides/js/core/util.js', 'slides/js/core/themes.js', 'slides/js/core/objects.js', 'slides/js/core/layouts.js', 'slides/js/core/model.js', 'slides/js/core/outline.js', 'slides/js/core/history.js'],
  render: ['slides/js/render/ttf.js', 'slides/js/render/fonts.js', 'slides/js/render/text.js', 'slides/js/render/shapes.js', 'slides/js/render/scene.js', 'slides/js/render/table.js', 'slides/js/render/canvas.js'],
  anim: ['shared/motion/easing.js', 'shared/motion/track.js', 'shared/motion/timeline.js', 'shared/motion/transitions.js',
    'shared/motion/playback.js', 'shared/motion/presets.js', 'shared/presets/core.js', 'shared/presets/builtins-effect.js', 'shared/presets/builtins-motion.js',
    'shared/presets/io.js', 'shared/presets/store.js', 'shared/presets/motion.js', 'shared/presets/ui.js', 'slides/js/anim/object.js', 'slides/js/anim/transition.js', 'slides/js/anim/migrate.js'],
  io: ['slides/js/io/templates.js', 'slides/js/io/templates-decks.js', 'slides/js/io/validate.js', 'slides/js/io/native.js', 'slides/js/io/template-file.js', 'slides/js/io/template-store.js', 'slides/js/io/pptx.js',
    'slides/js/io/pptx-in-style.js', 'slides/js/io/pptx-in-text.js', 'slides/js/io/pptx-in-shape.js', 'slides/js/io/pptx-in.js',
    'slides/js/io/pdf-math.js', 'slides/js/io/pdf-text.js', 'slides/js/io/pdf-paint.js', 'slides/js/io/pdf.js', 'slides/js/io/config.js'],
  ui: ['shared/ui/sheet.js', 'shared/frame/panel.js', 'slides/js/ui/dom.js', 'slides/js/ui/app.js', 'slides/js/ui/tabs.js', 'slides/js/ui/view-state.js', 'slides/js/ui/canvas-view.js', 'slides/js/ui/overlay.js', 'slides/js/ui/snap.js',
    'slides/js/ui/textedit-parse.js', 'slides/js/ui/textedit.js', 'slides/js/ui/pointer.js', 'slides/js/ui/ops.js', 'slides/js/ui/aspect.js', 'slides/js/ui/buffer.js', 'slides/js/ui/sorter.js',
    'slides/js/ui/sorter-drag.js', 'slides/js/ui/inspector.js', 'slides/js/ui/anim-panel.js', 'slides/js/ui/toolbar.js', 'slides/js/ui/files.js', 'slides/js/ui/templates-dialog.js', 'slides/js/ui/present-view.js', 'slides/js/ui/present.js',
    'slides/js/ui/presenter-view.js', 'slides/js/ui/presenter.js', 'slides/js/ui/file-drop.js',
    'slides/js/ui/commands.js', 'slides/js/ui/ctxmenu.js', 'slides/js/ui/main.js']
};
