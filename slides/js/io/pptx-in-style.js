/* Slop Slides: PPTX import, part 1 of 4: the package helpers and DrawingML styling. Relationships and part paths,
   element lookups (shared/office/xml.js, handed in as I.lib by pptx-in.js), colours (srgb, scheme with the master's
   colour map, system and preset colours, with lumMod, lumOff, tint, shade and alpha), fills, outlines, the shape
   frame (xfrm) and preset geometry names. A scheme colour with no modifier stays a theme slot reference ('accent1',
   'text', …) when the slide uses the deck's theme, so changing the theme later recolours it as in PowerPoint.
   Exposes SS.pptxIn (shared by pptx-in-text.js, pptx-in-shape.js and pptx-in.js). */
(function () {
  'use strict';
  var SS = window.SS, U = SS.util;
  var I = SS.pptxIn = SS.pptxIn || {};

  /* ---------- elements ---------- */
  I.a = function (el, name) { return el ? I.lib.kid(el, I.lib.NS.a, name) : null; };
  I.as = function (el, name) { return el ? I.lib.kids(el, I.lib.NS.a, name) : []; };
  I.p = function (el, name) { return el ? I.lib.kid(el, I.lib.NS.p, name) : null; };
  I.ps = function (el, name) { return el ? I.lib.kids(el, I.lib.NS.p, name) : []; };
  I.att = function (el, name) { return el ? I.lib.attr(el, null, name) : null; };
  I.rid = function (el, name) { return el ? I.lib.attr(el, I.lib.NS.r, name || 'embed') : null; };
  I.num = function (el, name, def) { var v = I.att(el, name); return v == null || v === '' || isNaN(+v) ? def : +v; };
  I.pt = function (v) { return I.lib.emuToPt(v); };
  I.xml = function (files, path) { var t = I.lib.readText(files, path); return t == null ? null : I.lib.parseXml(t).documentElement; };

  /* ---------- relationships ---------- */
  /** A part path relative to a folder ("ppt/slides/" + "../media/a.png" → "ppt/media/a.png"). */
  I.resolve = function (dir, target) {
    if (target.charAt(0) === '/') return target.slice(1);
    var out = [];
    (dir + target).split('/').forEach(function (s) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); });
    return out.join('/');
  };
  /** The relationships of a part: { rId: { type: 'slideLayout' | 'image' | …, target, external } }. */
  I.relsOf = function (files, part) {
    var dir = part.replace(/[^/]*$/, ''), map = {};
    var root = I.xml(files, dir + '_rels/' + part.slice(dir.length) + '.rels');
    I.lib.kids(root, I.lib.NS.rel, 'Relationship').forEach(function (r) { // i18n-ignore
      var ext = I.att(r, 'TargetMode') === 'External', t = I.att(r, 'Target') || ''; // i18n-ignore
      map[I.att(r, 'Id')] = { type: String(I.att(r, 'Type') || '').replace(/^.*\//, ''), target: ext ? t : I.resolve(dir, t), external: ext }; // i18n-ignore
    });
    return map;
  };
  I.relOfType = function (rels, type) {
    for (var k in rels) if (rels[k].type === type) return rels[k];
    return null;
  };

  /* ---------- colours ---------- */
  var SLOT = { bg1: 'bg', tx1: 'text', bg2: 'bg2', tx2: 'text2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6' };
  var PRESET = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', gray: '#808080', grey: '#808080',
    orange: '#ffa500', purple: '#800080', navy: '#000080', silver: '#c0c0c0', maroon: '#800000', lime: '#00ff00', teal: '#008080', aqua: '#00ffff', cyan: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff' };
  var KINDS = ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'];
  I.MAP_DEFAULT = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink' };

  /** The hex a scheme colour name stands for, through the master's colour map (bg1 → lt1 → '#ffffff'). */
  I.schemeHex = function (name, ctx) {
    if (name === 'phClr') return ctx.ph || '#000000';   // a theme style's placeholder colour: ctx.ph (hex) and ctx.phRef (its slot)
    var mapped = (ctx.clrMap && ctx.clrMap[name]) || name;
    return ctx.scheme[mapped] || ctx.scheme[name] || '#000000';
  };
  /** The theme slot for a scheme colour name, or null (a direct dk1/lt1 is found through the colour map). */
  function slotOf(name, ctx) {
    if (!ctx.slots) return null;
    if (SLOT[name]) return SLOT[name];
    for (var k in ctx.clrMap) if (ctx.clrMap[k] === name && SLOT[k]) return SLOT[k];
    return null;
  }
  function hsl(hex) {
    var c = U.hexToRgb(hex).map(function (v) { return v / 255; }), mx = Math.max.apply(null, c), mn = Math.min.apply(null, c), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === c[0] ? (c[1] - c[2]) / d + (c[1] < c[2] ? 6 : 0) : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function fromHsl(h, s, l) {
    function f(p, q, t) { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    if (!s) return U.rgbToHex(l * 255, l * 255, l * 255);
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return U.rgbToHex(f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255);
  }
  /** Applies the colour modifiers (children of a colour element) in document order. Returns { hex, alpha, changed }. */
  I.modify = function (hex, el) {
    var alpha = 1, changed = false;
    I.lib.kids(el, I.lib.NS.a).forEach(function (m) {
      var v = I.num(m, 'val', 0) / 100000, n = m.localName, c, x;
      if (n === 'alpha') { alpha = v; return; }
      if (n === 'lumMod' || n === 'lumOff') { x = hsl(hex); x[2] = Math.max(0, Math.min(1, n === 'lumMod' ? x[2] * v : x[2] + v)); hex = fromHsl(x[0], x[1], x[2]); changed = true; }
      else if (n === 'tint' || n === 'shade') {
        c = U.hexToRgb(hex).map(function (k) { return n === 'tint' ? 255 - (255 - k) * v : k * v; });
        hex = U.rgbToHex(c[0], c[1], c[2]); changed = true;
      } else if (n === 'satMod') { x = hsl(hex); hex = fromHsl(x[0], Math.min(1, x[1] * v), x[2]); changed = true; }
    });
    return { hex: hex, alpha: alpha, changed: changed };
  };
  /** The colour inside `holder` (a solidFill, a gs stop, a fontRef…): { ref: 'accent1' | '#rrggbb', alpha, hex } or null. */
  I.color = function (holder, ctx) {
    var el = null;
    for (var i = 0; i < KINDS.length && !el; i++) el = I.a(holder, KINDS[i]);
    if (!el) return null;
    var k = el.localName, hex, slot = null;
    if (k === 'srgbClr') hex = I.lib.ooxmlToHex(I.att(el, 'val')) || '#000000';
    else if (k === 'schemeClr') { var v = I.att(el, 'val'); hex = I.schemeHex(v, ctx); slot = v === 'phClr' ? (ctx.phRef && ctx.phRef.charAt(0) !== '#' ? ctx.phRef : null) : slotOf(v, ctx); }
    else if (k === 'sysClr') hex = I.lib.ooxmlToHex(I.att(el, 'lastClr')) || (I.att(el, 'val') === 'window' ? '#ffffff' : '#000000');
    else if (k === 'prstClr') hex = PRESET[I.att(el, 'val')] || '#000000';
    else if (k === 'scrgbClr') hex = U.rgbToHex(I.num(el, 'r', 0) / 100000 * 255, I.num(el, 'g', 0) / 100000 * 255, I.num(el, 'b', 0) / 100000 * 255);
    else hex = fromHsl(I.num(el, 'hue', 0) / 21600000, I.num(el, 'sat', 0) / 100000, I.num(el, 'lum', 0) / 100000);
    var m = I.modify(hex, el);
    return { ref: slot && !m.changed ? slot : m.hex, hex: m.hex, alpha: m.alpha };
  };

  /* ---------- fills and outlines ---------- */
  function withAlpha(o, a) { if (a < 1) o.alpha = Math.round(a * 1000) / 1000; return o; }
  var FILLS = ['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill'];
  /** A fill from an element holding one (spPr, bgPr, tcPr, rPr…). undefined when none is given (the caller then inherits). */
  I.fill = function (holder, ctx) {
    if (!holder) return undefined;
    var el = I.lib.kids(holder).filter(function (k) { return FILLS.indexOf(k.localName) >= 0; })[0];
    return el ? I.fillEl(el, ctx) : undefined;
  };
  /** One fill element (a:solidFill, a:gradFill, a:blipFill, …) → { type: 'none' | 'solid' | 'linear' | 'radial' | 'blip', … }. */
  I.fillEl = function (el, ctx) {
    var n = el.localName;
    if (n === 'noFill' || n === 'grpFill') return { type: 'none' };
    if (n === 'solidFill') { var c = I.color(el, ctx); return c ? withAlpha({ type: 'solid', color: c.ref }, c.alpha) : { type: 'none' }; }
    if (n === 'blipFill') return { type: 'blip', el: el };
    if (n === 'pattFill') { var fg = I.color(I.a(el, 'fgClr'), ctx); return fg ? { type: 'solid', color: fg.ref } : { type: 'none' }; }
    var stops = I.as(I.a(el, 'gsLst'), 'gs').map(function (g) { return { pos: I.num(g, 'pos', 0), c: I.color(g, ctx) }; }).filter(function (s) { return s.c; });
    stops.sort(function (x, y) { return x.pos - y.pos; });
    if (!stops.length) return { type: 'none' };
    if (stops.length === 1) return withAlpha({ type: 'solid', color: stops[0].c.ref }, stops[0].c.alpha);
    var cols = stops.map(function (s) { return s.c.ref; }), lin = I.a(el, 'lin'), path = I.a(el, 'path');
    if (path) {
      var r = I.a(path, 'fillToRect'), cx = r ? (I.num(r, 'l', 50000) + 100000 - I.num(r, 'r', 50000)) / 200000 : 0.5, cy = r ? (I.num(r, 't', 50000) + 100000 - I.num(r, 'b', 50000)) / 200000 : 0.5;
      return withAlpha({ type: 'radial', colors: cols, cx: cx, cy: cy }, stops[0].c.alpha);
    }
    return withAlpha({ type: 'linear', colors: cols, angle: ((lin ? I.num(lin, 'ang', 0) / 60000 : 0) + 90) % 360 }, stops[0].c.alpha);
  };
  /** An outline from a:ln (with the shape style's lnRef as the default). null for no outline. */
  I.line = function (ln, ctx, lnRef) {
    var refColor = lnRef && I.num(lnRef, 'idx', 0) > 0 ? I.color(lnRef, ctx) : null;
    var refWidth = refColor ? (ctx.lnWidths[I.num(lnRef, 'idx', 1) - 1] || 0.75) : 0;
    if (!ln) return refColor ? { color: refColor.ref, width: refWidth, dash: 'solid' } : null;
    if (I.a(ln, 'noFill')) return null;
    var f = I.fill(ln, ctx), color = f && f.type === 'solid' ? f.color : f && f.type !== 'none' && f.colors ? f.colors[0] : refColor ? refColor.ref : null;
    if (!color) return null;
    var st = { color: color, width: ln.hasAttribute('w') ? I.pt(I.att(ln, 'w')) : (refWidth || 0.75), dash: 'solid' };
    if (f && f.alpha != null) st.alpha = f.alpha;
    var dash = I.att(I.a(ln, 'prstDash'), 'val');
    if (dash && dash !== 'solid') st.dash = /dot/i.test(dash) && !/dash/i.test(dash) ? 'dot' : 'dash';
    var he = I.att(I.a(ln, 'headEnd'), 'type'), te = I.att(I.a(ln, 'tailEnd'), 'type');
    if (he && he !== 'none') st.head = 'arrow';
    if (te && te !== 'none') st.tail = 'arrow';
    return st;
  };

  /* ---------- frame and geometry ---------- */
  /** a:xfrm (or p:xfrm) → { x, y, w, h, rot, flipH, flipV, ch } in points; null when absent. */
  I.xfrm = function (x) {
    if (!x) return null;
    var off = I.a(x, 'off'), ext = I.a(x, 'ext'), cho = I.a(x, 'chOff'), che = I.a(x, 'chExt');
    var f = { x: I.pt(I.num(off, 'x', 0)), y: I.pt(I.num(off, 'y', 0)), w: I.pt(I.num(ext, 'cx', 0)), h: I.pt(I.num(ext, 'cy', 0)), rot: I.num(x, 'rot', 0) / 60000,
      flipH: I.att(x, 'flipH') === '1' || I.att(x, 'flipH') === 'true', flipV: I.att(x, 'flipV') === '1' || I.att(x, 'flipV') === 'true' };
    if (cho && che) f.ch = { x: I.pt(I.num(cho, 'x', 0)), y: I.pt(I.num(cho, 'y', 0)), w: I.pt(I.num(che, 'cx', 0)), h: I.pt(I.num(che, 'cy', 0)) };
    return f;
  };
  /** Preset geometry names that Slop Slides draws the same way. Others are drawn as rectangles (and counted). */
  I.PRST = { rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', rightArrow: 'rightArrow', leftArrow: 'leftArrow',
    star5: 'star5', diamond: 'diamond', hexagon: 'hexagon', line: 'line', straightConnector1: 'line', wedgeRectCallout: 'callout',
    wedgeRoundRectCallout: 'callout', cloudCallout: 'cloudCallout', flowChartProcess: 'rect', flowChartAlternateProcess: 'roundRect',
    flowChartDecision: 'diamond', flowChartConnector: 'ellipse', flowChartPreparation: 'hexagon', bentConnector3: 'line', curvedConnector3: 'line' };
  /** The roundRect corner (fraction of the short side) from <a:avLst><a:gd name="adj" fmla="val 16667"/>. */
  I.adj = function (geom, def) {
    var gd = I.as(I.a(geom, 'avLst'), 'gd').filter(function (g) { return I.att(g, 'name') === 'adj'; })[0];
    var m = gd && /val\s+(-?\d+)/.exec(I.att(gd, 'fmla') || '');
    return m ? Math.max(0, Math.min(0.5, +m[1] / 100000)) : def;
  };
})();
