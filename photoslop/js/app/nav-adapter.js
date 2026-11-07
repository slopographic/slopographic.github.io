/* PhotoSlop navigation presets: the viewport adapter for shared/nav (wheel, pan, touch and keys).
 * Only this file touches the view: the presets, the engine and the dialog live in shared/nav.
 * Loaded after view.js (V, setZoom, fitView, actualPixels, zoomStep, dirty are its globals). */
(function () {
  'use strict';
  const host = document.getElementById('viewport');
  if (!window.SlopNav || !host) return;
  const APP = 'photoslop';
  // The engine's capture listeners run before the app's Space handler (commands.js), and a preset may swallow Space
  // for its own pan. Mirror Space into the app's state here, first, so V.space (read by view.js and the guides) is
  // set under every preset. Keyup needs nothing: main.js's keyup handler clears V.space and is not stopped.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey) return;   // i18n-ignore: ids, class names, key names or text for agents
    if (window.SlopUI && SlopUI.openDialogs) return;
    if ((!!window.SlopTyping && window.SlopTyping.isTyping(e, { controls: true }))) return;   // shared/input/typing.js
    V.space = true; V.el.classList.add('space');
  }, true);
  SlopNav.attach(APP, {
    title: 'PhotoSlop',   // i18n-ignore: ids, class names, key names or text for agents
    host,
    adapter: {
      zoomAt: (f, x, y) => setZoom(V.zoom * f, viewPt(x, y)), // x, y are viewport points
      panBy: (dx, dy) => { const d = viewDelta(dx, dy); V.ox += d.x; V.oy += d.y; dirty(); },
      fit: () => fitView(),
      actual: () => actualPixels(),
      zoomStep: (dir, x, y) => zoomStep(dir, viewPt(x, y)),
      // A second finger takes over from a stroke the first finger started.
      cancelStroke: () => { if (V.op) { const t = V.op.tool; if (t.cancel) t.cancel(); V.op = null; dirty(); } },
    },
    // matched by command title, so the titles are read in the current language each time
    shortcuts: SlopNav.shortcutsFrom({ get fit() { return tr('photoslop.menu.fit_on_screen'); }, actual: '100%', get zoomIn() { return tr('photoslop.menu.zoom_in'); },
      get zoomOut() { return tr('photoslop.menu.zoom_out'); }, get handTool() { return TOOL.hand ? TOOL.hand.name : 'Hand Tool'; } }),   // i18n-ignore: fallback
  });
  const register = () => SlopCmd.register([{ id: 'ps.nav-preset', title: tr('photoslop.cmd.nav_preset'), group: 'View', keywords: ['navigation', 'zoom', 'pan', 'wheel', 'trackpad', 'touch', 'preset', 'mouse'], keys: [], run: () => SlopNav.openModal(APP) }]);   // i18n-ignore: ids, class names, key names or text for agents
  if (window.SlopCmd && SlopCmd.register) { register(); onLang(register); }
})();
