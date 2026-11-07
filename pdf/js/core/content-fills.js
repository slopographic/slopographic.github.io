/* Slop PDF — what a page's content paints under a box: the flat colour there, or null when it is not one colour. Pure,
   tested alone in Node (tests/node/pdf-content-strip.test.mjs), on the operators of content-lex.js.
     regions(ops, xobj) → the painted areas in order: { k (operator index), x0, y0, x1, y1 (user space), rgb ([r, g, b] in
       0..1, or null: an image, a shading, a pattern, or a shape that is not a rectangle and so may not fill its box) }.
       xobj(name) → { image: true } or { ops, matrix, xobj } for a form (its areas are followed, a few levels deep), or
       null when unknown (then the whole page counts as not flat from there on).
     under(ops, box, before, xobj) → the colour under box ({ x0, y0, x1, y1 }, user space) from what was painted before
       operator index `before`: the last area that touches the box decides; it must be a filled rectangle holding the whole
       box, else null. Nothing painted there: white (the paper). Clipping and transparency are not followed.
   Edit text uses it for the colour of a cover when the rendered page cannot be read (edit-colours.js). */
(function (root, factory) {
  var api = factory(root.SlopPdfStrip || (typeof require === 'function' ? require('./content-strip.js') : null),
    root.SlopPdfInk || (typeof require === 'function' ? require('./content-ink.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopPdfFills = api;
})(typeof window !== 'undefined' ? window : globalThis, function (St, Ink) {
  'use strict';
  var mul = St.mul, ID = [1, 0, 0, 1, 0, 0], ALL = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };
  function pt(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  function boxOf(ps) {
    var xs = ps.map(function (p) { return p[0]; }), ys = ps.map(function (p) { return p[1]; });
    return { x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) };
  }
  /** A colour from fill operands: 1 value grey, 3 RGB, 4 CMYK; a pattern name (or anything else) is null. */
  function colourOf(args) {
    var n = args.filter(function (v) { return typeof v === 'number'; });
    if (args.some(function (v) { return v && v.name != null; })) return null;
    if (n.length === 1) return [n[0], n[0], n[0]];
    if (n.length === 3) return n.slice();
    if (n.length === 4) return Ink.cmyk(n[0], n[1], n[2], n[3]); // as pdf.js draws it
    return null;
  }

  /** Whether a subpath (user-space points, a closing point repeating the first dropped) is an axis-aligned rectangle. */
  function isRect(ps) {
    if (ps.length === 5 && Math.abs(ps[4][0] - ps[0][0]) < 1e-3 && Math.abs(ps[4][1] - ps[0][1]) < 1e-3) ps = ps.slice(0, 4);
    if (ps.length !== 4) return false;
    for (var i = 0; i < 4; i++) {
      var p = ps[i], q = ps[(i + 1) % 4];
      if (Math.abs(p[0] - q[0]) > 1e-3 && Math.abs(p[1] - q[1]) > 1e-3) return false; // a side that is not level or plumb
    }
    return true;
  }

  function regions(ops, xobj, ctm0, depth, out, k0) {
    var gs = { ctm: ctm0 || ID, fill: [0, 0, 0] }, stack = [], subs = [], cur = null;
    out = out || [];
    function add(k, b, rgb) { out.push({ k: k0 == null ? k : k0, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, rgb: rgb }); }
    function start() { cur = { ps: [], curved: false }; subs.push(cur); }
    function to(x, y) { if (!cur) start(); cur.ps.push(pt(gs.ctm, x, y)); }
    var unit = function () { return boxOf([pt(gs.ctm, 0, 0), pt(gs.ctm, 1, 0), pt(gs.ctm, 1, 1), pt(gs.ctm, 0, 1)]); };
    ops.forEach(function (o, k) {
      var a = o.args, nn = a.filter(function (v) { return typeof v === 'number'; });
      switch (o.op) {
        case 'q': stack.push({ ctm: gs.ctm, fill: gs.fill }); break;
        case 'Q': if (stack.length) gs = stack.pop(); break;
        case 'cm': if (nn.length === 6) gs.ctm = mul(nn, gs.ctm); break;
        case 'g': case 'rg': case 'k': case 'sc': case 'scn': gs.fill = colourOf(a); break;
        case 'cs': gs.fill = a[0] && /^(DeviceGray|DeviceRGB|DeviceCMYK|CalGray|CalRGB)$/.test(a[0].name) ? (a[0].name === 'DeviceCMYK' ? [1, 1, 1] : [0, 0, 0]) : null; break; // i18n-ignore: PDF names / font names / producer, not UI
        case 'm': if (nn.length === 2) { start(); to(nn[0], nn[1]); } break;
        case 'l': if (nn.length === 2) to(nn[0], nn[1]); break;
        case 'c': if (nn.length === 6) { to(nn[0], nn[1]); to(nn[2], nn[3]); to(nn[4], nn[5]); cur.curved = true; } break;
        case 'v': case 'y': if (nn.length === 4) { to(nn[0], nn[1]); to(nn[2], nn[3]); cur.curved = true; } break;
        case 're':
          if (nn.length === 4) { start(); [[0, 0], [nn[2], 0], [nn[2], nn[3]], [0, nn[3]]].forEach(function (d) { to(nn[0] + d[0], nn[1] + d[1]); }); cur = null; }
          break;
        case 'f': case 'F': case 'f*': case 'B': case 'B*': case 'b': case 'b*':
          // each rectangle is its own flat area; any other shape is its box, which it may not fill
          subs.forEach(function (sp) { if (sp.ps.length) add(k, boxOf(sp.ps), !sp.curved && isRect(sp.ps) ? gs.fill : null); });
          subs = []; cur = null; break;
        case 'S': case 's': case 'n': subs = []; cur = null; break;
        case 'sh': add(k, ALL, null); break;
        case 'BI': add(k, unit(), null); break;
        case 'Do':
          var x = a[0] && a[0].name != null && xobj ? xobj(a[0].name) : null;
          if (x && x.image) add(k, unit(), null);
          else if (x && x.ops && (depth || 0) < 4) regions(x.ops, x.xobj, mul(x.matrix || ID, gs.ctm), (depth || 0) + 1, out, k0 == null ? k : k0);
          else add(k, ALL, null);
          break;
      }
    });
    return out;
  }
  function touches(r, b) { return r.x0 < b.x1 && b.x0 < r.x1 && r.y0 < b.y1 && b.y0 < r.y1; }
  function holds(r, b) { return r.x0 <= b.x0 + 0.01 && r.y0 <= b.y0 + 0.01 && r.x1 >= b.x1 - 0.01 && r.y1 >= b.y1 - 0.01; }

  function under(ops, box, before, xobj) {
    var rs = regions(ops, xobj), lim = before == null ? Infinity : before;
    for (var i = rs.length - 1; i >= 0; i--) {
      var r = rs[i];
      if (r.k >= lim || !touches(r, box)) continue;
      return r.rgb && holds(r, box) ? r.rgb.map(function (v) { return Math.max(0, Math.min(1, v)); }) : null;
    }
    return [1, 1, 1];
  }
  return { regions: function (ops, xobj) { return regions(ops, xobj); }, under: under };
});
