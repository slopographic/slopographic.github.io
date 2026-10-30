// "Unleash": chaos mode. A small brain picks actions while it lasts; Restore page undoes everything.
import { M, sleep, rand, reduced, changed } from './state.js';
import { bite, eat, knock, goo } from './acts.js';
import { blast } from './blast.js';
import { blackhole } from './blackhole.js';
import { restoreAll, count } from './journal.js';
import { say } from './fx.js';
import { line } from './lines.js';
import { bindChaos, calmRage } from './rage.js';
import * as P from './perches.js';
import { leapIn } from './motion.js';

export const ACTS = { bite, eat, knock, goo, blast, blackhole };
const CALM = { bite: 3, eat: 3, knock: 1.4, goo: 1.5, blast: 2, blackhole: 0.8 };
const RAGE = { bite: 2, eat: 2, knock: 2, goo: 1, blast: 5, blackhole: 1.6 };

/** Action names in a weighted random order. */
function order() {
  const left = { ...(M.raging ? RAGE : CALM) }, out = [];
  while (Object.keys(left).length) {
    let k = Math.random() * Object.values(left).reduce((a, b) => a + b, 0);
    for (const name in left) if ((k -= left[name]) <= 0) { out.push(name); delete left[name]; break; }
  }
  return out;
}

async function brain(tok) {
  await sleep(reduced() ? 400 : 650);
  while (M.chaos && tok === M.token) {
    if (M.mode === 'perched' && !document.hidden) {
      for (const name of order()) {
        if (await ACTS[name](tok)) break;
        if (tok !== M.token) return;
      }
    }
    await sleep(reduced() ? 1400 : M.raging ? rand(200, 500) : rand(450, 1000));
  }
}

export function setChaos(on, { quiet = false } = {}) {
  on = !!on;
  if (on === M.chaos) return;
  M.chaos = on;
  M.token++;
  M.el.classList.toggle('is-chaos', on);
  M.squash = 0.6;
  if (!quiet) say(line(on ? 'chaos' : 'calm'), 1100);
  changed();
  if (on) brain(M.token);
  else if (M.raging && !quiet) { M.rageChaos = false; calmRage(); }
}
bindChaos(setChaos);

const DAMAGE = '.sloppo-crack, .sloppo-burn, .sloppo-goo, .sloppo-hole, .sloppo-ball, .sloppo-letter';
let repairing = false;

/**
 * Stop chaos and rage, and undo every change they made. With { animate: true } (his happy repair)
 * the cracks, burns and goo fade out first, then the same undo runs. Only the animation differs.
 */
export function restore({ animate = false } = {}) {
  if (animate && !reduced() && !repairing && count()) {
    repairing = true;
    for (const n of M.layer.querySelectorAll(DAMAGE)) n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: 'forwards' });
    setTimeout(() => { repairing = false; restore(); say(line('repair'), 1800, { force: true }); }, 480);
    return;
  }
  if (M.raging) calmRage();
  if (M.chaos) setChaos(false, { quiet: true });
  M.token++;
  restoreAll();
  for (const n of M.layer.querySelectorAll('.sloppo-letter, .sloppo-goo, .sloppo-ball, .sloppo-hole')) n.remove();
  // Shaken elements can be left with an empty style attribute; drop it so the markup is exactly as before.
  for (const n of document.querySelectorAll('body [style=""]')) if (!n.closest('.sloppo-layer, .sloppo-hud, .buddy-toggle')) n.removeAttribute('style');
  // Back onto solid ground: if his perch is gone or he is mid-air, he hops onto a real perch.
  const pt = M.perch && P.point(M.perch);
  if (M.mode === 'air' || (M.mode === 'perched' && (!pt || !P.solidAt(M.perch.el, pt.x)))) leapIn();
  say(line('restore'), 1200);
}

/** Run one action now (used by tests and the debug hook). */
export const act = (name) => ACTS[name](M.token);
