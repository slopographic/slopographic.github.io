/* Slop Slides: the picture Present mode shows. A clipped stage holds two canvases, the outgoing and the incoming slide.
   Each slide is drawn once by the shared display list (scene.js); a transition only changes the CSS transform, opacity
   and clip of the two canvases, from SlopMotion.transitions. At progress 0 only the outgoing slide shows and at 1 only
   the incoming one. Build states (object animations) reach the scene through its `state` option. Exposes SS.presentView. */
(function () {
  'use strict';
  var SS = window.SS, R = SS.canvasRender, MO = window.SlopMotion;
  var V = SS.presentView = {};
  var stage = null, layers = {}, W = 0, H = 0;
  var ORIGIN = { center: '50% 50%', left: '0% 50%', right: '100% 50%' };

  function layer(name) {
    var cv = document.createElement('canvas');
    cv.className = 'present-layer present-' + name;
    stage.append(cv);
    layers[name] = cv;
  }
  /** Builds the stage and its two layers inside root. */
  V.mount = function (root) {
    stage = document.createElement('div');
    stage.className = 'present-stage';
    root.append(stage);
    layer('from');
    layer('to');
  };
  V.unmount = function () { stage = null; layers = {}; };
  /** Fits the stage to the window at the deck's aspect ratio. Returns { w, h } in css px. */
  V.fit = function (d) {
    W = Math.max(10, Math.min(window.innerWidth, window.innerHeight * d.size.w / d.size.h));
    H = W * d.size.h / d.size.w;
    stage.style.width = W + 'px';
    stage.style.height = H + 'px';
    return { w: W, h: H };
  };
  /** Draws a slide into one layer. states: the map from SS.anim.stateAt (or null for the slide as it stands). */
  V.paint = function (d, slide, name, states) {
    var cv = layers[name], dpr = window.devicePixelRatio || 1;
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    var state = states ? function (o) { return states[o.id]; } : null;
    R.slideToCanvas(d, slide, Math.round(W * dpr), { canvas: cv, dpr: 1, scene: { editor: false, state: state },
      onImage: function () { V.paint(d, slide, name, states); } });
  };
  function reset(cv) {
    cv.style.transform = '';
    cv.style.transformOrigin = '';
    cv.style.opacity = '';
    cv.style.clipPath = '';
    cv.style.display = '';
  }
  function apply(cv, side) {
    cv.style.display = '';
    cv.style.transform = side.transform;
    cv.style.transformOrigin = ORIGIN[side.origin] || ORIGIN.center;
    cv.style.opacity = String(side.opacity);
    cv.style.clipPath = side.clip;
  }
  /** Shows only the named layer, unmoved. */
  V.only = function (name) {
    Object.keys(layers).forEach(function (k) {
      reset(layers[k]);
      layers[k].style.display = k === name ? '' : 'none';
    });
  };
  /** The transition at progress p (0..1). The endpoints are whole slides: 0 hides the incoming one, 1 hides the outgoing. */
  V.transitionAt = function (name, p) {
    var t = MO.transitions.transition(name, p, { width: W, height: H });
    var from = layers.from, to = layers.to;
    if (p >= 1) { reset(from); from.style.display = 'none'; reset(to); to.style.display = ''; return; }
    if (p <= 0) { reset(to); to.style.display = 'none'; reset(from); from.style.display = ''; return; }
    apply(from, t.outgoing);
    apply(to, t.incoming);
  };
  /** The layer names currently visible, for tests and the presenter. */
  V.visible = function () {
    return Object.keys(layers).filter(function (k) { return layers[k].style.display !== 'none'; });
  };
})();
