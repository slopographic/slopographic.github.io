// RAGE: hard drops and throws fill a rage meter that drains over time.
// 1st hard landing: dizzy, "OUCH!". 2nd: annoyed. 3rd: RAGE for about 15 s (red, shaking,
// angry brows and a frown, steam) and chaos runs on its own until he calms down. Reduced motion: no automatic rage.
import { M, now, reduced, setMood, changed, rand } from './state.js';
import { say } from './fx.js';
import { line } from './lines.js';
import { size } from './look.js';
import { CFG } from './config.js';
import { save } from './store.js';
import { TIMING } from './timing.js';

export const RAGE_MS = TIMING.rageMs;
const DRAIN = TIMING.drainPerSec;   // meter units per second (one hard drop wears off in 4 s)
/** At or above this he is MAD: the meter stops draining until you give him something (care.js). */
export const MAD = 1.5;
let setChaos = () => {};
let shown = -1;
/** chaos.js hands over its toggle here (avoids an import cycle). */
export function bindChaos(fn) { setChaos = fn; }

/** Rage meter 0..1 for the HUD. */
export const rageLevel = () => (M.raging ? 1 : Math.min(1, M.rage / 3));

/** Called by motion.js after a hard throw or a long drop. */
export const hardLanding = () => addRage(1, 'ouch');

/** Add to the rage meter. 1st step: dizzy (with a `kind` line); 2nd: annoyed; 3rd: RAGE. */
export function addRage(n = 1, kind = 'ouch') {
  M.glad = 0;                          // a bad moment ends a happy one at once
  if (M.raging) { M.raging = Math.max(M.raging, now() + 4000); say(line('rage'), 1400); setMood('dizzy', 900); return; }
  M.rage = Math.min(3, M.rage + n);
  if (M.rage > 2.5 && !reduced()) enrage();
  else if (M.rage > MAD) { M.rage = Math.min(M.rage, 2.5); setMood('annoyed', 3000); say(line('annoyed'), 2400); }
  else if (kind === 'poke' || kind === 'offpage') { setMood('annoyed', 2000); say(line(kind), 1800); }
  else { setMood('dizzy', 2400); say(line(kind), 1500); }
  persistRage();
  changed();
}
export function persistRage() { save({ rage: +M.rage.toFixed(2) }); }

export function enrage(ms = RAGE_MS) {
  M.raging = now() + ms;
  M.rage = 3;
  M.el.classList.add('is-rage');
  M.squash = 0.85;
  say(line('rage'), 2200);
  if (!M.chaos && CFG.autoChaos) { M.rageChaos = true; setChaos(true, { quiet: true }); }
  changed();
}

export function calmRage() {
  if (!M.raging) return;
  M.raging = 0;
  M.rage = 2;                          // the storm is over, but he stays MAD until you give him something
  M.el.classList.remove('is-rage');
  if (M.rageChaos) { M.rageChaos = false; setChaos(false, { quiet: true }); }
  setMood('land', 600);
  say(line('stillmad'), 2400);
  persistRage();
  changed();
}

/** Per-frame: drain the meter, end rage on time, puff steam while raging. */
export function tickRage(dt, t) {
  if (M.raging) {
    if (t > M.raging) calmRage();
    else if (!reduced() && Math.random() < dt * 7) steam();
    return;
  }
  if (M.rage > 0 && M.rage < MAD) { M.rage = Math.max(0, M.rage - DRAIN * dt); if (M.rage === 0) persistRage(); }
  const pct = Math.round(rageLevel() * 20);
  if (pct !== shown) { shown = pct; changed(); }
}

function steam() {
  const s = size(), side = Math.random() < 0.5 ? -1 : 1;
  const p = document.createElement('span');
  p.className = 'sloppo-fx sloppo-steam';
  p.setAttribute('aria-hidden', 'true');
  p.style.left = M.x + side * s * rand(0.25, 0.4) + 'px';
  p.style.top = M.y - s * rand(0.75, 0.9) + 'px';
  M.layer.append(p);
  const a = p.animate([
    { transform: 'scale(.3)', opacity: 0.9 },
    { transform: `translate(${side * rand(14, 34)}px, ${-rand(40, 70)}px) scale(1.6)`, opacity: 0 },
  ], { duration: 700 + rand(0, 300), easing: 'ease-out' });
  a.onfinish = () => p.remove();
}
