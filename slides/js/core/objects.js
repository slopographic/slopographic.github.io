/* Slop Slides: slide objects. Every object has id, type, name, x, y, w, h (points), rot (degrees), opacity.
   Types: text, shape, image, table, chart, media (video/audio) and group (children + child frame `ch`). */
(function () {
  'use strict';
  var SS = window.SS, U = SS.util;
  var O = SS.objects = {};

  O.SHAPES = ['rect', 'roundRect', 'ellipse', 'triangle', 'rightArrow', 'leftArrow', 'star5', 'diamond', 'hexagon', 'line', 'arrowLine', 'callout', 'cloudCallout'];
  O.SHAPE_NAMES = { rect: 'Rectangle', roundRect: 'Rounded rectangle', ellipse: 'Oval', triangle: 'Triangle', rightArrow: 'Arrow', leftArrow: 'Left arrow', star5: 'Star', diamond: 'Diamond', hexagon: 'Hexagon', line: 'Line', arrowLine: 'Arrow line', callout: 'Callout', cloudCallout: 'Speech bubble' }; // i18n-ignore
  O.isLine = function (o) { return o.type === 'shape' && (o.shape === 'line' || o.shape === 'arrowLine'); };

  O.defaultText = function (s) { return { paras: [{ runs: [{ t: s || '' }] }], valign: 'top', autofit: 'none' }; };
  O.paras = function (lines, extra) {
    return lines.map(function (l) {
      if (typeof l === 'string') return Object.assign({ runs: [{ t: l }] }, extra || {});
      return Object.assign({}, extra || {}, l, { runs: l.runs || [{ t: l.t || '' }] });
    });
  };

  var defaults = {
    text: function () { return { style: { font: 'body', size: 24, color: 'text', bold: false, italic: false, align: 'l', lineHeight: 1.2 }, text: O.defaultText(''), fill: null, stroke: null }; },
    shape: function () {
      return { shape: 'roundRect', radius: 0.12, fill: { type: 'solid', color: 'accent1' }, stroke: null, shadow: null,
        style: { font: 'body', size: 20, color: 'bg', bold: true, italic: false, align: 'c', lineHeight: 1.15 }, text: Object.assign(O.defaultText(''), { valign: 'middle' }) };
    },
    image: function () { return { media: null, crop: { l: 0, t: 0, r: 0, b: 0 }, mask: 'none', radius: 0.08, stroke: null, shadow: null }; },
    table: function () {
      return { cols: 3, rowsN: 3, colW: null, rowH: null, header: true, banded: true, accent: 'accent1',
        style: { font: 'body', size: 16, color: 'text', align: 'l', lineHeight: 1.15 }, cells: null };
    },
    chart: function () {
      return { chart: 'bar', legend: true, labels: false, title: '', style: { font: 'body', size: 14, color: 'text2' },
        data: { cats: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Revenue', values: [12, 19, 15, 27] }, { name: 'Costs', values: [8, 11, 10, 14] }] } }; // i18n-ignore
    },
    media: function () { return { kind: 'video', media: null, poster: null, autoplay: false, loop: false, mime: '' }; },
    group: function () { return { children: [], ch: null }; }
  };

  /** Makes a new object of `type` with sensible defaults, overridden by `props`. */
  O.make = function (type, props) {
    var base = { id: U.uid(type[0]), type: type, name: '', x: 80, y: 80, w: 320, h: 120, rot: 0, opacity: 1 };
    var o = Object.assign(base, defaults[type] ? defaults[type]() : {}, props || {});
    if (type === 'shape' && O.isLine(o)) { o.fill = null; o.stroke = o.stroke || { color: 'text', width: 3, dash: 'solid', tail: o.shape === 'arrowLine' ? 'arrow' : 'none' }; o.text = null; }
    if (type === 'table' && !o.cells) {
      o.cells = [];
      for (var r = 0; r < o.rowsN; r++) { var row = []; for (var c = 0; c < o.cols; c++) row.push({ text: O.defaultText(r === 0 && o.header ? 'Header ' + (c + 1) : '') }); o.cells.push(row); } // i18n-ignore
    }
    if (type === 'table') { delete o.rowsN; delete o.cols; O.fixTable(o); }
    if (!o.name) o.name = O.defaultName(o);
    return o;
  };
  O.defaultName = function (o) {
    if (o.type === 'shape') return O.SHAPE_NAMES[o.shape] || 'Shape'; // i18n-ignore
    if (o.type === 'media') return o.kind === 'audio' ? 'Audio' : 'Video'; // i18n-ignore
    return { text: 'Text', image: 'Image', table: 'Table', chart: 'Chart', group: 'Group' }[o.type] || 'Object'; // i18n-ignore
  };
  /** Table column widths / row heights default to an even split of the frame. */
  O.fixTable = function (t) {
    var nr = t.cells.length, nc = t.cells[0] ? t.cells[0].length : 0;
    if (!t.colW || t.colW.length !== nc) t.colW = Array.from({ length: nc }, function () { return t.w / nc; });
    if (!t.rowH || t.rowH.length !== nr) t.rowH = Array.from({ length: nr }, function () { return t.h / nr; });
    var sw = t.colW.reduce(function (a, b) { return a + b; }, 0), sh = t.rowH.reduce(function (a, b) { return a + b; }, 0);
    if (Math.abs(sw - t.w) > 0.01) t.colW = t.colW.map(function (v) { return v * t.w / sw; });
    if (Math.abs(sh - t.h) > 0.01) t.rowH = t.rowH.map(function (v) { return v * t.h / sh; });
    return t;
  };

  /** Plain text of a text-bearing object (paragraphs joined by \n). */
  O.plain = function (text) {
    if (!text || !text.paras) return '';
    return text.paras.map(function (p) { return p.runs.map(function (r) { return r.t; }).join(''); }).join('\n');
  };
  O.isEmpty = function (o) {
    if (o.type === 'text') return !O.plain(o.text).trim();
    if (o.type === 'image') return !o.media;
    return false;
  };
  O.setPlain = function (o, s) {
    var keep = o.text && o.text.paras[0] ? o.text.paras[0] : {};
    o.text = Object.assign({}, o.text || O.defaultText(''), {
      paras: String(s).split('\n').map(function (line) { return { runs: [{ t: line }], bullet: keep.bullet, align: keep.align }; })
    });
    return o;
  };

  /** Walks objects depth-first (groups included), calling fn(obj, parent). */
  O.walk = function (list, fn, parent) {
    (list || []).forEach(function (o) { fn(o, parent || null); if (o.type === 'group') O.walk(o.children, fn, o); });
  };
  O.find = function (slide, id) { var hit = null; O.walk(slide.objects, function (o) { if (o.id === id) hit = o; }); return hit; };

  /** Gives fresh ids to an object tree (for paste/duplicate). */
  O.reId = function (o) { o.id = U.uid(o.type[0]); if (o.children) o.children.forEach(O.reId); return o; };

  /** Axis-aligned bounds of an object on the slide, rotation included. */
  O.bounds = function (o) {
    var m = U.mat.forObject(o), pts = [[0, 0], [o.w, 0], [o.w, o.h], [0, o.h]].map(function (p) { return U.mat.apply(m, p[0], p[1]); });
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    return { x: x, y: y, w: Math.max.apply(null, xs) - x, h: Math.max.apply(null, ys) - y };
  };
  O.union = function (objs) {
    if (!objs.length) return null;
    var b = objs.map(O.bounds), x = Math.min.apply(null, b.map(function (r) { return r.x; })), y = Math.min.apply(null, b.map(function (r) { return r.y; }));
    return { x: x, y: y, w: Math.max.apply(null, b.map(function (r) { return r.x + r.w; })) - x, h: Math.max.apply(null, b.map(function (r) { return r.y + r.h; })) - y };
  };

  /** Groups objects (removing them from `list`) and returns the new group, placed where the topmost was. */
  O.group = function (list, objs) {
    var u = O.union(objs), idx = Math.max.apply(null, objs.map(function (o) { return list.indexOf(o); }));
    var g = O.make('group', { x: u.x, y: u.y, w: u.w, h: u.h, ch: { x: u.x, y: u.y, w: u.w, h: u.h } });
    g.children = list.filter(function (o) { return objs.indexOf(o) >= 0; });
    var at = idx - (g.children.length - 1);
    for (var i = list.length - 1; i >= 0; i--) if (objs.indexOf(list[i]) >= 0) list.splice(i, 1);
    list.splice(Math.max(0, at), 0, g);
    return g;
  };
  /** Ungroups: children are mapped to slide coordinates (group scale and rotation applied). */
  O.ungroup = function (list, g) {
    var i = list.indexOf(g), out = g.children.map(function (c) { return O.toParent(g, c); });
    list.splice.apply(list, [i, 1].concat(out));
    return out;
  };
  O.toParent = function (g, c) {
    var ch = g.ch || g, sx = g.w / (ch.w || 1), sy = g.h / (ch.h || 1);
    var o = U.clone(c);
    var cx = (c.x + c.w / 2 - ch.x) * sx, cy = (c.y + c.h / 2 - ch.y) * sy;
    var p = U.mat.apply(U.mat.forObject({ x: g.x, y: g.y, w: g.w, h: g.h, rot: g.rot }), cx, cy);
    o.w = c.w * sx; o.h = c.h * sy; o.x = p[0] - o.w / 2; o.y = p[1] - o.h / 2;
    o.rot = ((c.rot || 0) + (g.rot || 0)) % 360;
    if (g.opacity != null && g.opacity < 1) o.opacity = (o.opacity == null ? 1 : o.opacity) * g.opacity;
    return o;
  };
})();
