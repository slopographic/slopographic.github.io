/* Slop Slides: shape geometry. Each shape becomes a path in object-local points (0..w, 0..h):
   [['M',x,y], ['L',x,y], ['C',x1,y1,x2,y2,x,y], ['Z']]. The same path feeds the canvas, the PDF and hit tests. */
(function () {
  'use strict';
  var SS = window.SS;
  var S = SS.shapes = {};
  var K = 0.5522847498;

  S.rect = function (w, h) { return [['M', 0, 0], ['L', w, 0], ['L', w, h], ['L', 0, h], ['Z']]; };
  S.roundRect = function (w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    if (!r) return S.rect(w, h);
    var c = r * (1 - K);
    return [['M', r, 0], ['L', w - r, 0], ['C', w - c, 0, w, c, w, r], ['L', w, h - r], ['C', w, h - c, w - c, h, w - r, h],
      ['L', r, h], ['C', c, h, 0, h - c, 0, h - r], ['L', 0, r], ['C', 0, c, c, 0, r, 0], ['Z']];
  };
  S.ellipse = function (w, h, x0, y0) {
    x0 = x0 || 0; y0 = y0 || 0;
    var rx = w / 2, ry = h / 2, cx = x0 + rx, cy = y0 + ry, kx = rx * K, ky = ry * K;
    return [['M', cx + rx, cy], ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry], ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
      ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry], ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy], ['Z']];
  };
  function poly(pts) { var p = pts.map(function (q, i) { return [i ? 'L' : 'M', q[0], q[1]]; }); p.push(['Z']); return p; }
  S.triangle = function (w, h) { return poly([[w / 2, 0], [w, h], [0, h]]); };
  S.diamond = function (w, h) { return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]); };
  S.hexagon = function (w, h) { var d = Math.min(w * 0.25, h * 0.5); return poly([[d, 0], [w - d, 0], [w, h / 2], [w - d, h], [d, h], [0, h / 2]]); };
  S.rightArrow = function (w, h) { var hd = Math.min(w * 0.45, h * 0.9), t = h * 0.25; return poly([[0, t], [w - hd, t], [w - hd, 0], [w, h / 2], [w - hd, h], [w - hd, h - t], [0, h - t]]); };
  S.leftArrow = function (w, h) { return S.rightArrow(w, h).map(function (c) { return c[0] === 'Z' ? c : [c[0], w - c[1], c[2]]; }); };
  S.star5 = function (w, h) {
    var pts = [], cx = w / 2, cy = h / 2 + h * 0.03, R = 0.5, r = 0.5 * 0.4;
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; pts.push([cx + Math.cos(a) * rr * w, cy + Math.sin(a) * rr * h * 1.05]); }
    return poly(pts);
  };
  /** Rounded speech box with a tail at the bottom left (tail tip at 18% / 125% of the box). */
  S.callout = function (w, h) {
    var bh = h * 0.8, r = Math.min(w, bh) * 0.14, c = r * (1 - K), tx = w * 0.18, tw = Math.min(w * 0.12, 40);
    return [['M', r, 0], ['L', w - r, 0], ['C', w - c, 0, w, c, w, r], ['L', w, bh - r], ['C', w, bh - c, w - c, bh, w - r, bh],
      ['L', tx + tw, bh], ['L', tx - tw * 0.4, h], ['L', tx, bh], ['L', r, bh], ['C', c, bh, 0, bh - c, 0, bh - r], ['L', 0, r], ['C', 0, c, c, 0, r, 0], ['Z']];
  };
  S.cloudCallout = function (w, h) {
    var p = S.ellipse(w, h * 0.82).slice(0, -1);
    p.push(['Z']);
    return p.concat(S.ellipse(w * 0.09, h * 0.09, w * 0.2, h * 0.84), S.ellipse(w * 0.05, h * 0.05, w * 0.12, h * 0.95));
  };
  S.line = function (w, h) { return [['M', 0, 0], ['L', w, h]]; };
  S.arrowLine = S.line;

  /** Path for a shape object (or an image mask). */
  S.path = function (kind, w, h, radius) {
    if (kind === 'roundRect') return S.roundRect(w, h, (radius == null ? 0.12 : radius) * Math.min(w, h));
    if (kind === 'circle') return S.ellipse(w, h);
    var fn = S[kind] || S.rect;
    return fn(w, h);
  };
  /** Arrow head triangle for a line from (x0,y0) to (x1,y1), pointing at (x1,y1). */
  S.arrowHead = function (x0, y0, x1, y1, lw) {
    var a = Math.atan2(y1 - y0, x1 - x0), L = Math.max(8, lw * 3.5), W = Math.max(5, lw * 2.2);
    var bx = x1 - Math.cos(a) * L, by = y1 - Math.sin(a) * L, nx = -Math.sin(a) * W, ny = Math.cos(a) * W;
    return [['M', x1, y1], ['L', bx + nx, by + ny], ['L', bx - nx, by - ny], ['Z']];
  };
  /** Text frame inside a shape (keeps text off pointy parts). */
  S.textBox = function (kind, w, h) {
    if (kind === 'ellipse' || kind === 'cloudCallout') return { x: w * 0.146, y: h * 0.146 * (kind === 'cloudCallout' ? 0.82 : 1), w: w * 0.708, h: (kind === 'cloudCallout' ? h * 0.82 : h) * 0.708 };
    if (kind === 'triangle') return { x: w * 0.25, y: h * 0.45, w: w * 0.5, h: h * 0.5 };
    if (kind === 'diamond') return { x: w * 0.25, y: h * 0.25, w: w * 0.5, h: h * 0.5 };
    if (kind === 'star5') return { x: w * 0.3, y: h * 0.38, w: w * 0.4, h: h * 0.38 };
    if (kind === 'callout') return { x: 0, y: 0, w: w, h: h * 0.8 };
    if (kind === 'rightArrow' || kind === 'leftArrow') return { x: 0, y: h * 0.25, w: w * 0.8, h: h * 0.5 };
    return { x: 0, y: 0, w: w, h: h };
  };
  /** Point-in-path test via a cached Path2D. */
  S.toPath2D = function (path) {
    var p = new Path2D();
    path.forEach(function (c) {
      if (c[0] === 'M') p.moveTo(c[1], c[2]); else if (c[0] === 'L') p.lineTo(c[1], c[2]);
      else if (c[0] === 'C') p.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]); else p.closePath();
    });
    return p;
  };
})();
