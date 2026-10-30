/* Slop PDF — the colour a page's content draws its text in. Pure, tested alone in Node (tests/node/pdf-content-ink.test.mjs),
   on the operators of content-lex.js walked by content-strip.js (which follows the text state, q/Q and the matrices).
     ink(ops, res, targets) → [r, g, b] in 0..1: the colour most of the glyphs in the targets ({ x0, x1, y, fs }, user space)
       are painted in, or null when none is known. A glyph is painted in the fill colour, or in the stroke colour for
       stroked-only text (render modes 1 and 5); invisible text (3, 7) does not count. Text in Form XObjects is followed.
       res: { fonts(name), space(name) → a colour space (below) or null, form(name) → { ops, matrix, res } or null }.
     Colour spaces: { kind: 'gray' | 'rgb' | 'cmyk' | 'pattern' }, { kind: 'indexed', base, hival, lookup (latin1 string) },
       { kind: 'sep', base, c0, c1, N } (a Separation or one-ink DeviceN with an exponential tint transform). An ICCBased
       space is its alternate (or the device space of its N). Unknown spaces give null.
     toRgb(space, comps) → [r, g, b]; cmyk(c, m, y, k) → [r, g, b], the same conversion pdf.js draws with, so the colour
       read here is the colour on the screen. */
(function (root, factory) {
  var api = factory(root.SlopPdfStrip || (typeof require === 'function' ? require('./content-strip.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopPdfInk = api;
})(typeof window !== 'undefined' ? window : globalThis, function (St) {
  'use strict';
  var GRAY = { kind: 'gray' }, RGB = { kind: 'rgb' }, CMYK = { kind: 'cmyk' }, PATTERN = { kind: 'pattern' };
  var BUILTIN = { DeviceGray: GRAY, G: GRAY, CalGray: GRAY, DeviceRGB: RGB, RGB: RGB, CalRGB: RGB, DeviceCMYK: CMYK, CMYK: CMYK, Pattern: PATTERN };
  var STROKE = { G: 1, RG: 1, K: 1, CS: 1, SC: 1, SCN: 1 };
  function clamp(v) { return Math.max(0, Math.min(1, v)); }

  /** pdf.js's DeviceCMYK to RGB (colorspace.js), in 0..1. */
  function cmyk(c, m, y, k) {
    var r = 255 + c * (-4.387332384609988 * c + 54.48615194189176 * m + 18.82290502165302 * y + 212.25662451639585 * k - 285.2331026137004) +
      m * (1.7149763477362134 * m - 5.6096736904047315 * y + -17.873870861415444 * k - 5.497006427196366) +
      y * (-2.5217340131683033 * y - 21.248923337353073 * k + 17.5119270841813) + k * (-21.86122147463605 * k - 189.48180835922747);
    var g = 255 + c * (8.841041422036149 * c + 60.118027045597366 * m + 6.871425592049007 * y + 31.159100130055922 * k - 79.2970844816548) +
      m * (-15.310361306967817 * m + 17.575251261109482 * y + 131.35250912493976 * k - 190.9453302588951) +
      y * (4.444339102852739 * y + 9.8632861493405 * k - 24.86741582555878) + k * (-20.737325471181034 * k - 187.80453709719578);
    var b = 255 + c * (0.8842522430003296 * c + 8.078677503112928 * m + 30.89978309703729 * y - 0.23883238689178934 * k - 14.183576799673286) +
      m * (10.49593273432072 * m + 63.02378494754052 * y + 50.606957656360734 * k - 112.23884253719248) +
      y * (0.03296041114873217 * y + 115.60384449646641 * k - 193.58209356861505) + k * (-22.33816807309886 * k - 180.12613974708367);
    return [clamp(r / 255), clamp(g / 255), clamp(b / 255)];
  }
  /** The number of components of a colour space. */
  function count(sp) { return !sp ? 0 : sp.kind === 'gray' || sp.kind === 'indexed' || sp.kind === 'sep' ? 1 : sp.kind === 'rgb' ? 3 : sp.kind === 'cmyk' ? 4 : 0; }
  /** The colour a space starts with when it is set (cs / CS): black, index 0, or full tint. */
  function initial(sp) { return !sp ? [] : sp.kind === 'cmyk' ? [0, 0, 0, 1] : sp.kind === 'sep' ? [1] : sp.kind === 'rgb' ? [0, 0, 0] : [0]; }
  function toRgb(sp, c, depth) {
    if (!sp || (depth || 0) > 3) return null;
    var v = function (i) { return clamp(+c[i] || 0); };
    switch (sp.kind) {
      case 'gray': return [v(0), v(0), v(0)];
      case 'rgb': return [v(0), v(1), v(2)];
      case 'cmyk': return cmyk(v(0), v(1), v(2), v(3));
      case 'indexed': {
        var n = count(sp.base), i = Math.max(0, Math.min(sp.hival, Math.round(+c[0] || 0))), comps = [];
        if (!n || !sp.lookup || sp.lookup.length < (i + 1) * n) return null;
        for (var j = 0; j < n; j++) comps.push(sp.lookup.charCodeAt(i * n + j) / 255);
        if (sp.base.kind === 'cmyk' || sp.base.kind === 'gray' || sp.base.kind === 'rgb') return toRgb(sp.base, comps, (depth || 0) + 1);
        return null;
      }
      case 'sep': {
        var t = Math.pow(v(0), sp.N == null ? 1 : sp.N), out = sp.c0.map(function (a, k) { return a + t * ((sp.c1[k] == null ? 1 : sp.c1[k]) - a); });
        return toRgb(sp.base, out, (depth || 0) + 1);
      }
    }
    return null;
  }

  /** The colour operators, on the walker's graphics state (content-strip.js walk opts.each). */
  function each(space) {
    function named(n) { return BUILTIN[n] || (space ? space(n) : null) || null; }
    return function (o, gs) {
      var a = o.args, nn = a.filter(function (x) { return typeof x === 'number'; }), op = o.op;
      var stroke = STROKE[op] === 1;
      var set = function (sp, rgb) { if (stroke) { gs.ssp = sp; gs.stroke = rgb; } else { gs.fsp = sp; gs.fill = rgb; } };
      switch (op) {
        case 'g': case 'G': set(GRAY, toRgb(GRAY, nn)); break;
        case 'rg': case 'RG': set(RGB, toRgb(RGB, nn)); break;
        case 'k': case 'K': set(CMYK, toRgb(CMYK, nn)); break;
        case 'cs': case 'CS': { var sp = a[0] && a[0].name != null ? named(a[0].name) : null; set(sp, toRgb(sp, initial(sp))); break; }
        case 'sc': case 'scn': case 'SC': case 'SCN': {
          var cur = stroke ? gs.ssp : gs.fsp, pat = a.some(function (x) { return x && x.name != null; });
          set(cur, pat || !cur || cur.kind === 'pattern' ? null : toRgb(cur, nn));
          break;
        }
      }
    };
  }
  /** The walker's options for a resource set (and the forms in it, a few levels deep). */
  function options(res, depth) {
    return {
      each: each(res && res.space),
      form: function (name) {
        var x = depth < 4 && res && res.form ? res.form(name) : null;
        return x && x.ops ? { ops: x.ops, fonts: (x.res && x.res.fonts) || function () { return null; }, matrix: x.matrix, opts: options(x.res, depth + 1) } : null;
      }
    };
  }
  function hex(rgb) { return rgb.map(function (v) { return ('0' + Math.round(clamp(v) * 255).toString(16)).slice(-2); }).join(''); }

  function ink(ops, res, targets) {
    var opts = options(res, 0), tally = {};
    opts.gs0 = { fill: [0, 0, 0], stroke: [0, 0, 0], fsp: GRAY, ssp: GRAY };
    St.glyphs(ops, (res && res.fonts) || function () { return null; }, opts).forEach(function (g) {
      if (g.tr === 3 || g.tr === 7 || !St.inTarget(g, targets)) return;
      var c = g.tr === 1 || g.tr === 5 ? g.stroke : g.fill;
      if (!c) return;
      var key = hex(c);
      tally[key] = tally[key] || { n: 0, c: c };
      tally[key].n++;
    });
    var best = null;
    Object.keys(tally).forEach(function (k) { if (!best || tally[k].n > best.n) best = tally[k]; });
    return best ? best.c.slice() : null;
  }
  return { ink: ink, toRgb: toRgb, cmyk: cmyk, BUILTIN: BUILTIN };
});
