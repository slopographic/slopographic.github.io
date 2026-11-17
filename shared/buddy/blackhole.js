// Black holes: a tiny void opens, sucks nearby letters and cards in along a spiral, then collapses.
import { M, reduced, rand, navH, sleep } from './state.js';
import * as P from './perches.js';
import { say } from './fx.js';
import { gain } from './levels.js';
import { letters, uneaten, lift, overlay } from './dom.js';
import { record } from './journal.js';
import { line } from './lines.js';
import { vanish, isCard } from './acts.js';
import { CFG } from './config.js';

const RADIUS = 230, STEPS = 10;
let open = 0;

/** Keyframes that spiral something from offset (dx, dy) around the hole into its centre. */
function spiral(dx, dy, base = '') {
  const a0 = Math.atan2(dy, dx), d = Math.hypot(dx, dy), out = [];
  for (let k = 0; k <= STEPS; k++) {
    const u = k / STEPS, a = a0 + u * 4.2, rr = d * (1 - u) * (1 - u * 0.15);
    const tx = Math.cos(a) * rr - dx, ty = Math.sin(a) * rr - dy;
    out.push({ transform: `${base}translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${(u * 540).toFixed(0)}deg) scale(${(1 - u * 0.95).toFixed(3)})`, opacity: k === STEPS ? 0 : 1 });
  }
  return out;
}

/** Things near (x, y) in page coordinates: letter spans of headings, and whole cards. */
function victims(x, y) {
  const spans = [], cards = [];
  for (const el of document.querySelectorAll(`${CFG.headings}, ${CFG.cards}`)) {
    if (el.closest('.sloppo-layer, .sloppo-hud, .buddy-toggle')) continue;
    if (P.gone.has(el) || P.fallen.has(el)) continue;
    const b = el.getBoundingClientRect();
    if (!b.width) continue;
    const cx = b.left + scrollX + b.width / 2, cy = b.top + scrollY + b.height / 2;
    if (isCard(el)) {
      if (Math.hypot(cx - x, cy - y) < RADIUS * 1.25 && cards.length < 2) cards.push(el);
      continue;
    }
    const nx = Math.max(b.left + scrollX, Math.min(x, b.right + scrollX)), ny = Math.max(b.top + scrollY, Math.min(y, b.bottom + scrollY));
    if (Math.hypot(nx - x, ny - y) > RADIUS) continue;
    letters(el);
    for (const s of uneaten(el)) {
      const r = s.getBoundingClientRect();
      const d = Math.hypot(r.left + scrollX + r.width / 2 - x, r.top + scrollY + r.height / 2 - y);
      if (d < RADIUS) spans.push([d, s]);
    }
  }
  return { spans: spans.sort((a, b) => a[0] - b[0]).slice(0, 36).map((a) => a[1]), cards };
}

/** Open a black hole near some content. */
export async function blackhole(tok) {
  if (tok !== M.token || open) return false;
  const near = P.all().filter(({ el, r }) => el !== (M.perch && M.perch.el) && r.top > navH() + 40 && r.top < innerHeight - 60);
  const t = near.length ? near[Math.floor(Math.random() * near.length)].r : null;
  const x = scrollX + (t ? Math.min(innerWidth - 60, Math.max(60, rand(t.left, t.right))) : rand(80, innerWidth - 80));
  const y = scrollY + (t ? Math.min(innerHeight - 80, t.top + rand(10, 60)) : rand(navH() + 100, innerHeight - 120));
  if (Math.hypot(x - M.x, y - M.y) < 90) return false;   // not on his own head
  open++;
  say(line('hole'), 1400);
  const hole = overlay(M.layer, 'sloppo-hole', x, y, '<i class="bh-ring"></i><i class="bh-disk"></i>');
  const still = reduced();
  if (!still) await hole.animate([{ transform: 'translate(-50%,-50%) scale(0)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 450, easing: 'cubic-bezier(.3,1.6,.5,1)' }).finished.catch(() => {});
  else await sleep(200);
  if (tok !== M.token) { open--; return false; }
  const { spans, cards } = victims(x, y);
  const anims = [];
  spans.forEach((s, i) => {
    const { fl, cx, cy } = lift(s, M.layer);
    if (still) { fl.remove(); return; }
    const a = fl.animate(spiral(cx - x, cy - y), { duration: 900 + rand(0, 400), delay: i * 25, easing: 'ease-in', fill: 'both' });
    a.finished.catch(() => {}).then(() => fl.remove());
    anims.push(a);
  });
  for (const card of cards) {
    vanish(card);
    if (still) { card.style.visibility = 'hidden'; continue; }
    const b = card.getBoundingClientRect();
    const a = card.animate(spiral(b.left + scrollX + b.width / 2 - x, b.top + scrollY + b.height / 2 - y), { duration: 1500, easing: 'ease-in', fill: 'forwards' });
    record(() => a.cancel());
    a.finished.then(() => { if (P.gone.has(card)) card.style.visibility = 'hidden'; }).catch(() => {});
    anims.push(a);
  }
  await sleep(still ? 300 : 1700);
  if (!still && hole.isConnected) await hole.animate([{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(1.35)', filter: 'brightness(3)', offset: 0.35 }, { transform: 'translate(-50%,-50%) scale(0)' }], { duration: 420, easing: 'ease-in' }).finished.catch(() => {});
  hole.remove();
  open--;
  gain(2, { source: 'chaos' });
  return true;
}
