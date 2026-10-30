/* Slop Paint, part 01: helpers: $, h(), clamp, colour and canvas utilities.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint = {};

/* =====================================================================
 * Helpers
 * ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid);
  return e;
}
/** Words in the chosen language (photoslop/classic/i18n, shared/i18n); onLang(fn) runs fn after a language change. */
const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
const onLang = fn => { if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(fn); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mkCanvas = (w, hh) => { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, hh | 0); return c; };
const ctx2d = (c, o) => { const x = c.getContext('2d', o); x.imageSmoothingEnabled = false; return x; };
const copyCanvas = src => { const c = mkCanvas(src.width, src.height); ctx2d(c).drawImage(src, 0, 0); return c; };
const loadImage = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('bad image')); i.src = src; });
async function loadBlobImage(blob) {
  const url = URL.createObjectURL(blob);
  try { return await loadImage(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
}
const hexToRgb = hx => { const n = parseInt(hx.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const pack = hx => { const [r, g, b] = hexToRgb(hx); return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; };
const isTyping = node => node && node.closest && !!node.closest('input, textarea, select, [contenteditable]');
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let hh = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh /= 6;
  }
  return [hh, s, l];
}
function hslToRgb(hh, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = h => { if (h < 0) h += 1; if (h > 1) h -= 1; if (h < 1 / 6) return p + (q - p) * 6 * h; if (h < 1 / 2) return q; if (h < 2 / 3) return p + (q - p) * (2 / 3 - h) * 6; return p; };
  return [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)].map(v => Math.round(v * 255));
}

Object.assign(P, { $, $$, EMOJI_FONT, onLang, t, clamp, copyCanvas, ctx2d, h, hexToRgb, hslToRgb, isTyping, loadBlobImage, loadImage, mkCanvas, pack, rgbHex, rgbToHsl });
})();
