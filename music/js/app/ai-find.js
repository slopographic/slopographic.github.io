/* Slop Music for the assistant: finding tracks and playlists by id or by words, the state summary (SlopCmd.provide
 * state) and the checkpoint (playlists and tags back as they were). Used by ai-commands.js. Classic script; adds
 * window.SlopMusic.ai = { trackOf, playlistOf, search, brief, state, checkpoint }. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const low = (s) => String(s || '').trim().toLowerCase();
  const title = (t) => M.lib.display(t);
  const byTitle = (a, b) => title(a).localeCompare(title(b), undefined, { numeric: true, sensitivity: 'base' });

  /** Tracks matching words (title, artist, album, file name, tags), best first: exact title, title start, then the rest. */
  function search(query, limit = 20) {
    const q = low(query), words = q.split(/\s+/).filter(Boolean), all = M.lib.list().sort(byTitle);
    if (!words.length) return all.slice(0, limit);
    const hay = (t) => low([title(t), t.artist, t.album, t.name, (t.tags || []).join(' ')].join(' '));
    const rank = (t) => (low(title(t)) === q ? 0 : low(title(t)).startsWith(q) ? 1 : low(title(t)).includes(q) ? 2 : 3);
    return all.filter((t) => words.every((w) => hay(t).includes(w))).sort((a, b) => rank(a) - rank(b)).slice(0, limit);
  }
  /** One track: by its Slop Drive id, else the best match for the title words. Throws a plain message when none. */
  function trackOf(id, words, { current = false } = {}) {
    if (id) { const t = M.lib.track(String(id).trim()); if (t) return t; if (!words) throw new Error(`No track with the id “${id}” in the library.`); }
    if (words) { const hit = search(words, 1)[0]; if (hit) return hit; throw new Error(`No track matches “${words}”. Use find_tracks to see what is in the library.`); }
    if (current && M.engine.current()) return M.engine.current();
    throw new Error(current ? 'Nothing is playing. Give a track id or a title.' : 'Give a track id or a title.');
  }
  /** One playlist: by id, else by name (exact, then the first that contains the words). */
  function playlistOf(key, { selected = false } = {}) {
    const all = M.playlists.all(), k = low(key);
    if (k) {
      const p = M.playlists.get(String(key).trim()) || all.find((x) => low(x.name) === k) || all.find((x) => low(x.name).includes(k));
      if (p) return p;
      throw new Error(`No playlist called “${key}”.` + (all.length ? ' The playlists are: ' + all.map((x) => x.name).join(', ') + '.' : ' There are no playlists yet.'));
    }
    const sel = selected && M.plUI && M.plUI.selected();
    if (sel) return sel;
    throw new Error('Give the playlist (its id or name).');
  }
  const brief = (t) => ({ id: t.id, title: title(t), artist: t.artist || '', album: t.album || '', duration: t.duration == null ? null : Math.round(t.duration), tags: (t.tags || []).slice() });
  const uniq = (xs) => new Set(xs.filter(Boolean)).size;

  /** What the assistant reads with app_state: library summary, now playing, the queue and the playlists with ids. */
  function state() {
    const s = M.engine.state(), all = M.lib.list().sort(byTitle), t = M.engine.current(), q = s.queue;
    return {
      app: 'Slop Music: a player for the audio in Slop Drive (it does not make or edit music)',
      library: { tracks: all.length, artists: uniq(all.map((x) => x.artist)), albums: uniq(all.map((x) => x.album)),
        tags: M.lib.tagCounts().slice(0, 12).map(([tag, count]) => ({ tag, count })),
        first: all.slice(0, 30).map((x) => ({ id: x.id, title: title(x), artist: x.artist || '' })),
        more: all.length > 30 ? 'Use find_tracks to search the rest.' : undefined },
      nowPlaying: t ? Object.assign(brief(t), { playing: s.playing, time: Math.round(s.time) }) : null,
      error: s.error || undefined,
      player: { volume: Math.round(s.volume * 100), muted: s.muted, speed: s.rate, shuffle: s.shuffle, repeat: s.repeat },
      queue: { length: q.order.length, position: q.index + 1,
        upNext: q.order.slice(q.index + 1, q.index + 6).map((id) => { const x = M.lib.track(id); return { id, title: x ? title(x) : 'Not in Slop Drive' }; }) },
      playlists: M.playlists.all().map((p) => ({ id: p.id, name: p.name, tracks: p.trackIds.length })),
    };
  }
  /** "Undo all AI changes": the playlists and the track tags as they were when the request started. */
  function checkpoint() {
    const lists = M.playlists.all().map((p) => JSON.parse(JSON.stringify(p)));
    const tags = new Map(M.lib.list().map((t) => [t.id, (t.tags || []).slice()]));
    return async () => {
      const keep = new Set(lists.map((p) => p.id));
      for (const p of M.playlists.all()) if (!keep.has(p.id)) await M.playlists.remove(p.id);
      for (const p of lists) await M.store.putPlaylist(p);
      await M.playlists.load();
      for (const t of M.lib.list()) {
        const was = tags.get(t.id);
        if (was && was.join('\n') !== (t.tags || []).join('\n')) await M.lib.setTags(t.id, was);
      }
    };
  }
  M.ai = { trackOf, playlistOf, search, brief, state, checkpoint };
})();
