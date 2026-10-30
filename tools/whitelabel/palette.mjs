// The palette shift of a white-label build: every colour of the source brand's accent family (its hues, from.hues) is
// turned to the profile's hue, keeping saturation and luminance, in the site's CSS, JavaScript, HTML and SVG. Greys, reds,
// blues and the rest are untouched; a moved colour keeps its luminance, so contrast stays as the source tested it.
// profile.palette: { hue: 221, from: [55, 110], minSaturation: 0.3, neutral? }. neutral: { hue, saturation, from, maxSaturation }
// also turns the source's tinted greys (its warm paper and its near-blacks; pure greys stay) to the profile's own neutral
// tint, with the same luminance: the apps' own backgrounds, fields and lines then match the profile's theme tokens.
// Under tests/ both shifts move only the colours the site's own files use (TEST_FILE): any other is the test's data.
// Node only. Tests: tests/node/whitelabel-palette.test.mjs.

const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** WCAG relative luminance of 0-255 channels. */
export function luminance([r, g, b]) {
  const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

/** The new [r, g, b] for a colour, or null when it is not in the accent family. The new colour has the profile's hue,
 * the same saturation, and the lightness that gives the same luminance, so every contrast the source passed still holds. */
export function shift([r, g, b], pal) {
  const [h, s] = rgbToHsl(r, g, b);
  const [lo, hi] = pal.from || [65, 100];
  if (h < lo || h > hi || s < (pal.minSaturation ?? 0.3)) return null;
  return atLuminance(pal.hue, s, luminance([r, g, b]));
}
/** The colour of a hue and saturation whose luminance is `want` (the lightness found by bisection). */
function atLuminance(hue, s, want) {
  let a = 0, z = 1;
  for (let i = 0; i < 30; i++) { const m = (a + z) / 2; if (luminance(hslToRgb(hue, s, m)) < want) a = m; else z = m; }
  return hslToRgb(hue, s, (a + z) / 2);
}
/** The source's tinted greys (default: the warm ones, hue 20-60) whose saturation is between 2% and maxSaturation (0.45). */
export const NEUTRAL_FROM = [[20, 60]];
/** The new [r, g, b] for a tinted grey, or null: neutral.hue at neutral.saturation (0.15), the same luminance. */
export function shiftNeutral([r, g, b], n) {
  if (!n || typeof n.hue !== 'number') return null;
  const [h, s] = rgbToHsl(r, g, b);
  if (s < 0.02 || s > (n.maxSaturation ?? 0.45) || !(n.from || NEUTRAL_FROM).some(([lo, hi]) => h >= lo && h <= hi)) return null;
  return atLuminance(n.hue, n.saturation ?? 0.15, luminance([r, g, b]));
}

const HEX = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const RGB = /\brgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(\s*[,)])/g;

/** A colour literal's key: its six lowercase hex digits (no alpha), or null when it is not a colour literal. */
export function colorKey(lit) {
  let m = /^#([0-9a-fA-F]{3,8})$/.exec(lit);
  if (m) { const h = m[1].length <= 4 ? m[1].split('').map((c) => c + c).join('') : m[1]; return h.length === 6 || h.length === 8 ? h.slice(0, 6).toLowerCase() : null; }
  m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(lit);
  return m ? m.slice(1, 4).map((v) => hex2(+v)).join('') : null;
}
/** The keys of every colour literal in some texts (the site's own colours, for a test file's rule: TEST_FILE). */
export function colorKeys(texts) {
  const out = new Set();
  for (const t of texts) for (const m of t.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)/g)) { const k = colorKey(m[0]); if (k) out.add(k); }
  return out;
}

/** The text with its accent-family colours moved to the profile's hue. Hex keeps its length and case style. only: a set
 * of colour keys (colorKeys); when given, a colour not in it stays as it is. */
export function remapColors(text, pal, only) {
  if (!pal || typeof pal.hue !== 'number') return text;
  const moved = (rgb, lit) => (only && !only.has(colorKey(lit)) ? null : shift(rgb, pal) || shiftNeutral(rgb, pal.neutral));
  return text.replace(HEX, (m, h) => {
    const full = h.length <= 4 ? h.split('').map((c) => c + c).join('') : h;
    const rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    const n = moved(rgb, m);
    if (!n) return m;
    let out = n.map(hex2).join('') + (full.length === 8 ? full.slice(6) : '');
    if (h === h.toUpperCase() && /[A-F]/.test(h)) out = out.toUpperCase();
    return '#' + out;
  }).replace(RGB, (m, r, g, b, tail) => {
    const n = moved([+r, +g, +b], m);
    return n ? m.slice(0, m.indexOf('(') + 1) + n.map(Math.round).join(', ') + tail : m;
  });
}

/** Colours that are inputs, not the site's look: tests that do colour maths, test fixtures, and the apps' built-in sample
 * pictures (<app>/js/io/sample.js: the background remover's model and its tests read that picture as drawn). Left as they are. */
export const PALETTE_KEEP = /^tests\/(node\/colors-|.*fixtures\/)|^[\w-]+\/js\/io\/sample\.js$/;
/** Which files the shift applies to: the site's own styles and code and the tests that check them; not third-party code. */
export const paletteFile = (file) => /\.(css|m?js|html|svg)$/.test(file) && !/^vendor\//.test(file) && !PALETTE_KEEP.test(file);
/** In a test file only the colours the site itself uses move (both shifts): such a colour is a check of the site's look;
 * any other is the test's own data, which its inputs hold in forms the shift does not see (a pptx's bare "FBFAF5"). */
export const TEST_FILE = /^tests\//;

const hexRgb = (h) => { const f = h.length === 4 ? h.slice(1).split('').map((c) => c + c).join('') : h.slice(1, 7); return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
const mix = (a, b, t) => a.map((v, i) => v * t + b[i] * (1 - t));   // t of a over b
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

/** The source's Light and Dark theme tokens, read from shared/theme/theme.js (th('light', 'light', bg, surface, text, accent, border)). */
export function sourceThemes(themeJs) {
  const out = {};
  for (const m of themeJs.matchAll(/th\('(light|dark)', '\w+', '(#\w+)', '(#\w+)', '(#\w+)', '(#\w+)', '(#\w+)'\)/g)) out[m[1]] = { background: m[2], surface: m[3], text: m[4], accent: m[5], border: m[6] };
  return out;
}

/** The pairs every theme is held to: text and its muted mixes on the surfaces, the accent on the surfaces and on a hover
 * tint, the border on the surface (3:1). */
export function themePairs(t) {
  const [bg, sf, tx, ac, bd] = ['background', 'surface', 'text', 'accent', 'border'].map((k) => hexRgb(t[k]));
  return [['text on background', tx, bg, 4.5], ['text on surface', tx, sf, 4.5], ['muted text (58%) on surface', mix(tx, sf, 0.58), sf, 4.5],
    ['accent on surface', ac, sf, 4.5], ['accent on background', ac, bg, 4.5], ['accent on a hover tint', ac, mix(tx, sf, 0.15), 4.5], ['border on surface', bd, sf, 3]];
}

/** The problems of a profile's themes: a pair under its minimum (or under the source's own figure, when that is lower), and
 * text that is less bright (dark) or less dark (light) than the source's, which the apps' own greys were tested against. */
export function themeProblems(themes, source) {
  const out = [];
  for (const id of ['light', 'dark']) {
    const t = Object.assign({}, source[id] || {}, (themes || {})[id] || {});
    if (!t.text) continue;
    const src = source[id] ? themePairs(source[id]) : [];
    themePairs(t).forEach(([name, a, b, min], i) => {
      const need = src[i] ? Math.min(min, contrast(src[i][1], src[i][2])) : min, got = contrast(a, b);
      if (got + 1e-9 < need) out.push(`${id}: ${name} is ${got.toFixed(2)}:1, needs ${need.toFixed(2)}:1`);
    });
    if (source[id]) {
      const lt = luminance(hexRgb(t.text)), ls = luminance(hexRgb(source[id].text));
      if (id === 'dark' ? lt < ls : lt > ls) out.push(`${id}: text ${t.text} is ${id === 'dark' ? 'darker' : 'lighter'} than the source's ${source[id].text}`);
    }
  }
  return out;
}
