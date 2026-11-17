// Pointer and keyboard: click (or Enter) to pet, drag to carry, release to throw.
import { M, now, setMood, cheer } from './state.js';
import { startDrag, dragTo, release } from './motion.js';
import { gain } from './levels.js';
import { hearts, say } from './fx.js';
import { line } from './lines.js';
import { petAllowed, onDrag, dragEnded } from './care.js';
import { addRage } from './rage.js';
import { TIMING } from './timing.js';
import { controlAt } from './avoid.js';

/** Too many pokes in a few seconds: a bad moment (mood.js keeps the count). */
export function pokedTooOften(t) {
  M.pokes = M.pokes.filter((x) => t - x < TIMING.pokeWindow);
  M.pokes.push(t);
  if (M.pokes.length < TIMING.pokeCount) return false;
  M.pokes = [];
  return true;
}

export function pet() {
  if (!petAllowed()) return;
  setMood('love', 1500);
  M.squash = 0.55;
  M.sqv = 0;
  hearts(3);
  cheer(0.7);
  gain(1, { source: 'pet', throttle: 250 });
  if (M.raging) { if (M.pets++ % 3 === 0) say(line('rage'), 1100); }
  else if (++M.pets % 4 === 0) say(line('pet'), 1100);
  M.nextIdle = Math.max(M.nextIdle, now() + 4000);
  if (pokedTooOften(now())) addRage(1, 'poke');
}

export function bindInput(hit) {
  let P = null;
  hit.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType !== 'mouse' && controlAt(e.clientX, e.clientY)) return;   // over a control under him: no pet (see HANDOFF: touch can't pass through)
    e.preventDefault();
    try { hit.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ } // touch-ok: his hit area has touch-action: none (buddy.css)
    P = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: M.x - e.pageX, oy: M.y - e.pageY, drag: false };
  });
  hit.addEventListener('pointermove', (e) => {
    if (!P || e.pointerId !== P.id) return;
    if (!P.drag && e.pointerType !== 'touch' && Math.hypot(e.clientX - P.sx, e.clientY - P.sy) > 6) {   // touch never drags him
      P.drag = true;
      startDrag();
      hit.classList.add('grabbing');
    }
    if (P.drag) { dragTo(e.pageX + P.ox, e.pageY + P.oy, e.timeStamp); onDrag(e.timeStamp, e.pageX, e.pageY); }
  });
  const end = (e, cancel) => {
    if (!P || e.pointerId !== P.id) return;
    const was = P;
    P = null;
    hit.classList.remove('grabbing');
    if (was.drag) {
      dragEnded();
      const sp = release(e.timeStamp, cancel);
      if (sp > 600) { gain(2, { source: 'throw', throttle: 600 }); say(line('thrown'), 900); }
    } else if (!cancel) pet();
  };
  hit.addEventListener('pointerup', (e) => end(e, false));
  hit.addEventListener('pointercancel', (e) => end(e, true));
  hit.addEventListener('lostpointercapture', (e) => end(e, true));
  hit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pet(); }
  });
  hit.addEventListener('contextmenu', (e) => e.preventDefault());
  hit.addEventListener('click', (e) => e.stopPropagation()); // pointer capture sends the click here
  hit.addEventListener('pointerenter', () => { M.hover = true; });
  hit.addEventListener('pointerleave', () => { M.hover = false; });
}
