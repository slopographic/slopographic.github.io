/* SlopVector — core: objects and paints to SVG markup (live render + export). A document can come from a file (the
   metadata of an SVG it saved), so every text value that goes into the markup is escaped with esc(); numbers go
   through fmt(). */
(function () {
  'use strict';
  var G = window.SVGeom;
  var SV = window.SV = window.SV || {};
  var SVGNS = 'http://www.w3.org/2000/svg';
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round;
  var fmt = G.fmt;
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var $ = SV._core = SV._core || {};
  function esc() { return $.esc.apply(this, arguments); }
  function localBox() { return $.localBox.apply(this, arguments); }
  function localSubs() { return $.localSubs.apply(this, arguments); }
  function textLayout() { return $.textLayout.apply(this, arguments); }
  var S = $.S;

  /* ================= painting → SVG ================= */
  function paintStops(stops) {
    return stops.map(function (s) {
      return '<stop offset="' + fmt(s.o) + '" stop-color="' + esc(s.c) + '"' + (s.a != null && s.a < 1 ? ' stop-opacity="' + fmt(s.a) + '"' : '') + '/>';
    }).join('');
  }
  function gradSVG(p, id) {
    if (p.type === 'radial') {
      return '<radialGradient id="' + esc(id) + '" cx="' + fmt(p.cx) + '" cy="' + fmt(p.cy) + '" r="' + fmt(p.r) + '"' +
        (p.fx != null ? ' fx="' + fmt(p.fx) + '" fy="' + fmt(p.fy) + '"' : '') + '>' + paintStops(p.stops) + '</radialGradient>';
    }
    return '<linearGradient id="' + esc(id) + '" x1="' + fmt(p.x1) + '" y1="' + fmt(p.y1) + '" x2="' + fmt(p.x2) + '" y2="' + fmt(p.y2) + '">' + paintStops(p.stops) + '</linearGradient>';
  }
  SV.gradSVG = gradSVG;
  function paintRef(p, ctx, o, which) {
    if (!p) return 'none';
    if (typeof p === 'string') return p;
    var id = ctx.gradId(o, which);
    ctx.defs.push(gradSVG(p, id));
    return 'url(#' + id + ')';
  }
  /** A paint attribute. A solid '#rrggbbaa' is written SVG 1.1 style: the colour plus fill-opacity / stroke-opacity. */
  function paintAttr(name, p, ctx, o, which) {
    var r = paintRef(p, ctx, o, which), m = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(r);
    if (!m) return ' ' + name + '="' + esc(r) + '"';
    return ' ' + name + '="#' + m[1] + '" ' + name + '-opacity="' + fmt(parseInt(m[2], 16) / 255) + '"';
  }
  function styleAttrs(o, ctx) {
    var st = o.style, a = '';
    if (ctx.clipping) return ''; // a clip shape only gives geometry; a clipPath ignores paint
    if (ctx.outline) {
      if (o.type === 'text') return ' fill="#000"';
      return ' fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"';
    }
    if (o.type !== 'image') {
      a += paintAttr('fill', st.fill, ctx, o, 'f');
      if (st.fill && st.rule === 'evenodd') a += ' fill-rule="evenodd"';
      if (st.stroke && st.sw > 0) {
        a += paintAttr('stroke', st.stroke, ctx, o, 's') + ' stroke-width="' + fmt(st.sw) + '"';
        if (st.cap && st.cap !== 'butt') a += ' stroke-linecap="' + esc(st.cap) + '"';
        if (st.join && st.join !== 'miter') a += ' stroke-linejoin="' + esc(st.join) + '"';
        if (st.join === 'miter' && st.miter && st.miter !== 4) a += ' stroke-miterlimit="' + fmt(st.miter) + '"';
        if (st.dash && st.dash.length) a += ' stroke-dasharray="' + st.dash.map(fmt).join(' ') + '"';
      }
    }
    return a;
  }
  function commonAttrs(o, ctx) {
    var st = o.style || {}, a = '';
    if (!G.isIdentity(o.m)) a += ' transform="matrix(' + o.m.map(fmt).join(' ') + ')"';
    if (!ctx.outline) {
      if (st.opacity != null && st.opacity < 1) a += ' opacity="' + fmt(st.opacity) + '"';
      if (st.blend && st.blend !== 'normal') a += ' style="mix-blend-mode:' + esc(String(st.blend).replace(/[^a-z-]/gi, '')) + '"';
    }
    if (ctx.hideId && ctx.hideId === o.id) a += ' visibility="hidden"';
    if (ctx.names && o.name) a += ' id="' + ctx.uniqueName(o.name) + '"';
    return a;
  }
  function objToSVG(o, ctx) {
    if (o.hidden && !ctx.keepHidden) return '';
    var c = commonAttrs(o, ctx), s, lb;
    switch (o.type) {
      case 'group':
        if (ctx.clipping) return o.children.map(function (ch) { return objToSVG(ch, ctx); }).join(''); // <g> is not allowed in a clipPath: its shapes go in directly
        if (o.clip && o.children.length) { // clipping mask: a <clipPath> in defs, the clipped objects inside a clip-path group
          var cl = SV.clipMask.svg(esc('sv-clip-' + o.id), objToSVG(o.children[o.children.length - 1], Object.assign({}, ctx, { clipping: true })),
            o.children.slice(0, -1).map(function (ch) { return objToSVG(ch, ctx); }).join(''), c);
          ctx.defs.push(cl.def);
          return cl.markup;
        }
        return '<g' + c + '>' + o.children.map(function (ch) { return objToSVG(ch, ctx); }).join('') + '</g>';
      case 'rect':
        s = styleAttrs(o, ctx);
        var rr = SV.rectRadii(o);
        if (rr[0] + rr[1] + rr[2] + rr[3] > 0) // rounded: the shared rounded-rectangle path (circular arcs)
          return '<path d="' + window.SlopShapes.svgPath({ x: o.x, y: o.y, w: o.w, h: o.h, radius: rr }) + '"' + s + c + '/>';
        return '<rect x="' + fmt(o.x) + '" y="' + fmt(o.y) + '" width="' + fmt(o.w) + '" height="' + fmt(o.h) + '"' + s + c + '/>';
      case 'ellipse':
        s = styleAttrs(o, ctx);
        if (abs(o.rx - o.ry) < 1e-9) return '<circle cx="' + fmt(o.cx) + '" cy="' + fmt(o.cy) + '" r="' + fmt(o.rx) + '"' + s + c + '/>';
        return '<ellipse cx="' + fmt(o.cx) + '" cy="' + fmt(o.cy) + '" rx="' + fmt(o.rx) + '" ry="' + fmt(o.ry) + '"' + s + c + '/>';
      case 'polygon': case 'star':
        s = styleAttrs(o, ctx);
        return '<polygon points="' + localSubs(o)[0].pts.map(function (p) { return fmt(p.x) + ',' + fmt(p.y); }).join(' ') + '"' + s + c + '/>';
      case 'path':
        s = styleAttrs(o, ctx);
        return '<path d="' + G.toD(o.subpaths) + '"' + s + c + '/>';
      case 'text':
        s = styleAttrs(o, ctx);
        var f = o.font, lay = textLayout(o);
        var anchor = f.align === 'center' ? 'middle' : f.align === 'right' ? 'end' : 'start';
        var t = '<text x="' + fmt(o.x) + '" y="' + fmt(o.y) + '" font-family="' + esc(SV.fontStack(f.family)) + '" font-size="' + fmt(f.size) + '"' +
          (f.weight && f.weight != 400 ? ' font-weight="' + esc(f.weight) + '"' : '') + (f.style === 'italic' ? ' font-style="italic"' : '') +
          (anchor !== 'start' ? ' text-anchor="' + anchor + '"' : '') + (lay.tr ? ' letter-spacing="' + fmt(lay.tr) + '"' : '') +
          ' xml:space="preserve"' + s + c + '>';
        lay.lines.forEach(function (ln, i) { t += '<tspan x="' + fmt(o.x) + '" y="' + fmt(o.y + i * lay.L) + '">' + esc(ln) + '</tspan>'; });
        return t + '</text>';
      case 'image':
        if (ctx.clipping) return '<rect x="' + fmt(o.x) + '" y="' + fmt(o.y) + '" width="' + fmt(o.w) + '" height="' + fmt(o.h) + '"' + c + '/>'; // <image> is not allowed in a clipPath
        if (ctx.outline) {
          lb = localBox(o);
          return '<path d="M' + fmt(o.x) + ' ' + fmt(o.y) + 'h' + fmt(o.w) + 'v' + fmt(o.h) + 'h' + fmt(-o.w) + 'zM' + fmt(o.x) + ' ' + fmt(o.y) + 'L' + fmt(o.x + o.w) + ' ' + fmt(o.y + o.h) + 'M' + fmt(o.x + o.w) + ' ' + fmt(o.y) + 'L' + fmt(o.x) + ' ' + fmt(o.y + o.h) + '" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"' + c + '/>';
        }
        var href = ctx.live && o.asset ? 'sv-asset:' + o.asset : ((S.doc.assets && S.doc.assets[o.asset]) || o.href || '');
        return '<image href="' + esc(href) + '" x="' + fmt(o.x) + '" y="' + fmt(o.y) + '" width="' + fmt(o.w) + '" height="' + fmt(o.h) + '" preserveAspectRatio="none"' + c + '/>';
    }
    return '';
  }
  SV.objToSVG = objToSVG;

  $.objToSVG = objToSVG;
})();
