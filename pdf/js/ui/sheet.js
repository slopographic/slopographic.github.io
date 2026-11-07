/* Slop PDF — page "sheets": a rotated wrapper around the unrotated page raster plus an SVG
   layer of annotations. Used by both the organizer thumbnails and the page editor, and
   drawn from exactly the same geometry the pdf-lib export uses. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine;
  var V = SP.view = {};

  /** CSS transform that maps the unrotated layer (W×H at scale s) onto the rotated view. */
  V.layerTransform = function (R, W, H, s) {
    if (R === 90) return 'translate(' + (H * s) + 'px,0) rotate(90deg)';
    if (R === 180) return 'translate(' + (W * s) + 'px,' + (H * s) + 'px) rotate(180deg)';
    if (R === 270) return 'translate(0,' + (W * s) + 'px) rotate(270deg)';
    return 'none';
  };

  function fmt(v) { return String(U.round(v, 3)); }
  var hatchSeq = 0;

  /** Text highlight: one filled quad per text line (pts hold four points per line). Style underline or strike draws a
      line along the bottom or through the middle of each line instead (sel-geom.js markLine, shared with the export). */
  V.texthlNode = function (a) {
    var g = U.s('g', { 'data-aid': a.id, class: 'an an-texthl' }), op = 'opacity' in a ? a.opacity : 1;
    for (var k = 0; k + 3 < a.pts.length; k += 4) {
      if (a.style === 'underline' || a.style === 'strike') {
        var ml = window.SlopPdfSel.markLine(a.pts.slice(k, k + 4), a.style);
        g.appendChild(U.s('line', { x1: fmt(ml.x0), y1: fmt(ml.y), x2: fmt(ml.x1), y2: fmt(ml.y), stroke: a.color || '#ffe14d', 'stroke-width': fmt(ml.w), 'stroke-opacity': op }));
        continue;
      }
      var q = a.pts.slice(k, k + 4).map(function (p) { return fmt(p[0]) + ',' + fmt(p[1]); }).join(' ');
      g.appendChild(U.s('polygon', { points: q, fill: a.color || '#ffe14d', 'fill-opacity': op, style: 'mix-blend-mode:multiply' }));
    }
    return g;
  };

  /** One annotation → SVG element in unrotated page space (points). */
  V.annotNode = function (a) {
    var g, op = 'opacity' in a ? a.opacity : 1;
    if (a.type === 'texthl') return a.pts && a.pts.length ? V.texthlNode(a) : null;
    if (a.type === 'note') return V.noteNode(a);
    if (a.type === 'callout') return V.calloutNode(a);
    if (a.type === 'step') return V.stepNode(a);
    if (a.type === 'para') return V.paraNode ? V.paraNode(a) : null; // a paragraph frame (editor/para-view.js)
    if (!E.isBox(a)) {
      if (!a.pts || !a.pts.length) return null;
      g = U.s('g', { 'data-aid': a.id, class: 'an an-' + a.type });
      var pts = a.pts.map(function (p) { return fmt(p[0]) + ',' + fmt(p[1]); });
      if (a.type === 'line' || a.type === 'arrow') pts = [pts[0], pts[pts.length - 1]];
      if (pts.length === 1) pts.push(fmt(a.pts[0][0] + 0.01) + ',' + fmt(a.pts[0][1]));
      var attrs = { points: pts.join(' '), fill: 'none', stroke: a.color || '#000', 'stroke-width': a.width || 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-opacity': op };
      if (a.type === 'marker') attrs.style = 'mix-blend-mode:multiply';
      // fat invisible hit line so thin strokes are easy to grab
      g.appendChild(U.s('polyline', { points: attrs.points, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(10, (a.width || 2) + 8), class: 'an-hit', 'stroke-linecap': 'round' }));
      g.appendChild(U.s('polyline', attrs));
      if (a.type === 'arrow') g.appendChild(U.s('path', { d: E.arrowHead(a), fill: a.color || '#000', 'fill-opacity': op }));
      return g;
    }
    g = U.s('g', { 'data-aid': a.id, class: 'an an-' + a.type, transform: 'translate(' + fmt(a.cx) + ' ' + fmt(a.cy) + ') rotate(' + fmt(-(a.rot || 0)) + ') translate(' + fmt(-a.w / 2) + ' ' + fmt(-a.h / 2) + ')' });
    g.appendChild(U.s('rect', { x: 0, y: 0, width: fmt(a.w), height: fmt(a.h), fill: 'transparent', class: 'an-hit' }));
    if (a.type === 'text') {
      var t = E.textLayout(a);
      var txt = U.s('text', { 'font-family': E.cssFont(a), 'font-size': fmt(t.size), fill: a.color || '#000', 'fill-opacity': op, 'font-weight': E.cssWeight(a), 'font-style': a.italic ? 'italic' : 'normal', 'xml:space': 'preserve', style: 'white-space:pre' });
      t.lines.forEach(function (line, i) { txt.appendChild(U.s('tspan', { x: fmt(t.pad), y: fmt(t.base(i)) }, line || ' ')); });
      g.appendChild(txt);
    } else if (a.type === 'redact') {
      // pending redaction: red hatching (never exported; applying burns a black box into the page)
      var pid = 'rh' + (++hatchSeq), pat = U.s('pattern', { id: pid, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
      pat.appendChild(U.s('rect', { x: 0, y: 0, width: 2.2, height: 6, fill: '#e0102f' }));
      g.appendChild(U.s('defs', null, pat));
      g.appendChild(U.s('rect', { x: 0, y: 0, width: fmt(a.w), height: fmt(a.h), fill: '#e0102f', 'fill-opacity': 0.16 }));
      g.appendChild(U.s('rect', { x: 0, y: 0, width: fmt(a.w), height: fmt(a.h), fill: 'url(#' + pid + ')', 'fill-opacity': 0.8, stroke: '#e0102f', 'stroke-width': 1.2, 'stroke-dasharray': '4 2', 'vector-effect': 'non-scaling-stroke' }));
    } else if (a.type === 'image') {
      var as = E.assets.get(a.asset);
      if (as) g.appendChild(U.s('image', { href: as.url, x: 0, y: 0, width: fmt(a.w), height: fmt(a.h), preserveAspectRatio: 'none', opacity: op }));
    } else {
      var sw = a.type === 'whiteout' || a.type === 'hlbox' ? 0 : (a.width == null ? 2 : a.width);
      var fill = a.fill && a.fill !== 'none' ? a.fill : 'none';
      var at = { fill: fill, stroke: sw > 0 && a.color && a.color !== 'none' ? a.color : 'none', 'stroke-width': sw };
      if (fill !== 'none') at['fill-opacity'] = a.type === 'hlbox' ? (a.opacity == null ? 0.4 : a.opacity) : (a.fillOpacity == null ? op : a.fillOpacity);
      at['stroke-opacity'] = op;
      if (a.type === 'hlbox') at.style = 'mix-blend-mode:multiply';
      if (a.type === 'ellipse') {
        at.cx = fmt(a.w / 2); at.cy = fmt(a.h / 2); at.rx = fmt(Math.max(0.1, (a.w - sw) / 2)); at.ry = fmt(Math.max(0.1, (a.h - sw) / 2));
        g.appendChild(U.s('ellipse', at));
      } else {
        at.x = fmt(sw / 2); at.y = fmt(sw / 2); at.width = fmt(Math.max(0.1, a.w - sw)); at.height = fmt(Math.max(0.1, a.h - sw));
        g.appendChild(U.s('rect', at));
      }
    }
    return g;
  };

  /** Fills an <svg> with the page's annotations (+ stamps preview). */
  V.paintAnnots = function (svg, p, index, total, opts) {
    opts = opts || {};
    var g = E.geom(p);
    svg.setAttribute('viewBox', '0 0 ' + fmt(g.W) + ' ' + fmt(g.H));
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var stamps = index != null ? E.stampAnnots(p, index, total) : [];
    var sg = U.s('g', { class: 'stamps' });
    stamps.forEach(function (a) { var n = V.annotNode(a); if (n) sg.appendChild(n); });
    var ag = U.s('g', { class: 'annots' });
    (p.annots || []).forEach(function (a) { if (a.hidden || (opts.hide && opts.hide === a.id)) return; var n = V.annotNode(a); if (n) ag.appendChild(n); });
    if (opts.draft) { var d = V.annotNode(opts.draft); if (d) { d.classList.add('draft'); ag.appendChild(d); } }
    svg.appendChild(ag); svg.appendChild(sg);
  };

  /** Signature used to skip re-painting unchanged thumbnails. */
  V.sig = function (p, index, total) {
    var st = E.state.stamps, s = E.rotation(p) + '|' + JSON.stringify(p.annots || []);
    if (st.pageNumbers) s += '|n' + index + '/' + total + JSON.stringify(st.pageNumbers);
    if (st.wm || st.watermark || st.watermarks) s += '|w' + JSON.stringify([st.wm || null, st.watermark || null, st.watermarks || null]);
    return s;
  };

  /** Builds (or updates) a sheet for a page, fitting maxW×maxH CSS px. Returns {el, scale}. */
  V.sheet = function (el, p, maxW, maxH, index, total) {
    var g = E.geom(p), R = E.rotation(p), vs = E.viewSize(p);
    var s = Math.min(maxW / vs.w, maxH / vs.h);
    if (!el) {
      el = U.h('div', { class: 'sheet' },
        U.h('div', { class: 'sheet-layer' }, U.h('img', { class: 'sheet-img', alt: '', draggable: 'false', decoding: 'async' }), U.s('svg', { class: 'sheet-svg', 'aria-hidden': 'true', preserveAspectRatio: 'none' })));
    }
    el.style.width = (vs.w * s) + 'px'; el.style.height = (vs.h * s) + 'px';
    var layer = el.firstChild;
    layer.style.width = (g.W * s) + 'px'; layer.style.height = (g.H * s) + 'px';
    layer.style.transform = V.layerTransform(R, g.W, g.H, s);
    el.classList.toggle('is-blank', !!p.blank);
    var svg = layer.querySelector('svg');
    var sig = V.sig(p, index, total) + '|' + g.W + 'x' + g.H;
    if (el._sig !== sig) { el._sig = sig; V.paintAnnots(svg, p, index, total); }
    el._scale = s;
    return el;
  };
  /** Loads the raster into a sheet's <img> (lazy; called when visible). */
  V.loadRaster = function (el, p, px) {
    var img = el.querySelector('.sheet-img');
    if (p.blank) { img.removeAttribute('src'); img.style.visibility = 'hidden'; return Promise.resolve(); }
    var base = p.f + ':' + p.i + ':' + E.formKey(p.f), b = E.bucket(px), key = base + ':' + b;
    // zooming out keeps the sharper raster already shown instead of fetching a smaller one
    if (img._key === key || (img._base === base && img._b >= b && img._shown)) return Promise.resolve();
    img._key = key; img._base = base; img._b = b; img._shown = false;
    return E.thumbURL(p, px).then(function (url) {
      if (img._key !== key || !url) return;
      img.style.visibility = '';
      if (img.src !== url) img.src = url;
      img._shown = true;
      el.classList.add('loaded');
    }).catch(function (e) { console.warn('Slop PDF: thumbnail failed', e); el.classList.add('failed'); });
  };
})();
