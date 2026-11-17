/* Slop PDF — rewriting where a page object paints, on the objects of content-objs.js. Pure (no DOM), tested alone in Node
   (tests/node/pdf-content-objs.test.mjs). Every function returns the new content text; every operator it does not name
   stays byte for byte.
     transform(src, ops, obj, T)   the object moved by T, a matrix in user space (move, scale, rotate about a point): its
                                   wrapper's first cm becomes cm × X, or a bare object becomes q X cm … Q, with
                                   X = outer × T × outer⁻¹, so the object (with its own clip) lands where T puts it
     remove(src, ops, obj)         the object (and its wrapper) gone
     duplicate(src, ops, obj, T)   a copy placed by T right after it (on top)
     order(src, ops, objs, obj, dir)  dir 'front' | 'back' | 'forward' | 'backward': the object's text moved to the end, the
                                   start, past the next object or before the previous one, wrapped in q X cm … Q so it keeps
                                   its place (X = outer × destination⁻¹); null when it is already there
     replace(src, ops, obj, name, aspect)  an image (XObject or inline) painted as /name Do instead, fitted inside its old
                                   box with the new picture's aspect (w / h), centred
     stripMarked(src, ops, names)  every /OC /name BDC … EMC sequence (and what it holds) for the names gone; null when none
   Matrix helpers: move(dx, dy), scaleAbout(sx, sy, cx, cy), rotateAbout(deg, cx, cy) in user space. */
(function (root, factory) {
  var api = factory(root.SlopPdfLex || (typeof require === 'function' ? require('./content-lex.js') : null),
    root.SlopPdfObjs || (typeof require === 'function' ? require('./content-objs.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopPdfMove = api;
})(typeof window !== 'undefined' ? window : globalThis, function (Lx, Ob) {
  'use strict';
  var mul = Ob.mul, inv = Ob.inv;
  /** A matrix as content text: ten significant digits (an object's own space can be a thousandth of a point), no exponent. */
  function mat(m) {
    return m.map(function (v) {
      if (!v || !isFinite(v)) return '0';
      var d = Math.max(0, Math.min(12, 9 - Math.floor(Math.log10(Math.abs(v))))), t = v.toFixed(d);
      if (t.indexOf('.') >= 0) t = t.replace(/\.?0+$/, '');
      return t === '-0' ? '0' : t;
    }).join(' ');
  }
  /** Applies non-overlapping edits [{ s, e, t }] to the text. */
  function edit(src, list) {
    var out = src;
    list.slice().sort(function (x, y) { return y.s - x.s; }).forEach(function (d) { out = out.slice(0, d.s) + d.t + out.slice(d.e); });
    return out;
  }
  function span(ops, obj) { var w = obj.wrap || { a: obj.a, b: obj.b }; return { a: w.a, b: w.b, s: ops[w.a].s, e: ops[w.b].e }; }
  /** X: T (user space) as a matrix in the object's outer space. */
  function local(obj, T) { return mul(mul(obj.outer, T), inv(obj.outer)); }
  /** The edits that place the object by T: [{ s, e, t }]. */
  function placeEdits(src, ops, obj, T) {
    var X = local(obj, T), w = obj.wrap;
    if (w) {
      var first = ops[w.a + 1];
      if (first && first.op === 'cm' && first.args.length === 6) return [{ s: first.s, e: first.e, t: mat(mul(first.args, X)) + ' cm' }];
      return [{ s: ops[w.a].e, e: ops[w.a].e, t: ' ' + mat(X) + ' cm' }];
    }
    var sp = span(ops, obj);
    return [{ s: sp.s, e: sp.s, t: 'q ' + mat(X) + ' cm ' }, { s: sp.e, e: sp.e, t: ' Q' }];
  }

  function transform(src, ops, obj, T) { return edit(src, placeEdits(src, ops, obj, T)); }
  function remove(src, ops, obj) { var sp = span(ops, obj); return edit(src, [{ s: sp.s, e: sp.e, t: '' }]); }
  function duplicate(src, ops, obj, T) {
    var sp = span(ops, obj), X = local(obj, T);
    return edit(src, [{ s: sp.e, e: sp.e, t: '\nq ' + mat(X) + ' cm ' + src.slice(sp.s, sp.e) + ' Q' }]);
  }
  function order(src, ops, objs, obj, dir) {
    var cm = Ob.ctms(ops), sp = span(ops, obj), list = objs.slice().sort(function (x, y) { return x.a - y.a; });
    var spans = list.map(function (o) { return { o: o, sp: span(ops, o) }; });
    var at, dest;
    if (dir === 'front') {
      if (!spans.some(function (x) { return x.sp.a > sp.b; })) return null;
      at = src.length; dest = cm[ops.length];
    } else if (dir === 'back') {
      if (!spans.some(function (x) { return x.sp.b < sp.a; })) return null;
      at = 0; dest = cm[0];
    } else if (dir === 'forward') {
      var nx = spans.filter(function (x) { return x.sp.a > sp.b; })[0];
      if (!nx) return null;
      at = nx.sp.e; dest = cm[nx.sp.b + 1];
    } else {
      var pv = spans.filter(function (x) { return x.sp.b < sp.a; }).pop();
      if (!pv) return null;
      at = pv.sp.s; dest = cm[pv.sp.a];
    }
    var X = mul(obj.outer, inv(dest)), body = 'q ' + mat(X) + ' cm ' + src.slice(sp.s, sp.e) + ' Q';
    return edit(src, [{ s: sp.s, e: sp.e, t: '' }, { s: at, e: at, t: (at ? '\n' : '') + body + (at ? '' : '\n') }]);
  }
  /** The fit of a picture of aspect w/h inside the unit square of an image painted with ctm m: [sx 0 0 sy tx ty]. */
  function fitIn(m, aspect) {
    var wl = Math.hypot(m[0], m[1]), hl = Math.hypot(m[2], m[3]), old = hl ? wl / hl : 1, sx = 1, sy = 1;
    if (!(aspect > 0) || !isFinite(aspect)) return [1, 0, 0, 1, 0, 0];
    if (aspect > old) sy = old / aspect; else sx = aspect / old;
    return [sx, 0, 0, sy, (1 - sx) / 2, (1 - sy) / 2];
  }
  function replace(src, ops, obj, name, aspect) {
    var o = ops[obj.a], S = fitIn(obj.ctm, aspect), fit = S[0] !== 1 || S[3] !== 1;
    var paint = '/' + name + ' Do'; // i18n-ignore: PDF names / font names / producer, not UI
    return edit(src, [{ s: o.s, e: o.e, t: fit ? 'q ' + mat(S) + ' cm ' + paint + ' Q' : paint }]);
  }
  function stripMarked(src, ops, names) {
    var gone = new Set(names), st = [], cut = [];
    ops.forEach(function (o, k) {
      if (o.op === 'BDC' || o.op === 'BMC') {
        var a = o.args, nm = o.op === 'BDC' && a[0] && a[0].name === 'OC' && a[1] && a[1].name != null ? a[1].name : null;
        st.push({ k: k, drop: nm != null && gone.has(nm) });
      } else if (o.op === 'EMC') {
        var m = st.pop();
        if (m && m.drop && !st.some(function (x) { return x.drop; })) cut.push({ s: ops[m.k].s, e: o.e, t: '' });
      }
    });
    return cut.length ? edit(src, cut) : null;
  }

  function move(dx, dy) { return [1, 0, 0, 1, dx, dy]; }
  function scaleAbout(sx, sy, cx, cy) { return mul(mul(move(-cx, -cy), [sx, 0, 0, sy, 0, 0]), move(cx, cy)); }
  function rotateAbout(deg, cx, cy) {
    var r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return mul(mul(move(-cx, -cy), [c, s, -s, c, 0, 0]), move(cx, cy));
  }

  return { transform: transform, remove: remove, duplicate: duplicate, order: order, replace: replace, stripMarked: stripMarked,
    fitIn: fitIn, span: span, move: move, scaleAbout: scaleAbout, rotateAbout: rotateAbout, mat: mat };
});
