/* Slop Colors: the colour wheel's geometry and its handles' rules. Pure, no DOM; needs the convert and harmony modules
 * (colors/js/core/convert.js, harmony.js). A place on the wheel is { a, r, v }: a the angle in degrees (0 at the top,
 * clockwise), r the distance from the centre (0-1), v the slider under the wheel (0-1). What they mean depends on the wheel:
 *   rgb    a = HSB hue, r = HSB saturation, v = HSB brightness (the hue ring and disc of most pickers)
 *   ryb    the same, with a on the artist's red-yellow-blue wheel (convert.hueToRyb)
 *   oklch  a = OKLCH hue, r = chroma / CMAX, v = OKLCH lightness; a place outside sRGB shows its gamut-mapped colour
 *   point(hex, wheel) → { a, r, v }     colour(p, wheel) → hex       (each other's inverse up to the 8-bit rounding)
 *   rgb(a, r, v, wheel), ringRgb(a, wheel) → [r, g, b]   the same as unrounded channels, for drawing the disc and ring
 *   colours(s) → [hex]          the handles' colours for a state { current, harmony, wheel, custom }: the base first
 *   places(s, base) → [p]       the handles' places; a turning rule's handles sit at the base's angle plus the turn (so a
 *                               grey base keeps its set together); base: the base's place when the page knows it better
 *   drag(s, i, p, base) → { patch, base }   handle i moved to p: the base sets current (the others follow by the rule);
 *                               in custom each other handle sets its own colour; under a rule another handle turns the
 *                               whole set (and sets the saturation, except for monochrome and shades, which share a hue).
 *                               base: the base's new place (null when it did not move)
 *   nudge(p, key, big) → p | null   a key on a handle: ← → turn (1°, Shift 10°), ↑ ↓ the radius (1%, Shift 10%),
 *                               Page Up/Down the slider (5%), Home and End the radius 0 and 1
 *   toXY(p, R) → [x, y] from the centre;  fromXY(x, y, R) → { a, r } (r may pass 1: the hue ring is outside the disc) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else (root.SlopColors = root.SlopColors || {}).wheel = factory(root.SlopColors.convert, root.SlopColors.harmony);
})(typeof window !== 'undefined' ? window : globalThis, function (C, H) {
  'use strict';
  const CMAX = 0.32;   // OKLCH chroma at the rim: about the most any sRGB colour has (blue, 0.313)
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const wrap = (a) => ((a % 360) + 360) % 360;
  const ids = () => H.WHEELS.map((w) => w[0]);
  const model = (wheel) => (ids().includes(wheel) ? wheel : 'rgb');

  function point(hex, wheel) {
    const rgb = C.rgbOf(C.parse(hex) || '#000000');
    if (model(wheel) === 'oklch') { const [L, Ch, h] = C.rgbToOklch(...rgb); return { a: h, r: clamp(Ch / CMAX, 0, 1), v: L }; }
    const [h, s, v] = C.rgbToHsv(...rgb);
    return { a: model(wheel) === 'ryb' ? C.hueToRyb(h) : h, r: s / 100, v: v / 100 };
  }
  function rgb(a, r, v, wheel) {
    const w = model(wheel);
    a = wrap(a); r = clamp(r, 0, 1); v = clamp(v, 0, 1);
    if (w === 'oklch') return C.oklchToRgb(v, r * CMAX, a);
    return C.hsvToRgb(w === 'ryb' ? C.rybToHue(a) : a, r * 100, v * 100);
  }
  const colour = (p, wheel) => C.hexOf(rgb(p.a, p.r, p.v, wheel));
  /** The ring's colour at an angle: the hue at its fullest (OKLCH: a mid lightness, the chroma sRGB allows there). */
  const ringRgb = (a, wheel) => (model(wheel) === 'oklch' ? rgb(a, 0.5, 0.72, wheel) : rgb(a, 1, 1, wheel));

  const colours = (s) => H.harmony(s.current, s.harmony, { wheel: model(s.wheel), custom: s.custom });
  function places(s, base) {
    const w = model(s.wheel), cols = colours(s), b = base || point(cols[0], w);
    const turns = (H.TURNS[s.harmony] || []).filter((x) => x !== 0), same = s.harmony === 'monochrome' || s.harmony === 'brightness';
    return cols.map((hex, i) => {
      if (!i) return b;
      const p = point(hex, w);
      if (turns.length) return { a: wrap(b.a + turns[i - 1]), r: p.r, v: p.v };
      return same ? { a: b.a, r: p.r, v: p.v } : p;
    });
  }
  function drag(s, i, p, base) {
    const w = model(s.wheel);
    if (!i) return { patch: { current: colour(p, w) }, base: p };
    if (s.harmony === 'custom') { const own = colours(s).slice(1); own[i - 1] = colour(p, w); return { patch: { custom: own }, base: null }; }
    const at = places(s, base), same = s.harmony === 'monochrome' || s.harmony === 'brightness';
    const b = { a: wrap(at[0].a + p.a - at[i].a), r: same ? at[0].r : clamp(p.r, 0, 1), v: at[0].v };
    return { patch: { current: colour(b, w) }, base: b };
  }
  function nudge(p, key, big) {
    const q = Object.assign({}, p), step = big ? 10 : 1;
    if (key === 'ArrowRight') q.a = wrap(p.a + step);
    else if (key === 'ArrowLeft') q.a = wrap(p.a - step);
    else if (key === 'ArrowUp') q.r = clamp(p.r + step / 100, 0, 1);
    else if (key === 'ArrowDown') q.r = clamp(p.r - step / 100, 0, 1);
    else if (key === 'PageUp') q.v = clamp(p.v + 0.05, 0, 1);
    else if (key === 'PageDown') q.v = clamp(p.v - 0.05, 0, 1);
    else if (key === 'Home') q.r = 0;
    else if (key === 'End') q.r = 1;
    else return null;
    return q;
  }
  function toXY(p, R) { const t = (wrap(p.a) * Math.PI) / 180; return [Math.sin(t) * p.r * R, -Math.cos(t) * p.r * R]; }
  function fromXY(x, y, R) { return { a: wrap((Math.atan2(x, -y) * 180) / Math.PI), r: Math.hypot(x, y) / R }; }
  return { CMAX, model, point, rgb, colour, ringRgb, colours, places, drag, nudge, toXY, fromXY };
});
