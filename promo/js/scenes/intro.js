// Intro (16 beats): a goo drop falls and lands, floods the screen lime, SLOPOGRAPHIC slams in
// letter by letter, then "creative apps that run 100% in your browser".
import { h, css, k, E, punch, letters, lerp, fitOnce } from '../ease.js';
import { sloppo } from '../goo.js';

export function makeIntro(seg, ctx) {
  const el = h('div', 'scene intro');
  const flood = h('div', 'in-flood');
  const sp = sloppo('in-sloppo');
  const ring = h('div', 'in-ring');
  const word = h('div', 'in-word wide');
  const chars = letters(word, 'SLOPOGRAPHIC');
  const sub = h('div', 'in-sub mono', 'Creative apps that run');
  const big = h('div', 'in-big wide', '<span class="n">100%</span>');
  const tail = h('div', 'in-tail cond');
  const tailCh = letters(tail, 'in your browser');
  const tag = h('div', 'in-tag serif', 'No installs. No accounts. Nothing uploaded.');
  el.append(flood, ring, word, sp.el, sub, big, tail, tag);
  const V = ctx.vertical;
  const s = { pre: 0, post: 0.4 };
  s.el = el;
  s.render = (t) => {
    fitOnce(word, ctx.W * 0.86); fitOnce(big, ctx.W * 0.9); fitOnce(tail, ctx.W * 0.9); fitOnce(tag, ctx.W * 0.9);
    // 1. the drop falls (0..1s), lands, bounces, then rides the word.
    const fall = k(t, 0.2, 1.0, E.inQuad);
    let y = lerp(-0.7, 0, fall), squash = 0;
    if (t >= 1.0 && t < 1.6) { const b = (t - 1.0) / 0.6; y = -Math.sin(b * Math.PI) * 0.12; squash = punch(t, 1.0, 0.5) * 0.8; }
    const sizeK = k(t, 2.0, 2.6, E.inOutCubic);
    const spSize = lerp(V ? 520 : 480, V ? 260 : 300, sizeK);
    const wordTop = V ? 0.43 : 0.40;
    const yPix = t < 2.0 ? (0.5 + y * 0.6) * ctx.H - spSize * 0.6 : lerp(0.5 * ctx.H - spSize * 0.6, wordTop * ctx.H + (V ? 90 : 80) - word.offsetHeight * 0.45 - spSize * 0.72, sizeK);
    const landHop = t > 2.6 && t < 4.6 ? Math.abs(Math.sin((t - 2.6) * Math.PI * 2)) * 18 : 0;
    css(sp.el, { width: spSize + 'px', height: spSize + 'px', left: (ctx.W - spSize) / 2 + 'px', top: yPix - landHop + 'px', opacity: t < 0.2 ? 0 : t > 4.9 ? 0 : 1 });
    sp.pose(t, { squash: squash + (t > 2.6 && t < 4.6 ? punch(t, 2.6 + Math.floor((t - 2.6) * 2) / 2, 0.4) * 0.4 : 0), open: k(t, 1.0, 1.15) - k(t, 1.5, 1.8), look: Math.sin(t * 1.3) * 0.4 });
    // landing ring
    const r = k(t, 1.0, 1.7, E.outCubic);
    css(ring, { opacity: t >= 1.0 && t < 1.7 ? (1 - r) : 0, transform: `translate(-50%, -50%) scale(${0.2 + r * 2.4}, ${(0.2 + r * 2.4) * 0.28})`, top: 0.5 * ctx.H + spSize * 0.4 + 'px' });
    // 2. lime flood from the drop at 2.0s
    const fl = k(t, 1.75, 2.25, E.inOutExpo);
    css(flood, { 'clip-path': `circle(${fl * 140}% at 50% ${50 + 8}%)`, opacity: t < 5 ? 1 : 0 });
    // 3. SLOPOGRAPHIC, one letter per eighth note
    chars.forEach((c, i) => {
      const t0 = 2.5 + i * 0.125, p = k(t, t0, t0 + 0.28, E.outBack);
      const pk = punch(t, 4.0, 0.5) * 0.06;
      css(c, { transform: `translateY(${(1 - p) * -120}%) scale(${1 + pk}, ${1 - pk})`, opacity: t < t0 ? 0 : 1 });
    });
    css(word, { opacity: t < 5 ? 1 : 0, transform: `translate(-50%, -50%) scale(${1 + k(t, 4.0, 5.0) * 0.04})`, top: wordTop * ctx.H + (V ? 90 : 80) + 'px' });
    css(sub, { opacity: t > 4.0 && t < 5 ? 1 : 0, 'clip-path': `inset(0 ${100 - k(t, 4.0, 4.6, E.outCubic) * 100}% 0 0)` });
    // 4. dark again: 100% + in your browser
    const on4 = t >= 5.0;
    const zoomOut = k(t, 7.55, 8.0, E.inExpo);
    css(big, { opacity: on4 ? 1 - zoomOut : 0, transform: `translate(-50%, -50%) scale(${lerp(1.5, 1, k(t, 5.0, 5.4, E.outExpo)) * (1 + zoomOut * 6) * (1 + punch(t, 6.0, 0.4) * 0.03)})` });
    tailCh.forEach((c, i) => { const t0 = 5.5 + i * 0.04, p = k(t, t0, t0 + 0.35, E.outExpo); css(c, { transform: `translateY(${(1 - p) * 110}%)`, opacity: p > 0 ? 1 : 0 }); });
    css(tail, { opacity: on4 ? 1 - zoomOut : 0 });
    css(tag, { opacity: on4 ? k(t, 6.5, 7.0) * (1 - zoomOut) : 0, transform: `translate(-50%, 0) translateY(${(1 - k(t, 6.5, 7.0, E.outCubic)) * 30}px)` });
  };
  return s;
}
