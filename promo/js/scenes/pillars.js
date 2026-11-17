// The pillars (24 beats): no installs · no accounts · no uploads · NO WATERMARKS (its own
// moment: Sloppo eats a watermark off a picture) · works offline.
import { h, css, k, E, punch, lerp, fitOnce } from '../ease.js';
import { sloppo } from '../goo.js';

const ICONS = {
  install: '<path d="M32 8v32M18 28l14 14 14-14"/><path d="M10 46v8h44v-8"/>',
  account: '<circle cx="32" cy="22" r="11"/><path d="M12 56c2-12 10-18 20-18s18 6 20 18"/>',
  upload: '<path d="M20 46h-4a12 12 0 0 1-1-24 16 16 0 0 1 31-3 11 11 0 0 1 2 22h-6"/><path d="M32 52V30M24 38l8-8 8 8"/>',
  offline: '<path d="M8 24a34 34 0 0 1 48 0M15 32a24 24 0 0 1 34 0M22 40a14 14 0 0 1 20 0"/><circle cx="32" cy="49" r="3"/>',
};
const PILLARS = [
  { at: 0, no: 'No', word: 'installs', icon: 'install', sub: 'Open a link. That is the whole setup.', theme: 'dark' },
  { at: 2, no: 'No', word: 'accounts', icon: 'account', sub: 'No sign-up, no email, no password.', theme: 'lime' },
  { at: 4, no: 'No', word: 'uploads', icon: 'upload', sub: 'Your files never leave your device.', theme: 'dark' },
  { at: 10, no: 'Works', word: 'offline', icon: 'offline', sub: 'Save any app as one .html file.', theme: 'lime', noSlash: true },
];

function pillar(p) {
  const el = h('div', 'pl-card ' + p.theme);
  el.innerHTML = `<svg class="pl-icon" viewBox="0 0 64 64" aria-hidden="true"><g class="draw">${ICONS[p.icon]}</g>${p.noSlash ? '' : '<path class="slash" d="M8 8l48 48"/>'}</svg>
    <div class="pl-text"><div class="pl-no wide">${p.no}</div><div class="pl-word wide">${p.word}</div><div class="pl-sub serif">${p.sub}</div></div>`;
  return { el, p, icon: el.querySelector('.draw'), slash: el.querySelector('.slash'), no: el.querySelector('.pl-no'), word: el.querySelector('.pl-word'), sub: el.querySelector('.pl-sub') };
}

export function makePillars(seg, ctx) {
  const el = h('div', 'scene pillars');
  const cards = PILLARS.map(pillar);
  el.append(...cards.map((c) => c.el));
  // the watermark moment
  const wm = h('div', 'wm');
  const pic = h('div', 'wm-pic');
  const img = new Image(); img.src = ctx.root + 'assets/shots/photoslop.jpg'; img.alt = '';
  const mark = h('div', 'wm-mark', `<div class="wm-tiles">${Array.from({ length: 60 }, () => '<span>SAMPLE · WATERMARK</span>').join('')}</div><div class="wm-big">© STOCK-ISH PRO<small>Upgrade to remove</small></div>`);
  pic.append(img, mark);
  const cap = h('div', 'wm-cap mono', 'Other editors, on export:');
  const sp = sloppo('wm-sloppo');
  const stamp = h('div', 'wm-stamp wide', 'No<br>watermarks.');
  const ever = h('div', 'wm-ever serif', 'Ever. Full quality, free.');
  wm.append(cap, pic, sp.el, stamp, ever);
  el.append(wm);
  const V = ctx.vertical;
  const s = { el, pre: 0.35, post: 0.35 };
  s.render = (lt) => {
    for (const c of cards) {
      const t0 = c.p.at, dur = 2, on = lt >= t0 - 0.0001 && lt < t0 + dur + (c.p.at === 10 ? 0.4 : 0);
      c.el.style.display = on ? '' : 'none';
      if (!on) continue;
      fitOnce(c.word, ctx.vertical ? ctx.W * 0.9 : ctx.W * 0.6);
      const x = lt - t0;
      const shake = punch(x, 0, 0.35) * 12;
      css(c.el, { transform: `translate(${shake}px, ${-shake * 0.5}px)` });
      css(c.no, { transform: `translateX(${(1 - k(x, 0, 0.25, E.outExpo)) * -80}px)`, opacity: k(x, 0, 0.1) });
      css(c.word, { transform: `scale(${lerp(1.6, 1, k(x, 0.05, 0.35, E.outExpo))})`, opacity: k(x, 0.05, 0.15) });
      css(c.sub, { opacity: k(x, 0.5, 0.8), transform: `translateY(${(1 - k(x, 0.5, 0.9, E.outCubic)) * 20}px)` });
      css(c.icon, { 'stroke-dashoffset': String(200 * (1 - k(x, 0, 0.6, E.outCubic))) });
      if (c.slash) css(c.slash, { 'stroke-dashoffset': String(70 * (1 - k(x, 0.5, 0.75, E.outExpo))) });
      const out = k(x, 1.8, 2.2, E.inExpo);
      c.el.querySelector('.pl-text').style.transform = `translateX(${out * -30}%)`;
    }
    // watermark moment: local 6..10
    const w = lt - 6, won = w >= -0.05 && w < 4.05;
    wm.style.display = won ? '' : 'none';
    if (won) {
      fitOnce(ever, ctx.W * 0.9);
      const inP = k(w, 0, 0.35, E.outBack);
      css(pic, { transform: `translate(-50%, -50%) scale(${(0.85 + inP * 0.15) * (1 - k(w, 2, 2.3, E.outCubic) * 0.12)}) rotate(${(1 - inP) * -4 + Math.sin(w * 3) * 0.6}deg)`, opacity: Math.min(1, inP * 2) });
      css(cap, { opacity: k(w, 0.1, 0.4) * (1 - k(w, 1.8, 2.0)) });
      // Sloppo slides across 1.0..2.0, eating the watermark as he goes
      const eat = k(w, 1.0, 1.95, E.inOutCubic);
      const pw = V ? 940 : 1180, ph = pw * 0.625;
      css(mark, { 'clip-path': `inset(0 0 0 ${eat * 100}%)` });
      const size = V ? 230 : 250;
      const sx = ctx.W / 2 - pw / 2 + eat * pw - size / 2;
      const sy = ctx.H / 2 + ph / 2 - size * 0.86 - Math.abs(Math.sin(eat * Math.PI * 5)) * 30;
      css(sp.el, { width: size + 'px', height: size + 'px', left: sx + 'px', top: sy + 'px', opacity: w > 0.9 && w < 2.1 ? 1 : 0 });
      sp.pose(w, { open: w > 1 && w < 2 ? 0.5 + Math.abs(Math.sin(w * 18)) * 0.5 : 0, squash: punch(w, 1.0, 0.4) * 0.6, look: 1 });
      // the stamp
      const st = k(w, 2.0, 2.2, E.outExpo);
      css(stamp, { opacity: w >= 2.0 ? 1 : 0, transform: `translate(-50%, -50%) rotate(-6deg) scale(${lerp(2.6, 1, st) * (1 + punch(w, 2.2, 0.4) * 0.05)})` });
      css(ever, { opacity: k(w, 2.6, 2.9), transform: `translate(-50%, 0) translateY(${(1 - k(w, 2.6, 3.0, E.outCubic)) * 24}px)` });
      const shake = punch(w, 2.15, 0.45) * 18;
      css(wm, { transform: `translate(${shake}px, ${shake * 0.6}px)` });
    }
  };
  return s;
}
