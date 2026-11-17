/* Shared colour model (PhotoSlop and SlopVector): hex with optional alpha, HSB, recent colours and pixel sampling.
 * Colours are strings: '#rrggbb', or '#rrggbbaa' when alpha is below 1. Exposed as window.SlopColor. */
(function () {
  'use strict';
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var byte = function (v) { return clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'); };

  /** '#rgb', '#rgba', '#rrggbb' or '#rrggbbaa' -> { r, g, b, a } (r, g, b in 0-255, a in 0-1). Bad input parses as black. */
  function parse(hex) {
    var s = String(hex || '#000').trim().replace(/^#/, '');
    if (s.length === 3 || s.length === 4) s = s.split('').map(function (c) { return c + c; }).join('');
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) s = '000000';
    var n = parseInt(s.slice(0, 6), 16);
    return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255, a: s.length === 8 ? parseInt(s.slice(6), 16) / 255 : 1 };
  }
  /** rgb (0-255) and alpha (0-1) -> hex. Alpha 1 gives the six-digit form. */
  function toHex(r, g, b, a) {
    var base = '#' + byte(r) + byte(g) + byte(b);
    return a == null || a >= 1 ? base : base + byte(clamp(a, 0, 1) * 255);
  }
  /** rgb (0-255) -> [h 0-360, s 0-1, v 0-1]. */
  function rgbToHsb(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, mx ? d / mx : 0, mx];
  }
  /** [h 0-360, s 0-1, v 0-1] -> [r, g, b] (0-255). */
  function hsbToRgb(h, s, v) {
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  /** The same colour with a new alpha (0-1). */
  function withAlpha(hex, a) { var c = parse(hex); return toHex(c.r, c.g, c.b, a); }
  /** Alpha of a colour string, 0-1. */
  function alphaOf(hex) { return parse(hex).a; }
  /** Most-recent-first list with `hex` moved to the front, no duplicates, at most `max` entries. */
  function recentAdd(list, hex, max) {
    var c = String(hex).toLowerCase();
    return [c].concat((list || []).filter(function (x) { return String(x).toLowerCase() !== c; })).slice(0, max || 10);
  }
  /**
   * Mean colour of a sample box in RGBA pixel data (a Uint8ClampedArray region of w x h pixels).
   * The colour is weighted by alpha, so an opaque 3x3 box gives the plain arithmetic mean.
   * Returns { r, g, b, a } with a in 0-1, or null when the box is fully transparent.
   */
  function meanOf(data, w, h) {
    var R = 0, G = 0, B = 0, A = 0, n = w * h;
    for (var i = 0; i < n * 4; i += 4) {
      var a = data[i + 3];
      R += data[i] * a; G += data[i + 1] * a; B += data[i + 2] * a; A += a;
    }
    if (!A) return null;
    return { r: R / A, g: G / A, b: B / A, a: A / (n * 255) };
  }
  /** The box of `size` pixels (1, 3, 5, ...) centred on (x, y), clipped to a w x h image: { x0, y0, bw, bh }. */
  function boxAround(x, y, size, w, h) {
    var r = Math.floor((size || 1) / 2), x0 = clamp(Math.floor(x) - r, 0, w - 1), y0 = clamp(Math.floor(y) - r, 0, h - 1);
    var x1 = clamp(Math.floor(x) + r, 0, w - 1), y1 = clamp(Math.floor(y) + r, 0, h - 1);
    return { x0: x0, y0: y0, bw: x1 - x0 + 1, bh: y1 - y0 + 1 };
  }
  /** A sampled { r, g, b, a } as a colour string (hex with alpha when it is not opaque). */
  function fromSample(s) { return s ? toHex(s.r, s.g, s.b, s.a) : null; }

  window.SlopColor = {
    parse: parse, toHex: toHex, rgbToHsb: rgbToHsb, hsbToRgb: hsbToRgb, withAlpha: withAlpha, alphaOf: alphaOf,
    recentAdd: recentAdd, meanOf: meanOf, boxAround: boxAround, fromSample: fromSample,
  };
})();
