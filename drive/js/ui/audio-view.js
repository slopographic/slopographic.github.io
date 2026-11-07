/* Slop Drive — ui/audio-view: the audio player shown in Quick look and the details panel. A view of DR.player
 * (core/player.js): the full waveform (click or drag to seek; the played part is drawn in the kind's colour), play and
 * pause, 10-second skips, previous and next in the folder, speed, volume and the time. With the player focused, Space
 * plays or pauses and the arrow keys seek 5 seconds. Its keys stop here, so Quick look does not take them. */
'use strict';
(function (DR) {
  const el = DR.el, P = DR.player;
  const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const clock = (t) => { if (!isFinite(t) || t < 0) t = 0; const s = Math.floor(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  DR.audioView = function (r, big = false) {
    const wave = el('canvas', { class: 'ap-wave', title: DR.t('drive.audio.seek_tip'), 'aria-hidden': 'true', 'data-touch-surface': '' }); // a finger scrubs, never scrolls (shared/input)
    const msg = el('p', { class: 'ap-msg', role: 'status' });
    const time = el('span', { class: 'ap-time' }, '0:00 / 0:00');
    const button = (label, title, act, cls = '') => {
      const b = el('button', { type: 'button', class: 'btn ap-b ' + cls, title, 'aria-label': title }, label);
      b.addEventListener('click', () => act());
      return b;
    };
    const play = button('▶', DR.t('drive.audio.play'), () => playThis(), 'ap-play');
    const rate = el('select', { class: 'inp ap-rate', 'aria-label': DR.t('drive.audio.speed') }, RATES.map((x) => el('option', { value: String(x) }, x + '×')));
    rate.addEventListener('change', () => P.setRate(Number(rate.value)));
    const vol = el('input', { type: 'range', min: '0', max: '1', step: '0.01', class: 'ap-vol', 'aria-label': DR.t('drive.audio.volume'), value: String(P.audio.volume) });
    vol.addEventListener('input', () => P.setVolume(Number(vol.value)));
    const box = el('div', { class: 'ap' + (big ? ' big' : ''), tabindex: '0', role: 'group', 'aria-label': DR.t('drive.audio.player_of', { name: r.name }) },
      wave,
      el('div', { class: 'ap-row' },
        button('⏮', DR.t('drive.audio.prev'), () => P.step(-1), 'ap-step'), button('−10 s', DR.t('drive.audio.back10'), () => skip(-10)),
        play, button('+10 s', DR.t('drive.audio.fwd10'), () => skip(10)), button('⏭', DR.t('drive.audio.next'), () => P.step(1), 'ap-step'),
        time, rate, vol),
      msg);
    let peaks = null, peaksDone = false, pending = null, unsub = () => {};
    const isCur = () => !!(P.cur && P.cur.id === r.id);
    const durNow = () => (isCur() && isFinite(P.audio.duration) ? P.audio.duration : ((DR.mediaInfo(r) || {}).duration || 0));
    /** Plays this file: starts it, or toggles it when it is the one loaded. */
    function playThis() { if (isCur()) P.toggle(); else P.load(r); }
    function skip(d) { if (!isCur()) P.load(r, { autoplay: false }); P.skip(d); }
    function seekFrac(f) {
      if (isCur() && isFinite(P.audio.duration)) P.seek(f * P.audio.duration);
      else { pending = f; if (!isCur()) P.load(r, { autoplay: false }); }
      update();
    }
    function draw() {
      const dpr = window.devicePixelRatio || 1, w = wave.clientWidth || 300, h = wave.clientHeight || 84;
      if (wave.width !== Math.round(w * dpr) || wave.height !== Math.round(h * dpr)) { wave.width = Math.round(w * dpr); wave.height = Math.round(h * dpr); }
      const g = wave.getContext('2d'), dur = durNow(), frac = isCur() && dur ? Math.min(1, P.audio.currentTime / dur) : 0;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const faint = '#8a8a94', colour = DR.kindColor(r), n = peaks ? peaks.length : 0;
      if (!n) { g.fillStyle = faint; g.fillRect(0, h / 2, w, 1); }
      else {
        const bw = w / n;
        for (let i = 0; i < n; i++) {
          g.fillStyle = (i + 0.5) / n <= frac ? colour : faint;
          const bh = Math.max(2, peaks[i] * h * 0.9);
          g.fillRect(i * bw, (h - bh) / 2, Math.max(1, bw * 0.7), bh);
        }
      }
      g.fillStyle = '#f2f2f4'; g.fillRect(Math.round(frac * w), 0, 2, h);
      wave.dataset.pos = frac.toFixed(4);
    }
    function update() {
      if (!box.isConnected) { unsub(); return; }
      const cur = isCur(), a = P.audio, dur = durNow();
      if (pending != null && cur && isFinite(a.duration)) { P.seek(pending * a.duration); pending = null; }
      const playing = cur && !a.paused;
      play.textContent = playing ? '❚❚' : '▶';
      play.title = DR.t(playing ? 'drive.audio.pause' : 'drive.audio.play');
      play.setAttribute('aria-label', play.title);
      time.textContent = `${clock(cur ? a.currentTime : 0)} / ${clock(dur)}`;
      rate.value = String(P.rate);
      if (document.activeElement !== vol) vol.value = String(a.volume);
      msg.textContent = cur && P.error ? P.error : peaksDone && !peaks ? DR.t('drive.audio.no_wave') : '';
      draw();
    }
    // Keys: Space plays or pauses; the arrows seek. They stop here, so Quick look and the Drive do not take them.
    box.addEventListener('keydown', (e) => {
      if (e.target !== box) return;
      if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); playThis(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); skip(e.key === 'ArrowRight' ? 5 : -5); }
    });
    // A press on the waveform seeks; a drag keeps seeking.
    const fracAt = (e) => { const b = wave.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - b.left) / (b.width || 1))); };
    let scrub = false;
    wave.addEventListener('pointerdown', (e) => {
      scrub = true;
      try { wave.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no pointer to capture */ }
      seekFrac(fracAt(e));
    });
    wave.addEventListener('pointermove', (e) => { if (scrub) seekFrac(fracAt(e)); });
    const endScrub = () => { scrub = false; };
    wave.addEventListener('pointerup', endScrub);
    wave.addEventListener('pointercancel', endScrub);
    unsub = P.subscribe(update);
    DR.audioPeaks(r).then((p) => { peaks = p; peaksDone = true; update(); }, () => { peaksDone = true; update(); });
    update();
    return box;
  };
})(window.DR);
