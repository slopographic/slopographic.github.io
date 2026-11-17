/* Slop PDF — the objects a page's content stream places, found on the operators of content-lex.js. Pure (no DOM), tested
   alone in Node (tests/node/pdf-content-objs.test.mjs).
     objects(src, ops, info, opts) → [obj] in paint order. info(name) → { kind: 'image', w, h } | { kind: 'form', bbox,
       matrix } | null for an XObject name of the page's resources. opts.page: [x0, y0, x1, y1], the page box (a clipped
       group as big as the page is the page itself, not an object).
   An object: { id, kind: 'image' | 'inline' | 'form' | 'vector', name, a, b (its first and last operator: the Do or BI, or
     the BDC…EMC / q…Q of a group), wrap ({ a, b }: the q … Q around it that holds only its own cm, gs and clip, when there
     is one), ctm (the matrix it paints with: an image's unit square, a form's space), outer (the matrix before its span),
     quad (its four corners in user space), box [x0, y0, x1, y1], clip (painted inside a clip set before it), oc (the name
     of the innermost /OC marked-content property around it, or null), w, h (an image's pixels), filter (inline) }.
   Vector groups are marked-content sequences (BDC/BMC … EMC) and clipped groups (q … W n … Q) that paint paths only (no
   text, image, form or shading); a group inside another group is part of it. Matrices are PDF's [a b c d e f]. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopPdfObjs = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var ID = [1, 0, 0, 1, 0, 0];
  /** m1 × m2 (m1 first, then m2), for row-vector points: p × m1 × m2. */
  function mul(m1, m2) {
    return [m1[0] * m2[0] + m1[1] * m2[2], m1[0] * m2[1] + m1[1] * m2[3], m1[2] * m2[0] + m1[3] * m2[2], m1[2] * m2[1] + m1[3] * m2[3],
      m1[4] * m2[0] + m1[5] * m2[2] + m2[4], m1[4] * m2[1] + m1[5] * m2[3] + m2[5]];
  }
  function inv(m) {
    var d = m[0] * m[3] - m[1] * m[2];
    if (!d) return ID.slice();
    return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
  }
  function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  function nums(args, n) {
    if (args.length < n) return null;
    var a = args.slice(args.length - n);
    return a.every(function (v) { return typeof v === 'number' && isFinite(v); }) ? a : null;
  }
  function boxOf(pts) {
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
  }
  function grow(b, c) { return !b ? c.slice() : !c ? b : [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[2]), Math.max(b[3], c[3])]; }
  function quadOf(m, x0, y0, x1, y1) { return [apply(m, x0, y0), apply(m, x1, y0), apply(m, x1, y1), apply(m, x0, y1)]; }

  var PATH = { m: 2, l: 2, c: 6, v: 4, y: 4, re: 4 };
  var PAINT = { S: 1, s: 1, f: 1, F: 1, 'f*': 1, B: 1, 'B*': 1, b: 1, 'b*': 1, n: 1 };
  // what may stand between a wrapper's q and the object it wraps: its own placement, graphics state and clip
  var INNER = { cm: 1, gs: 1, re: 1, W: 1, 'W*': 1, n: 1, m: 1, l: 1, c: 1, v: 1, y: 1, h: 1 };

  /** The matrix in effect before each operator (and, at ops.length, after the last). */
  function ctms(ops) {
    var out = new Array(ops.length + 1), m = ID, st = [];
    ops.forEach(function (o, k) {
      out[k] = m;
      var n;
      if (o.op === 'q') st.push(m);
      else if (o.op === 'Q') { if (st.length) m = st.pop(); }
      else if (o.op === 'cm' && (n = nums(o.args, 6))) m = mul(n, m);
    });
    out[ops.length] = m;
    return out;
  }
  /** The q … Q around operators a..b that holds only their own placement, state and clip (null when there is none). */
  function wrapOf(ops, a, b) {
    var j = a - 1;
    while (j >= 0 && INNER[ops[j].op] === 1) j--;
    return j >= 0 && ops[j].op === 'q' && b + 1 < ops.length && ops[b + 1].op === 'Q' ? { a: j, b: b + 1 } : null;
  }
  /** An inline image's size and filter, from its dictionary in the stream text. */
  function inlineInfo(text) {
    var head = text.slice(0, Math.max(0, text.indexOf(' ID') + 1) || 400);
    var w = /\/(?:W|Width)\s+(\d+)/.exec(head), h = /\/(?:H|Height)\s+(\d+)/.exec(head), f = /\/(?:F|Filter)\s*(?:\[\s*)?\/(\w+)/.exec(head);
    return { w: w ? +w[1] : 0, h: h ? +h[1] : 0, filter: f ? f[1] : '' };
  }

  function objects(src, ops, info, opts) {
    info = info || function () { return null; };
    opts = opts || {};
    var cm = ctms(ops), out = [], gs = { ctm: ID, clip: false }, stack = [], mc = [], path = null, pendClip = false;
    function open() { return stack.concat(mc); } // every group being read
    function mark(key) { stack.forEach(function (f) { f[key] = true; }); mc.forEach(function (f) { f[key] = true; }); }
    function ocNow() { for (var i = mc.length - 1; i >= 0; i--) if (mc[i].oc) return mc[i].oc; return null; }
    function add(o) {
      var w = wrapOf(ops, o.a, o.b);
      o.wrap = w;
      o.outer = cm[w ? w.a : o.a];
      o.box = boxOf(o.quad);
      o.oc = o.oc === undefined ? ocNow() : o.oc;
      o.id = o.kind + ':' + o.a;
      out.push(o);
    }
    ops.forEach(function (o, k) {
      var a = o.args, n;
      switch (o.op) {
        case 'q': stack.push({ k: k, gs: { ctm: gs.ctm, clip: gs.clip }, depth: stack.length, oc: ocNow() }); break;
        case 'Q':
          var fr = stack.pop();
          if (fr) {
            gs = fr.gs;
            if (fr.ownClip && fr.box && !fr.text && !fr.xo) out.push({ kind: 'vector', group: 'clip', a: fr.k, b: k, quad: quadOf(ID, fr.box[0], fr.box[1], fr.box[2], fr.box[3]), ctm: ID, clip: gs.clip, oc: fr.oc, name: null });
            if (fr.box) stack.concat(mc).forEach(function (g) { g.box = grow(g.box, fr.box); });
          }
          break;
        case 'cm': if ((n = nums(a, 6))) gs.ctm = mul(n, gs.ctm); break;
        case 'W': case 'W*': pendClip = true; break;
        case 'BDC': case 'BMC':
          var tag = a[0] && a[0].name, oc = o.op === 'BDC' && tag === 'OC' && a[1] && a[1].name != null ? a[1].name : null;
          mc.push({ k: k, tag: tag || '', oc: oc, depth: stack.length, clip: gs.clip });
          break;
        case 'EMC':
          var m = mc.pop();
          if (m && m.box && !m.text && !m.xo && m.depth === stack.length) out.push({ kind: 'vector', group: 'marked', tag: m.tag, a: m.k, b: k, quad: quadOf(ID, m.box[0], m.box[1], m.box[2], m.box[3]), ctm: ID, clip: m.clip, oc: m.oc || ocNow(), name: null });
          if (m && m.box) open().forEach(function (g) { g.box = grow(g.box, m.box); });
          if (m && (m.text || m.xo)) open().forEach(function (g) { if (m.text) g.text = true; if (m.xo) g.xo = true; });
          break;
        case 'BT': mark('text'); break;
        case 'sh': mark('xo'); break;
        case 'Do':
          var nm = a[0] && a[0].name, x = nm != null ? info(nm) : null;
          mark('xo');
          if (x && x.kind === 'image') add({ kind: 'image', name: nm, a: k, b: k, ctm: gs.ctm, quad: quadOf(gs.ctm, 0, 0, 1, 1), clip: gs.clip, w: x.w || 0, h: x.h || 0 });
          else if (x && x.kind === 'form') {
            var fm = x.matrix ? mul(x.matrix, gs.ctm) : gs.ctm, bb = x.bbox || [0, 0, 1, 1];
            add({ kind: 'form', name: nm, a: k, b: k, ctm: fm, quad: quadOf(fm, bb[0], bb[1], bb[2], bb[3]), clip: gs.clip });
          }
          break;
        case 'BI':
          var ii = inlineInfo(src.slice(o.s, o.e));
          mark('xo');
          add({ kind: 'inline', name: null, a: k, b: k, ctm: gs.ctm, quad: quadOf(gs.ctm, 0, 0, 1, 1), clip: gs.clip, w: ii.w, h: ii.h, filter: ii.filter });
          break;
        default:
          if (PATH[o.op] && (n = nums(a, PATH[o.op]))) {
            var pts = o.op === 're' ? [[n[0], n[1]], [n[0] + n[2], n[1] + n[3]]] : [];
            if (o.op !== 're') for (var i = 0; i < n.length; i += 2) pts.push([n[i], n[i + 1]]);
            if (o.op === 're') pts = [pts[0], [pts[1][0], pts[0][1]], pts[1], [pts[0][0], pts[1][1]]];
            path = grow(path, boxOf(pts.map(function (p) { return apply(gs.ctm, p[0], p[1]); })));
          } else if (PAINT[o.op]) {
            if (pendClip) { gs.clip = true; if (stack.length) stack[stack.length - 1].ownClip = true; pendClip = false; }
            if (o.op !== 'n' && path) open().forEach(function (g) { g.box = grow(g.box, path); });
            path = null;
          }
      }
    });
    return groups(out, opts.page);
  }
  /** Keeps the outermost vector groups (a group inside another is part of it) and drops one as big as the page. */
  function groups(list, page) {
    var area = page ? (page[2] - page[0]) * (page[3] - page[1]) : 0;
    var vec = list.filter(function (o) { return o.kind === 'vector' && !(area && (o.quad[2][0] - o.quad[0][0]) * (o.quad[2][1] - o.quad[0][1]) >= 0.9 * area); });
    var keep = vec.filter(function (o) { return !vec.some(function (p) { return p !== o && p.a <= o.a && p.b >= o.b && (p.a < o.a || p.b > o.b); }); });
    var done = list.filter(function (o) { return o.kind !== 'vector'; });
    keep.forEach(function (o) {
      o.wrap = null; o.box = boxOf(o.quad); o.id = 'vector:' + o.a;
      done.push(o);
    });
    return done.sort(function (x, y) { return x.a - y.a; });
  }
  /** Fills in the wrapper and outer matrix of vector groups (objects() calls it once the operators are all read). */
  function finish(list, ops) {
    var cm = ctms(ops);
    list.forEach(function (o) { if (o.kind === 'vector') { o.wrap = wrapOf(ops, o.a, o.b); o.outer = cm[o.wrap ? o.wrap.a : o.a]; } });
    return list;
  }

  return {
    objects: function (src, ops, info, opts) { return finish(objects(src, ops, info, opts), ops); },
    ctms: ctms, wrapOf: wrapOf, mul: mul, inv: inv, apply: apply, quadOf: quadOf, boxOf: boxOf, inlineInfo: inlineInfo, ID: ID
  };
});
