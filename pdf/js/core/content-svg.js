/* Slop PDF — a content stream's vector drawing as SVG: paths (m l c v y h re) filled and stroked in their colours (gray,
   RGB and CMYK, sc/scn by component count), line width, caps, joins and dashes, the even-odd rule, clipping paths, and
   Form XObjects drawn in place. Images are placed through a callback; text is left to the caller (pdf.js has the text).
   Pure (no DOM), tested in Node (tests/node/pdf-content-objs.test.mjs).
     toSVG(ops, opts) → an SVG document string. opts: box [x0, y0, x1, y1] (the user-space area shown; the SVG is that big
       in points), from/to (draw only operators from..to, e.g. one object's span), form(name) → { ops, matrix, bbox } or null,
       image(name | null, ctm, k) → { href, w, h } or null (null name: an inline image at operator k), extra (SVG markup
       added on top, in user space), ctm0 (the matrix the operators start in). */
(function (root, factory) {
  var api = factory(root.SlopPdfObjs || (typeof require === 'function' ? require('./content-objs.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopPdfSvg = api;
})(typeof window !== 'undefined' ? window : globalThis, function (Ob) {
  'use strict';
  var mul = Ob.mul, apply = Ob.apply;
  function n(v) { var t = (Math.round(v * 1000) / 1000).toFixed(3).replace(/\.?0+$/, ''); return t === '-0' ? '0' : t; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function rgb(c) {
    var v = c.map(function (x) { return Math.max(0, Math.min(1, +x || 0)); });
    if (v.length === 1) v = [v[0], v[0], v[0]];
    else if (v.length === 4) { var k = v[3]; v = [(1 - v[0]) * (1 - k), (1 - v[1]) * (1 - k), (1 - v[2]) * (1 - k)]; }
    else if (v.length !== 3) v = [0, 0, 0];
    return '#' + v.map(function (x) { return ('0' + Math.round(x * 255).toString(16)).slice(-2); }).join('');
  }
  var CAP = ['butt', 'round', 'square'], JOIN = ['miter', 'round', 'bevel'];

  function toSVG(ops, opts) {
    opts = opts || {};
    var box = opts.box || [0, 0, 612, 792], defs = [], body = [], clipN = 0, depth = 0;
    function draw(list, gs0, from, to) {
      var gs = Object.assign({}, gs0), st = [], d = '', cur = null, start = null, pendClip = null;
      function pt(x, y) { var p = apply(gs.ctm, x, y); return n(p[0]) + ' ' + n(p[1]); }
      function scale() { return Math.sqrt(Math.abs(gs.ctm[0] * gs.ctm[3] - gs.ctm[1] * gs.ctm[2])) || 1; }
      function attrs(fill, stroke, eo) {
        var a = ' fill="' + (fill ? gs.fill : 'none') + '"' + (fill && eo ? ' fill-rule="evenodd"' : '');
        if (stroke) {
          a += ' stroke="' + gs.stroke + '" stroke-width="' + n(Math.max(gs.lw * scale(), 0.1)) + '"';
          if (gs.cap) a += ' stroke-linecap="' + CAP[gs.cap] + '"';
          if (gs.join) a += ' stroke-linejoin="' + JOIN[gs.join] + '"';
          if (gs.dash && gs.dash.length) a += ' stroke-dasharray="' + gs.dash.map(function (v) { return n(v * scale()); }).join(' ') + '"';
        }
        return a + (gs.clip ? ' clip-path="url(#' + gs.clip + ')"' : '');
      }
      function paint(fill, stroke, eo, close) {
        if (close && d) d += ' Z';
        if (d) body.push('<path d="' + d.trim() + '"' + attrs(fill, stroke, eo) + '/>');
        if (pendClip && d) {
          var id = 'c' + (++clipN);
          defs.push('<clipPath id="' + id + '"' + (gs.clip ? ' clip-path="url(#' + gs.clip + ')"' : '') + '><path d="' + d.trim() + '"' + (pendClip === 'eo' ? ' clip-rule="evenodd"' : '') + '/></clipPath>');
          gs.clip = id;
        }
        d = ''; pendClip = null;
      }
      for (var k = from; k <= to && k < list.length; k++) {
        var o = list[k], a = o.args.filter(function (x) { return typeof x === 'number'; });
        switch (o.op) {
          case 'q': st.push(Object.assign({}, gs)); break;
          case 'Q': if (st.length) gs = st.pop(); break;
          case 'cm': if (a.length >= 6) gs.ctm = mul(a.slice(-6), gs.ctm); break;
          case 'w': if (a.length) gs.lw = a[0]; break;
          case 'J': if (a.length) gs.cap = a[0]; break;
          case 'j': if (a.length) gs.join = a[0]; break;
          case 'd': gs.dash = Array.isArray(o.args[0]) ? o.args[0].filter(function (x) { return typeof x === 'number'; }) : null; break;
          case 'g': gs.fill = rgb(a); break;
          case 'G': gs.stroke = rgb(a); break;
          case 'rg': gs.fill = rgb(a); break;
          case 'RG': gs.stroke = rgb(a); break;
          case 'k': gs.fill = rgb(a); break;
          case 'K': gs.stroke = rgb(a); break;
          case 'sc': case 'scn': if (a.length) gs.fill = rgb(a); break;
          case 'SC': case 'SCN': if (a.length) gs.stroke = rgb(a); break;
          case 'm': if (a.length >= 2) { d += ' M' + pt(a[0], a[1]); cur = start = [a[0], a[1]]; } break;
          case 'l': if (a.length >= 2) { d += ' L' + pt(a[0], a[1]); cur = [a[0], a[1]]; } break;
          case 'c': if (a.length >= 6) { d += ' C' + pt(a[0], a[1]) + ' ' + pt(a[2], a[3]) + ' ' + pt(a[4], a[5]); cur = [a[4], a[5]]; } break;
          case 'v': if (a.length >= 4 && cur) { d += ' C' + pt(cur[0], cur[1]) + ' ' + pt(a[0], a[1]) + ' ' + pt(a[2], a[3]); cur = [a[2], a[3]]; } break;
          case 'y': if (a.length >= 4) { d += ' C' + pt(a[0], a[1]) + ' ' + pt(a[2], a[3]) + ' ' + pt(a[2], a[3]); cur = [a[2], a[3]]; } break;
          case 'h': if (d) d += ' Z'; cur = start; break;
          case 're':
            if (a.length >= 4) { var x = a[0], y = a[1], w = a[2], hh = a[3]; d += ' M' + pt(x, y) + ' L' + pt(x + w, y) + ' L' + pt(x + w, y + hh) + ' L' + pt(x, y + hh) + ' Z'; cur = start = [x, y]; }
            break;
          case 'W': pendClip = 'nz'; break;
          case 'W*': pendClip = 'eo'; break;
          case 'n': paint(false, false, false, false); break;
          case 'f': case 'F': paint(true, false, false, false); break;
          case 'f*': paint(true, false, true, false); break;
          case 'S': paint(false, true, false, false); break;
          case 's': paint(false, true, false, true); break;
          case 'B': paint(true, true, false, false); break;
          case 'B*': paint(true, true, true, false); break;
          case 'b': paint(true, true, false, true); break;
          case 'b*': paint(true, true, true, true); break;
          case 'Do':
            var nm = o.args[0] && o.args[0].name, fx = nm != null && opts.form ? opts.form(nm) : null;
            if (fx && depth < 6) {
              depth++;
              var g2 = Object.assign({}, gs, { ctm: fx.matrix ? mul(fx.matrix, gs.ctm) : gs.ctm });
              draw(fx.ops, g2, 0, fx.ops.length - 1);
              depth--;
            } else if (nm != null) image(nm, gs, k);
            break;
          case 'BI': image(null, gs, k); break;
        }
      }
    }
    function image(name, gs, k) {
      var im = opts.image ? opts.image(name, gs.ctm, k) : null;
      if (!im || !im.href) return;
      var m = gs.ctm; // the unit square, with the picture's first row at its top (y = 1)
      body.push('<image href="' + esc(im.href) + '" x="0" y="0" width="1" height="1" preserveAspectRatio="none" transform="matrix(' +
        [m[0], m[1], m[2], m[3], m[4], m[5]].map(n).join(' ') + ') matrix(1 0 0 -1 0 1)"' + (gs.clip ? ' clip-path="url(#' + gs.clip + ')"' : '') + '/>');
    }
    var gs0 = { ctm: opts.ctm0 || Ob.ID, fill: '#000000', stroke: '#000000', lw: 1, cap: 0, join: 0, dash: null, clip: null };
    draw(ops, gs0, opts.from || 0, opts.to == null ? ops.length - 1 : opts.to);
    var W = box[2] - box[0], H = box[3] - box[1];
    return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + n(W) + 'pt" height="' + n(H) + 'pt" viewBox="0 0 ' + n(W) + ' ' + n(H) + '">' +
      (defs.length ? '<defs>' + defs.join('') + '</defs>' : '') +
      '<g transform="matrix(1 0 0 -1 ' + n(-box[0]) + ' ' + n(box[3]) + ')">' + body.join('') + (opts.extra || '') + '</g></svg>\n';
  }
  return { toSVG: toSVG, rgb: rgb, esc: esc };
});
