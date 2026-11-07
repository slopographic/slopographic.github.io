/* Slop Press — rulers (in the document unit, zero at the active page's top-left) and drag-out guides. */
(function () {
  'use strict';
  var PR = window.PR, V = PR.view, S = PR.state, U = PR.util;
  var RU = PR.rulers = { h: null, v: null, size: 18 };

  function steps(unit) {
    var u = U.UNITS[unit] || 1, px = u * V.zoom, cands = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
    for (var i = 0; i < cands.length; i++) if (cands[i] * px >= 52) return cands[i];
    return 1000;
  }
  function draw(c, horiz) {
    if (!c || !S.doc) return;
    var ctx = c.getContext('2d'), dpr = V.dpr, W = c.clientWidth, Hh = c.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(Hh * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(Hh * dpr); }
    var cs = getComputedStyle(document.documentElement);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = cs.getPropertyValue('--ruler-bg').trim() || '#262626'; ctx.fillRect(0, 0, W, Hh);
    var fg = cs.getPropertyValue('--ruler-fg').trim() || '#999', tick = cs.getPropertyValue('--ruler-tick').trim() || '#555';
    var s = V.active(); if (!s) return;
    var unit = S.doc.unit, u = (U.UNITS[unit] || 1), major = steps(unit), minor = major / (major >= 10 && major % 5 === 0 ? 5 : 2);
    var off = RU.size, len = horiz ? W : Hh;
    var origin = horiz ? V.toScreen(s.x, 0).x - off : V.toScreen(0, s.y).y - off;
    var a = -origin / (u * V.zoom), b = (len - origin) / (u * V.zoom);
    ctx.strokeStyle = tick; ctx.fillStyle = fg; ctx.lineWidth = 1; ctx.font = '9px ' + (cs.getPropertyValue('--mono').trim() || 'monospace');
    ctx.beginPath();
    for (var v = Math.floor(a / minor) * minor; v <= b; v += minor) {
      var p = Math.round(origin + v * u * V.zoom) + 0.5, isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6, t = isMajor ? RU.size : RU.size * 0.3;
      if (horiz) { ctx.moveTo(p, RU.size); ctx.lineTo(p, RU.size - t); } else { ctx.moveTo(RU.size, p); ctx.lineTo(RU.size - t, p); }
      if (isMajor) {
        var lbl = String(U.round(v, 2));
        if (horiz) ctx.fillText(lbl, p + 2, 9);
        else { ctx.save(); ctx.translate(9, p + 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right'; ctx.fillText(lbl, 0, 0); ctx.restore(); }
      }
    }
    ctx.stroke();
    // pointer marker
    if (RU.ptr) {
      var q = horiz ? V.toScreen(RU.ptr.x, 0).x - off : V.toScreen(0, RU.ptr.y).y - off;
      ctx.strokeStyle = '#4f8cff'; ctx.beginPath();
      if (horiz) { ctx.moveTo(q + 0.5, 0); ctx.lineTo(q + 0.5, RU.size); } else { ctx.moveTo(0, q + 0.5); ctx.lineTo(RU.size, q + 0.5); }
      ctx.stroke();
    }
  }
  RU.draw = function () { draw(RU.h, true); draw(RU.v, false); };
  RU.attach = function (h, v) {
    RU.h = h; RU.v = v;
    PR.on('drawn', RU.draw);
    PR.on('pointer', function (w) { RU.ptr = w; RU.draw(); });
    [[h, 'y'], [v, 'x']].forEach(function (pair) {
      pair[0].addEventListener('pointerdown', function (e) {
        if (!S.doc) return;
        e.preventDefault();
        var axis = pair[1], s = V.active(), g = { axis: axis, pos: 0 };
        var cv = V.canvas.getBoundingClientRect();
        var drag = function (ev) {
          var w = V.toWorld(ev.clientX - cv.left, ev.clientY - cv.top), ss = V.surfaceAt(w.x, w.y) || s;
          if (ss !== s) { var idx = s.guides.indexOf(g); if (idx >= 0) s.guides.splice(idx, 1); s = ss; }
          if (s.guides.indexOf(g) < 0) s.guides.push(g);
          var p = PR.snap.point(s, w.x - s.x, w.y - s.y);
          g.pos = U.round(axis === 'x' ? p.x : p.y, 3); PR.touch();
        };
        var up = function (ev) {
          removeEventListener('pointermove', drag); removeEventListener('pointerup', up);
          PR.snap.clear();
          var inside = ev.clientX > cv.left && ev.clientY > cv.top;
          if (!inside) { var i = s.guides.indexOf(g); if (i >= 0) s.guides.splice(i, 1); PR.touch(); return; }
          PR.history.commit(U.t('press.edit.undo_new_guide'));
        };
        addEventListener('pointermove', drag); addEventListener('pointerup', up);
      });
    });
    var corner = document.getElementById('rulerCorner');
    if (corner) corner.addEventListener('dblclick', function () { V.fitPage(); });
  };
})();
