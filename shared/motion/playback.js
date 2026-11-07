// A clock-driven player for a timeline's playhead. No DOM is touched at load time.
//   const p = SlopMotion.playback.create({ duration: 2, loop: 'loop', onFrame: (time, state) => {...} });
//   p.play(); p.pause(); p.seek(0.5); p.setSpeed(2); p.setLoop('pingpong'); p.destroy();
// loop: 'none' (stops at the end), 'loop' (wraps), 'pingpong' (runs back and forth). Uses track.mapTime.
// clock (optional, for tests): { now(): ms, schedule(cb): cancelFn }. Default: performance.now and
// requestAnimationFrame, resolved inside create(), never at load. Classic script: window.SlopMotion.playback.
(function (g) {
  'use strict';
  const ns = (g.SlopMotion = g.SlopMotion || {});

  /** Default clock: performance.now and requestAnimationFrame (or setTimeout where rAF is missing). */
  function defaultClock() {
    const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
    const schedule = (cb) => {
      if (typeof requestAnimationFrame === 'function') {
        const id = requestAnimationFrame(() => cb());
        return () => { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id); };
      }
      const id = setTimeout(() => cb(), 16);
      return () => clearTimeout(id);
    };
    return { now, schedule };
  }

  const finite = (v, what) => {
    if (!Number.isFinite(v)) throw new RangeError(`playback: ${what} must be a finite number`);
    return v;
  };
  const LOOPS = ['none', 'loop', 'pingpong'];
  const checkLoop = (m) => {
    if (!LOOPS.includes(m)) throw new RangeError(`playback: loop must be one of ${LOOPS.join(', ')}`);
    return m;
  };

  /** Creates a player. opts: { duration, loop, speed, time, clock, onFrame }. */
  function create(opts = {}) {
    const clock = opts.clock || defaultClock();
    const onFrame = typeof opts.onFrame === 'function' ? opts.onFrame : () => {};
    let duration = finite(opts.duration === undefined ? 0 : opts.duration, 'duration');
    if (duration < 0) throw new RangeError('playback: duration must be >= 0');
    let loop = checkLoop(opts.loop === undefined ? 'none' : opts.loop);
    let speed = finite(opts.speed === undefined ? 1 : opts.speed, 'speed');
    let elapsed = finite(opts.time === undefined ? 0 : opts.time, 'time');
    let playing = false;
    let ended = false;
    let last = 0;
    let cancel = null;

    /** Playhead in [0, duration] for loop 'none', or the wrapped/reflected value for the other modes. */
    function current() {
      if (loop === 'none') return Math.min(Math.max(elapsed, 0), duration);
      return ns.track.mapTime(elapsed, duration, loop);
    }
    function emit() {
      onFrame(current(), { playing, ended, speed, loop, duration });
    }
    function stopScheduling() {
      if (cancel) cancel();
      cancel = null;
    }
    function atEnd() {
      return speed >= 0 ? elapsed >= duration : elapsed <= 0;
    }
    function tick() {
      cancel = null;
      if (!playing) return;
      const now = clock.now();
      elapsed += ((now - last) / 1000) * speed;
      last = now;
      if (loop === 'none' && atEnd()) {
        elapsed = speed >= 0 ? duration : 0;
        playing = false;
        ended = true;
      }
      emit();
      if (playing) cancel = clock.schedule(tick);
    }

    const player = {
      play() {
        if (playing) return player;
        if (loop === 'none' && ended) {
          elapsed = speed >= 0 ? 0 : duration;
          ended = false;
        }
        playing = true;
        last = clock.now();
        cancel = clock.schedule(tick);
        emit();
        return player;
      },
      pause() {
        stopScheduling();
        if (playing) { playing = false; emit(); }
        return player;
      },
      seek(t) {
        elapsed = finite(t, 'seek time');
        ended = false;
        last = clock.now();
        emit();
        return player;
      },
      setSpeed(s) {
        speed = finite(s, 'speed');
        return player;
      },
      setLoop(mode) {
        loop = checkLoop(mode);
        ended = false;
        emit();
        return player;
      },
      setDuration(d) {
        duration = finite(d, 'duration');
        if (duration < 0) throw new RangeError('playback: duration must be >= 0');
        emit();
        return player;
      },
      destroy() {
        stopScheduling();
        playing = false;
      },
      get time() { return current(); },
      get playing() { return playing; },
      get ended() { return ended; },
      get speed() { return speed; },
      get loop() { return loop; },
      get duration() { return duration; },
    };
    return player;
  }

  ns.playback = { create };
})(typeof window !== 'undefined' ? window : globalThis);
