/* SlopVector navigation presets: the stage adapter for shared/nav (wheel, pan, touch and keys).
 * Only this file touches the view: the presets, the engine and the dialog live in shared/nav.
 * Wheel and keys ease (core/zoom.js); a pinch (live) follows the fingers at once.
 * Loaded after ui/commands.js (SV and the stage element are its globals). */
(function () {
  'use strict';
  const host = document.getElementById('stage');
  if (!window.SlopNav || !host) return;
  const S = window.SV.state; // the app state (core/state.js); a classic script has no global S
  SlopNav.attach('vector', {
    title: 'SlopVector', // i18n-ignore: the app's name
    host,
    adapter: {
      zoomAt: (f, x, y, live) => (live ? SV.setZoom(S.view.zoom * f, x, y) : SV.zoomBy(f, x, y)),
      panBy: (dx, dy) => { SV.panView(dx, dy); if (S.editing) SV.positionEditor(); },
      fit: () => SV.fitArtboard(true),
      actual: () => SV.actualSize(true),
      zoomStep: (dir, x, y) => SV.zoomStep(dir, x, y),
      // A second finger ends a drag the first finger started (same as Esc does).
      cancelStroke: () => { if (S.op) { SV.revert(); S.op = null; S.marquee = null; S.readout = null; SV.requestRender(true); } },
    },
    // Matched by command title, so the titles are read in the current language each time (as SlopCmd has them).
    shortcuts: () => SlopNav.shortcutsFrom({ fit: SV.t('vector.act.view_fit'), actual: SV.t('vector.act.view_actual'), zoomIn: SV.t('vector.act.view_zoom_in'), zoomOut: SV.t('vector.act.view_zoom_out') })(),
  });
})();
