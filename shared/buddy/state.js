// Shared state for the homepage mascot. Every mascot module imports M and these helpers.
export const M = {
  x: 0, y: 0, vx: 0, vy: 0,   // feet position in page coordinates, and velocity (px/s)
  rot: 0, vr: 0,               // spin while thrown (rad, rad/s)
  squash: 0, sqv: 0,           // jelly squash-and-stretch spring (>0 wide, <0 tall)
  mode: 'hidden',              // hidden | perched | hop | air | drag | glide (a short move aside) | float (rests in the open)
  glide: null,                 // { x0, y0, x1, y1, t, T } while gliding (glide.js)
  perch: null,                 // { el, frac } or null (the page floor)
  hop: null, samples: [],
  mood: '', moodUntil: 0,      // love | dizzy | chomp | land
  offSince: 0, nextIdle: 0, hard: false, hover: false, pets: 0,
  thrown: false, daze: 0,      // a throw in flight (ends on the page floor = left the page); dizzy until this time
  glad: 0,                     // happiness 0..1 from good moments, fades fast (mood.js)
  happyAt: 0, askAt: 0, pokes: [], offs: [],   // mood bookkeeping (mood.js, motion.js, input.js)
  chaos: false, token: 0,      // token changes when chaos stops, so running actions bail out
  rage: 0, raging: 0, rageChaos: false, // rage meter (0..3) and when RAGE ends (ms)
  is3d: false,
  xp: 0, level: 1, hat: null,
  layer: null, el: null, svg: null, hit: null, bubble: null,
};

const mq = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');
/** Touch first: he does not wander on his own, and a touch never moves him. */
export const touchOnly = () => coarse.matches;
export const reduced = () => mq.matches;
export const now = () => performance.now();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const navH = () => { const n = document.querySelector('.nav'); return n ? n.getBoundingClientRect().bottom : 0; };
export const pageW = () => document.documentElement.clientWidth;
// The page's own height (the body box), not counting things that fell or flew past it.
export const pageH = () => Math.max(document.body.offsetHeight, document.documentElement.clientHeight);

export function setMood(mood, ms) { M.mood = mood; M.moodUntil = now() + ms; }
export const moodIs = (mood) => M.mood === mood && now() < M.moodUntil;
/** A good moment: lifts his happiness (clamped to 0..1, never lowered here). */
export const cheer = (a) => { M.glad = Math.max(M.glad, Math.min(1, a)); };

/** HUD and hit-box listeners: called whenever level, hat, chaos or the journal change. */
export const listeners = new Set();
export function changed() { for (const f of listeners) f(); }
