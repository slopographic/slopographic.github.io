// Goo blasts: he shoots goo at cards and headings, which crack, burn holes and splat.
import { M, reduced, rand, setMood, navH } from './state.js';
import * as P from './perches.js';
import { size } from './look.js';
import { gooSVG, say } from './fx.js';
import { gain } from './levels.js';
import { punch, holeCount, overlay } from './dom.js';
import { line } from './lines.js';
import { wait, spit, isCard } from './acts.js';
import { CFG } from './config.js';

/** Visible cards and headings that can still take a hit: [{ el, r }] (viewport rects). */
function targets() {
  const out = [];
  for (const el of document.querySelectorAll(`${CFG.cards}, ${CFG.headings}`)) {
    if (el.closest('.sloppo-layer, .sloppo-hud, .buddy-toggle')) continue;
    if (P.gone.has(el) || P.fallen.has(el) || holeCount(el) > 24) continue;
    const r = P.rectOf(el);
    if (!r) continue;
    const b = el.getBoundingClientRect();
    if (b.bottom < navH() + 20 || b.top > innerHeight - 20) continue;
    out.push({ el, r: b });
  }
  return out;
}

/** A jagged crack pattern radiating from the middle of a 200x200 box, as SVG. */
export function crackSVG() {
  let d = '';
  const rays = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < rays; i++) {
    let a = (i / rays) * Math.PI * 2 + rand(-0.3, 0.3), x = 100, y = 100;
    d += `M100 100`;
    const len = rand(55, 95), steps = 4;
    for (let k = 1; k <= steps; k++) {
      a += rand(-0.45, 0.45);
      x = 100 + Math.cos(a) * (len * k) / steps;
      y = 100 + Math.sin(a) * (len * k) / steps;
      d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
  }
  let ring = '';
  for (let i = 0; i < 7; i++) { const a = rand(0, 6.28), r = rand(22, 40); ring += `M${(100 + Math.cos(a) * r).toFixed(1)} ${(100 + Math.sin(a) * r).toFixed(1)}l${rand(-14, 14).toFixed(1)} ${rand(-14, 14).toFixed(1)}`; }
  return `<svg viewBox="0 0 200 200" aria-hidden="true"><path class="c-hi" d="${d}${ring}"/><path class="c-lo" d="${d}${ring}"/></svg>`;
}

/** What a hit does to an element at page point (x, y): crack, burn hole, or both, plus goo. */
export function impact(el, x, y, power = 1) {
  const b = el.getBoundingClientRect(), lx = x - b.left - scrollX, ly = y - b.top - scrollY;
  const roll = Math.random();
  if (roll < 0.55) {
    const w = 170 * power;
    const c = overlay(M.layer, 'sloppo-crack', x - w / 2, y - w / 2, crackSVG());
    c.style.width = c.style.height = w + 'px';
  }
  if (roll > 0.35) {
    const R = rand(12, 22) * power;
    punch(el, [{ x: lx, y: ly, r: R }]);
    const D = (R * 2) / 0.47;
    const burn = overlay(M.layer, 'sloppo-burn', x - D / 2, y - D / 2);
    burn.style.width = burn.style.height = D + 'px';
  }
  const w = rand(46, 70) * power;
  const g = overlay(M.layer, 'sloppo-goo sloppo-splat', x - w / 2 + rand(-10, 10), y - w * 0.45, gooSVG(rand(22, 30)));
  g.style.width = w + 'px';
  if (!reduced()) {
    g.animate([{ transform: 'scale(.2)', opacity: 0.4 }, { transform: 'scale(1.2, .85)', offset: 0.6 }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
    el.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${rand(-5, 5)}px, ${rand(-4, 4)}px)` }, { transform: 'translate(0,0)' }], { duration: 160, iterations: 2, composite: 'add' });
  }
}

/** Shoot a goo ball at a random visible card or heading. */
export async function blast(tok) {
  if (tok !== M.token || M.mode === 'drag') return false;
  const list = targets().filter((t) => !M.perch || t.el !== M.perch.el);
  if (!list.length) return false;
  const { el, r } = list[Math.floor(Math.random() * list.length)];
  const x = scrollX + r.left + rand(0.15, 0.85) * r.width, y = scrollY + r.top + rand(0.2, 0.8) * r.height;
  if (Math.random() < 0.6) say(line('blast'), 800);
  setMood('chomp', 450);
  M.squash = -0.55;
  await wait(160);
  if (tok !== M.token) return false;
  const ball = document.createElement('span');
  ball.className = 'sloppo-ball';
  ball.setAttribute('aria-hidden', 'true');
  Object.assign(ball.style, { left: x + 'px', top: y + 'px' });
  M.layer.append(ball);
  M.squash = 0.6;
  await spit(ball, x, y, 380);
  ball.remove();
  if (tok !== M.token) return false;
  impact(el, x, y, M.raging ? 1.3 : 1);
  gain(1, { source: 'chaos' });
  return true;
}
