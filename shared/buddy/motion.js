// Moving around: perching, hopping between perches, falling with physics, drag and throw,
// and leaping back into view when his perch scrolls away.
import { M, reduced, now, rand, clamp, setMood, navH, pageW, pageH, touchOnly } from './state.js';
import * as P from './perches.js';
import { size } from './look.js';
import { dust } from './fx.js';
import { hardLanding, addRage } from './rage.js';
import { stepBodies } from './bodies.js';
import { say } from './fx.js';
import { line } from './lines.js';
import { TIMING } from './timing.js';
import { stepGlide, rememberSpot } from './glide.js';
import { hopTime, hopLift, arcY } from '../roam/path.js';   // the hop's arc, shared with the mascot slot's roaming

const GRAVITY = 2600, OFFSCREEN_MS = 1500;
let dazeTok = 0;

/** Put him on a perch at once (no animation). */
export function place(p) {
  const pt = P.point(p);
  if (!pt) return false;
  Object.assign(M, { perch: p, mode: 'perched', x: pt.x, y: pt.y, vx: 0, vy: 0, rot: 0, vr: 0, offSince: 0 });
  pin(p);
  M.nextIdle = now() + rand(3500, 8000);
  return true;
}

/** Hop to a perch along an arc. Resolves true on landing, false if interrupted. */
export function hopTo(p, { high = 0, from = null } = {}) {
  cancelHop();
  return new Promise((resolve) => {
    const pt = P.point(p);
    if (!pt) { resolve(false); return; }
    if (reduced()) { place(p); resolve(true); return; }
    if (from) { M.x = from.x; M.y = from.y; }
    const dist = Math.hypot(pt.x - M.x, pt.y - M.y);
    const crouch = from || M.mode !== 'perched' ? 0 : 0.11;
    M.hop = { p, x0: M.x, y0: M.y, t: -crouch, T: hopTime(dist), lift: hopLift(dist, high), resolve };
    M.mode = 'hop';
    M.perch = null;
    M.rot = 0;
  });
}
export function cancelHop() {
  if (!M.hop) return;
  const r = M.hop.resolve;
  M.hop = null;
  r(false);
}

function stepHop(dt) {
  const h = M.hop;
  h.t += dt;
  if (h.t < 0) { M.squash = 0.45; M.sqv = 0; return; }           // crouch before the jump
  const pt = P.point(h.p);
  if (!pt) { M.hop = null; fall(); h.resolve(false); return; }  // the target vanished mid-air
  const u = Math.min(1, h.t / h.T);
  M.x = h.x0 + (pt.x - h.x0) * u;
  M.y = arcY(h.y0, pt.y, h.lift, u);
  M.squash = u < 0.4 ? -0.28 * (1 - u / 0.4) : 0;                // stretch on take-off
  M.sqv = 0;
  if (u >= 1) { M.hop = null; land(h.p, 900); h.resolve(true); }
}

function land(p, impact) {
  const leftPage = !p && M.thrown;   // a throw that ended on the page floor
  Object.assign(M, { perch: p, mode: 'perched', vx: 0, vy: 0, rot: 0, vr: 0, sqv: 0, offSince: 0, flail: false, thrown: false });
  const pt = p && P.point(p);
  if (pt) { M.x = pt.x; M.y = pt.y; pin(p); rememberSpot(); }
  M.squash = clamp(impact / 2200, 0.25, 0.75);
  M.nextIdle = now() + rand(3500, 8000);
  if (M.hard || impact > 2000) hardLanding();
  else if (impact > 0) setMood('land', 320);
  M.hard = false;
  if (!reduced()) dust(M.x, M.y, clamp(impact / 1400, 0.4, 1.4));
  if (leftPage) fellOff();
}

/**
 * He was thrown off the page: dizzy for a few seconds (stars, spiral eyes, a wobble), then he jumps
 * back up onto a perch. A second fall within a minute is an anger moment (addRage).
 */
function fellOff() {
  const tok = ++dazeTok, t = now();
  M.offs = M.offs.filter((x) => t - x < 60000);
  M.offs.push(t);
  M.daze = t + TIMING.dazeMs;
  if (M.offs.length >= 2) { M.offs = []; addRage(1, 'offpage'); }
  else { setMood('dizzy', TIMING.dazeMs); say(line('dizzy'), TIMING.dazeMs); }
  setTimeout(() => {
    if (tok !== dazeTok) return;
    M.daze = 0;
    M.rot = 0;
    if (M.visible && M.mode === 'perched' && !M.perch) leapIn();
  }, TIMING.dazeMs);
}

/** Remember the exact spot on the element he stands on. */
function pin(p) { p.off = M.x - (p.el.getBoundingClientRect().left + scrollX); }

/** Let go: he falls from where he is. `flail` when the floor vanished under him (not a throw). */
export function fall(vx = 0, vy = 0, flail = false) {
  Object.assign(M, { mode: 'air', perch: null, vx, vy, flail, vr: 0, thrown: !flail && Math.hypot(vx, vy) > 300 });
  M.hop = null;
  if (flail) say(line('fall'), 1100);
}

function stepAir(dt) {
  const y0 = M.y, s = size(), half = s * 0.55, W = pageW();
  M.vy += GRAVITY * dt;
  M.vx *= Math.pow(0.55, dt);
  M.x += M.vx * dt;
  M.y += M.vy * dt;
  if (reduced()) M.rot = 0;
  else if (M.flail) M.rot = Math.sin(performance.now() / 45) * 0.28;   // arms-everywhere wobble
  else M.rot += M.vr * dt;
  if (M.x < half) { M.x = half; M.vx = Math.abs(M.vx) * 0.5; M.vr *= -0.6; }
  if (M.x > W - half) { M.x = W - half; M.vx = -Math.abs(M.vx) * 0.5; M.vr *= -0.6; }
  if (M.y < s && M.vy < 0) { M.y = s; M.vy = -M.vy * 0.3; }
  if (M.vy > 0) {
    const hit = P.landing(M.x, y0, M.y);
    if (hit) { land({ el: hit.el, frac: hit.frac }, M.vy); return; }
  }
  const floor = pageH() - 2;
  if (M.y >= floor) { M.y = floor; land(null, M.vy); }
}

function stepPerched(t) {
  if (t < M.daze) { M.rot = Math.sin(t / 110) * 0.2; return; }   // dizzy: wobbling, no hops yet
  if (M.perch) {
    const pt = P.point(M.perch);
    if (!pt || P.underStrip(pt)) {
      // A removed or swallowed perch drops him; a hidden one (view switch) sends him somewhere visible;
      // one that scrolled under the consent strip (its buttons must stay clickable) is left for a clear spot.
      if (!pt && (P.gone.has(M.perch.el) || !M.perch.el.isConnected)) fall(0, 0, true);
      else { M.perch = null; if (!leapIn()) M.offSince = t; }
      return;
    }
    if (!P.solidAt(M.perch.el, pt.x)) { fall(0, 0, true); return; }   // eaten or holed under his feet
    M.x = pt.x;
    M.y = pt.y;
  }
  const vis = M.y > scrollY + navH() + 6 && M.y - size() * 0.7 < scrollY + innerHeight;
  if (vis) M.offSince = 0;
  else if (!M.offSince) M.offSince = t;
  else if (t - M.offSince > OFFSCREEN_MS) { M.offSince = t; leapIn(); return; }
  if (vis && !M.chaos && !reduced() && !M.hover && !touchOnly() && t > M.nextIdle) idleHop();
}

/** Floating in the open (after a glide aside): he waits there, then goes back to a perch. Off screen for a moment, he leaps back. */
function stepFloat(t) {
  const vis = M.y > scrollY + navH() + 6 && M.y - size() * 0.7 < scrollY + innerHeight;
  if (!vis) {
    if (!M.offSince) M.offSince = t;
    else if (t - M.offSince > OFFSCREEN_MS) { M.offSince = 0; leapIn(); }
    return;
  }
  M.offSince = 0;
  if (!M.chaos && !reduced() && !M.hover && !touchOnly() && t > M.nextIdle) idleHop();
}

function idleHop() {
  M.nextIdle = now() + rand(4500, 9500);
  if (M.perch && Math.random() < 0.3) hopTo({ el: M.perch.el, frac: 0.1 + Math.random() * 0.8 });
  else { const p = P.pick({ exclude: M.perch && M.perch.el }); if (p) hopTo(p); }
}

/** Leap onto a visible perch, entering from the edge of the screen he went out of. */
export function leapIn() {
  const p = P.pick({ near: false });
  if (!p) return false;
  if (reduced()) return place(p);
  const pt = P.point(p), top = scrollY + navH(), bottom = scrollY + innerHeight, s = size();
  const x = clamp(pt.x + rand(-140, 140), s, pageW() - s);
  let from = null;
  if (M.mode === 'hidden' || M.y < top + 6) from = { x, y: top - 8 };
  else if (M.y - s * 0.7 > bottom) from = { x, y: bottom + s + 10 };
  hopTo(p, { from, high: from ? 30 : 0 });
  return true;
}

/* ---------- drag and throw ---------- */
/** Seconds for him to close most of the gap to the pointer (about 95% after one second): he lags behind your hand. */
const DRAG_LAG = 0.33;
export function startDrag() {
  cancelHop();
  Object.assign(M, { mode: 'drag', perch: null, samples: [], vx: 0, vy: 0, vr: 0, tx: M.x, ty: M.y });
}
/** Records where the pointer is. He does not jump there: followDrag eases him over (see DRAG_LAG). */
export function dragTo(x, y, t) {
  const s = M.samples;
  if (s.length) { const [t0, x0] = s[s.length - 1]; const v = (x - x0) / Math.max(8, t - t0) * 1000; M.rot += (clamp(v * 0.00035, -0.45, 0.45) - M.rot) * 0.3; }
  M.tx = x;
  M.ty = y;
  s.push([t, x, y]);
  while (s.length > 2 && t - s[0][0] > 90) s.shift();
}
/** Each frame while carried: ease his position towards the pointer, so he trails behind the hand. */
export function followDrag(dt) {
  if (M.mode !== 'drag' || M.tx === undefined) return;
  const k = 1 - Math.exp(-dt / DRAG_LAG);
  M.x += (M.tx - M.x) * k;
  M.y += (M.ty - M.y) * k;
}
/** Release a drag: throw with the pointer's recent velocity. Returns the throw speed. */
export function release(t, cancel = false) {
  const s = M.samples;
  let vx = 0, vy = 0;
  if (!cancel && s.length > 1 && t - s[s.length - 1][0] < 80) {
    const a = s[0], b = s[s.length - 1], d = Math.max(16, b[0] - a[0]) / 1000;
    vx = (b[1] - a[1]) / d;
    vy = (b[2] - a[2]) / d;
  }
  const sp = Math.hypot(vx, vy), k = sp > 3200 ? 3200 / sp : 1;
  fall(vx * k, vy * k);
  M.vr = reduced() ? 0 : clamp(vx * k * 0.004, -12, 12);
  M.hard = sp > 1900;
  return sp * k;
}

/** One simulation step. */
export function step(dt, t) {
  if (reduced()) { M.squash = 0; M.sqv = 0; }
  else if (M.mode !== 'hop' && M.mode !== 'glide') {
    M.sqv += (-340 * M.squash - 11 * M.sqv) * dt;               // wobbly jelly spring
    M.squash += M.sqv * dt;
  }
  stepBodies(dt);
  if (M.mode === 'perched') stepPerched(t);
  else if (M.mode === 'hop') stepHop(dt);
  else if (M.mode === 'air') stepAir(dt);
  else if (M.mode === 'glide') stepGlide(dt);
  else if (M.mode === 'float') stepFloat(t);
}
