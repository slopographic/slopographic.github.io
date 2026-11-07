/* Slop Press — view overlays: selection handles, text frame ports with overset markers, thread lines,
   text caret and selection, plus whatever the active tool draws (marquee, snap lines, previews). */
(function () {
  'use strict';
  var PR = window.PR, V = PR.view, S = PR.state, I = PR.items, M = PR.model, EN = PR.engine, N = PR.nav;
  var PT = PR.paint;
  PT.ACCENT = '#4f8cff';
  PT.caretOn = true;

  /** Surface that shows item `it` (null if it is not on screen). */
  PT.surfaceOf = function (it) {
    var ss = V.surfaces();
    for (var k = 0; k < ss.length; k++) if (ss[k].items.indexOf(it) >= 0) return ss[k];
    return null;
  };
  function itemSpace(ctx, s, it) { ctx.translate(s.x, s.y); PR.render.applyTransform(ctx, it); }
  PT.HANDLE = 7;
  /** Handle positions in item-local coords: [name, x, y]. */
  PT.handles = function (it) {
    var w = it.w, h = it.h;
    return [['nw', 0, 0], ['n', w / 2, 0], ['ne', w, 0], ['e', w, h / 2], ['se', w, h], ['s', w / 2, h], ['sw', 0, h], ['w', 0, h / 2]];
  };
  /** Port boxes of a text frame (local coords): in = top-left, out = bottom-right. */
  PT.ports = function (it) { var p = 9 / V.zoom; return { inp: { x: p * 1.2, y: -p / 2, s: p }, out: { x: it.w - p * 2.2, y: it.h - p / 2, s: p } }; };

  function layerColor(it) { var l = M.findLayer(S.doc, it.layer); return (l && l.color) || PT.ACCENT; }

  PT.overlay = function (ctx) {
    var z = V.zoom, px = 1 / z, doc = S.doc;
    var sel = PR.selected();
    // overset markers on every visible last frame
    if (!V.preview) V.surfaces().forEach(function (s) {
      s.items.forEach(function (it) {
        if (it.type !== 'text' || it.next) return;
        if (!EN.overset(it, null)) return;
        ctx.save(); itemSpace(ctx, s, it);
        var p = PT.ports(it).out;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e5484d'; ctx.lineWidth = px;
        ctx.fillRect(p.x, p.y, p.s, p.s); ctx.strokeRect(p.x, p.y, p.s, p.s);
        ctx.beginPath(); ctx.moveTo(p.x + p.s / 2, p.y + 2 * px); ctx.lineTo(p.x + p.s / 2, p.y + p.s - 2 * px); ctx.moveTo(p.x + 2 * px, p.y + p.s / 2); ctx.lineTo(p.x + p.s - 2 * px, p.y + p.s / 2);
        ctx.lineWidth = 1.6 * px; ctx.stroke();
        ctx.restore();
      });
    });
    // hover highlight (Selection tool)
    var hv = PR.tools.hover && S.tool === 'select' && !PR.tools.drag ? M.findItem(doc, PR.tools.hover) : null;
    if (hv) { var hs0 = PT.surfaceOf(hv.item); if (hs0) { ctx.save(); itemSpace(ctx, hs0, hv.item); ctx.strokeStyle = layerColor(hv.item); ctx.lineWidth = 1.5 * px; I.tracePath(ctx, hv.item.type === 'line' ? I.path(hv.item) : [['M', 0, 0], ['L', hv.item.w, 0], ['L', hv.item.w, hv.item.h], ['L', 0, hv.item.h], ['Z']]); ctx.stroke(); ctx.restore(); } }
    // text selection + caret
    if (S.text) drawText(ctx);
    // selection
    sel.forEach(function (it) {
      var s = PT.surfaceOf(it); if (!s) return;
      ctx.save(); itemSpace(ctx, s, it);
      var col = layerColor(it);
      ctx.strokeStyle = col; ctx.lineWidth = px;
      ctx.strokeRect(0, 0, it.w, it.h);
      if (!S.text || S.text.frame !== it.id) {
        var hs = PT.HANDLE * px;
        ctx.fillStyle = '#fff';
        PT.handles(it).forEach(function (h) { ctx.fillRect(h[1] - hs / 2, h[2] - hs / 2, hs, hs); ctx.strokeRect(h[1] - hs / 2, h[2] - hs / 2, hs, hs); });
      }
      if (it.type === 'text') {
        var P2 = PT.ports(it);
        [['inp', !!it.prev], ['out', !!it.next]].forEach(function (pp) {
          var b = P2[pp[0]]; ctx.fillStyle = '#fff'; ctx.fillRect(b.x, b.y, b.s, b.s); ctx.strokeRect(b.x, b.y, b.s, b.s);
          if (pp[1]) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(b.x + 2 * px, b.y + 2 * px); ctx.lineTo(b.x + b.s - 2 * px, b.y + b.s / 2); ctx.lineTo(b.x + 2 * px, b.y + b.s - 2 * px); ctx.fill(); }
        });
      }
      ctx.restore();
    });
    // threads of selected text frames
    if (V.show.threads && !V.preview) {
      var done = {};
      sel.forEach(function (it) {
        if (it.type !== 'text' || done[it.story]) return; done[it.story] = 1;
        var fr = M.storyFrames(doc, it.story);
        ctx.save(); ctx.strokeStyle = layerColor(it); ctx.lineWidth = 1.2 * px; ctx.setLineDash([5 * px, 3 * px]);
        for (var k = 0; k + 1 < fr.length; k++) {
          var sa = PT.surfaceOf(fr[k]), sb = PT.surfaceOf(fr[k + 1]); if (!sa || !sb) continue;
          var pa = PT.ports(fr[k]).out, pb = PT.ports(fr[k + 1]).inp;
          var A = I.toPage(fr[k], pa.x + pa.s / 2, pa.y + pa.s / 2), Bp = I.toPage(fr[k + 1], pb.x + pb.s / 2, pb.y + pb.s / 2);
          ctx.beginPath(); ctx.moveTo(sa.x + A.x, sa.y + A.y);
          ctx.bezierCurveTo(sa.x + A.x + 40, sa.y + A.y + 20, sb.x + Bp.x - 40, sb.y + Bp.y - 20, sb.x + Bp.x, sb.y + Bp.y); ctx.stroke();
        }
        ctx.restore();
      });
    }
    if (PR.tools && PR.tools.overlay) PR.tools.overlay(ctx);
  };

  function drawText(ctx) {
    var T = S.text, st = S.doc.stories[T.story]; if (!st) return;
    var a = Math.min(T.caret, T.anchor), b = Math.max(T.caret, T.anchor);
    if (a !== b) {
      N.rects(T.story, a, b).forEach(function (r) {
        var s = PT.surfaceOf(r.fr); if (!s) return;
        ctx.save(); itemSpace(ctx, s, r.fr); ctx.fillStyle = 'rgba(79,140,255,.32)'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore();
      });
    } else if (PT.caretOn) {
      var at = N.locate(T.story, T.caret);
      if (at) {
        var s = PT.surfaceOf(at.fr);
        if (s) { ctx.save(); itemSpace(ctx, s, at.fr); ctx.fillStyle = '#111'; ctx.fillRect(at.x - 0.5 / V.zoom, at.y0, 1.2 / V.zoom, at.y1 - at.y0); ctx.restore(); }
      } else {
        // empty frame or overset caret: draw at the frame's top-left inset
        var f = M.findItem(S.doc, T.frame);
        if (f) { var s2 = PT.surfaceOf(f.item); if (s2) { ctx.save(); itemSpace(ctx, s2, f.item); ctx.fillStyle = '#111'; var ins = f.item.inset || 0; ctx.fillRect(ins, ins, 1.2 / V.zoom, 12); ctx.restore(); } }
      }
    }
  }
  // caret blink
  setInterval(function () { if (S.text) { PT.caretOn = !PT.caretOn; V.request(); } }, 530);
})();
