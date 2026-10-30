// Chapter card (4 beats): lime bars sweep in, the section word slams, the count ticks up.
import { h, css, k, E, punch, letters, fitOnce } from '../ease.js';

export function makeChapter(seg, ctx) {
  const el = h('div', 'scene chapter');
  const bars = [0, 1, 2, 3, 4].map(() => h('div', 'ch-bar'));
  const word = h('div', 'ch-word wide');
  const chars = letters(word, seg.title);
  const outline = h('div', 'ch-ghost wide outline', seg.title);
  const count = h('div', 'ch-count mono');
  const line = h('div', 'ch-line serif', seg.line);
  el.append(...bars, outline, word, count, line);
  const n = String(seg.count).padStart(2, '0');
  const s = { el, pre: 0.25, post: 0.3 };
  s.render = (t) => {
    fitOnce(word, ctx.W * 0.9); fitOnce(outline, ctx.W * 0.9 / 1.0); fitOnce(line, ctx.W * 0.9);
    bars.forEach((b, i) => {
      const inP = k(t, -0.25 + i * 0.04, 0.15 + i * 0.04, E.outExpo), outP = k(t, 1.65 + i * 0.03, 2.05 + i * 0.03, E.inExpo);
      css(b, { top: (i * 20) + '%', transform: `translateX(${(1 - inP) * -101 + outP * 101}%)` });
    });
    chars.forEach((c, i) => {
      const t0 = 0.1 + i * 0.05, p = k(t, t0, t0 + 0.3, E.outBack);
      css(c, { transform: `translateY(${(1 - p) * 60}%) scale(${0.6 + p * 0.4})`, opacity: p > 0 ? 1 : 0 });
    });
    const pk = punch(t, 1.0, 0.45);
    const out = k(t, 1.75, 2.1, E.inExpo);
    css(word, { transform: `translate(-50%, -50%) scale(${1 + pk * 0.05}) translateX(${out * -60}%)`, opacity: 1 - out });
    css(outline, { transform: `translate(-50%, -50%) translateX(${(t - 1) * 4}%) scale(1.9)`, opacity: k(t, 0.3, 0.8) * 0.5 * (1 - out) });
    const c = Math.round(k(t, 0.4, 1.0, E.outCubic) * seg.count);
    count.textContent = `${String(c).padStart(2, '0')} / ${n}  ·  ${seg.title}`;
    css(count, { opacity: k(t, 0.3, 0.5) * (1 - out) });
    css(line, { opacity: k(t, 0.8, 1.1) * (1 - out), transform: `translate(-50%, 0) translateY(${(1 - k(t, 0.8, 1.1, E.outCubic)) * 24}px)` });
  };
  return s;
}
