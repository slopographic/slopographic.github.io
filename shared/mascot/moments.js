// The mascot slot's moments: when a page greets, works, finishes, fails, goes quiet or wants to show a control, the slot
// (slot.js) asks the profile's mascot overlay to play the named animation for that moment. The table is the contract an
// overlay implements: it lists the animations it has (`animations`) and may map a moment to another one (`moments`).
// Pure logic (no DOM): the work and idle trackers take a clock, so Node tests drive them. Tests:
// tests/node/mascot-moments.test.mjs. The overlay contract itself is described in shared/mascot/slot.js.

/** Moment -> animation name. greeting: the page opened; working: a task runs; done / error: it ended; idle: nothing
 * happened for IDLE_MS (the mascot sleeps); wake: the first input after that; point: the page asks it to show a control. */
export const MOMENTS = Object.freeze({
  greeting: 'hello', working: 'working', done: 'celebrate', error: 'oops', idle: 'sleep', wake: 'wake', point: 'point',
});

/** How long without input before the idle moment (ms), and how long a busy region must have been busy for its end to count
 * as done (a list that loads in 200 ms is not a finished task). */
export const IDLE_MS = 60000;
export const DONE_AFTER_MS = 1200;

/** The animation an overlay plays for a moment: its own mapping first, then MOMENTS; null when it does not have it. */
export function animationFor(moment, overlay = {}) {
  const name = (overlay.moments && overlay.moments[moment]) || MOMENTS[moment];
  if (!name) return null;
  return !Array.isArray(overlay.animations) || overlay.animations.includes(name) ? name : null;
}

/** A page element's work state: 'run', 'done', 'error' or 'end' (stopped being busy, outcome unknown), or null.
 * SlopFlow tiles carry data-state (idle, run, done, error); any other region says it is busy with aria-busy. */
export function stateOf(el) {
  if (!el || !el.getAttribute) return null;
  const flow = el.getAttribute('data-state');
  if (flow != null && el.classList && el.classList.contains('sflow')) return flow === 'idle' ? 'end' : flow;
  const busy = el.getAttribute('aria-busy');
  return busy === 'true' ? 'run' : busy == null ? null : 'end';
}

/** Turns element states into moments. A SlopFlow tile that runs (task: true) is a task: 'working' at once. Any other
 * busy region (aria-busy: a page loading, a viewer drawing) counts only once it has been busy DONE_AFTER_MS: tick(now)
 * says 'working' then, so the short busy spells of a busy app never start the working loop. When the last region ends:
 * 'done' if it says so, ran long enough or 'working' had started (the loop always ends), 'error' at once. A region that
 * leaves the page while busy (isConnected false) ends at the next tick. emit(moment). */
export function workTracker(emit, clock = () => Date.now()) {
  const busy = new Map();
  let started = false;
  const end = (el, state) => {
    const since = busy.get(el);
    if (since === undefined && state !== 'error') return;
    busy.delete(el);
    if (state === 'error') { emit('error'); if (!busy.size) started = false; return; }
    if (busy.size) return;
    const was = started;
    started = false;
    if (state === 'done' || was || clock() - since >= DONE_AFTER_MS) emit('done');
  };
  return {
    update(el, state, task = false) {
      if (state === 'run') {
        if (busy.has(el)) return;
        busy.set(el, clock());
        if (task && !started) { started = true; emit('working'); }
        return;
      }
      if (state === 'done' || state === 'error' || state === 'end') end(el, state);
    },
    tick(now = clock()) {
      for (const el of [...busy.keys()]) if (el && el.isConnected === false) end(el, 'end');
      if (!started && [...busy.values()].some((since) => now - since >= DONE_AFTER_MS)) { started = true; emit('working'); }
    },
    get busy() { return busy.size; },
  };
}

/** Idle and wake: tick(now) emits 'idle' once after ms without activity; activity(now) emits 'wake' when it was idle. */
export function idleTracker(emit, ms = IDLE_MS, start = Date.now()) {
  let last = start, asleep = false;
  return {
    activity(now) { last = now; if (asleep) { asleep = false; emit('wake'); } },
    tick(now) { if (!asleep && now - last >= ms) { asleep = true; emit('idle'); } },
    get asleep() { return asleep; },
  };
}

/** Which way a target lies from the mascot: -1 (left) or 1 (right), from two DOMRect-like boxes. */
export function sideOf(mascotBox, targetBox) {
  const mx = mascotBox.left + mascotBox.width / 2, tx = targetBox.left + targetBox.width / 2;
  return tx < mx ? -1 : 1;
}
