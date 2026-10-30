/* Slop Drive — core/player: the one audio player for the whole Drive. Quick look, the details panel and the mini bar
 * are all views of it. It owns its object URL, so closing a panel or re-rendering one does not stop the sound. Playing
 * a file in a folder moves through the audio files of the list in order (ended → next). DR.player.subscribe(fn) → unsubscribe. */
'use strict';
(function (DR) {
  const audio = new Audio();
  audio.preload = 'metadata';
  const listeners = new Set();
  let url = null;
  const P = DR.player = { cur: null, audio, error: null, rate: 1, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const emit = () => { for (const fn of [...listeners]) { try { fn(P); } catch (e) { console.error(e); } } };
  ['play', 'pause', 'timeupdate', 'loadedmetadata', 'durationchange', 'seeked', 'volumechange', 'ratechange', 'waiting', 'canplay']
    .forEach((t) => audio.addEventListener(t, emit));
  audio.addEventListener('ended', () => { if (P.list().length > 1) P.step(1); else emit(); });
  audio.addEventListener('error', () => {
    const code = audio.error ? audio.error.code : 0, ext = (P.cur && DR.ext(P.cur.name) || '').toUpperCase();
    P.error = DR.t('drive.audio.cannot_play' + (ext ? '' : '_this') + (code === 4 ? '_format' : ''), { ext });
    emit();
  });
  /** Loads a file (an autoplay starts it). Loading the file that is already loaded keeps its position. */
  P.load = function (r, { autoplay = true } = {}) {
    if (!r || !r.blob) return;
    if (!(P.cur && P.cur.id === r.id && url)) {
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(r.blob);
      P.cur = r; P.error = null;
      audio.src = url; audio.playbackRate = P.rate;
    }
    emit();
    if (autoplay) P.play();
  };
  P.play = function () {
    if (!P.cur) return;
    const p = audio.play();
    if (p && p.catch) p.catch((e) => { P.error = e.name === 'NotAllowedError' ? DR.t('drive.audio.press_play') : P.error || DR.t('drive.audio.not_played'); emit(); });
  };
  P.toggle = () => (audio.paused ? P.play() : audio.pause());
  /** Moves to a time in seconds (clamped to the file). */
  P.seek = function (t) {
    if (!P.cur || !isFinite(audio.duration)) return;
    audio.currentTime = Math.min(audio.duration, Math.max(0, t));
  };
  P.skip = (d) => P.seek(audio.currentTime + d);
  P.setRate = function (x) { P.rate = x; audio.playbackRate = x; emit(); };
  P.setVolume = (v) => { audio.volume = Math.min(1, Math.max(0, v)); };
  P.stop = function () {
    audio.pause(); audio.removeAttribute('src'); audio.load();
    if (url) URL.revokeObjectURL(url);
    url = null; P.cur = null; P.error = null; emit();
  };
  /** The audio files of the list on screen, in order. */
  P.list = () => (DR.lastVisible || []).filter((x) => !x.isFolder && DR.kindOf(x) === 'audio');
  /** The next (n = 1) or previous (n = -1) audio file in the list; wraps around. */
  P.step = function (n) {
    const list = P.list();
    if (!list.length) return;
    const i = P.cur ? list.findIndex((x) => x.id === P.cur.id) : -1;
    const next = list[i < 0 ? (n > 0 ? 0 : list.length - 1) : (i + n + list.length) % list.length];
    if (next && (!P.cur || next.id !== P.cur.id)) P.load(next);
  };
  /** The full waveform peaks of an audio file (decoded once, kept with its thumbnail), or null when they cannot be made. */
  DR.audioPeaks = async function (r) {
    await DR.thumb(r);
    const m = DR.mediaInfo(r);
    return m && m.peaks ? m.peaks : null;
  };
})(window.DR);
