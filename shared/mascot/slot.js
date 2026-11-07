// The mascot slot: a profile's own mascot in place of the built-in buddy. A white-label build whose profile sets
// "mascot": { "overlay": "<folder>" } copies that folder to brand/mascot/ and turns the buddy loader (shared/buddy/boot.js)
// to this module, which has the engine's interface (start, show, toggleHud). The overlay is two ES modules:
//   brand/mascot/mascot.js   export const name ('Acme Bot'), animations (['hello', ...]), moments? ({ done: 'bounce' })
//                            export function create(el, { reduce }) -> { play(name, { loop, side }) -> Promise, dispose() }
//                            play() stops what runs and starts name; its promise settles when name ends or is cut off.
//                            loop: hold the animation (idle, a long task) until the next play. create may throw (no
//                            WebGL): the slot then shows the icon, still.
//   brand/mascot/icon.js     export const name; export function svg(size, small) -> SVG markup with width and height
//                            size (no DOM: the build also renders the favicon
//                            and the app icons from it). small: the 16 and 24 px drawing.
// The slot plays an animation for each moment (moments.js): greeting when shown, working / done / error from the page's
// busy regions (SlopFlow tiles, aria-busy), idle -> sleep after a minute without input and wake on the next one, point
// when a page asks (document event 'mascot-moment', detail { moment: 'point', target }) or at [data-mascot-point] after
// the greeting. Pages and apps may send any moment the same way.
// The mascot is a button (ui.js): a helper menu, drag to move, and optional look() / react() hooks on the instance. It is
// the only presence while shown (the buddy's toggle steps aside, shared/buddy/boot.js); in a plain-tone build it is drawn
// smaller (SCALE). The profile may size it ("mascot": { "size": { "desktop": <px tall>, "phone": <px> } }: the stage is
// then laid out at that size, interact.js dims()) and let it roam the page ("roam": "float" | "hop" | true; roam.js);
// both come in through the profile markers below. Tests: tests/buddy/roam.test.html (size and roaming), tests/node/mascot-moments.test.mjs, tests/node/mascot-interact.test.mjs (the logic),
// tests/buddy/slot.test.html (the slot on a page).
import { animationFor, stateOf, workTracker, idleTracker, sideOf, MOMENTS, DONE_AFTER_MS } from './moments.js';
import { attach } from './ui.js';
import { dims } from './interact.js';
import { createRoam, styleOf } from './roam.js';

export const OVERLAY = new URL('../../brand/mascot/', import.meta.url).href;
const W = 112, H = 136;
/** The drawing's scale: calm and small in a plain-tone build (shared/theme/theme.js), full size otherwise. */
export const SCALE = typeof window !== 'undefined' && window.SlopTheme && window.SlopTheme.tone === 'plain' ? 0.62 : 1;
const CALM = SCALE < 1;
/** The profile's options (white-label build markers; none here): its size on a desktop and a phone (px tall), roaming. */
export const OPTIONS = { size: { desktop: /*profile:mascotDesktop*/null, phone: /*profile:mascotPhone*/null }, roam: /*profile:mascotRoam*/'' };
let SW = 0, SH = 0;
const stageCss = (d) => (d.real ? `width:${d.w}px;height:${d.h}px;transform:none` : `width:${W}px;height:${H}px;transform:scale(${d.k})`);
const css = ({ desk, phone }) => `.mascot-slot{position:fixed;width:${desk.w}px;height:${desk.h}px;padding:0;margin:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer;touch-action:none;
-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;transition:opacity .3s;translate:0 calc(var(--consent-h,0px)*-1);
--ms-safe-t:env(safe-area-inset-top,0px);--ms-safe-r:env(safe-area-inset-right,0px);--ms-safe-b:env(safe-area-inset-bottom,0px);--ms-safe-l:env(safe-area-inset-left,0px)}
.mascot-slot[hidden]{display:none}.mascot-slot.is-dragging{cursor:grabbing}
.mascot-slot:focus-visible{outline:2px solid var(--sl-accent,Highlight);outline-offset:2px;border-radius:12px}
.mascot-slot .ms-stage{position:absolute;right:0;bottom:0;${stageCss(desk)};transform-origin:100% 100%;pointer-events:none}
.mascot-slot .ms-stage>*{width:100%;height:100%;display:block}
.mascot-slot .ms-icon{display:grid;place-items:end center}.mascot-slot .ms-icon svg{width:64px;height:64px}
.ms-say{position:fixed;z-index:2001;max-width:min(300px,calc(100vw - 32px));margin:0;padding:10px 12px;border:1px solid var(--sl-border,GrayText);border-radius:10px;
background:var(--sl-surface,Canvas);color:var(--sl-text,CanvasText);font:14px/1.4 var(--sans,system-ui);box-shadow:0 8px 24px rgba(0,0,0,.25)}.ms-say[hidden]{display:none}
${phone.h !== desk.h ? `@media (max-width:700px){.mascot-slot{width:${phone.w}px;height:${phone.h}px}.mascot-slot .ms-stage{${stageCss(phone)}}}` : ''}
@media print{.mascot-slot,.ms-say{display:none}}`;

let mod = null, inst = null, dock = null, stage = null, ui = null, cfg = null, visible = false, holding = null, base = OVERLAY, roamer = null;
const media = (q) => typeof matchMedia === 'function' && matchMedia(q).matches;
/** Reduced motion (cfg.reduce: a test's override); a phone or a touch screen (it stays docked there). */
const reduce = () => (cfg && cfg.reduce != null ? !!cfg.reduce : media('(prefers-reduced-motion: reduce)'));
const phone = () => media('(max-width: 700px), (pointer: coarse)');

/** Loads the overlay's icon module (the toggle button shows it before the mascot itself loads). */
export const loadIcon = () => import(base + 'icon.js');

/** Plays the animation for a moment, in place of the one running. Returns false when the overlay has none for it. A
 * looping animation (idle, a task still running) holds until the next moment. */
export function moment(name, detail = {}) {
  const anim = mod && inst && animationFor(name, mod);
  if (!anim || !visible) return false;
  const loop = name === 'idle' || (name === 'working' && work && work.busy > 0);
  const opts = { loop, side: detail.side || 0 };
  holding = loop ? name : null;
  try { Promise.resolve(inst.play(anim, opts)).catch(() => {}); } catch (e) { /* an overlay error never reaches the page */ }
  document.dispatchEvent(new CustomEvent('mascot-played', { detail: { moment: name, animation: anim } }));
  return true;
}

/** Points at a page element: the overlay turns towards it (side -1 left, 1 right of the mascot). */
export function point(target) {
  if (!target || !dock || !target.getBoundingClientRect) return false;
  return moment('point', { side: sideOf(dock.getBoundingClientRect(), target.getBoundingClientRect()) });
}

let work = null, idle = null, observer = null, timer = 0;
function watch() {
  work = workTracker((m) => moment(m));
  idle = idleTracker((m) => moment(m));
  // aria-busy taken off (removeAttribute) ends the region too; a region busy long enough starts 'working' on a tick
  const seen = (el, attr) => {
    const s = stateOf(el) || (attr === 'aria-busy' ? 'end' : null);
    if (!s) return;
    work.update(el, s, s === 'run' && el.classList.contains('sflow'));
    if (s === 'run') setTimeout(() => work.tick(Date.now()), DONE_AFTER_MS + 50);
  };
  observer = new MutationObserver((list) => { for (const r of list) if (r.type === 'attributes') seen(r.target, r.attributeName); });
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-state', 'aria-busy'] });
  const poke = () => idle.activity(Date.now());
  for (const t of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(t, poke, { passive: true, capture: true });
  timer = setInterval(() => { idle.tick(Date.now()); work.tick(Date.now()); }, 5000);
  document.addEventListener('mascot-moment', (e) => {
    const d = e.detail || {};
    if (d.moment === 'point') point(d.target); else if (d.moment && MOMENTS[d.moment]) moment(d.moment, d);
  });
}

/** The engine interface (shared/buddy/boot.js calls these). cfg.overlay: another overlay folder URL; cfg.size, cfg.roam,
 * cfg.reduce: the profile's options and reduced motion, for tests. */
export async function start(c) {
  cfg = c || {};
  if (cfg.overlay) base = new URL(cfg.overlay, location.href).href;
  if (dock) return;
  const d = dims(cfg.size !== undefined ? cfg.size : OPTIONS.size, SCALE);
  SW = d.desk.w; SH = d.desk.h;
  if (!document.getElementById('mascot-slot-css')) {
    const st = document.createElement('style'); st.id = 'mascot-slot-css'; st.textContent = css(d); document.head.append(st);
  }
  dock = document.createElement('button');
  dock.className = 'mascot-slot';
  stage = document.createElement('span');
  stage.className = 'ms-stage';
  dock.append(stage);
  Object.assign(dock.style, { zIndex: String((cfg.z || 900) + 1) });
  dock.hidden = true;
  document.body.append(dock);
  mod = await import(base + 'mascot.js');
  try { inst = mod.create(stage, { reduce: reduce() }); } catch (e) { inst = null; }
  if (!inst) {                                    // no 3D here: the flat icon stands in
    const icon = await loadIcon().catch(() => null);
    if (icon) { const s = document.createElement('div'); s.className = 'ms-icon'; s.innerHTML = icon.svg(64, false); stage.append(s); }
  }
  dock.dataset.mascot = mod.name || '';
  ui = attach(dock, { name: mod.name || 'Helper', size: { w: SW, h: SH }, inst: () => inst, moment: (m) => moment(m), reduce,
    hide: () => (typeof cfg.hide === 'function' ? cfg.hide() : show(false)), settle: () => roamer && roamer.settle() });
  roamer = createRoam(dock, stage, { style: styleOf(cfg.roam !== undefined ? cfg.roam : OPTIONS.roam), calm: CALM, reduce, phone, ui,
    hook: (fn, ...args) => { if (inst && typeof inst[fn] === 'function') { try { inst[fn](...args); } catch (e) { /* an overlay error never reaches the page */ } } } });
  if (visible) roamer.run(true);
  window.MascotSlot = { state, parts, moment, show };   // a debug and test hook, like the buddy's
  watch();
}

export function show(v) {
  visible = !!v;
  if (!dock) return;
  dock.hidden = !visible;
  if (roamer) roamer.run(visible);
  if (!visible) return;
  if (ui) ui.place();
  moment('greeting');
  const target = document.querySelector('[data-mascot-point]');
  if (target) setTimeout(() => point(target), 2600);
}

export function toggleHud() { /* the slot has no HUD */ }

/** For tests: the state of the slot. */
export const state = () => ({ visible, name: mod && mod.name, live: !!inst, holding, busy: work ? work.busy : 0, asleep: idle ? idle.asleep : false });
export function stop() { clearInterval(timer); if (observer) observer.disconnect(); if (roamer) roamer.dispose(); if (ui) ui.dispose(); if (inst && inst.dispose) inst.dispose(); }
/** For tests: the dock (the mascot's button) and the interaction layer. */
export const parts = () => ({ dock, stage, ui, roam: roamer, size: { w: SW, h: SH } });
