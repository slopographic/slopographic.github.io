// One scene per app, game and experiment: the captured clip in a device frame, with the name,
// tagline and 2-3 callouts from SLOP_APPS. Scenes alternate sides; cuts are whip pans.
import { h, css, k, E, punch, letters, lerp, noise } from '../ease.js';
import { mediaOf } from '../plan.js';

const KIND = { app: 'App', game: 'Game', experiment: 'Experiment' };
const STATUS = { live: 'Live', beta: 'Beta', building: 'In development' };

function device(a, ctx) {
  const kind = a.kind === 'app' ? 'laptop' : a.kind === 'game' ? 'arcade' : 'browser';
  const dev = h('div', 'dev ' + kind);
  const scr = h('div', 'scr');
  const m = mediaOf(a, ctx.root);
  const tile = h('div', 'tile-gen', `<b>${a.name}</b><span>${STATUS[a.status] || ''}</span>`);
  scr.append(tile);
  let video = null;
  if (m.shot) {
    const img = new Image();
    img.className = 'shot'; img.alt = ''; img.src = m.shot;
    img.addEventListener('error', () => { img.remove(); if (video) video.remove(); video = null; });
    scr.append(img);
    video = ctx.video(m.clip, m.shot);
    video.className = 'clip';
    scr.append(video);
  }
  if (kind === 'browser') dev.append(h('div', 'bar', `<i></i><i></i><i></i><span class="url">slopographic.com/${a.path.replace(/^#/, '#')}</span>`));
  dev.append(scr);
  if (kind === 'laptop') dev.append(h('div', 'base'));
  return { dev, get video() { return video; } };
}

export function makeApp(seg, ctx) {
  const a = seg.app, V = ctx.vertical, flip = !V && seg.index % 2 === 1;
  const el = h('div', `scene app-scene k-${a.kind}${flip ? ' flip' : ''}`);
  const num = h('div', 'as-num wide outline', String(seg.index + 1).padStart(2, '0'));
  const txt = h('div', 'as-text');
  const idx = h('div', 'as-idx mono', `${String(seg.index + 1).padStart(2, '0')} / ${String(seg.of).padStart(2, '0')} — ${KIND[a.kind]}${a.status !== 'live' ? ` <b class="st ${a.status}">${STATUS[a.status]}</b>` : ''}`);
  const name = h('div', 'as-name cond');
  const words = a.name.split(' ').map((w) => { const s = h('span', 'w'); letters(s, w); return s; });
  words.forEach((w, i) => { name.append(w); if (i < words.length - 1) name.append(' '); });
  const chars = [...name.querySelectorAll('.ch')];
  const tag = h('div', 'as-tag serif', a.tagline);
  const feats = (a.features && a.features.length ? a.features.slice(0, 3) : [`${KIND[a.kind]} · ${STATUS[a.status]}`, 'Free, in your browser']).map((f) => h('div', 'as-feat', `<i></i><span>${f}</span>`));
  const fl = h('div', 'as-feats');
  fl.append(...feats);
  txt.append(idx, name, tag, fl);
  const d = device(a, ctx);
  const wrap = h('div', 'as-dev');
  wrap.append(d.dev);
  el.append(num, wrap, txt);
  let fitted = false;
  const D = seg.dur;
  const s = { el, pre: 0.35, post: 0.35 };
  s.hide = () => { if (d.video) ctx.setTime(d.video, 0, false); };
  s.render = (lt) => {
    if (!fitted) { fitted = true; let fs = V ? 130 : 150; name.style.fontSize = fs + 'px'; while ((name.scrollWidth > name.clientWidth + 2 || name.offsetHeight > fs * 0.9 * 2.05) && fs > 60) { fs -= 6; name.style.fontSize = fs + 'px'; } }
    const dir = flip ? -1 : 1;
    const inP = k(lt, -0.35, 0.35, E.outExpo);
    const outP = k(lt, D - 0.2, D + 0.35, E.inExpo);
    // whole-scene whip
    css(el, { transform: V ? `translateY(${(1 - inP) * 30 - outP * 40}%)` : `translateX(${((1 - inP) * 35 - outP * 45) * dir}%) skewX(${(outP * 8 - (1 - inP) * 6) * dir}deg)`, opacity: Math.min(1, inP * 1.4) * (1 - outP * 0.6) });
    // device: 3D swing in, slow drift, beat bump
    const drift = noise(lt * 0.6, seg.index + 3);
    const rot = V ? `rotateX(${(1 - inP) * 25 + 4}deg) rotateY(${drift * 4}deg)` : `rotateY(${(-14 + (1 - inP) * -30 + drift * 3) * dir}deg) rotateX(${4 + drift * 2}deg)`;
    const bump = punch(lt, 0, 0.45) * 0.03;
    css(d.dev, { transform: `${rot} scale(${(0.92 + inP * 0.08 + k(lt, 0, D) * 0.03) * (1 + bump)})` });
    if (d.video) ctx.setTime(d.video, lt + 0.35, true);
    // text: letters rise from a mask, one per 1/32 note
    chars.forEach((c, i) => { const t0 = -0.15 + i * 0.03, p = k(lt, t0, t0 + 0.35, E.outExpo); css(c, { transform: `translateY(${(1 - p) * 105}%)` }); });
    css(idx, { opacity: k(lt, -0.1, 0.2), transform: `translateX(${(1 - k(lt, -0.1, 0.3, E.outCubic)) * -30}px)` });
    css(tag, { opacity: k(lt, 0.2, 0.5), transform: `translateY(${(1 - k(lt, 0.2, 0.6, E.outCubic)) * 26}px)` });
    feats.forEach((f, i) => {
      const t0 = 0.5 + i * (D > 2.5 ? 0.5 : 0.25), p = k(lt, t0, t0 + 0.3, E.outBack);
      css(f, { opacity: Math.min(1, p * 2), transform: `translateX(${(1 - p) * -40 * (flip ? -1 : 1)}px) scale(${0.9 + p * 0.1 + punch(lt, t0 + 0.05, 0.3) * 0.04})` });
    });
    css(num, { transform: `translate(${lerp(6, -6, k(lt, -0.3, D + 0.3)) * dir}%, 0)`, opacity: 0.18 * inP });
  };
  return s;
}
