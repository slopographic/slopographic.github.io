/* Slop Music: the playback engine. One <audio> element, the queue (SlopMusic.queue) and the track source
 * (a Slop Drive blob, played through an object URL). Lives on the page, so playback goes on while other tabs
 * are open. Only one Music tab plays at a time: starting here pauses the others (SlopHub bus).
 * Exposes window.SlopMusic.engine. Subscribers get called with no argument on any change. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const H = () => window.SlopHub, Q = M.queue;
  const audio = new Audio();
  audio.preload = 'auto';
  const pref = (k, d) => { try { const v = localStorage.getItem('slop-music.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const keep = (k, v) => { try { localStorage.setItem('slop-music.' + k, JSON.stringify(v)); } catch (e) { /* blocked: not saved */ } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const T = (k) => (window.SlopI18n ? window.SlopI18n.t(k) : k);   // the error shown under the player
  const st = { q: { ids: [], order: [], index: -1, shuffle: !!pref('shuffle', false), repeat: pref('repeat', 'off') },
    trackId: null, error: '', muted: !!pref('muted', false) };
  let url = null, seq = 0;
  const subs = new Set();
  const emit = () => { M.media && M.media.sync(state()); subs.forEach((f) => { try { f(); } catch (e) { console.warn(e); } }); };
  audio.volume = clamp(Number(pref('volume', 0.8)), 0, 1);
  audio.playbackRate = Number(pref('rate', 1)) || 1;
  audio.muted = st.muted;

  function state() {
    const d = isFinite(audio.duration) ? audio.duration : (M.lib && st.trackId && M.lib.track(st.trackId) ? M.lib.track(st.trackId).duration : null);
    return { trackId: st.trackId, playing: !audio.paused, time: audio.currentTime || 0, duration: d, volume: audio.volume,
      rate: audio.playbackRate, muted: audio.muted, shuffle: st.q.shuffle, repeat: st.q.repeat, queue: st.q, error: st.error };
  }
  async function loadId(id, autoplay) {
    const mine = ++seq;
    st.trackId = id; st.error = '';
    const rec = await H().get(id);
    if (mine !== seq) return;
    if (!rec) { st.error = T('music.err.gone'); audio.pause(); emit(); return; }
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(rec.blob);
    audio.src = url;
    emit();
    if (autoplay) await play();
  }
  async function play() {
    if (!audio.src) return;
    H().emit('music:playing', { tab: H().self.id });
    try { await audio.play(); st.error = ''; } catch (e) { st.error = T('music.err.blocked'); }
    emit();
  }
  function pause() { audio.pause(); }
  function playIndex(i) {
    st.q.index = i;
    return loadId(st.q.order[i], true);
  }
  /** Starts a queue made from ids (list order) at startId. */
  function setQueue(ids, startId) {
    st.q = Q.create(ids, startId, { shuffle: st.q.shuffle, repeat: st.q.repeat });
    if (!st.q.order.length) return Promise.resolve();
    return playIndex(st.q.index);
  }
  function next() {
    const i = Q.step(st.q, 1, false);
    if (i < 0) { audio.pause(); audio.currentTime = 0; emit(); return Promise.resolve(); }
    return playIndex(i);
  }
  function prev() {
    if (audio.currentTime > 3) return Promise.resolve(seek(0));
    const i = Q.step(st.q, -1, false);
    if (i < 0) { seek(0); return Promise.resolve(); }
    return playIndex(i);
  }
  function ended() {
    const i = Q.step(st.q, 1, true);
    if (i < 0) { audio.pause(); audio.currentTime = 0; emit(); return; }
    if (st.q.repeat === 'one' && i === st.q.index) { audio.currentTime = 0; play(); return; }
    playIndex(i);
  }
  function seek(t) {
    const d = isFinite(audio.duration) ? audio.duration : 0;
    audio.currentTime = d ? clamp(t, 0, d) : Math.max(0, t);
    emit();
  }
  function setVolume(v) { audio.volume = clamp(v, 0, 1); keep('volume', audio.volume); emit(); }
  function toggleMute() { audio.muted = !audio.muted; st.muted = audio.muted; keep('muted', st.muted); emit(); }
  function setRate(r) { audio.playbackRate = clamp(r, 0.5, 2); keep('rate', audio.playbackRate); emit(); }
  function setShuffle(on) { st.q = Q.setShuffle(st.q, !!on); keep('shuffle', st.q.shuffle); emit(); }
  function setRepeat(mode) { st.q.repeat = mode; keep('repeat', mode); emit(); }
  const REPEAT_NEXT = { off: 'all', all: 'one', one: 'off' };
  function cycleRepeat() { setRepeat(REPEAT_NEXT[st.q.repeat] || 'off'); }
  /** Puts a track in the queue, right after the current one ('next') or at the end ('last'). With an empty queue
   * the track is loaded, paused. */
  function enqueue(id, where = 'last') {
    if (!st.q.order.length || st.q.index < 0) { st.q = Q.create([id], id, { shuffle: st.q.shuffle, repeat: st.q.repeat }); return loadId(id, false); }
    const cur = st.q.order[st.q.index], order = st.q.order.filter((x) => x !== id || x === cur);
    const at = order.indexOf(cur);
    if (id !== cur) order.splice(where === 'next' ? at + 1 : order.length, 0, id);
    st.q = Object.assign({}, st.q, { order, index: at, ids: st.q.ids.includes(id) ? st.q.ids : st.q.ids.concat(id) });
    emit();
    return Promise.resolve();
  }
  const current = () => (st.trackId ? M.lib.track(st.trackId) : null);

  audio.addEventListener('timeupdate', () => { M.media && M.media.position(state()); subs.forEach((f) => f()); });
  ['play', 'pause', 'durationchange', 'volumechange', 'ratechange', 'seeked'].forEach((ev) => audio.addEventListener(ev, emit));
  audio.addEventListener('loadedmetadata', () => { if (st.trackId && M.lib) M.lib.setDuration(st.trackId, audio.duration); emit(); });
  audio.addEventListener('ended', ended);
  audio.addEventListener('error', () => { if (audio.src) { st.error = T('music.err.cannot_play'); audio.pause(); emit(); } });
  if (H()) H().on('music:playing', () => { if (!audio.paused) audio.pause(); });

  M.engine = { audio, state, current, subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
    setQueue, play, pause, toggle: () => (audio.paused ? play() : pause()), next, prev, seek, setVolume, toggleMute,
    setRate, setShuffle, setRepeat, cycleRepeat, playIndex, enqueue };
  // Convert… in the header (shared/convert/provided.js): the current track's file from Slop Drive.
  addEventListener('slop:convert-files', (e) => e.detail.provide(async () => {
    const rec = st.trackId && H() ? await H().get(st.trackId).catch(() => null) : null;
    return rec && rec.blob ? [{ name: rec.name, blob: rec.blob }] : null;
  }));
})();
