// The always-on backdrop: dark field, a drifting lime glow that breathes on the beat, a
// perspective grid floor and film grain. Also the beat flash used on hard cuts.
import { h, css, noise, BEAT } from '../ease.js';

export function makeBackdrop(ctx) {
  const el = h('div', 'backdrop');
  const glow = h('div', 'bd-glow'), glow2 = h('div', 'bd-glow b2'), grid = h('div', 'bd-grid'), grain = h('div', 'bd-grain'), vig = h('div', 'bd-vig');
  el.append(glow, glow2, grid, vig, grain);
  const cuts = ctx.plan.segs.map((s) => s.start).filter((s) => s > 0);
  function render(t) {
    const b = (t / BEAT) % 1, pulse = Math.exp(-b * 5);
    css(glow, { transform: `translate(${noise(t * 0.25, 1) * 18}%, ${noise(t * 0.2, 2) * 14}%) scale(${1 + pulse * 0.06})`, opacity: 0.55 + pulse * 0.25 });
    css(glow2, { transform: `translate(${noise(t * 0.18, 5) * 25}%, ${noise(t * 0.22, 7) * 20}%)` });
    css(grid, { 'background-position': `0 ${(t * 60) % 80}px` });
    css(grain, { 'background-position': `${Math.floor(t * 24) * 37 % 200}px ${Math.floor(t * 24) * 53 % 200}px` });
    // brief white-lime flash on each cut
    let f = 0;
    for (const c of cuts) { const d = t - c; if (d >= 0 && d < 0.12) f = Math.max(f, 1 - d / 0.12); }
    el.style.setProperty('--flash', (f * 0.35).toFixed(3));
  }
  return { el, render };
}
