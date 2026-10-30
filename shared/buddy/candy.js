// Candy: when Sloppo is angry he asks for one. "Make candy" paints a small lollipop or gummy on a
// canvas (no art files), sets it beside him, and you drag it onto him. Dropping it on him calms him
// down and makes him happy. One candy at a time; it fades away after a minute if nobody uses it.
import { M, now, reduced, rand, setMood, changed, cheer } from './state.js';
import { say, hearts, sparkle } from './fx.js';
import { line, tr } from './lines.js';
import { size } from './look.js';
import { calmRage, persistRage } from './rage.js';

export const CANDY_CALM = 1.2;
const LIFE_MS = 60000, TAU = Math.PI * 2;
const COLS = ['#ff4f86', '#ffd23f', '#5cc8ff', '#d4ff3a'];
let out = null, lifeTok = 0;

export const candyOut = () => !!out;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** A lollipop (swirled disc on a stick) or a gummy bear, drawn on a 64px canvas. Returns a data URL. */
function sprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  if (Math.random() < 0.5) {
    g.fillStyle = '#f4f1e8'; g.fillRect(29, 38, 6, 24);                           // stick
    g.beginPath(); g.arc(32, 26, 22, 0, TAU); g.fillStyle = '#fff'; g.fill();
    for (let i = 0, r = 19; r > 3; r -= 4, i++) { g.beginPath(); g.arc(32, 26, r, 0, TAU); g.strokeStyle = COLS[i % COLS.length]; g.lineWidth = 3; g.stroke(); }
    g.beginPath(); g.arc(32, 26, 22, 0, TAU); g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(24, 17, 4, 2.2, -0.6, 0, TAU); g.fill();
  } else {
    const col = pick(COLS);
    g.fillStyle = col; g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(20, 20, 9, 0, TAU); g.arc(44, 20, 9, 0, TAU); g.arc(32, 30, 19, 0, TAU); g.fill(); g.stroke();   // ears + body
    g.beginPath(); g.ellipse(32, 44, 14, 9, 0, 0, TAU); g.fill(); g.stroke();                                              // feet
    g.fillStyle = '#1a1206'; g.beginPath(); g.arc(25, 28, 2.4, 0, TAU); g.arc(39, 28, 2.4, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.8)'; for (const [x, y] of [[22, 14], [40, 18], [30, 36]]) { g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill(); }
  }
  return c.toDataURL('image/png');
}

/** "Make candy": one candy beside him, ready to drag. Returns its element (or the one already out). */
export function makeCandy() {
  if (out || !M.layer) return out;
  const s = size(), side = Math.random() < 0.5 ? -1 : 1;
  const n = document.createElement('span');
  n.className = 'sloppo-candy';
  n.setAttribute('role', 'button');
  n.setAttribute('aria-label', tr('ui.buddy.candy_aria'));
  const url = sprite();
  if (url) n.style.backgroundImage = `url("${url}")`;
  else n.textContent = '🍭';
  Object.assign(n.style, { left: M.x + side * s * rand(0.9, 1.3) + 'px', top: M.y - 14 + 'px' });
  M.layer.append(n);
  out = n;
  bindDrag(n);
  if (!reduced()) n.animate([{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  const tok = ++lifeTok;
  setTimeout(() => { if (tok === lifeTok && out === n) { out = null; fade(n); changed(); } }, LIFE_MS);
  say(line('candymade'), 2400, { force: true });
  changed();
  return n;
}

function fade(n) {
  if (reduced()) { n.remove(); return; }
  n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500 }).onfinish = () => n.remove();
}

/** Drag it with the pointer; release over him to give it. */
function bindDrag(n) {
  let d = null;
  n.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { n.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ } // touch-ok: a candy has touch-action: none (extras.css)
    d = { id: e.pointerId, ox: parseFloat(n.style.left) - e.pageX, oy: parseFloat(n.style.top) - e.pageY };
    n.classList.add('grabbing');
  });
  n.addEventListener('pointermove', (e) => {
    if (!d || e.pointerId !== d.id) return;
    n.style.left = e.pageX + d.ox + 'px';
    n.style.top = e.pageY + d.oy + 'px';
  });
  n.addEventListener('pointerup', (e) => {
    if (!d || e.pointerId !== d.id) return;
    d = null;
    n.classList.remove('grabbing');
    if (overHim(n)) give(n);
  });
  n.addEventListener('pointercancel', () => { d = null; n.classList.remove('grabbing'); });
}

/** Is the candy's centre over his body? */
function overHim(n) {
  const s = size(), cx = parseFloat(n.style.left), cy = parseFloat(n.style.top);
  return Math.hypot(cx - M.x, cy - (M.y - s * 0.55)) < s * 0.8;
}

/** He eats it: calmer (a raging storm is called off), happy, hearts. */
function give(n) {
  out = null;
  lifeTok++;
  fade(n);
  if (M.raging) calmRage();
  M.rage = Math.max(0, M.rage - CANDY_CALM);
  M.squash = 0.6;
  setMood('love', 1500);
  cheer(1);
  if (!reduced()) { hearts(4); sparkle(); }
  say(line('candyyes'), 1800, { force: true });
  persistRage();
  changed();
}

/** Remove the candy (Sloppo was hidden). */
export function clearCandy() {
  lifeTok++;
  if (out) out.remove();
  out = null;
}
