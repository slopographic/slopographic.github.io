/* Slop Recorder: one recording session on top of the state machine (core/state.js): the countdown, MediaRecorder with
 * pause and resume, the live timer, and the recording as a Blob with its length written in (core/webm.js). Classic script:
 * SlopRec.session.
 *   const s = SlopRec.session.create({ onChange(state, info), onTick(info), onDone(result), onError(err) });
 *   await s.start(opts)    asks for the sources (capture.js), counts down, records
 *   s.pause(); s.resume(); s.stop(); s.cancel()   (cancel: the countdown, or a recording thrown away)
 *   s.state, s.elapsed(), s.preview (the stream to show while recording), s.notes
 *   result: { blob, type, ext, ms, audioOnly, notes, elapsed, pausedMs }   ms: the length read from the file's own frames
 *   (written into it as its Duration); elapsed: what the timer counted, pauses left out; pausedMs: the pauses together
 * The time counts from the call to MediaRecorder.start, not from its start event: the encoder takes frames from the call on,
 * and on a busy machine the event can come a second or more later (counting from the event left that time out of the timer
 * while the file had it). Recording starts once the event came, so the controls are not offered before. The page's clock is performance.now(); while counting down and recording a worker clock ticks the timer (capture.ticker)
 * so it keeps up in a background tab. */
(function (g) {
  'use strict';
  const R = (g.SlopRec = g.SlopRec || {});
  const now = () => g.performance.now();
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  function create(hooks = {}) {
    const m = R.state.create();
    let cap = null, rec = null, chunks = [], mime = '', stopTick = null, done = null, opts = null, starting = null;
    const info = () => ({ state: m.state, elapsed: m.elapsed(now()), left: m.left(now()), notes: cap ? cap.notes : [] });
    const emit = () => { if (hooks.onChange) hooks.onChange(m.state, info()); };
    m.on(emit);
    function tick() {
      if (m.due(now())) begin();
      if (hooks.onTick) hooks.onTick(info());
    }
    function release() {
      if (stopTick) { stopTick(); stopTick = null; }
      if (cap) { cap.stop(); }
    }
    /** The countdown ran out: the recorder starts, and the time counts from its first frame (an encoder can take a moment). */
    function begin() {
      if (starting) return;
      starting = startRecorder().then((at) => {
        if (m.state === 'countdown') m.go(at);
        else if (rec && rec.state !== 'inactive') rec.stop();   // cancelled while it was starting
      });
    }
    /** MediaRecorder on the stream; resolves on its start event (or after 4 s, for a browser that sends none) with the time
     *  start was called. */
    function startRecorder() {
      const M = g.MediaRecorder;
      mime = R.plan.pickMime((type) => M.isTypeSupported(type), cap.audioOnly);
      rec = new M(cap.stream, mime ? { mimeType: mime, videoBitsPerSecond: 6e6, audioBitsPerSecond: 128000 } : undefined);
      chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = (e) => fail(e.error || new Error(t('recorder.err.stopped')));
      done = new Promise((res) => { rec.onstop = res; });
      const began = new Promise((res) => { rec.onstart = res; setTimeout(res, 4000); });
      const at = now();
      rec.start(1000);
      return began.then(() => at);
    }
    function fail(err) {
      release();
      if (m.can('stop')) m.stop(now());
      if (hooks.onError) hooks.onError(err);
    }
    async function finish() {
      const ms = m.elapsed(now()), pausedMs = m.paused(now());
      await done;
      release();
      const type = (rec && rec.mimeType) || mime || 'video/webm', raw = new Blob(chunks, { type: type.split(';')[0] });
      const ext = R.plan.extOf(type);
      let blob = raw, len = ms;
      if (ext === 'webm') {
        try {
          const bytes = new Uint8Array(await raw.arrayBuffer()), measured = R.webm.measure(bytes);
          if (measured > 0) len = measured;
          blob = new Blob([R.webm.setDuration(bytes, len)], { type: raw.type });
        } catch (e) { blob = raw; }
      }
      const result = { blob, type: blob.type, ext, ms: len, audioOnly: cap ? cap.audioOnly : false, notes: cap ? cap.notes : [],
        elapsed: ms, pausedMs };
      if (hooks.onDone) hooks.onDone(result);
      return result;
    }
    const s = {
      get state() { return m.state; },
      get preview() { return cap ? cap.preview : null; },
      get notes() { return cap ? cap.notes : []; },
      elapsed: () => m.elapsed(now()),
      async start(o) {
        if (!m.can('arm')) throw new Error(t('recorder.err.already'));
        if (typeof g.MediaRecorder !== 'function') throw new Error(t('recorder.err.no_recorder'));
        opts = R.plan.clean(o);
        cap = await R.capture.open(opts, { onEnded: () => { if (m.can('stop')) s.stop(); else if (m.state === 'countdown') s.cancel(); } });
        starting = null;
        if (!opts.countdown) m.arm(0, await startRecorder());   // no countdown: recording once the recorder runs
        else m.arm(opts.countdown, now());
        stopTick = R.capture.ticker(100, tick);
        return s;
      },
      pause() { if (!m.can('pause')) throw new Error('Nothing is being recorded.'); rec.pause(); m.pause(now()); },
      resume() { if (!m.can('resume')) throw new Error('The recording is not paused.'); rec.resume(); m.resume(now()); },
      async stop() {
        if (!m.can('stop')) throw new Error('Nothing is being recorded.');
        m.stop(now());
        if (rec.state !== 'inactive') rec.stop();
        return finish();
      },
      cancel() {
        if (m.state === 'countdown') { m.cancel(now()); release(); return; }
        if (m.can('stop')) { m.stop(now()); if (rec && rec.state !== 'inactive') rec.stop(); release(); m.discard(now()); }
      },
      /** Back to idle after a review (the page drops the old recording). */
      discard() { if (m.state === 'review') m.discard(now()); },
      options: () => opts,
    };
    return s;
  }
  R.session = { create };
})(typeof window !== 'undefined' ? window : globalThis);
