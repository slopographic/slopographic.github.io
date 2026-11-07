/* Slop Colors: palettes made from one colour. Pure; needs the convert module (colors/js/core/convert.js) and the
 * contrast maths (shared/color/contrast.js). In Node the factory takes them; in a page it reads SlopColors.convert.
 *   HARMONIES                      [[id, label]]: complementary, analogous, triadic, split, tetradic, square, monochrome,
 *                                  brightness (shades: one hue, darker and lighter), custom (colours chosen one by one)
 *   WHEELS                         [[id, label]]: rgb (the HSL/HSB wheel), ryb (the artist's red-yellow-blue wheel),
 *                                  oklch (perceptual: OKLCH hue, lightness and chroma kept)
 *   TURNS                          the hue turns of each turning rule, in degrees on the chosen wheel
 *   harmony(hex, id, { wheel, custom }) → [hex]   the base colour first, then the others: turned on the wheel (rgb keeps
 *                                  HSL saturation and lightness, ryb turns the RYB angle, oklch keeps L and C); monochrome
 *                                  keeps the hue and steps the lightness (HSL, or OKLCH on that wheel); brightness steps
 *                                  HSB brightness; custom is the base and the custom colours as given
 *   turn(hex, deg, wheel) → hex    one colour turned on a wheel
 *   customFrom(hex, id, wheel) → [hex]   the custom colours a switch to custom starts from: the rule's other colours,
 *                                  made up to CUSTOM_N with turns of a fifth of the wheel
 *   SCALES                         [[id, label]]: tints (towards white), shades (towards black), tones (towards grey)
 *   scale(hex, id, steps) → [hex]  the colour and steps-1 mixes, the last one step short of white, black or grey
 *   RAMP_KEYS, ramp(hex) → { 50: hex, …, 950: hex }   a Tailwind-style ramp: the hue kept, lightness from 97% to 22% in
 *                                  OKLCH with the chroma eased at the ends, and the given colour placed at its nearest step
 *   suggest(fg, bg, target) → hex | null   the colour nearest fg (same hue and chroma, lightness moved the least) whose
 *                                  contrast with bg reaches target */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else (root.SlopColors = root.SlopColors || {}).harmony = factory(root.SlopColors.convert, root.SlopContrastMath);
})(typeof window !== 'undefined' ? window : globalThis, function (C, M) {
  'use strict';
  const HARMONIES = [['complementary', 'Complementary'], ['analogous', 'Analogous'], ['triadic', 'Triadic'], ['split', 'Split complementary'],
    ['tetradic', 'Tetradic'], ['square', 'Square'], ['monochrome', 'Monochrome'], ['brightness', 'Shades'], ['custom', 'Custom']];
  const WHEELS = [['rgb', 'RGB'], ['ryb', 'RYB (artist)'], ['oklch', 'OKLCH (perceptual)']];
  const CUSTOM_N = 4;
  const TURNS = { complementary: [0, 180], analogous: [-30, 0, 30, 60], triadic: [0, 120, 240], split: [0, 150, 210], tetradic: [0, 60, 180, 240], square: [0, 90, 180, 270] };
  const SCALES = [['tints', 'Tints (with white)'], ['shades', 'Shades (with black)'], ['tones', 'Tones (with grey)']];
  const RAMP_KEYS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  const RAMP_L = [0.97, 0.93, 0.87, 0.79, 0.70, 0.62, 0.54, 0.46, 0.38, 0.30, 0.22];

  /** The colour turned by deg on the wheel. */
  function turn(hex, deg, wheel = 'rgb') {
    const [r, g, b] = C.rgbOf(C.parse(hex) || '#000000');
    if (wheel === 'oklch') { const [L, Ch, h] = C.rgbToOklch(r, g, b); return C.hexOf(C.oklchToRgb(L, Ch, h + deg)); }
    const [h, s, l] = C.rgbToHsl(r, g, b);
    return C.hexOf(C.hslToRgb(wheel === 'ryb' ? C.rybToHue(C.hueToRyb(h) + deg) : h + deg, s, l));
  }
  /** The base value first, then the steps not too near it (at most five in all). */
  const steps = (v, list, gap) => [v, ...list.filter((x) => Math.abs(x - v) > gap)].slice(0, 5);

  function harmony(hex, id, o = {}) {
    const base = C.parse(hex) || '#000000', [r, g, b] = C.rgbOf(base), wheel = o.wheel || 'rgb';
    const keep = (list, fn) => list.map((x, i) => (i === 0 ? base : C.hexOf(fn(x))));
    if (id === 'monochrome' && wheel === 'oklch') {
      const [L, Ch, h] = C.rgbToOklch(r, g, b);
      return keep(steps(L, [0.3, 0.45, 0.6, 0.75, 0.9], 0.07), (x) => C.oklchToRgb(x, Ch, h));
    }
    if (id === 'monochrome') { const [h, s, l] = C.rgbToHsl(r, g, b); return keep(steps(l, [20, 35, 50, 65, 80], 7), (x) => C.hslToRgb(h, s, x)); }
    if (id === 'brightness') { const [h, s, v] = C.rgbToHsv(r, g, b); return keep(steps(v, [20, 40, 60, 80, 100], 7), (x) => C.hsvToRgb(h, s, x)); }
    if (id === 'custom') {
      const own = (Array.isArray(o.custom) ? o.custom : customFrom(base, 'analogous', wheel)).map((x) => C.parse(x)).filter(Boolean);
      return [base, ...own.slice(0, 7)];
    }
    const turns = TURNS[id] || TURNS.complementary;
    return [base, ...turns.filter((t) => t !== 0).map((t) => turn(base, t, wheel))];
  }
  /** The colours a switch to custom starts from, so the handles stay where they were. */
  function customFrom(hex, id, wheel = 'rgb') {
    const own = id === 'custom' ? [] : harmony(hex, id, { wheel }).slice(1);
    for (let k = 1; own.length < CUSTOM_N; k++) own.push(turn(hex, 72 * k, wheel));
    return own;
  }

  function scale(hex, id = 'tints', steps = 5) {
    const base = C.rgbOf(C.parse(hex) || '#000000'), n = Math.max(2, Math.min(20, Math.round(steps) || 5));
    const to = id === 'shades' ? [0, 0, 0] : id === 'tones' ? [128, 128, 128] : [255, 255, 255];
    const out = [];
    for (let i = 0; i < n; i++) { const t = i / n; out.push(C.hexOf(base.map((v, k) => v + (to[k] - v) * t))); }
    return out;
  }

  function ramp(hex) {
    const [r, g, b] = C.rgbOf(C.parse(hex) || '#000000'), [L, Ch, h] = C.rgbToOklch(r, g, b);
    let at = 0;
    RAMP_L.forEach((x, i) => { if (Math.abs(x - L) < Math.abs(RAMP_L[at] - L)) at = i; });
    const out = {};
    RAMP_KEYS.forEach((k, i) => {
      const ease = 1 - Math.abs(RAMP_L[i] - 0.6) * 0.9;   // less chroma near white and black, where little fits
      out[k] = i === at ? C.hexOf([r, g, b]) : C.hexOf(C.oklchToRgb(RAMP_L[i], Ch * Math.max(0.25, ease), h));
    });
    return out;
  }

  function suggest(fg, bg, target = 4.5) {
    const f = C.parse(fg), b = C.parse(bg);
    if (!f || !b) return null;
    if (M.ratioHex(f, b) >= target) return f;
    const [L, Ch, h] = C.rgbToOklch(...C.rgbOf(f));
    let best = null;
    for (let d = 0.005; d <= 1; d += 0.005) {
      for (const L2 of [L - d, L + d]) {
        if (L2 < 0 || L2 > 1) continue;
        const x = C.hexOf(C.oklchToRgb(L2, Ch, h));
        if (M.ratioHex(x, b) >= target) { best = x; break; }
      }
      if (best) break;
    }
    return best;
  }
  return { HARMONIES, WHEELS, TURNS, CUSTOM_N, SCALES, RAMP_KEYS, harmony, turn, customFrom, scale, ramp, suggest };
});
