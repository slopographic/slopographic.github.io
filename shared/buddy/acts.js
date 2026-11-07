// Chaos actions: bite cards, eat letters, knock cards off the page, spit goo.
// (Goo blasts live in blast.js, black holes in blackhole.js.) Each records its own undo,
// takes the chaos token and returns true if it did something.
import { M, reduced, sleep, rand, clamp, setMood, navH } from './state.js';
import * as P from './perches.js';
import { hopTo, fall } from './motion.js';
import { launch } from './bodies.js';
import { size } from './look.js';
import { record, keepStyle } from './journal.js';
import { crumbs, say, gooSVG } from './fx.js';
import { gain } from './levels.js';
import { punch, holeCount, letters, uneaten, lift } from './dom.js';
import { line } from './lines.js';
import { CFG } from './config.js';

export const ok = (tok) => tok === M.token && M.mode === 'perched';
export const wait = (ms) => sleep(reduced() ? 0 : ms);
export const isCard = (el) => el.matches(CFG.cards) && !P.fallen.has(el);

/** Hop onto a perch chosen by filter (or stay if already there). */
export async function goTo(filter, tok) {
  const p = P.pick({ filter });
  if (!p) return null;
  if (M.perch && M.perch.el === p.el) return ok(tok) ? p : null;
  return (await hopTo(p)) && ok(tok) ? p : null;
}

/* ---------- bite a card ---------- */
export async function bite(tok) {
  const p = await goTo((el) => isCard(el) && holeCount(el) < 18, tok);
  if (!p) return false;
  if (Math.random() < 0.4) say(line('bite'), 900);
  for (let i = 0; i < 2; i++) {
    setMood('chomp', 300);
    M.squash = -0.35;
    await wait(170);
    if (!ok(tok)) return false;
    M.squash = 0.6;
    const r = p.el.getBoundingClientRect(), R = size() * 0.27;
    // He leans over and bites beside his feet (a bite under them would drop him through the card).
    const side = M.x - scrollX - r.left < r.width / 2 ? 1 : -1;
    const x = clamp(M.x - scrollX - r.left + side * R * (1.9 + i * 0.9), R, r.width - R);
    punch(p.el, [{ x, y: R * 0.2, r: R }, { x: x - R * 0.85, y: R * 0.45, r: R * 0.5 }, { x: x + R * 0.85, y: R * 0.45, r: R * 0.5 }]);
    crumbs(r.left + scrollX + x, r.top + scrollY + R * 0.4, '#1d1d1d');
    await wait(260);
  }
  gain(1, { source: 'chaos' });
  return true;
}

/* ---------- eat letters from a heading ---------- */
// Headings keep at least one letter, so there is always something to stand on.
const edible = (el) => el.matches(CFG.headings) && (uneaten(el) || [0, 0]).length > 1;
export async function eat(tok) {
  const p = await goTo(edible, tok);
  if (!p) return false;
  letters(p.el);
  const left = uneaten(p.el);
  const near = left.map((s) => { const r = s.getBoundingClientRect(); return [Math.abs(r.left + r.width / 2 + scrollX - M.x), s]; })
    .sort((a, b) => a[0] - b[0]).slice(0, 6).map((a) => a[1]);
  const n = Math.min(near.length, left.length - 1, 2 + Math.floor(Math.random() * 3));
  say(line('eat'), 1000);
  for (let i = 0; i < n; i++) {
    if (!ok(tok)) return false;
    await gulp(near.splice(Math.floor(Math.random() * near.length), 1)[0]);
  }
  gain(1, { source: 'chaos' });
  return true;
}
/** Fly one letter into his mouth. */
async function gulp(span) {
  const { fl, cx, cy } = lift(span, M.layer);
  setMood('chomp', 700);
  if (!reduced()) {
    const mx = M.x - cx, my = M.y - size() * 0.32 - cy;
    await fl.animate([
      { transform: 'none' },
      { transform: `translate(${mx * 0.45}px, ${my * 0.45 - 50}px) rotate(160deg) scale(.75)`, offset: 0.55 },
      { transform: `translate(${mx}px, ${my}px) rotate(320deg) scale(.08)`, opacity: 0.5 },
    ], { duration: 480, easing: 'ease-in' }).finished.catch(() => {});
  }
  fl.remove();
  M.squash = 0.5;
  await wait(110);
}

/* ---------- knock a card off the page ---------- */
export async function knock(tok) {
  const p = await goTo(isCard, tok);
  if (!p) return false;
  say(line('knock'), 1200);
  for (let i = 0; i < 2; i++) { M.squash = 0.65; await wait(240); if (!ok(tok)) return false; }
  topple(p.el);
  gain(1, { source: 'chaos' });
  return true;
}
/** Mark a card gone (no longer a perch) and record how to bring it back. */
export function vanish(card, gone = true) {
  keepStyle(card);
  const set = gone ? P.gone : P.fallen;   // gone: swallowed for good; fallen: a rigid body, still a perch
  set.add(card);
  record(() => set.delete(card));
  Object.assign(card.style, { pointerEvents: 'none', transition: 'none', position: 'relative', zIndex: '14' });
}
function topple(card) {
  vanish(card, false);
  if (M.perch && M.perch.el === card) fall(0, -120, true);    // the floor just left
  if (reduced()) { card.style.visibility = 'hidden'; return; }
  const r = card.getBoundingClientRect();
  const vx = rand(60, 220) * (M.x < r.left + scrollX + r.width / 2 ? 1 : -1);
  record(launch(card, { vx, vy: -rand(280, 420), vr: vx * rand(0.15, 0.35) }));
}

/* ---------- spit goo ---------- */
/** Throw something from his mouth to (x, y) in page coordinates. Resolves on impact. */
export function spit(node, x, y, ms = 560) {
  if (reduced()) return Promise.resolve();
  const dx = M.x - x, dy = M.y - size() * 0.3 - y;
  return node.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.12)` }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 90}px) scale(.3)`, offset: 0.5 }, { transform: 'scale(1.15, .8)', offset: 0.88 }, { transform: 'none' }], { duration: ms, easing: 'ease-out' }).finished.catch(() => {});
}
export async function goo(tok) {
  if (tok !== M.token) return false;
  const top = navH() + 30;
  const x = scrollX + rand(40, innerWidth - 40), y = scrollY + rand(top, Math.max(top + 10, innerHeight - 90));
  setMood('chomp', 400);
  M.squash = -0.45;
  await wait(180);
  if (tok !== M.token) return false;
  const blob = document.createElement('div');
  blob.className = 'sloppo-goo';
  blob.setAttribute('aria-hidden', 'true');
  const w = rand(70, 120);
  Object.assign(blob.style, { left: x - w / 2 + 'px', top: y - w * 0.5 + 'px', width: w + 'px' });
  blob.innerHTML = gooSVG(rand(26, 36));
  M.layer.append(blob);
  record(() => blob.remove());
  spit(blob, x, y);
  gain(1, { source: 'chaos' });
  return true;
}
