/* Slop Music: the mini player bar. Shown at the bottom of the Music app while a track is loaded and the Now
 * playing view is not open: the track, play or pause, a progress bar, and a link back to Now playing.
 * Exposes window.SlopMusic.mini = { bind, paint }. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const $ = (id) => document.getElementById(id);
  const T = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  let showNow = () => {};
  function paint(view) {
    const s = M.engine.state(), t = s.trackId ? M.lib.track(s.trackId) : null;
    const bar = $('mini');
    bar.hidden = !t || view === 'now';
    if (!t) return;
    $('mini-title').textContent = M.lib.display(t);
    $('mini-sub').textContent = [t.artist, s.error].filter(Boolean).join(' · ');
    $('mini-play').setAttribute('aria-label', s.playing ? T('music.now.pause') : T('music.now.play'));
    $('mini-play').querySelector('use').setAttribute('href', s.playing ? '#i-pause' : '#i-play');
    const d = s.duration || 0;
    $('mini-bar').style.width = (d ? Math.min(100, (s.time / d) * 100) : 0) + '%';
    $('mini-progress').setAttribute('aria-valuenow', String(Math.round(d ? (s.time / d) * 100 : 0)));
  }
  function bind(onNow) {
    showNow = onNow;
    $('mini-play').addEventListener('click', () => M.engine.toggle());
    $('mini-return').addEventListener('click', (e) => { e.preventDefault(); showNow(); });
    $('mini-title').addEventListener('click', () => showNow());
  }
  M.mini = { bind, paint };
})();
