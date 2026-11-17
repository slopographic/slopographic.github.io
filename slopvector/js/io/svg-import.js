/* SlopVector — io: SVG elements to editable objects */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state;
  var fmt = G.fmt, esc = SV.esc, clone = SV.clone;
  var abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt;
  var IO = SV.io = SV.io || {};
  var $ = SV._io = SV._io || {};
  function frac() { return $.frac.apply(this, arguments); }
  function num() { return $.num.apply(this, arguments); }
  function ownProps() { return $.ownProps.apply(this, arguments); }
  function parseCSS() { return $.parseCSS.apply(this, arguments); }
  function parseColor() { return $.parseColor.apply(this, arguments); }
  function parseTransform() { return $.parseTransform.apply(this, arguments); }
  var INHERIT = $.INHERIT;

  function svgToObjects(root, opts) {
    var rules = [], grads = {}, warnings = {};
    Array.prototype.forEach.call(root.getElementsByTagName('style'), function (s) { rules = rules.concat(parseCSS(s.textContent || '')); });
    var byId = {};
    Array.prototype.forEach.call(root.querySelectorAll('[id]'), function (e) { byId[e.getAttribute('id')] = e; });
    function href(el) { return el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || el.getAttribute('xlink:href'); }
    function gradAttr(el, name) {
      var cur = el, guard = 0;
      while (cur && guard++ < 10) { var v = cur.getAttribute(name); if (v != null) return v; var h = href(cur); cur = h && h[0] === '#' ? byId[h.slice(1)] : null; }
      return null;
    }
    function gradStops(el) {
      var cur = el, guard = 0;
      while (cur && guard++ < 10) {
        var st = Array.prototype.filter.call(cur.children, function (c) { return c.localName === 'stop'; });
        if (st.length) return st.map(function (s) {
          var pp = ownProps(s, rules), col = parseColor(pp['stop-color'] || s.getAttribute('stop-color') || '#000') || { c: '#000000', a: 0 };
          var op = parseFloat(pp['stop-opacity'] != null ? pp['stop-opacity'] : 1);
          return { o: SV.clamp(frac(s.getAttribute('offset'), 0), 0, 1), c: col.c, a: SV.clamp((isNaN(op) ? 1 : op) * col.a, 0, 1) };
        });
        var h = href(cur); cur = h && h[0] === '#' ? byId[h.slice(1)] : null;
      }
      return [];
    }
    function resolvePaint(val, props, localBox, which) {
      if (val == null) return which === 'fill' ? { c: '#000000', a: 1 } : null;
      val = String(val).trim();
      var mu = /^url\(\s*['"]?#([^)'"]+)['"]?\s*\)\s*(.*)$/.exec(val);
      if (mu) {
        var gel = byId[mu[1]];
        if (!gel || (gel.localName !== 'linearGradient' && gel.localName !== 'radialGradient')) return mu[2] ? resolvePaint(mu[2], props, localBox, which) : null;
        var stops = gradStops(gel); if (!stops.length) return null;
        if (stops.length === 1) return { c: stops[0].c, a: stops[0].a };
        var units = gradAttr(gel, 'gradientUnits') || 'objectBoundingBox';
        var gt = parseTransform(gradAttr(gel, 'gradientTransform'));
        var bb = localBox || { x: 0, y: 0, w: 1, h: 1 };
        var userU = units === 'userSpaceOnUse';
        function toFrac(x, y) {
          var p = G.ap(gt, x, y);
          if (!userU) return p;
          return { x: bb.w ? (p.x - bb.x) / bb.w : 0.5, y: bb.h ? (p.y - bb.y) / bb.h : 0.5 };
        }
        function coord(name, def, axis) {
          var v = gradAttr(gel, name); if (v == null) return userU ? (axis === 'x' ? bb.x + def * bb.w : bb.y + def * bb.h) : def;
          if (/%$/.test(v)) { var f = parseFloat(v) / 100; return userU ? (axis === 'x' ? bb.x + f * bb.w : bb.y + f * bb.h) : f; }
          return parseFloat(v);
        }
        if (gel.localName === 'radialGradient') {
          var cx = coord('cx', 0.5, 'x'), cy = coord('cy', 0.5, 'y'), fxv = gradAttr(gel, 'fx') != null ? coord('fx', 0.5, 'x') : cx, fyv = gradAttr(gel, 'fy') != null ? coord('fy', 0.5, 'y') : cy;
          var rr = gradAttr(gel, 'r'), r = rr == null ? (userU ? 0.5 * (bb.w + bb.h) / 2 : 0.5) : (/%$/.test(rr) ? parseFloat(rr) / 100 * (userU ? (bb.w + bb.h) / 2 : 1) : parseFloat(rr));
          var c = toFrac(cx, cy), f = toFrac(fxv, fyv), sc = sqrt(abs(G.det(gt)));
          var rf = userU ? r * sc / (((bb.w + bb.h) / 2) || 1) : r * sc;
          return { grad: { type: 'radial', cx: c.x, cy: c.y, r: rf, fx: f.x, fy: f.y, stops: stops } };
        }
        var p1 = toFrac(coord('x1', 0, 'x'), coord('y1', 0, 'y')), p2 = toFrac(coord('x2', 1, 'x'), coord('y2', 0, 'y'));
        return { grad: { type: 'linear', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stops: stops } };
      }
      if (val === 'currentColor') return parseColor(props.color || '#000');
      return parseColor(val);
    }
    function styleFrom(props, localBox) {
      var st = SV.mkStyle();
      var fp = resolvePaint(props.fill === undefined ? null : props.fill, props, localBox, 'fill');
      if (props.fill === undefined) fp = { c: '#000000', a: 1 };
      var sp = props.stroke === undefined ? null : resolvePaint(props.stroke, props, localBox, 'stroke');
      var fo = parseFloat(props['fill-opacity']); if (isNaN(fo)) fo = 1;
      var so = parseFloat(props['stroke-opacity']); if (isNaN(so)) so = 1;
      var op = parseFloat(props.opacity); if (isNaN(op)) op = 1;
      if (fp && fp.grad) { st.fill = fp.grad; if (fo < 1) st.fill.stops.forEach(function (s) { s.a *= fo; }); }
      else if (fp) { st.fill = fp.c; if (fp.a * fo < 1) { if (!sp) op *= fp.a * fo; } }
      if (sp && sp.grad) st.stroke = sp.grad; else if (sp) { st.stroke = sp.c; if (sp.a * so < 1 && !st.fill) op *= sp.a * so; }
      st.sw = props['stroke-width'] != null ? num(props['stroke-width'], 1) : 1;
      if (props['stroke-linecap']) st.cap = props['stroke-linecap'];
      if (props['stroke-linejoin']) st.join = props['stroke-linejoin'] === 'arcs' || props['stroke-linejoin'] === 'miter-clip' ? 'miter' : props['stroke-linejoin'];
      if (props['stroke-miterlimit']) st.miter = parseFloat(props['stroke-miterlimit']) || 4; else st.miter = 4;
      if (props['stroke-dasharray'] && props['stroke-dasharray'] !== 'none') { var d = props['stroke-dasharray'].split(/[\s,]+/).map(function (v) { return num(v); }).filter(function (v) { return !isNaN(v); }); if (d.length && d.some(function (v) { return v > 0; })) st.dash = d; }
      if (props['fill-rule'] === 'evenodd') st.rule = 'evenodd';
      st.opacity = SV.clamp(op, 0, 1);
      if (props['mix-blend-mode'] && SV.BLENDS.indexOf(props['mix-blend-mode']) >= 0) st.blend = props['mix-blend-mode'];
      return st;
    }
    function nameOf(el) { return el.getAttribute('data-name') || el.getAttributeNS('http://www.inkscape.org/namespaces/inkscape', 'label') || el.getAttribute('inkscape:label') || el.getAttribute('id') || ''; }
    var SKIP = { defs: 1, metadata: 1, title: 1, desc: 1, style: 1, clipPath: 1, mask: 1, symbol: 1, pattern: 1, linearGradient: 1, radialGradient: 1, filter: 1, script: 1, foreignObject: 1, marker: 1 };
    var prevScale = S.prefs.scaleStrokes;
    function conv(el, parentProps, ctm, depth) {
      var tag = el.localName;
      if (SKIP[tag] || depth > 40) return null;
      var own = ownProps(el, rules), props = {};
      INHERIT.forEach(function (k) { if (parentProps[k] !== undefined) props[k] = parentProps[k]; });
      Object.keys(own).forEach(function (k) { if (own[k] !== 'inherit') props[k] = own[k]; });
      if (props.display === 'none') return null;
      var m = G.mul(ctm, parseTransform(own.transform));
      var o = null, lb;
      function fin(obj) {
        obj.name = nameOf(el);
        if (props.visibility === 'hidden') obj.hidden = true;
        SV.transformObj(obj, m);
        return obj;
      }
      switch (tag) {
        case 'g': case 'a': case 'switch': case 'svg': {
          var cm = m;
          if (tag === 'svg') {
            cm = G.mul(m, G.translate(num(el.getAttribute('x')), num(el.getAttribute('y'))));
            var vbs = el.getAttribute('viewBox');
            if (vbs) { var v = vbs.split(/[\s,]+/).map(parseFloat), ww = num(el.getAttribute('width'), v[2]), hh = num(el.getAttribute('height'), v[3]); cm = G.mul(cm, G.mul(G.scale(ww / v[2], hh / v[3]), G.translate(-v[0], -v[1]))); }
          }
          var kids = [];
          Array.prototype.forEach.call(el.children, function (c) { var r = conv(c, props, cm, depth + 1); if (r) kids.push(r); });
          if (!kids.length) return null;
          var op = parseFloat(own.opacity);
          if (kids.length === 1 && isNaN(op) && !nameOf(el)) return kids[0];
          var g = SV.mk.group(kids, nameOf(el));
          if (!isNaN(op) && op < 1) g.style.opacity = op;
          if (own['mix-blend-mode']) g.style.blend = own['mix-blend-mode'];
          return g;
        }
        case 'use': {
          var h = href(el); var ref = h && h[0] === '#' ? byId[h.slice(1)] : null;
          if (!ref || ref === el) return null;
          var um = G.mul(m, G.translate(num(el.getAttribute('x')), num(el.getAttribute('y'))));
          if (ref.localName === 'symbol') {
            var ks = []; Array.prototype.forEach.call(ref.children, function (c) { var r = conv(c, props, um, depth + 1); if (r) ks.push(r); });
            return ks.length ? (ks.length === 1 ? ks[0] : SV.mk.group(ks, nameOf(el))) : null;
          }
          return conv(ref, props, um, depth + 1);
        }
        case 'rect': {
          var x = num(el.getAttribute('x')), y = num(el.getAttribute('y')), w = num(el.getAttribute('width')), hgt = num(el.getAttribute('height'));
          if (w <= 0 || hgt <= 0) return null;
          var rx = el.getAttribute('rx'), ry = el.getAttribute('ry'), rad = rx != null ? num(rx) : ry != null ? num(ry) : 0;
          o = SV.mk.rect(x, y, w, hgt, rad, styleFrom(props, { x: x, y: y, w: w, h: hgt }));
          return fin(o);
        }
        case 'circle': case 'ellipse': {
          var cx = num(el.getAttribute('cx')), cy = num(el.getAttribute('cy'));
          var erx = tag === 'circle' ? num(el.getAttribute('r')) : num(el.getAttribute('rx')), ery = tag === 'circle' ? erx : num(el.getAttribute('ry'));
          if (tag === 'ellipse' && el.getAttribute('ry') == null) ery = erx; if (tag === 'ellipse' && el.getAttribute('rx') == null) erx = ery;
          if (erx <= 0 || ery <= 0) return null;
          o = SV.mk.ellipse(cx, cy, erx, ery, styleFrom(props, { x: cx - erx, y: cy - ery, w: 2 * erx, h: 2 * ery }));
          return fin(o);
        }
        case 'line': {
          var subs = [{ closed: false, pts: [G.A(num(el.getAttribute('x1')), num(el.getAttribute('y1'))), G.A(num(el.getAttribute('x2')), num(el.getAttribute('y2')))] }];
          var stl = styleFrom(props, G.subsBBox(subs)); stl.fill = null;
          o = SV.mk.path(subs, stl); return fin(o);
        }
        case 'polyline': case 'polygon': {
          var nums = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(parseFloat).filter(function (v) { return !isNaN(v); });
          var pts = []; for (var i = 0; i + 1 < nums.length; i += 2) pts.push(G.A(nums[i], nums[i + 1]));
          if (pts.length < 2) return null;
          var s2 = [{ closed: tag === 'polygon', pts: pts }];
          o = SV.mk.path(s2, styleFrom(props, G.subsBBox(s2))); return fin(o);
        }
        case 'path': {
          var ps = G.parseD(el.getAttribute('d') || '');
          if (!ps.length) return null;
          o = SV.mk.path(ps, styleFrom(props, G.subsBBox(ps))); return fin(o);
        }
        case 'text': {
          var lines = [], tx = el.getAttribute('x'), ty = el.getAttribute('y');
          var tsp = Array.prototype.filter.call(el.children, function (c) { return c.localName === 'tspan'; });
          var multi = tsp.length > 1 && tsp.some(function (t) { return t.getAttribute('dy') || (t.getAttribute('y') && t.getAttribute('y') !== ty); });
          if (multi) tsp.forEach(function (t) { lines.push((t.textContent || '').replace(/\s+/g, ' ')); });
          else lines.push((el.textContent || '').replace(/\s+/g, ' ').trim());
          if (tx == null && tsp[0]) tx = tsp[0].getAttribute('x');
          if (ty == null && tsp[0]) ty = tsp[0].getAttribute('y');
          var x0 = num(String(tx || '0').split(/[\s,]+/)[0]), y0 = num(String(ty || '0').split(/[\s,]+/)[0]);
          if (tsp[0] && tsp[0].getAttribute('dy')) y0 += num(tsp[0].getAttribute('dy'));
          var fam = (props['font-family'] || 'Inter Tight').split(',')[0].replace(/['"]/g, '').trim();
          Object.keys(SV.FONTS).forEach(function (k) { if (k.toLowerCase() === fam.toLowerCase()) fam = k; });
          var size = num(props['font-size'], 16) || 16;
          var wt = props['font-weight'] || '400'; wt = wt === 'bold' ? 700 : wt === 'normal' ? 400 : (parseInt(wt, 10) || 400);
          var anchor = props['text-anchor'];
          var lh = 1.2;
          if (multi && tsp.length > 1) { var d1 = tsp[1].getAttribute('dy'); if (d1) lh = num(d1) / size; else if (tsp[1].getAttribute('y')) lh = (num(tsp[1].getAttribute('y')) - num(tsp[0].getAttribute('y') || ty)) / size; if (!(lh > 0.3 && lh < 5)) lh = 1.2; }
          var ls = parseFloat(props['letter-spacing']);
          var font = { family: fam, size: size, weight: wt, style: props['font-style'] === 'italic' ? 'italic' : 'normal', align: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left', lh: Math.round(lh * 1000) / 1000, tracking: isNaN(ls) ? 0 : Math.round(ls / size * 1000) };
          if (!lines.join('').trim()) return null;
          o = SV.mk.text(x0, y0, lines.join('\n'), font, styleFrom(props, null));
          return fin(o);
        }
        case 'image': {
          var src = href(el);
          if (!src || !/^data:image\//.test(src)) { warnings.external = true; return null; }
          var aid = 'a' + SV.uid();
          opts.assets[aid] = src;
          o = SV.mk.image(aid, num(el.getAttribute('x')), num(el.getAttribute('y')), num(el.getAttribute('width')), num(el.getAttribute('height')));
          var op2 = parseFloat(props.opacity); if (!isNaN(op2)) o.style.opacity = op2;
          return fin(o);
        }
      }
      return null;
    }
    S.prefs.scaleStrokes = true;
    var result;
    try {
      var vb = root.getAttribute('viewBox'), W, H, base = G.I();
      var wAttr = root.getAttribute('width'), hAttr = root.getAttribute('height');
      if (vb) {
        var v = vb.trim().split(/[\s,]+/).map(parseFloat);
        W = wAttr && !/%/.test(wAttr) ? num(wAttr) : v[2]; H = hAttr && !/%/.test(hAttr) ? num(hAttr) : v[3];
        base = G.mul(G.scale(W / v[2], H / v[3]), G.translate(-v[0], -v[1]));
      } else { W = num(wAttr, 800) || 800; H = num(hAttr, 600) || 600; }
      var rootProps = {}; var rp = ownProps(root, rules); INHERIT.forEach(function (k) { if (rp[k] !== undefined) rootProps[k] = rp[k]; });
      base = G.mul(base, parseTransform(rp.transform));
      var kids = Array.prototype.filter.call(root.children, function (c) { return !SKIP[c.localName]; });
      var layers = [];
      var allGroups = kids.length > 0 && kids.every(function (c) { return c.localName === 'g'; });
      if (allGroups && opts.asLayers) {
        kids.forEach(function (gEl, i) {
          var gp = ownProps(gEl, rules), props = {};
          INHERIT.forEach(function (k) { if (rootProps[k] !== undefined) props[k] = rootProps[k]; if (gp[k] !== undefined && gp[k] !== 'inherit') props[k] = gp[k]; });
          if (gp.display === 'none') return;
          var gm = G.mul(base, parseTransform(gp.transform));
          var L = SV.mk.layer(nameOf(gEl) || ('Layer ' + (i + 1)), SV.LAYER_COLORS[i % SV.LAYER_COLORS.length]);
          Array.prototype.forEach.call(gEl.children, function (c) { var r = conv(c, props, gm, 1); if (r) L.children.push(r); });
          var gop = parseFloat(gp.opacity);
          if (!isNaN(gop) && gop < 1) L.children.forEach(function (o) { o.style.opacity = (o.style.opacity == null ? 1 : o.style.opacity) * gop; });
          layers.push(L);
        });
      } else {
        var L1 = SV.mk.layer('Layer 1', SV.LAYER_COLORS[0]);
        kids.forEach(function (c) { var r = conv(c, rootProps, base, 1); if (r) L1.children.push(r); });
        layers.push(L1);
      }
      result = { width: W, height: H, layers: layers, warnings: warnings };
    } finally { S.prefs.scaleStrokes = prevScale; }
    return result;
  }

  $.svgToObjects = svgToObjects;
})();
