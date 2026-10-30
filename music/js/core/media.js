/* Slop Music: the Media Session API. Lock-screen and OS media keys show the track, its cover and controls.
 * Exposes window.SlopMusic.media = { sync(state), position(state) }. Does nothing where the API is missing. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const ms = navigator.mediaSession || null;
  let artUrl = '', lastId = null;
  const eng = () => M.engine;
  function set(action, fn) { try { ms.setActionHandler(action, fn); } catch (e) { /* action not supported here */ } }
  function bind() {
    if (!ms) return;
    set('play', () => eng().play());
    set('pause', () => eng().pause());
    set('previoustrack', () => eng().prev());
    set('nexttrack', () => eng().next());
    set('seekto', (d) => eng().seek(d.seekTime));
    set('seekbackward', (d) => eng().seek(eng().audio.currentTime - (d.seekOffset || 10)));
    set('seekforward', (d) => eng().seek(eng().audio.currentTime + (d.seekOffset || 10)));
  }
  /** Called on every state change: metadata when the track changes, playback state always. */
  function sync(s) {
    if (!ms || !M.engine) return;
    const t = s.trackId ? M.lib.track(s.trackId) : null;
    if (t && t.id !== lastId) {
      lastId = t.id;
      if (artUrl) URL.revokeObjectURL(artUrl);
      artUrl = t.cover ? URL.createObjectURL(t.cover) : '';
      try {
        ms.metadata = new MediaMetadata({
          title: M.lib.display(t), artist: t.artist || '', album: t.album || '',
          artwork: artUrl ? [{ src: artUrl, sizes: '512x512', type: t.cover.type || 'image/jpeg' }] : [],
        });
      } catch (e) { /* MediaMetadata missing */ }
    }
    ms.playbackState = s.trackId ? (s.playing ? 'playing' : 'paused') : 'none';
    position(s);
  }
  function position(s) {
    if (!ms || !ms.setPositionState || !s.duration) return;
    try { ms.setPositionState({ duration: s.duration, playbackRate: s.rate || 1, position: Math.min(s.time || 0, s.duration) }); } catch (e) { /* invalid state */ }
  }
  M.media = { sync, position };
  bind();
})();
