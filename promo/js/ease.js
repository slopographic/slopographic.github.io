// Easing and timing helpers. Every visual in the promo is a pure function of time t (seconds),
// built from these, so any frame can be rendered on its own.
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const BPM = 120;
export const BEAT = 60 / BPM;

export const E = {
  linear: (x) => x,
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outQuart: (x) => 1 - Math.pow(1 - x, 4),
  inQuart: (x) => x * x * x * x,
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  inOutExpo: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
  outBack: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  inBack: (x) => { const c1 = 1.70158; return (c1 + 1) * x * x * x - c1 * x * x; },
  outElastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
};

/** Progress 0..1 of t between t0 and t1, eased. */
export function k(t, t0, t1, ease = E.linear) {
  if (t1 <= t0) return t >= t1 ? 1 : 0;
  return ease(clamp((t - t0) / (t1 - t0)));
}
/** A damped "punch": 0 at t0, jumps to 1 and wobbles back to 0 over dur seconds. */
export function punch(t, t0, dur = 0.4) {
  const x = (t - t0) / dur;
  if (x < 0 || x > 1) return 0;
  return Math.exp(-5 * x) * Math.cos(x * Math.PI * 3);
}
/** Deterministic pseudo-random in [0,1) from a number seed. */
export function rnd(seed) {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
/** Smooth deterministic noise in [-1,1]. */
export function noise(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(rnd(i + seed * 57) * 2 - 1, rnd(i + 1 + seed * 57) * 2 - 1, u);
}

/** Tiny DOM helpers. */
export function h(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
export const css = (el, o) => { for (const key in o) el.style.setProperty(key, o[key]); return el; };
/** Wrap each character of el's text in <span class="ch">, keeping spaces. Returns the spans. */
export function letters(el, text) {
  el.textContent = '';
  return [...text].map((c) => { const s = h('span', 'ch', c === ' ' ? '&nbsp;' : c.replace(/&/g, '&amp;').replace(/</g, '&lt;')); el.append(s); return s; });
}
/** Shrink el's font-size (once, after fonts load) until it is at most maxW pixels wide. */
export function fitOnce(el, maxW) {
  if (el._fit || !el.getClientRects().length) return;
  el._fit = true;
  let fs = parseFloat(getComputedStyle(el).fontSize);
  const w = el.scrollWidth;
  if (w > maxW) { fs = Math.floor(fs * maxW / w); el.style.fontSize = fs + 'px'; }
}
