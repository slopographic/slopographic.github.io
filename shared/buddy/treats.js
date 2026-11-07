// Treats from the "Give…" tray are PLACED on the page next to him, wobble there, and he decides
// what to do: a bit annoyed — "hmph", a short pause, then he hops over and eats it; really angry —
// he turns his back ("not hungry. ANGRY.") and at full rage may kick it away. While a treat is
// around his rage slowly melts, so eventually he sneaks over. Favourites break through faster.
// Uneaten treats fade after a while; Restore page clears them.
import { M, now, rand, reduced, sleep, setMood, changed } from './state.js';
import * as P from './perches.js';
import { hopTo } from './motion.js';
import { say } from './fx.js';
import { tr as word } from './lines.js';
import { size } from './look.js';
import { record } from './journal.js';
import { MAD, persistRage } from './rage.js';
import { feed, item } from './care.js';

export const FADE_MS = 30000;
const treats = [];
export const list = () => treats.slice();
let busy = false, nextLook = 0;

/** Place a treat near him: on his perch a little to the side, or on the nearest visible perch. */
export function offer(id) {
  const it = item(id);
  if (!it || !M.layer) return null;
  let p = null;
  if (M.perch) {
    const r = M.perch.el.getBoundingClientRect(), side = Math.random() < 0.5 ? -1 : 1;
    const x = Math.max(r.left + 14, Math.min(r.right - 14, M.x - scrollX + side * rand(70, 120)));
    p = { el: M.perch.el, off: x - r.left };
  } else p = P.pick({ near: true });
  if (!p) return null;
  const el = document.createElement('span');
  el.className = 'sloppo-treat';
  el.textContent = it.icon;
  el.setAttribute('aria-hidden', 'true');
  M.layer.append(el);
  const t = { id, el, perch: p, born: now(), eatAt: 0 };
  treats.push(t);
  record(() => remove(t));
  position(t);
  if (!reduced()) el.animate([{ transform: 'translate(-50%, -100%) scale(.2)', opacity: 0 }, { transform: 'translate(-50%, -100%) scale(1)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.3,1.6,.5,1)' });
  plan(t);
  changed();
  return t;
}
function remove(t) {
  const i = treats.indexOf(t);
  if (i >= 0) treats.splice(i, 1);
  t.el.remove();
}
function position(t) {
  const pt = P.point(t.perch);
  if (!pt) return false;
  t.x = pt.x;
  t.y = pt.y;
  t.el.style.left = pt.x + 'px';
  t.el.style.top = pt.y + 'px';
  return true;
}
/** How long he holds out before going for a treat (Infinity: not while this angry). */
export function delayFor(id, rage = M.rage, raging = !!M.raging) {
  const fav = id === M.fav;
  if (raging || rage >= 2.5) return Infinity;
  if (rage >= MAD) return fav ? 2500 : 9000;
  return rage > 0 ? 1400 : 600;
}
function plan(t) {
  const d = delayFor(t.id);
  t.eatAt = d === Infinity ? 0 : now() + d;
  if (d === Infinity) snub(t);
  else if (M.rage > 0) say(word('ui.buddy.hmph'), 900, { force: true });
}
function snub(t) {
  M.backUntil = now() + 2600;               // turns his back on it
  say(Math.random() < 0.5 ? word('ui.buddy.not_hungry') : word('ui.buddy.dont_want', { item: word(item(t.id).name) }), 1800, { force: true });
}

/** Per frame: keep treats on their perches, fade old ones, melt rage, and go eat when ready. */
export function tickTreats(dt, t) {
  for (const tr of treats.slice()) {
    if (!position(tr) || t - tr.born > FADE_MS) { fade(tr); continue; }
  }
  if (!treats.length) return;
  // The smell of snacks: rage melts slowly while a treat is around (even when MAD).
  if (!M.raging && M.rage > 0) { M.rage = Math.max(0, M.rage - 0.06 * dt); if (Math.random() < dt) persistRage(); }
  if (busy || M.mode !== 'perched' || M.chaos) return;
  for (const tr of treats) {
    if (!tr.eatAt) {
      if (delayFor(tr.id) !== Infinity) plan(tr);
      else if (t > nextLook) { nextLook = t + 7000; if ((M.raging || M.rage >= 2.9) && Math.random() < 0.4) kick(tr); else snub(tr); }
      continue;
    }
    if (t >= tr.eatAt) { go(tr); return; }
  }
}
function fade(tr) {
  const i = treats.indexOf(tr);
  if (i < 0) return;
  treats.splice(i, 1);
  if (reduced()) { tr.el.remove(); return; }
  tr.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600 }).onfinish = () => tr.el.remove();
}

/** Hop to the treat and eat it. */
async function go(tr) {
  busy = true;
  try {
    const ok = await hopTo({ el: tr.perch.el, off: tr.perch.off, frac: 0.5 });
    if (!ok || !treats.includes(tr)) return;
    setMood('chomp', 600);
    M.squash = 0.6;
    if (!reduced()) await tr.el.animate([{ transform: 'translate(-50%, -100%)' }, { transform: `translate(-50%, ${-size() * 0.4}px) scale(.1)`, opacity: 0.3 }], { duration: 320, easing: 'ease-in' }).finished.catch(() => {});
    remove(tr);
    feed(tr.id);
  } finally { busy = false; }
}

/** Full rage: hop over and boot it off the page. */
async function kick(tr) {
  busy = true;
  try {
    if (!(await hopTo({ el: tr.perch.el, off: tr.perch.off + (M.x < tr.x ? -30 : 30), frac: 0.5 })) || !treats.includes(tr)) return;
    say(word('ui.buddy.kick'), 1200, { force: true });
    M.squash = -0.5;
    const dir = M.x < tr.x ? 1 : -1;
    treats.splice(treats.indexOf(tr), 1);
    if (reduced()) { tr.el.remove(); return; }
    await sleep(120);
    tr.el.animate([{ transform: 'translate(-50%, -100%)' }, { transform: `translate(${dir * 240}px, -260px) rotate(${dir * 540}deg)`, opacity: 0 }], { duration: 700, easing: 'cubic-bezier(.2,.6,.4,1)' }).onfinish = () => tr.el.remove();
  } finally { busy = false; }
}
