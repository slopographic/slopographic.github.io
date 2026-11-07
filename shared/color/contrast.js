/* The WCAG 2.x contrast maths, in one place: Slop Colors' contrast checker and the site's contrast tests (the sweep's
 * tests/a11y/contrast.js, tests/node/theme-contrast.test.mjs) use these functions. Pure, no DOM. UMD: window.SlopContrastMath
 * in a page, module.exports in Node.
 *   linear(v)               one sRGB channel (0-255) as linear light (0-1), the WCAG 2.x formula (0.04045 threshold)
 *   luminance([r, g, b])    relative luminance (0-1)
 *   ratio(a, b)             the contrast ratio of two [r, g, b] colours, 1 to 21
 *   ratioHex('#rgb', '#rgb') the same for hex strings
 *   LEVELS                  the thresholds: AA normal text 4.5, AA large text 3, AAA normal 7, AAA large 4.5, UI parts 3
 *   levels(r)               { aaNormal, aaLarge, aaaNormal, aaaLarge, ui }: which levels the ratio passes
 *   large(px, weight)       true for "large text": 24 px, or 18.66 px (14 pt) bold */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SlopContrastMath = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const linear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const luminance = (c) => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);
  function ratio(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function rgbOfHex(hex) {
    let s = String(hex || '').trim().replace(/^#/, '');
    if (s.length === 3 || s.length === 4) s = s.split('').map((c) => c + c).join('');
    const n = parseInt(s.slice(0, 6), 16);
    return Number.isFinite(n) ? [n >> 16 & 255, n >> 8 & 255, n & 255] : [0, 0, 0];
  }
  const ratioHex = (a, b) => ratio(rgbOfHex(a), rgbOfHex(b));
  const LEVELS = Object.freeze({ aaNormal: 4.5, aaLarge: 3, aaaNormal: 7, aaaLarge: 4.5, ui: 3 });
  function levels(r) {
    const out = {};
    for (const k of Object.keys(LEVELS)) out[k] = r + 1e-9 >= LEVELS[k];
    return out;
  }
  const large = (px, weight = 400) => px >= 24 || (px >= 18.66 && weight >= 700);
  return { linear, luminance, ratio, ratioHex, rgbOfHex, LEVELS, levels, large };
});
