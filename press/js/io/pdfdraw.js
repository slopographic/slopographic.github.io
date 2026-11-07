/* Slop Press — PDF content stream drawing: shapes, images, opacity and text (positioned glyph by glyph
   with TJ adjustments so the PDF matches the layout exactly). Coordinates: page space, y down (the page
   content starts with a flipping cm). */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, I = PR.items, EN = PR.engine, num = PR.pdfw.num;
  var D = PR.pdfDraw = {};

  /** Colour operator: fill (rg / k) or stroke (RG / K). */
  D.color = function (c, stroke) {
    var k = U.parseCMYK(c);
    if (k) return k.map(num).join(' ') + (stroke ? ' K' : ' k');
    var r = U.rgbOf(c || '#000');
    return r.map(function (v) { return num(v / 255); }).join(' ') + (stroke ? ' RG' : ' rg');
  };
  function path(cmds) {
    return cmds.map(function (c) {
      if (c[0] === 'M') return num(c[1]) + ' ' + num(c[2]) + ' m';
      if (c[0] === 'L') return num(c[1]) + ' ' + num(c[2]) + ' l';
      if (c[0] === 'C') return c.slice(1).map(num).join(' ') + ' c';
      return 'h';
    }).join('\n');
  }
  D.path = path;
  function transform(it) {
    var s = '1 0 0 1 ' + num(it.x) + ' ' + num(it.y) + ' cm\n';
    if (it.rot) {
      var a = it.rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), cx = it.w / 2, cy = it.h / 2;
      s += '1 0 0 1 ' + num(cx) + ' ' + num(cy) + ' cm\n' + [c, sn, -sn, c, 0, 0].map(num).join(' ') + ' cm\n1 0 0 1 ' + num(-cx) + ' ' + num(-cy) + ' cm\n';
    }
    return s;
  }
  /** Draws one item. C: { out: [], gs(alpha) → name, image(assetId) → { res, w, h } | null, fonts, pageIdx }. */
  D.item = function (C, it, pageIdx) {
    var o = C.out, p = path(I.path(it));
    o.push('q\n' + transform(it));
    var a = it.opacity == null ? 1 : it.opacity;
    if (a < 1) o.push('/' + C.gs(a) + ' gs');
    if (it.fill && it.type !== 'line') o.push(D.color(it.fill) + '\n' + p + '\nf');
    if (it.type === 'image') {
      var im = C.image(it.asset);
      if (im) {
        var r = PR.render.imageRect(it, im.natW, im.natH);
        o.push('q\n' + p + '\nW n\n' + [r.w, 0, 0, -r.h, r.x, r.y + r.h].map(num).join(' ') + ' cm\n/' + im.res + ' Do\nQ');
      }
    }
    if (it.type === 'text') D.text(C, it, EN.frame(it, pageIdx));
    if (it.stroke && it.sw > 0) {
      var dash = it.dash ? '[' + it.dash.map(function (d) { return num(d * it.sw); }).join(' ') + '] 0 d ' : '';
      o.push(D.color(it.stroke, true) + ' ' + num(it.sw) + ' w 0 j ' + (it.dash && it.dash[0] < 1 ? '1 J ' : '0 J ') + dash + '\n' + p + '\nS');
    }
    o.push('Q');
  };
  /** Text of one frame (lines are frame-local; the caller has already applied the frame transform). */
  D.text = function (C, fr, lay) {
    var o = C.out;
    lay.rules.forEach(function (r) { o.push(D.color(r.color || '#000') + ' ' + [r.x1, r.y - r.w / 2, r.x2 - r.x1, r.w].map(num).join(' ') + ' re f'); });
    lay.lines.forEach(function (ln) {
      var run = null, deco = [];
      function flush() {
        if (!run) return;
        var tj = '', prev = null;
        run.gl.forEach(function (e) {
          if (prev) { var t = (prev.g.x + prev.w * run.size / 1000 - e.g.x) * 1000 / run.size; if (Math.abs(t) > 0.01) tj += '> ' + num(t) + ' <'; }
          tj += e.hex; prev = e;
        });
        o.push('BT\n/' + run.res + ' ' + num(run.size) + ' Tf\n' + D.color(run.color) + '\n1 0 0 -1 ' + num(run.x) + ' ' + num(run.y) + ' Tm\n[<' + tj + '>] TJ\nET');
        run = null;
      }
      ln.g.forEach(function (g) {
        if (g.hidden || g.nl || g.c === '\t' || g.c === '\u2028' || (g.trail && /\s/.test(g.c))) return;
        var rec = C.fonts.get(g.s.font, g.s.fontStyle); if (!rec) return;
        var y = ln.y + (g.by || 0) - (g.s.baselineShift || 0), col = g.s.color || '#000';
        if (run && (run.res !== rec.res || run.size !== g.size || run.y !== y || run.color !== col)) flush();
        var e = C.fonts.encode(rec, g.c === '\u00A0' ? ' ' : g.c, g.fk);
        if (!run) run = { res: rec.res, size: g.size, y: y, x: g.x, color: col, gl: [] };
        run.gl.push({ g: g, hex: e.hex, w: e.w });
        if (g.s.underline || g.s.strike) deco.push({ g: g, y: y });
      });
      flush();
      deco.forEach(function (d) {
        var g = d.g, t = Math.max(0.5, g.size / 18);
        if (g.s.underline) o.push(D.color(g.s.color || '#000') + ' ' + [g.x, d.y + g.size * 0.12, g.w, t].map(num).join(' ') + ' re f');
        if (g.s.strike) o.push(D.color(g.s.color || '#000') + ' ' + [g.x, d.y - g.size * 0.3, g.w, t].map(num).join(' ') + ' re f');
      });
    });
  };
  /** Collects the (family|style) keys a set of pages needs. */
  D.fontKeys = function (doc, pages) {
    var keys = { 'Helvetica|Regular': 1 };
    pages.forEach(function (i) {
      PR.render.pageItems(doc, i).forEach(function (it) {
        if (it.type !== 'text') return;
        var mine = doc.pages[i].items.indexOf(it) >= 0;
        EN.frame(it, mine ? null : i).lines.forEach(function (l) { l.g.forEach(function (g) { if (!g.hidden && !g.nl) keys[PR.fonts.key(g.s.font, g.s.fontStyle)] = 1; }); });
      });
    });
    return Object.keys(keys);
  };
})();
