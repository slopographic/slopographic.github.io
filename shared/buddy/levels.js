// Gaining XP, levelling up and changing hats.
import { M, now, changed } from './state.js';
import { levelFor, hatsFor, hatLabel, save } from './store.js';
import { say, sparkle } from './fx.js';
import { tr } from './lines.js';

const lastGain = {};
/** Add XP. `throttle` (ms) limits how often one source (e.g. petting) can pay out. */
export function gain(n, { source = 'any', throttle = 0 } = {}) {
  const t = now();
  if (throttle && t - (lastGain[source] || -1e9) < throttle) return false;
  lastGain[source] = t;
  M.xp += n;
  const lv = levelFor(M.xp);
  if (lv > M.level) {
    M.level = lv;
    const hats = hatsFor(lv);
    M.hat = hats[hats.length - 1] || null;
    say(M.hat ? tr('ui.buddy.level_hat', { n: lv, hat: hatLabel(M.hat) }) : tr('ui.buddy.level', { n: lv }), 2600);
    sparkle();
    M.squash = 0.7;
  }
  persist();
  return true;
}

/** Cycle through no hat and every unlocked hat. */
export function cycleHat() {
  const hats = [null, ...hatsFor(M.level)];
  M.hat = hats[(hats.indexOf(M.hat) + 1) % hats.length];
  M.squash = 0.4;
  say(hatLabel(M.hat), 1000);
  persist();
}

function persist() {
  save({ xp: M.xp, hat: M.hat });
  changed();
}
