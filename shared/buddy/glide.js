// Gliding aside and remembering where he rests. A glide is a short eased move (no physics) to a spot
// that avoid.js picked. He then floats there ("float" mode) until his idle timer sends him back to a
// perch. Where he rests is kept per page in sessionStorage, so a reload leaves him where he was.
import { M, reduced, now } from './state.js';
import { easeOut as ease, glideTime } from '../roam/path.js';   // the paths both mascots move along

const KEY = 'slop.mascot.spot';
const idleSoon = () => now() + 4000 + Math.random() * 5000;

/** Glide from where he is to the feet point (x, y) in page coordinates. Reduced motion: at once. */
export function glideTo(x, y) {
  Object.assign(M, { perch: null, hop: null, vx: 0, vy: 0, vr: 0, rot: 0, nextIdle: idleSoon() });
  const dist = Math.hypot(x - M.x, y - M.y);
  if (reduced() || dist < 1) {
    Object.assign(M, { x, y, mode: 'float' });
    rememberSpot();
    return;
  }
  M.glide = { x0: M.x, y0: M.y, x1: x, y1: y, t: 0, T: glideTime(dist) };
  M.mode = 'glide';
}

/** One frame of the glide. Returns true when it has arrived (he now floats). */
export function stepGlide(dt) {
  const g = M.glide;
  g.t += dt;
  const u = Math.min(1, g.t / g.T), e = ease(u);
  M.x = g.x0 + (g.x1 - g.x0) * e;
  M.y = g.y0 + (g.y1 - g.y0) * e;
  M.squash = -0.25 * Math.sin(Math.PI * u);      // a little stretch while he moves
  M.sqv = 0;
  if (u < 1) return false;
  Object.assign(M, { glide: null, mode: 'float', squash: 0, sqv: 0 });
  rememberSpot();
  return true;
}

function store() {
  try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}

/** Remember where he is (page coordinates) for this page, for the rest of the browser session. */
export function rememberSpot() {
  try {
    const all = store();
    all[location.pathname] = { x: Math.round(M.x), y: Math.round(M.y) };
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch (e) { /* private window or blocked storage: he simply starts afresh */ }
}

/** The spot he rested on this page, or null. */
export function savedSpot() {
  const s = store()[location.pathname];
  return s && Number.isFinite(s.x) && Number.isFinite(s.y) ? s : null;
}
