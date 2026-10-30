/* Slop Colors: colour spaces. One colour is a hex string ('#rrggbb', the site's form: shared/color/model.js parse/toHex);
 * this module converts it to and from RGB, HSL, OKLab/OKLCH (Björn Ottosson's matrices, CSS Color 4) and CMYK (naive,
 * no ICC profile), and reads any of them back from text. Pure, no DOM. Needs shared/color/model.js (SlopColor) and
 * shared/color/contrast.js (SlopContrastMath.linear, the one sRGB linearisation) loaded first; in Node, pass them to factory.
 *   rgbToHsl(r, g, b) → [h 0-360, s 0-100, l 0-100]   hslToRgb(h, s, l) → [r, g, b] (0-255, unrounded)
 *   rgbToOklch(r, g, b) → [L 0-1, C, h 0-360]          oklchToRgb(L, C, h) → [r, g, b], gamut mapped (chroma reduced)
 *   rgbToCmyk(r, g, b) → [c, m, y, k] (0-100)          cmykToRgb(c, m, y, k) → [r, g, b]
 *   rgbToHsv(r, g, b) → [h, s 0-100, v 0-100]          hsvToRgb(h, s, v) → [r, g, b] (HSB, the colour wheel's disc;
 *                                                      shared/color/model.js's maths)
 *   hueToRyb(h) → angle, rybToHue(angle) → h           the artist's red-yellow-blue wheel: an RGB/HSL hue to its angle
 *                                                      there and back (piecewise linear between the primaries and
 *                                                      secondaries, RYB_STOPS; red 0, yellow 120, blue 240, so a
 *                                                      complement is red–green, yellow–violet, blue–orange)
 *   parse(text) → '#rrggbb' or null: #rgb, #rrggbb, rgb(), hsl(), oklch(), cmyk(), or "r g b"
 *   format(hex, kind)  kind: hex | rgb | hsl | oklch | cmyk, as CSS text (cmyk() is not CSS; it is for print people)
 *   all(hex) → { hex, rgb, hsl, oklch, cmyk }          KINDS: the kinds in order */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else (root.SlopColors = root.SlopColors || {}).convert = factory(root.SlopColor, root.SlopContrastMath);
})(typeof window !== 'undefined' ? window : globalThis, function (Model, Math2) {
  'use strict';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const round = (v, d = 0) => { const p = 10 ** d; return Math.round(v * p) / p; };
  const KINDS = ['hex', 'rgb', 'hsl', 'oklch', 'cmyk'];
  const hexOf = (rgb) => Model.toHex(rgb[0], rgb[1], rgb[2]);
  const rgbOf = (hex) => { const c = Model.parse(hex); return [c.r, c.g, c.b]; };

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, s * 100, l * 100];
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }

  const toGamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255;
  function rgbToOklab(r, g, b) {
    const [R, G, B] = [r, g, b].map(Math2.linear);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  /** OKLab → linear sRGB (may be out of 0-1). */
  function oklabToLinear(L, a, b) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  const oklabToRgb = (L, a, b) => oklabToLinear(L, a, b).map((v) => toGamma(clamp(v, 0, 1)));
  function rgbToOklch(r, g, b) {
    const [L, a, bb] = rgbToOklab(r, g, b), C = Math.hypot(a, bb);
    let h = C < 1e-7 ? 0 : (Math.atan2(bb, a) * 180) / Math.PI;
    if (h < 0) h += 360;
    return [L, C, h];
  }
  const inGamut = (lin) => lin.every((v) => v >= -1e-5 && v <= 1 + 1e-5);
  /** OKLCH → sRGB; a colour outside sRGB keeps its lightness and hue and loses chroma until it fits (CSS Color 4's idea). */
  function oklchToRgb(L, C, h) {
    L = clamp(L, 0, 1); C = Math.max(0, C);
    const lab = (c) => [L, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
    if (inGamut(oklabToLinear(...lab(C)))) return oklabToRgb(...lab(C));
    let lo = 0, hi = C;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (inGamut(oklabToLinear(...lab(mid)))) lo = mid; else hi = mid; }
    return oklabToRgb(...lab(lo));
  }
  const outOfGamut = (L, C, h) => !inGamut(oklabToLinear(L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)));

  function rgbToCmyk(r, g, b) {
    const k = 1 - Math.max(r, g, b) / 255;
    if (k >= 1) return [0, 0, 0, 100];
    const f = (v) => ((1 - v / 255 - k) / (1 - k)) * 100;
    return [f(r), f(g), f(b), k * 100];
  }
  const cmykToRgb = (c, m, y, k) => [c, m, y].map((v) => 255 * (1 - clamp(v, 0, 100) / 100) * (1 - clamp(k, 0, 100) / 100));

  const wrap = (h) => ((h % 360) + 360) % 360;
  const rgbToHsv = (r, g, b) => { const [h, s, v] = Model.rgbToHsb(r, g, b); return [h, s * 100, v * 100]; };
  const hsvToRgb = (h, s, v) => Model.hsbToRgb(wrap(h), clamp(s, 0, 100) / 100, clamp(v, 0, 100) / 100);
  /** [RYB angle, RGB hue]: red, orange, yellow, green, blue, violet and red again. */
  const RYB_STOPS = [[0, 0], [60, 30], [120, 60], [180, 120], [240, 240], [300, 280], [360, 360]];
  function stops(x, from, to) {
    x = wrap(x);
    for (let i = 1; i < RYB_STOPS.length; i++) {
      const a = RYB_STOPS[i - 1], b = RYB_STOPS[i];
      if (x <= b[from]) return a[to] + ((x - a[from]) / (b[from] - a[from])) * (b[to] - a[to]);
    }
    return 0;
  }
  const rybToHue = (angle) => wrap(stops(angle, 0, 1)), hueToRyb = (h) => wrap(stops(h, 1, 0));

  /** The numbers in a colour function's text: "50%" stays a percentage (flagged), "deg" is dropped. */
  function nums(body) {
    return body.replace(/[,/]/g, ' ').trim().split(/\s+/).filter(Boolean).map((t) => ({ v: parseFloat(t), pct: /%$/.test(t) }));
  }
  function parse(text) {
    const s = String(text == null ? '' : text).trim().toLowerCase();
    if (!s) return null;
    if (/^#?([0-9a-f]{3}|[0-9a-f]{6})$/.test(s)) return Model.toHex(...rgbOf(s.startsWith('#') ? s : '#' + s).slice(0, 3));
    if (/^#?([0-9a-f]{4}|[0-9a-f]{8})$/.test(s)) return hexOf(rgbOf(s.startsWith('#') ? s : '#' + s));
    const m = /^([a-z]+)\(([^()]*)\)$/.exec(s);
    const list = m ? nums(m[2]) : /^[\d.\s,]+$/.test(s) ? nums(s) : null;
    if (!list || list.some((n) => !Number.isFinite(n.v))) return null;
    const fn = m ? m[1] : 'rgb', v = list.map((n) => n.v);
    if ((fn === 'rgb' || fn === 'rgba') && v.length >= 3) return hexOf(list.slice(0, 3).map((n) => clamp(n.pct ? n.v * 2.55 : n.v, 0, 255)));
    if ((fn === 'hsl' || fn === 'hsla') && v.length >= 3) return hexOf(hslToRgb(v[0], v[1], v[2]));
    if (fn === 'oklch' && v.length >= 3) return hexOf(oklchToRgb(list[0].pct ? v[0] / 100 : v[0], list[1].pct ? (v[1] / 100) * 0.4 : v[1], v[2]));
    if (fn === 'cmyk' && v.length >= 4) return hexOf(cmykToRgb(v[0], v[1], v[2], v[3]));
    return null;
  }
  function format(hex, kind) {
    const [r, g, b] = rgbOf(hex);
    if (kind === 'rgb') return `rgb(${r} ${g} ${b})`;
    if (kind === 'hsl') { const [h, s, l] = rgbToHsl(r, g, b); return `hsl(${round(h, 1)} ${round(s, 1)}% ${round(l, 1)}%)`; }
    if (kind === 'oklch') { const [L, C, h] = rgbToOklch(r, g, b); return `oklch(${round(L * 100, 3)}% ${round(C, 5)} ${round(h, 3)})`; }
    if (kind === 'cmyk') return `cmyk(${rgbToCmyk(r, g, b).map((x) => round(x, 1) + '%').join(' ')})`;
    return hexOf([r, g, b]);
  }
  const all = (hex) => Object.fromEntries(KINDS.map((k) => [k, format(hex, k)]));
  return { KINDS, rgbToHsl, hslToRgb, rgbToOklab, oklabToRgb, rgbToOklch, oklchToRgb, outOfGamut, rgbToCmyk, cmykToRgb, rgbToHsv, hsvToRgb,
    RYB_STOPS, hueToRyb, rybToHue, parse, format, all, hexOf, rgbOf };
});
