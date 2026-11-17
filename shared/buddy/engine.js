// Sloppo the buddy: the engine. He perches on headings, cards, toolbars and panels, hops around,
// can be petted, dragged and thrown, levels up (with hats), has RAGE and an "Unleash" chaos mode
// with a full undo, physics, tips, snacks and an AI power-up. Pages load it through boot.js.
import { M, reduced, rand, listeners, navH, changed, now, pageH, cheer } from './state.js';
import { load, levelFor } from './store.js';
import { setup, draw, size, face, CW, CH, BASE } from './look.js';
import { step, place, hopTo, leapIn, fall, followDrag } from './motion.js';
import * as P from './perches.js';
import { bindInput, pet } from './input.js';
import { mountHud, placeHud } from './hud.js';
import { setChaos, restore, act } from './chaos.js';
import { TIMING } from './timing.js';
import { tickMood, askForCandy } from './mood.js';
import { makeCandy, clearCandy } from './candy.js';
import { gain } from './levels.js';
import { say, placeBubble, hush } from './fx.js';
import { count } from './journal.js';
import { count as bodyCount } from './bodies.js';
import { impact } from './blast.js';
import { line, tr } from './lines.js';
import { tickRage, hardLanding, enrage, calmRage } from './rage.js';
import { set3d, renderer3d } from './view3d.js';
import { CFG, configure } from './config.js';
import * as tips from './tips.js';
import * as power from './power.js';
import * as care from './care.js';
import * as treats from './treats.js';
import { bindAvoid, restoreSpot } from './avoid.js';

function el(tag, cls, attrs = {}) {
  const n = document.createElement(tag);
  n.className = cls;
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function build() {
  for (const f of ['buddy.css', 'extras.css']) {
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href.endsWith('/shared/buddy/' + f))) continue;
    document.head.append(el('link', '', { rel: 'stylesheet', href: new URL('./' + f, import.meta.url).href }));
  }
  const layer = el('div', 'sloppo-layer' + (CFG.home ? '' : ' in-app'));
  layer.style.zIndex = CFG.z;
  const m = el('div', 'sloppo', { hidden: '' });
  m.style.width = CW + 'px';
  m.style.height = CH + 'px';
  const stars = el('div', 'sloppo-stars', { 'aria-hidden': 'true' });
  stars.innerHTML = '<i>✦</i><i>✦</i><i>✦</i>';
  const bubble = el('div', 'sloppo-say', { role: 'status', 'aria-live': 'polite' });
  const hit = el('div', 'sloppo-hit', { role: 'button', tabindex: '0', 'aria-label': tr('ui.buddy.hit_aria') });
  const svg = setup(m);
  m.append(stars, bubble, hit);
  layer.append(m);
  document.body.append(layer);
  Object.assign(M, { layer, el: m, svg, hit, bubble, stars });
}

/** Size the hit box and dizzy stars to his body (he grows with each level). */
function fit() {
  const s = size();
  Object.assign(M.hit.style, { left: CW / 2 - s * 0.62 + 'px', top: BASE - s * 1.16 + 'px', width: s * 1.24 + 'px', height: s * 1.18 + 'px' });
  Object.assign(M.stars.style, { top: BASE - s * 1.2 + 'px', width: s * 1.1 + 'px', marginLeft: -s * 0.55 + 'px' });
}

/* ---------- idle chatter ---------- */
let nextChat = now() + TIMING.chatterMin;
function chatter(t) {
  if (t < nextChat) return;
  nextChat = t + TIMING.chatterMin + Math.random() * (TIMING.chatterMax - TIMING.chatterMin);
  const vis = M.y > scrollY && M.y < scrollY + innerHeight;
  if (!vis || M.mode !== 'perched' || M.chaos || M.raging) return;
  if (!tips.maybeTip() && !power.maybeComment()) say(line(M.rage > 1.4 ? 'annoyed' : 'idle'), 1600);
}

/* ---------- apps: never in the way ---------- */
// While you press, drag or paint anywhere else (and in games while you play) he turns into a ghost
// that ignores the pointer, and in games he pauses.
function guard() {
  const own = (e) => e.target.closest && e.target.closest('.sloppo-layer, .sloppo-hud, .buddy-toggle');
  document.addEventListener('pointerdown', (e) => { if (!own(e)) { M.ghost = true; M.busyUntil = now() + 4000; } }, true);
  const up = () => { if (M.ghost) setTimeout(() => { M.ghost = false; }, 350); };
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
  document.addEventListener('keydown', (e) => { if (!own(e)) M.busyUntil = now() + 4000; }, true);
}
const paused = (t) => CFG.kind === 'game' && t < (M.busyUntil || 0);

let last = 0, lastDraw = -Infinity, visible = false;
const DRAW_MOVE_MS = 1000 / 30, DRAW_REST_MS = 1000 / 12;
function frame(t) {
  const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
  last = t;
  if (visible && M.mode !== 'hidden') {
    M.layer.style.height = pageH() + 'px';
    const hold = paused(t);
    M.layer.classList.toggle('is-ghost', !CFG.home && (M.ghost || hold));
    if (!hold) {
      followDrag(dt);
      step(dt, t);
      tickRage(dt, t);
      tickMood(dt, t);
      care.tick(dt, t);
      chatter(t);
    }
    M.el.style.transform = `translate3d(${(M.x - CW / 2).toFixed(1)}px, ${(M.y - BASE).toFixed(1)}px, 0)`;
    // The goo filter re-rasterises his SVG on every change, the costliest per-frame work on the page. He is redrawn
    // at 30 fps while he moves and 12 fps while he rests (his breathing is slow); the movement itself is per frame.
    const resting = M.mode === 'perched' || M.mode === 'float';
    if (t - lastDraw >= (resting ? DRAW_REST_MS : DRAW_MOVE_MS) && M.y + 40 > scrollY && M.y - CH < scrollY + innerHeight) {
      lastDraw = t;
      const r3d = renderer3d();
      if (r3d) r3d.render(M, size(), face(t), t, reduced());
      else draw(t);
    }
    M.el.classList.toggle('is-dizzy', M.mood === 'dizzy' && t < M.moodUntil);
    M.el.classList.toggle('is-held', M.mode === 'drag');
    placeBubble();
    placeHud();
  }
  requestAnimationFrame(frame);
}

/** Appear: onto the intro ledge or the title on the homepage, any visible perch in apps. */
function spawn() {
  M.el.hidden = false;
  if (!restoreSpot()) arrive();              // back where he rested on this page, or a fresh arrival
  // his hello, unless he is already saying something (a page's say() in the meantime keeps its own time)
  setTimeout(() => { if (!M.bubble.classList.contains('show')) say(M.xp ? line('hello') : tr('ui.buddy.say.hello_1'), 2200); }, 900);
  if (!CFG.home) setTimeout(() => tips.maybeTip(true), 6000);
}

/** A fresh arrival: hop onto the intro ledge or title (homepage) or any visible perch. */
function arrive() {
  const first = (CFG.home ? ['.stage-ledge', '#intro-title', '.page-title'] : [])
    .map((s) => document.querySelector(s))
    .find((n) => { const r = n && P.rectOf(n); return r && P.inView(r); });
  const p = first ? { el: first, frac: 0.35 + Math.random() * 0.3 } : P.pick({ near: false });
  if (!p) {                                   // nothing to sit on: the bottom of the window
    Object.assign(M, { mode: 'air', perch: null, x: innerWidth - 120 + scrollX, y: scrollY + innerHeight - 140, vx: 0, vy: 0 });
  } else if (reduced()) place(p);
  else {
    const pt = P.point(p);
    hopTo(p, { from: { x: pt.x + rand(-60, 60), y: scrollY + navH() - 10 }, high: 20 });
  }
}

let started = false, hud = null;
/** Build him once (options: see config.js). */
export function start(opts = {}) {
  if (started) return window.SlopBuddy;
  started = true;
  configure(opts);
  Object.assign(M, load());
  M.level = levelFor(M.xp);
  build();
  fit();
  bindInput(M.hit);
  bindAvoid();
  listeners.add(fit);
  hud = mountHud({ onUnleash: () => setChaos(!M.chaos), onRestore: restore, on3d: () => set3d(!M.is3d), onAsk: () => power.ask() });
  care.mount(hud);
  power.watch();
  if (!CFG.home) guard();
  requestAnimationFrame((t) => { last = t; frame(t); });
  const api = {
    M, pet, gain, act, restore, leapIn, hopTo, face, impact, perches: P, bodies: () => bodyCount(), show, toggleHud, tips, power, care, treats,
    fling: (vx, vy) => fall(vx, vy), cheer, askForCandy, candy: { make: makeCandy, clear: clearCandy },
    repair: () => restore({ animate: true }),
    unleash: () => setChaos(true), calm: () => setChaos(false), bonk: hardLanding, enrage, calmRage, set3d, say,
    get level() { return M.level; }, get xp() { return M.xp; }, get hat() { return M.hat; }, get journal() { return count(); },
    get visible() { return visible; },
  };
  window.SlopBuddy = api;
  window.SlopMascot = api;                     // old name, used by the homepage tests
  return api;
}

/** Show or hide him. Hiding undoes any chaos first, so the page is always left as it was. */
export function show(on) {
  on = !!on;
  if (on === visible) return;
  visible = on;
  M.visible = on;
  if (!on) {
    if (count() || M.chaos || M.raging) restore();
    hush();
    clearCandy();
    M.layer.hidden = true;
    hud.hidden = true;
    M.mode = 'hidden';
    M.el.hidden = true;
  } else {
    M.layer.hidden = false;
    changed();
    setTimeout(spawn, reduced() ? 0 : 400);
  }
  document.dispatchEvent(new CustomEvent('sloppo:visible', { detail: on }));
}

/** Apps: the HUD stays folded away until asked for. */
export function toggleHud(force) {
  M.hudOpen = force == null ? !M.hudOpen : !!force;
  changed();
}
