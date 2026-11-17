/* Slop Press — text wrap: obstacles from items with wrap settings, and the free segments of a text band.
   Wrap types: 'none', 'box' (bounding box + offset), 'contour' (ellipses follow their curve, other
   shapes use the box), 'jump' (object jump: no text beside the object). */
(function () {
  'use strict';
  var PR = window.PR;
  var W = PR.wrap = {};

  /** Obstacles affecting text frame `fr`, in frame-local coordinates. items: everything shown on its page. */
  W.obstacles = function (doc, fr, items) {
    if (fr.rot) return [];
    var out = [];
    (items || []).forEach(function (it) {
      if (it === fr || it.id === fr.id || !it.wrap || it.wrap.type === 'none') return;
      if (it.type === 'text' && it.story === fr.story) return;
      if (PR.layers && !PR.layers.visible(doc, it)) return;
      var b = PR.items.bounds(it), off = +it.wrap.off || 0;
      if (b.x - off > fr.x + fr.w || b.x + b.w + off < fr.x || b.y - off > fr.y + fr.h || b.y + b.h + off < fr.y) return;
      out.push({ type: it.wrap.type, shape: it.type === 'ellipse' && !it.rot && it.wrap.type === 'contour' ? 'ellipse' : 'box',
        x: b.x - fr.x, y: b.y - fr.y, w: b.w, h: b.h, off: off });
    });
    return out;
  };
  /** The x-range an obstacle blocks within band [y0, y1]: null, [a, b] or 'all'. */
  W.blocked = function (ob, y0, y1) {
    var top = ob.y - ob.off, bot = ob.y + ob.h + ob.off;
    if (y1 <= top || y0 >= bot) return null;
    if (ob.type === 'jump') return 'all';
    if (ob.shape === 'ellipse') {
      var cx = ob.x + ob.w / 2, cy = ob.y + ob.h / 2, rx = ob.w / 2 + ob.off, ry = ob.h / 2 + ob.off;
      // widest point of the ellipse inside the band
      var yy = cy < y0 ? y0 : cy > y1 ? y1 : cy, t = 1 - Math.pow((yy - cy) / ry, 2);
      if (t <= 0) return null;
      var hw = rx * Math.sqrt(t);
      return [cx - hw, cx + hw];
    }
    return [ob.x - ob.off, ob.x + ob.w + ob.off];
  };
  /** Free segments of [x0, x1] in band [y0, y1]. Segments narrower than minW are dropped. */
  W.segments = function (obs, x0, x1, y0, y1, minW) {
    var segs = [[x0, x1]];
    for (var i = 0; i < obs.length; i++) {
      var bl = W.blocked(obs[i], y0, y1);
      if (!bl) continue;
      if (bl === 'all') return [];
      var next = [];
      segs.forEach(function (s) {
        if (bl[1] <= s[0] || bl[0] >= s[1]) { next.push(s); return; }
        if (bl[0] > s[0]) next.push([s[0], bl[0]]);
        if (bl[1] < s[1]) next.push([bl[1], s[1]]);
      });
      segs = next;
    }
    return segs.filter(function (s) { return s[1] - s[0] >= (minW || 0); });
  };
  /** Lowest bottom among obstacles intersecting the band (to skip below a jump object quickly). */
  W.clearBelow = function (obs, y0, y1) {
    var y = null;
    obs.forEach(function (ob) { if (W.blocked(ob, y0, y1)) { var b = ob.y + ob.h + ob.off; if (y === null || b > y) y = b; } });
    return y;
  };
})();
