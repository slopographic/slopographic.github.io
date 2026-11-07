/* SlopVector — ui/view-state: the artboard zoom and pan and the active tool are kept in SlopSession, so leaving Slop
 * Vector and coming back restores them with the recovered document. The document itself autosaves (core/history.js);
 * the panels, tabs and theme are already kept in slopvector.prefs and slopvector.theme. Classic script; uses SV.state. */
(function () {
  'use strict';
  var SV = window.SV, S = SV.state, APP = 'vector';
  var ready = false; // nothing is saved until the saved view has been applied, so boot cannot overwrite it
  var auto = window.SlopSession.autosave(APP, 'view', function () {
    var v = SV.targetView(); // where an eased zoom ends, never a frame in between
    return { zoom: v.zoom, x: v.x, y: v.y, tool: S.tool };
  }, { delay: 300 });
  var touch = function () { if (ready) auto.touch(); };
  // Zoom, pan and tool changes come from pointer, wheel and key input: save after any of them.
  ['pointerup', 'click', 'keyup'].forEach(function (t) { document.addEventListener(t, touch, true); });
  document.addEventListener('wheel', touch, { capture: true, passive: true });

  /** Boot: apply the saved view. `recovered` is true when the document came back from autosave, so the view belongs to it. */
  SV.restoreView = function (recovered) {
    return window.SlopSession.load(APP, 'view', null).catch(function () { return null; }).then(function (v) {
      if (v && typeof v === 'object') {
        if (recovered && v.zoom > 0 && isFinite(v.x) && isFinite(v.y)) {
          S.view.zoom = SV.clamp(v.zoom, SV.ZOOM_MIN, SV.ZOOM_MAX); S.view.x = v.x; S.view.y = v.y;
          SV.requestRender(true);
        }
        if (typeof v.tool === 'string' && SV.TOOL_LIST.some(function (t) { return t.id === v.tool; })) SV.setTool(v.tool);
      }
      ready = true;
      SV.viewRestored = true; // the URL route (js/ui/route.js) waits for this, so a link's tool wins over the saved one
    });
  };
})();
