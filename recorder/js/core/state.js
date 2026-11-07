/* Slop Recorder: the recorder's state machine. Pure (no DOM, no clock of its own: every call takes the time in ms), so Node
 * tests run it (tests/node/recorder-core.test.mjs). Classic script: SlopRec.state; also a CommonJS module.
 *   idle ──arm(countdown)──▶ countdown ──go──▶ recording ⇄ paused (pause / resume) ──stop──▶ review
 *   (arm with countdown 0 goes straight to recording; cancel from countdown goes back to idle; discard from review goes
 *   back to idle; arm from review starts a new recording, the old one is dropped by the page)
 *   const m = SlopRec.state.create();
 *   m.arm(3, now) → 'countdown'; m.left(now) → whole seconds still to count; m.go(now); m.pause(now); m.resume(now);
 *   m.stop(now); m.elapsed(now) → ms recorded, pauses left out; m.paused(now) → ms spent paused (the pause going on
 *   included); m.state; m.can(action); m.on(fn) (fn(state, prev))
 * go(now) takes the time the recorder was started (record.js passes the moment it called MediaRecorder.start, which can be
 * well before the browser's start event on a busy machine: the file counts from then, so the timer does too). Times that
 * go backwards (a pause earlier than the start) are treated as no time. 
 * An action that is not allowed in the current state throws an Error that says so ("Cannot pause while idle"). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SlopRec = root.SlopRec || {}).state = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const NEXT = {
    idle: { arm: 'countdown' },
    countdown: { go: 'recording', cancel: 'idle' },
    recording: { pause: 'paused', stop: 'review' },
    paused: { resume: 'recording', stop: 'review' },
    review: { discard: 'idle', arm: 'countdown' },
  };
  const WORD = { idle: 'idle', countdown: 'counting down', recording: 'recording', paused: 'paused', review: 'reviewing a recording' };
  const STATES = Object.keys(NEXT);

  function create() {
    let state = 'idle', countEnd = 0, startedAt = null, pausedAt = 0, pausedMs = 0, stoppedAt = 0;
    const subs = [];
    function move(action, now) {
      const to = NEXT[state][action];
      if (!to) throw new Error(`Cannot ${action} while ${WORD[state]}`);
      const prev = state;
      state = to;
      for (const fn of subs) fn(state, prev, action, now);
      return state;
    }
    const num = (t) => { if (typeof t !== 'number' || !isFinite(t)) throw new Error('A time in ms is needed'); return t; };
    const m = {
      get state() { return state; },
      can: (action) => !!NEXT[state][action],
      on(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
      /** Starts the countdown (seconds), or the recording itself when it is 0. */
      arm(seconds, now) {
        num(now);
        const s = Math.max(0, Math.round(Number(seconds) || 0));
        if (!m.can('arm')) move('arm', now);   // throws with the reason
        startedAt = null; pausedAt = pausedMs = stoppedAt = 0;
        countEnd = now + s * 1000;
        move('arm', now);
        if (!s) m.go(now);
        return state;
      },
      /** Whole seconds left in the countdown (3, 2, 1), 0 when it is over or not running. */
      left: (now) => (state === 'countdown' ? Math.max(0, Math.ceil((countEnd - num(now)) / 1000)) : 0),
      /** True when the countdown has run out (the page then calls go). */
      due: (now) => state === 'countdown' && num(now) >= countEnd,
      go(now) { num(now); move('go', now); startedAt = now; pausedMs = 0; return state; },
      cancel(now) { return move('cancel', num(now)); },
      pause(now) { num(now); move('pause', now); pausedAt = now; return state; },
      resume(now) { num(now); move('resume', now); pausedMs += Math.max(0, now - pausedAt); pausedAt = 0; return state; },
      stop(now) {
        num(now);
        if (state === 'paused') { pausedMs += Math.max(0, now - pausedAt); pausedAt = 0; }
        move('stop', now);
        stoppedAt = now;
        return state;
      },
      discard(now) { return move('discard', num(now)); },
      /** The time spent paused so far, in ms (all pauses, the one going on included). */
      paused: (now) => (startedAt == null ? 0 : pausedMs + (state === 'paused' ? Math.max(0, num(now) - pausedAt) : 0)),
      /** The time recorded so far, in ms, without the pauses. */
      elapsed(now) {
        if (startedAt == null) return 0;
        const end = state === 'review' ? stoppedAt : state === 'paused' ? pausedAt : num(now);
        return Math.max(0, end - startedAt - pausedMs);
      },
    };
    return m;
  }
  return { create, STATES, NEXT };
});
