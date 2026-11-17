/* Slop Slides: the PDF writer's maths (pure, no DOM; the Node tests load it). Page and image matrices for drawing the
   display list (slide points, y down) on a PDF page (y up); where a cropped or "cover" picture lands; the TJ plan that
   places shaped glyphs exactly where the font engine put them (advances, mark offsets and rise); colours, dashes and
   gradient stops; and the split of a line of text into runs that each have one font and one direction (SlopBidi, with
   the font that can set each character). Exposes SS.pdfMath. */
(function () {
  'use strict';
  var SS = window.SS = window.SS || {};
  var P = SS.pdfMath = {};

  /** '#rrggbb' → [r, g, b] in 0..1. */
  P.rgb = function (hex) {
    var h = String(hex || '#000000').replace('#', '');
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    var n = parseInt(h.slice(0, 6), 16) || 0;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  /** The page matrix: slide points with y down onto a PDF page of height h (y up). */
  P.pageMatrix = function (h) { return [1, 0, 0, -1, 0, h]; };
  /** An image XObject draws in the unit square with y up: this places it on the rectangle r (y down). */
  P.imageMatrix = function (r) { return [r.w, 0, 0, -r.h, r.x, r.y + r.h]; };
  /** Text space (y up) at a baseline point (x, y) in y-down space; skew leans the glyphs right (synthetic italic). */
  P.textMatrix = function (x, y, skew) { return [1, 0, skew || 0, -1, x, y]; };

  /**
   * Where a picture node {x, y, w, h, crop {l,t,r,b}, cover} draws an image of iw × ih pixels: the whole image goes to
   * `img` and is clipped to `clip` (the node's box). A crop trims fractions of each side; cover fills the box, centred.
   */
  P.imagePlace = function (n, iw, ih) {
    var clip = { x: n.x, y: n.y, w: n.w, h: n.h }, c = n.crop || {};
    if (n.cover) {
      var k = Math.max(n.w / iw, n.h / ih), W = iw * k, H = ih * k;
      return { clip: clip, img: { x: n.x + (n.w - W) / 2, y: n.y + (n.h - H) / 2, w: W, h: H } };
    }
    var fw = Math.max(0.01, 1 - (c.l || 0) - (c.r || 0)), fh = Math.max(0.01, 1 - (c.t || 0) - (c.b || 0));
    var w = n.w / fw, h = n.h / fh;
    return { clip: clip, img: { x: n.x - (c.l || 0) * w, y: n.y - (c.t || 0) * h, w: w, h: h } };
  };

  /** Dash pattern for a stroke ('dash' | 'dot' | 'solid') of width w, as the canvas draws it; dots use round caps. */
  P.dash = function (d, w) { return d === 'dash' ? [w * 4, w * 2.5] : d === 'dot' ? [0, w * 2] : []; };

  /** Gradient stops [[t, '#hex'], …] → the pieces of a PDF stitching function: { domain, bounds, encode, pieces: [[c0, c1]] }. */
  P.stops = function (stops) {
    var s = stops.slice().sort(function (a, b) { return a[0] - b[0]; });
    if (s.length === 1) s = [s[0], [1, s[0][1]]];
    var pieces = [], bounds = [], encode = [];
    for (var i = 0; i < s.length - 1; i++) {
      pieces.push([P.rgb(s[i][1]), P.rgb(s[i + 1][1])]);
      encode.push(0, 1);
      if (i > 0) bounds.push(Math.max(0, Math.min(1, s[i][0])));
    }
    return { domain: [Math.max(0, s[0][0]), Math.min(1, s[s.length - 1][0]) || 1], bounds: bounds, encode: encode, pieces: pieces };
  };

  /**
   * The TJ plan for one shaped run. glyphs: [{ advanceWidth }], positions: [{ xAdvance, xOffset, yOffset }] (font units),
   * as fontkit lays them out. A TJ number moves the pen left by n/1000 of the font size, so after each glyph the plan
   * adds (advanceWidth − xAdvance) · 1000/upm, and a mark offset is a move before the glyph and back after it. Glyphs
   * with a different yOffset start a new group with its own rise (Ts). Returns { groups: [{ rise, parts: [{ g: glyph index }
   * | number] }], width } with the rise and width in points at `size` (letter spacing excluded).
   */
  P.glyphPlan = function (glyphs, positions, upm, size) {
    var k = 1000 / upm, groups = [], cur = null, width = 0;
    function num(v) {
      if (Math.abs(v) < 0.01) return;
      var last = cur.parts[cur.parts.length - 1];
      if (typeof last === 'number') cur.parts[cur.parts.length - 1] = last + v; else cur.parts.push(v);
    }
    for (var i = 0; i < glyphs.length; i++) {
      var p = positions[i] || { xAdvance: glyphs[i].advanceWidth, xOffset: 0, yOffset: 0 };
      var rise = (p.yOffset || 0) * size / upm;
      if (!cur || Math.abs(cur.rise - rise) > 1e-6) { cur = { rise: rise, parts: [] }; groups.push(cur); }
      num(-(p.xOffset || 0) * k);
      cur.parts.push({ g: i });
      num(((glyphs[i].advanceWidth || 0) - (p.xAdvance || 0) + (p.xOffset || 0)) * k);
      width += (p.xAdvance || 0) * size / upm;
    }
    return { groups: groups, width: width };
  };

  /**
   * Splits one line of text into runs [{ text, font, rtl }] in visual order (left to right). base: the paragraph direction
   * ('ltr' matches the canvas, which draws with the page's left-to-right base). o: { face, has(font, cp), packOf(cp), bidi }:
   * face is the text's own font and sets every character it has (as the canvas does); a character it lacks goes to the
   * language font that can (packOf). Joiners and variation selectors stay with the characters around them.
   */
  P.joiner = function (cp) { return cp === 0x200C || cp === 0x200D || cp === 0x034F || (cp >= 0xFE00 && cp <= 0xFE0F); };
  P.runs = function (text, o) {
    var B = o.bidi, out = [];
    if (!text) return out;
    var fontOf = function (cp) {
      if (P.joiner(cp)) return null;
      if (o.has(o.face, cp)) return o.face;
      var p = o.packOf(cp);
      return p && o.has(p, cp) ? p : o.face;
    };
    var segs = B ? B.segments(text, { base: o.base || 'ltr', fontOf: fontOf }) : [{ text: text, rtl: false, font: o.face }];
    segs.forEach(function (seg) {
      var pieces = [], cur = null, font = seg.font || o.face;
      Array.from(seg.text).forEach(function (ch) {
        var cp = ch.codePointAt(0), pk = o.packOf(cp);
        var f = P.joiner(cp) || o.has(font, cp) ? font : o.has(o.face, cp) ? o.face : pk && o.has(pk, cp) ? pk : font;
        if (cur && cur.font === f) cur.text += ch; else { cur = { text: ch, font: f, rtl: seg.rtl }; pieces.push(cur); }
      });
      // a right-to-left segment's pieces are in logical order: the first one is drawn rightmost
      out.push.apply(out, seg.rtl ? pieces.reverse() : pieces);
    });
    return out;
  };
})();
