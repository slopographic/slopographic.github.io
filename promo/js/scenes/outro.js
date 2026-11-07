// Outro (16 beats): lime flood, Sloppo bounces onto the wordmark, the URL, and a promise.
import { h, css, k, E, punch, letters, fitOnce } from '../ease.js';
import { sloppo } from '../goo.js';

export function makeOutro(seg, ctx) {
  const el = h('div', 'scene outro');
  const flood = h('div', 'ou-flood');
  const sp = sloppo('ou-sloppo');
  const word = h('div', 'ou-word wide');
  const chars = letters(word, 'SLOPOGRAPHIC');
  const url = h('div', 'ou-url mono', 'slopographic.com');
  const line = h('div', 'ou-line cond', 'Free <i>·</i> No watermarks <i>·</i> 100% in your browser');
  const small = h('div', 'ou-small mono', 'No installs · No accounts · No uploads · Works offline');
  const black = h('div', 'ou-black');
  el.append(flood, word, sp.el, url, line, small, black);
  const V = ctx.vertical;
  const s = { el, pre: 0.4, post: 0.1 };
  s.render = (lt) => {
    fitOnce(word, ctx.W * 0.86); fitOnce(line, ctx.W * 0.9); fitOnce(small, ctx.W * 0.9);
    const D = seg.dur;
    css(flood, { 'clip-path': `circle(${k(lt, -0.4, 0.3, E.inOutExpo) * 150}% at 50% 110%)` });
    chars.forEach((c, i) => { const t0 = 0.3 + i * 0.06, p = k(lt, t0, t0 + 0.4, E.outBack); css(c, { transform: `translateY(${(1 - p) * 140}%) rotate(${(1 - p) * (i % 2 ? 12 : -12)}deg)`, opacity: p > 0 ? 1 : 0 }); });
    css(word, { transform: `translate(-50%, -50%) scale(${1 + punch(lt, 1.5, 0.5) * 0.05})` });
    // Sloppo drops in at beat 4 and bounces every beat
    const size = V ? 380 : 400;
    const land = 2.0;
    let y;
    if (lt < land) y = -1.2 + k(lt, 1.4, land, E.inQuad) * 1.2;
    else { const b = ((lt - land) / 0.5) % 1; y = -Math.sin(b * Math.PI) * 0.22 * Math.max(0.3, 1 - (lt - land) / 6); }
    const baseTop = (V ? 0.46 : 0.47) * ctx.H - word.offsetHeight * 0.45 - size * 0.72;
    const sq = lt >= land ? punch(lt, land + Math.floor((lt - land) / 0.5) * 0.5, 0.35) * 0.5 : 0;
    css(sp.el, { width: size + 'px', height: size + 'px', left: (ctx.W - size) / 2 + 'px', top: baseTop + y * size + 'px', opacity: lt > 1.3 ? 1 : 0 });
    sp.pose(lt, { squash: sq, open: lt > 5.5 && lt < 6.2 ? 0.8 : 0, look: Math.sin(lt * 1.7) * 0.5 });
    css(url, { opacity: k(lt, 2.5, 2.8), transform: `translate(-50%, 0) scale(${0.8 + k(lt, 2.5, 2.9, E.outBack) * 0.2})` });
    css(line, { opacity: k(lt, 3.2, 3.6), transform: `translate(-50%, 0) translateY(${(1 - k(lt, 3.2, 3.7, E.outCubic)) * 30}px)` });
    css(small, { opacity: k(lt, 4.0, 4.5) });
    css(black, { opacity: k(lt, D - 0.7, D - 0.05, E.inCubic) });
  };
  return s;
}
