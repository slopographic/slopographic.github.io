// Games montage (12 beats): rapid full-bleed cuts on every beat, then every game in one grid.
import { h, css, k, E, punch, lerp, fitOnce } from '../ease.js';
import { mediaOf } from '../plan.js';

export function makeMontage(seg, ctx) {
  const el = h('div', 'scene montage');
  const games = seg.games;
  const full = games.map((g) => {
    const m = mediaOf(g, ctx.root), box = h('div', 'mt-full');
    if (m.shot) { const i = new Image(); i.src = m.shot; i.alt = ''; box.append(i); }
    const v = m.clip ? ctx.video(m.clip, m.shot) : null;
    if (v) box.append(v);
    box.append(h('div', 'mt-name wide', g.name));
    el.append(box);
    return { box, v };
  });
  const grid = h('div', 'mt-grid');
  const cells = games.map((g) => {
    const m = mediaOf(g, ctx.root), c = h('div', 'mt-cell');
    if (m.shot) { const i = new Image(); i.src = m.shot; i.alt = ''; c.append(i); }
    const v = m.clip ? ctx.video(m.clip, m.shot) : null;
    if (v) c.append(v);
    c.append(h('span', 'mono', g.name));
    grid.append(c);
    return { c, v };
  });
  const head = h('div', 'mt-head wide', `<span class="lime">${games.length} games.</span> All free.<br>All in your browser.`);
  el.append(grid, head);
  const cutLen = 0.5, cutEnd = Math.min(games.length, 6) * cutLen;
  const s = { el, pre: 0.1, post: 0.35 };
  s.hide = () => { for (const f of [...full, ...cells]) if (f.v) ctx.setTime(f.v, 0, false); };
  s.render = (lt) => {
    const D = seg.dur;
    full.forEach((f, i) => {
      const last = i === Math.min(games.length, 6) - 1, t0 = i * cutLen;
      const on = lt >= t0 - 0.0001 && lt < t0 + cutLen + (last ? 0.45 : 0) && (lt < cutEnd || last);
      f.box.style.display = on ? '' : 'none';
      if (f.v) ctx.setTime(f.v, lt - t0 + 1, on);
      if (on) {
        fitOnce(f.box.querySelector('.mt-name'), ctx.W * 0.68);
        const p = (lt - t0) / cutLen;
        css(f.box, { transform: `scale(${1.15 - p * 0.1 + punch(lt, t0, 0.3) * 0.04}) rotate(${(i % 2 ? 1 : -1) * (1 - p) * 1.5}deg)`, opacity: 1 - k(lt, cutEnd, cutEnd + 0.45) });
        css(f.box.querySelector('.mt-name'), { transform: `translate(-50%, -50%) scale(${lerp(1.25, 1, k(lt, t0, t0 + 0.2, E.outExpo))})` });
      }
    });
    const gOn = lt >= cutEnd;
    grid.style.display = gOn ? '' : 'none';
    head.style.display = gOn ? '' : 'none';
    if (gOn) fitOnce(head, ctx.W * 0.92);
    const out = k(lt, D - 0.25, D + 0.35, E.inExpo);
    cells.forEach((c, i) => {
      const t0 = cutEnd + i * 0.06, p = k(lt, t0, t0 + 0.45, E.outBack);
      if (c.v) ctx.setTime(c.v, lt + 2, gOn);
      css(c.c, { transform: `scale(${0.6 + p * 0.4}) rotate(${(1 - p) * (i % 2 ? 6 : -6)}deg)`, opacity: Math.min(1, p * 2) });
    });
    const z = k(lt, cutEnd, D, E.linear);
    css(grid, { transform: `translate(-50%, -50%) scale(${(1.02 + z * 0.05) * (1 + out * 2.5)})`, opacity: 1 - out });
    css(head, { opacity: k(lt, cutEnd + 0.4, cutEnd + 0.7) * (1 - out), transform: `translate(-50%, 0) translateY(${(1 - k(lt, cutEnd + 0.4, cutEnd + 0.8, E.outCubic)) * 40}px)` });
  };
  return s;
}
