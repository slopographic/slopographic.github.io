// Moods that change quickly. Happiness (cheer() in state.js) fades in about a second. While he is
// happy and there is damage he made, he repairs it: the same Restore page undo, with a short fade.
// While he is angry he asks for a candy (candy.js) in his speech bubble.
import { M } from './state.js';
import { TIMING, GLAD_FACE } from './timing.js';
import { count } from './journal.js';
import { restore } from './chaos.js';
import { say } from './fx.js';
import { line, tr } from './lines.js';
import { MAD } from './rage.js';
import { makeCandy, candyOut } from './candy.js';
import { list as treatList } from './treats.js';

/** Once per frame, while he is visible. */
export function tickMood(dt, t) {
  M.glad *= Math.pow(0.5, dt / TIMING.gladHalfLife);
  if (M.glad < 0.01) M.glad = 0;
  tickRepair(t);
  tickAsk(t);
}

/* ---------- happy repair ---------- */
const happy = () => M.glad >= GLAD_FACE;
/** Repair only when calm: no chaos or rage running, no treat waiting, not in the air. */
const canRepair = () => count() > 0 && !M.chaos && !M.raging && M.rage < 1 && M.mode === 'perched' && !treatList().length;

function tickRepair(t) {
  if (!happy()) { M.happyAt = 0; return; }
  if (!M.happyAt) { M.happyAt = t; return; }
  if (t - M.happyAt < TIMING.repairDelay || !canRepair()) return;
  M.happyAt = Infinity;                 // once per happy moment
  restore({ animate: true });
}

/* ---------- the candy ask ---------- */
function tickAsk(t) {
  const angry = !!M.raging || M.rage >= MAD;
  if (!angry) { M.askAt = 0; return; }
  if (!M.askAt) { M.askAt = t + TIMING.askDelay; return; }
  if (t < M.askAt) return;
  M.askAt = t + TIMING.askEvery;
  if (!candyOut()) askForCandy();
}
/** He asks in his bubble; the button makes the candy beside him. */
export function askForCandy() {
  say(line('askcandy'), 7000, { force: true, actions: [{ label: tr('ui.buddy.make_candy'), run: makeCandy }] });
}
