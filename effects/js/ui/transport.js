// Slop Effects transport: play and pause, go to start and end, step a frame, loop, a play range (in and out points), the
// scrub bar and the time readout. Playback is the shared SlopMotion player; a play range is kept by seeking back to its
// in point when the playhead passes its out point. Classic script: window.SlopEffects.transport.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const { h, fmtTime } = ns.dom, t = (k, v) => ns.defs.t(k, v);
  /** Static labels: data-i18n-attr keeps them in the chosen language (SlopI18n.apply on a change). */
  const tip = (key, aria) => ({ title: t(key), 'aria-label': aria ? t(aria) : null, 'data-i18n-attr': 'title:' + key + (aria ? ';aria-label:' + aria : '') });

  /** Mounts the transport into host. act: the actions, S: the state. Returns { play, pause, toggle, stepFrames, start, end, setIn, setOut, clearRange }. */
  function mount(host, S, act) {
    const fps = () => S.doc.comp.fps;
    const scrub = h('input', { type: 'range', min: 0, max: S.doc.comp.duration, step: 1 / S.doc.comp.fps, value: 0, 'aria-label': t('effects.tr.playhead'), 'data-i18n-attr': 'aria-label:effects.tr.playhead', oninput: (e) => { player.seek(Number(e.target.value)); } });
    const time = h('span', { class: 'fx-time', 'aria-live': 'off' });
    const playBtn = h('button', { type: 'button', class: 'sui-btn', title: t('effects.tr.play_tip'), 'data-i18n-attr': 'title:effects.tr.play_tip', 'aria-label': t('effects.tr.play') }, '▶');
    const loopBtn = h('button', { type: 'button', class: 'sui-btn', ...tip('effects.tr.loop'), 'aria-pressed': 'true', 'data-i18n': 'effects.tr.loop', onclick: () => S.setLoop(!S.loop) }, t('effects.tr.loop'));
    const inBtn = h('button', { type: 'button', class: 'sui-btn', ...tip('effects.tr.in_tip'), 'data-i18n': 'effects.tr.in', onclick: () => setIn() }, t('effects.tr.in'));
    const outBtn = h('button', { type: 'button', class: 'sui-btn', ...tip('effects.tr.out_tip'), 'data-i18n': 'effects.tr.out', onclick: () => setOut() }, t('effects.tr.out'));
    const rangeBtn = h('button', { type: 'button', class: 'sui-btn', ...tip('effects.tr.full_tip'), 'data-i18n': 'effects.tr.full', onclick: () => clearRange() }, t('effects.tr.full'));
    const rangeNote = h('span', { class: 'fx-time' });

    const player = g.SlopMotion.playback.create({
      duration: S.doc.comp.duration,
      loop: S.loop ? 'loop' : 'none',
      onFrame: (time, st) => {
        const r = S.range;
        if (r && st.playing && (time >= r.out - 1e-6 || time < r.in - 1e-6)) { player.seek(r.in); S.seek(r.in); return; }
        if (st.ended && !S.loop) { player.pause(); }
        S.seek(time);
        if (!st.playing) setPlaying(false);
      },
    });

    /** Sets the play button's state and the aria label. */
    function setPlaying(on) {
      playBtn.textContent = on ? '❚❚' : '▶';
      playBtn.setAttribute('aria-label', t(on ? 'effects.tr.pause' : 'effects.tr.play'));
    }

    function play() {
      if (!S.loop && S.playhead >= S.doc.comp.duration - 1e-6) player.seek(S.range ? S.range.in : 0);
      else if (S.range && (S.playhead < S.range.in || S.playhead >= S.range.out)) player.seek(S.range.in);
      player.play();
      setPlaying(true);
    }
    function pause() { player.pause(); setPlaying(false); }
    function toggle() { if (player.playing) pause(); else play(); }
    function seekTo(time) { player.seek(time); S.seek(time); }
    const start = () => seekTo(S.range ? S.range.in : 0);
    const end = () => seekTo(S.doc.comp.duration);
    const stepFrames = (n) => seekTo(S.playhead + n / fps());
    function setIn() { const now = S.playhead; const out = S.range ? S.range.out : S.doc.comp.duration; S.setRange({ in: Math.min(now, out - 1 / fps()), out }); }
    function setOut() { const now = S.playhead; const inT = S.range ? S.range.in : 0; S.setRange({ in: inT, out: Math.max(now, inT + 1 / fps()) }); }
    function clearRange() { S.setRange(null); }

    playBtn.addEventListener('click', toggle);
    host.append(
      h('button', { type: 'button', class: 'sui-btn', ...tip('effects.tr.start_tip', 'effects.tr.start'), onclick: start }, '⇤'),
      h('button', { type: 'button', class: 'sui-btn', ...tip('effects.tr.prev_tip', 'effects.tr.prev'), onclick: () => stepFrames(-1) }, '◁'),
      playBtn,
      h('button', { type: 'button', class: 'sui-btn', ...tip('effects.tr.next_tip', 'effects.tr.next'), onclick: () => stepFrames(1) }, '▷'),
      h('button', { type: 'button', class: 'sui-btn', ...tip('effects.tr.end_tip', 'effects.tr.end'), onclick: end }, '⇥'),
      loopBtn, inBtn, outBtn, rangeBtn, rangeNote, scrub, time,
    );

    /** Keeps the readouts and the scrub bar in step with the state. */
    function refresh() {
      const d = S.doc.comp.duration;
      setPlaying(player.playing);
      scrub.max = d; scrub.step = 1 / S.doc.comp.fps;
      if (document.activeElement !== scrub) scrub.value = S.playhead;
      time.textContent = fmtTime(S.playhead, S.doc.comp.fps) + ' / ' + d.toFixed(2) + ' s';
      loopBtn.setAttribute('aria-pressed', String(!!S.loop));
      player.setLoop(S.loop ? 'loop' : 'none');
      player.setDuration(d);
      rangeNote.textContent = S.range ? t('effects.tr.range', { a: S.range.in.toFixed(2), b: S.range.out.toFixed(2) }) : '';
      rangeBtn.setAttribute('aria-pressed', String(!!S.range));
    }

    S.on((what) => { if (what === 'doc' || what === 'time' || what === 'view') refresh(); });
    refresh();
    return { play, pause, toggle, start, end, stepFrames, setIn, setOut, clearRange, seekTo, player, refresh, get playing() { return player.playing; } };
  }

  ns.transport = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
