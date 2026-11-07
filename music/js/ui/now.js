/* Slop Music: the Now playing view. Large cover, title, the waveform, transport controls, volume, speed,
 * the track's tags (add and remove), and the queue as a sheet (a bottom sheet on phones). Exposes window.SlopMusic.now. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const UI = () => window.SlopUI, el = (...a) => UI().el(...a);
  const $ = (id) => document.getElementById(id);
  const T = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  let peaks = null, peaksFor = null, lastKey = '', queueKey = '';
  const icon = (id) => el('svg', { class: 'mu-ic', 'aria-hidden': 'true' }, el('use', { href: '#i-' + id }));
  function cur() { return M.engine.current(); }
  async function loadPeaks(id) {
    if (peaksFor === id) return;
    peaksFor = id; peaks = null;
    const a = id ? await M.store.getAnalysis(id) : null;
    if (peaksFor === id) { peaks = a && a.peaks ? a.peaks : null; paint(); }
  }
  function paintCover(t) {
    const box = $('now-cover');
    const key = t ? t.id + '|' + (t.coverUrl || '') : 'none';
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    box.replaceChildren(t ? M.fmt.tile(t, 'mu-cover-img mu-cover-big') : el('span', { class: 'mu-cover-none' }, '♪'));
  }
  function paintTags(t) {
    const box = $('now-tags');
    if (!t) { box.replaceChildren(); return; }
    box.replaceChildren(...t.tags.map((g) => el('span', { class: 'mu-chip mu-chip-x' }, g,
      el('button', { type: 'button', class: 'mu-chip-del', 'aria-label': T('music.now.remove_tag', { tag: g }), onclick: () => M.lib.setTags(t.id, t.tags.filter((x) => x !== g)) }, '×'))));
  }
  function paintQueue(s) {
    const ids = s.queue.order.join('|');
    if ($('queue-sheet').hidden) return;
    const k = ids + '#' + s.trackId;
    if (k === queueKey) return;
    queueKey = k;
    $('queue-list').replaceChildren(...s.queue.order.map((id, i) => {
      const t = M.lib.track(id);
      return el('li', { class: 'mu-row' + (id === s.trackId ? ' on' : '') },
        el('button', { type: 'button', class: 'mu-row-main', onclick: () => M.engine.playIndex(i) },
          el('span', { class: 'mu-idx' }, String(i + 1)), el('span', { class: 'mu-txt' }, el('b', null, t ? M.lib.display(t) : T('music.now.missing')), el('small', null, t ? t.artist || '' : ''))));
    }));
  }
  function paint() {
    const s = M.engine.state(), t = cur();
    const key = [s.trackId, s.playing, s.shuffle, s.repeat, s.muted, s.volume.toFixed(2), s.rate, s.error].join('|');
    if (key !== lastKey) {
      lastKey = key;
      if (t !== null && t.id !== peaksFor) loadPeaks(t.id);
      paintCover(t);
      paintTags(t);
      $('now-title').textContent = t ? M.lib.display(t) : T('music.now.nothing');
      $('now-artist').textContent = t ? t.artist || '' : T('music.now.choose');
      $('now-album').textContent = t ? [t.album, t.year, t.genre].filter(Boolean).join(' · ') : '';
      const pb = $('now-play');
      pb.setAttribute('aria-label', s.playing ? T('music.now.pause') : T('music.now.play'));
      pb.querySelector('use').setAttribute('href', s.playing ? '#i-pause' : '#i-play');
      $('now-shuffle').setAttribute('aria-pressed', String(s.shuffle));
      const rp = $('now-repeat');
      rp.setAttribute('aria-label', T('music.now.repeat_' + s.repeat));
      rp.dataset.mode = s.repeat;
      rp.querySelector('use').setAttribute('href', s.repeat === 'one' ? '#i-repeat1' : '#i-repeat');
      rp.classList.toggle('on', s.repeat !== 'off');
      $('now-mute').querySelector('use').setAttribute('href', s.muted || s.volume === 0 ? '#i-mute' : '#i-vol');
      $('now-vol').value = String(s.volume);
      $('now-rate').value = String(s.rate);
      $('now-err').textContent = s.error;
    }
    const d = s.duration || 0, time = s.time || 0;
    $('now-cur').textContent = M.fmt.time(time);
    $('now-dur').textContent = M.fmt.time(d || null);
    M.wave.draw($('now-wave'), peaks, d ? time / d : 0);
    $('now-wave').setAttribute('aria-valuenow', String(Math.round(d ? (time / d) * 100 : 0)));
    paintQueue(s);
  }
  function addTag() {
    const t = cur(), input = $('now-tag-input');
    if (!t) return;
    const add = window.SlopTags.parse(input.value);
    if (!add.length) return;
    input.value = '';
    M.lib.setTags(t.id, window.SlopTags.withAdded(t.tags, add));
  }
  function openQueue(open) {
    $('queue-sheet').hidden = !open;
    $('now-queue').setAttribute('aria-expanded', String(open));
    queueKey = '';
    if (open) paint();
  }
  function bind() {
    const e = M.engine;
    $('now-play').addEventListener('click', () => e.toggle());
    $('now-prev').addEventListener('click', () => e.prev());
    $('now-next').addEventListener('click', () => e.next());
    $('now-shuffle').addEventListener('click', () => e.setShuffle(!e.state().shuffle));
    $('now-repeat').addEventListener('click', () => e.cycleRepeat());
    $('now-mute').addEventListener('click', () => e.toggleMute());
    $('now-vol').addEventListener('input', (ev) => e.setVolume(Number(ev.target.value)));
    $('now-rate').addEventListener('change', (ev) => e.setRate(Number(ev.target.value)));
    $('now-queue').addEventListener('click', () => openQueue($('queue-sheet').hidden));
    $('queue-close').addEventListener('click', () => openQueue(false));
    $('queue-sheet').addEventListener('keydown', (ev) => { if (ev.key === 'Escape') openQueue(false); });
    $('now-tag-add').addEventListener('click', addTag);
    $('now-tag-input').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addTag(); } });
    M.wave.attach($('now-wave'), (f) => { const d = e.state().duration; if (d) e.seek(f * d); });
    $('now-wave').addEventListener('keydown', (ev) => { if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); e.seek(e.state().time + (ev.key === 'ArrowLeft' ? -5 : 5)); } });
    e.subscribe(paint);
    M.lib.subscribe(() => { lastKey = ''; paint(); });
    // a language change: the labels the code sets (title, play, repeat) and the queue again
    if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => { lastKey = ''; queueKey = ''; paint(); });
    paint();
  }
  M.now = { bind, paint, openQueue, addTag };
})();
