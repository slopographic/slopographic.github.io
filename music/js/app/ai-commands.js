/* Slop Music: SlopCmd commands with arguments (shared/commands/args.js). They show in the Ctrl+K palette and are the
 * tools of the Slop AI panel, WebMCP and the Claude Code bridge (shared/ai/cmdtools.js). Each one calls the player's own
 * engine, library and playlists (no second implementation). From the palette (args null) a command that needs a
 * choice opens the view or dialog for it. Music is a player: it plays, queues, tags, lists and exports playlists; it does
 * not make songs.
 * Classic script; adds window.SlopMusic.cmds.install(), called by main.js after SlopCmd.init({ app: 'music' }). */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const A = () => M.ai, E = () => M.engine, P = () => M.playlists;
  const S = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 200, description }, extra);
  const N = (name, min, max, def, description, extra) => Object.assign({ name, type: 'number', min, max, default: def, description }, extra);
  const TRACK = [S('id', 'the track’s Slop Drive id (from app_state or find_tracks)'), S('title', 'words from the title, artist or album, when there is no id')];
  const PLAYLIST = S('playlist', 'the playlist’s id or name');
  const defaults = (schema) => Object.fromEntries(schema.filter((a) => a.default !== undefined).map((a) => [a.name, a.default]));
  const name = (t) => `“${M.lib.display(t)}”`;
  const list = [];
  /** One command: id mu.<tool>, run(args) with the defaults filled when the palette runs it; ask() when args are null. */
  function add(tool, title, description, args, run, extra = {}) {
    const { ask, ...rest } = extra;
    list.push(Object.assign({ id: 'mu.' + tool.replace(/_/g, '-'), tool, title, group: 'Player', description, args, destructive: false,
      run: (a) => (a == null && ask ? ask() : run(a || defaults(args))) }, rest));
  }
  const libraryIds = () => M.libUI.visible().map((t) => t.id);
  const tidy = (v) => Math.round(v * 100) / 100;

  /* playback */
  add('play', 'Play', 'Play, or go on playing. With nothing loaded it starts the library from the top.', [], async () => {
    if (!E().state().trackId) { const ids = libraryIds(); if (!ids.length) throw new Error('The library is empty. Add audio files to Slop Drive first.'); await E().setQueue(ids, ids[0]); }
    else await E().play();
    const s = E().state();
    if (s.error) throw new Error(s.error);
    return `Playing ${name(E().current())}.`;
  });
  add('pause', 'Pause', 'Pause the music.', [], () => { E().pause(); return 'Paused.'; });
  add('play_pause', 'Play or pause', 'Pause when playing, play when paused.', [], async () => { await E().toggle(); return E().state().playing ? 'Playing.' : 'Paused.'; });
  add('play_track', 'Play a track…', 'Play one track, found by its Slop Drive id or by words from its title, artist or album. The queue becomes the library (or the playlist when one is given).',
    TRACK.concat([S('playlist', 'play it inside this playlist (id or name); the playlist becomes the queue')]), async (a) => {
      const t = A().trackOf(a.id, a.title);
      let ids = libraryIds();
      if (a.playlist) { const p = A().playlistOf(a.playlist); ids = p.trackIds.filter((id) => M.lib.track(id)); if (!ids.includes(t.id)) throw new Error(`${name(t)} is not in “${p.name}”.`); }
      if (!ids.includes(t.id)) ids = M.lib.list().map((x) => x.id);   // a search filter in the library hides it
      await E().setQueue(ids, t.id);
      if (E().state().error) throw new Error(E().state().error);
      return `Playing ${name(t)}${t.artist ? ' by ' + t.artist : ''}.`;
    }, { ask: () => M.setView('library', { focus: true }) });
  add('play_playlist', 'Play a playlist…', 'Play a playlist from its first track (or shuffled).', [PLAYLIST, { name: 'shuffle', type: 'boolean', description: 'shuffle it; leave out to keep the current setting' }], async (a) => {
    const p = A().playlistOf(a.playlist, { selected: true }), ids = p.trackIds.filter((id) => M.lib.track(id));
    if (!ids.length) throw new Error(`“${p.name}” has no tracks that are in the library.`);
    if (a.shuffle != null) E().setShuffle(a.shuffle);
    await E().setQueue(ids, a.shuffle ? ids[Math.floor(Math.random() * ids.length)] : ids[0]);
    return `Playing “${p.name}” (${ids.length} track${ids.length === 1 ? '' : 's'})${E().state().shuffle ? ', shuffled' : ''}.`;
  }, { ask: () => M.setView('playlists', { focus: true }) });
  add('next', 'Next track', 'Skip to the next track in the queue.', [], async () => { await E().next(); const t = E().current(); return t && E().state().playing ? `Playing ${name(t)}.` : 'That was the last track.'; });
  add('previous', 'Previous track', 'Go back one track (after 3 seconds into a track it restarts the track instead).', [], async () => { await E().prev(); const t = E().current(); return t ? `On ${name(t)}.` : 'Nothing to go back to.'; });
  add('seek', 'Seek', 'Jump to a time in the current track, or forward or back by some seconds.',
    [N('seconds', 0, 86400, 10, 'seconds'), { name: 'mode', type: 'enum', values: ['to', 'forward', 'back'], default: 'forward', description: 'to: that time from the start; forward / back: from where it is now' }], (a) => {
      const s = E().state();
      if (!s.trackId) throw new Error('Nothing is loaded. Play a track first.');
      E().seek(a.mode === 'to' ? a.seconds : s.time + (a.mode === 'back' ? -a.seconds : a.seconds));
      const t = E().state().time;
      return `At ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.`;
    });
  add('volume', 'Set the volume', 'Set the volume in percent, and mute or unmute.', [N('percent', 0, 100, undefined, '0 is silent, 100 is full'), { name: 'muted', type: 'boolean', description: 'true mutes, false unmutes' }], (a) => {
    if (a.percent == null && a.muted == null) throw new Error('Give percent (0 to 100) or muted.');
    if (a.percent != null) E().setVolume(a.percent / 100);
    if (a.muted != null && a.muted !== E().state().muted) E().toggleMute();
    const s = E().state();
    return `Volume ${Math.round(s.volume * 100)}%${s.muted ? ', muted' : ''}.`;
  }, { ask: () => E().toggleMute() });
  add('speed', 'Set the speed', 'Playback speed: 1 is normal, 0.5 half, 2 double.', [N('rate', 0.5, 2, 1, 'times normal speed', { step: 0.05 })], (a) => { E().setRate(a.rate); return `Speed ${tidy(E().state().rate)}×.`; });
  add('shuffle', 'Shuffle', 'Turn shuffle on or off (the current track keeps playing).', [{ name: 'on', type: 'boolean', description: 'true for on, false for off; leave out to switch' }], (a) => {
    E().setShuffle(a.on == null ? !E().state().shuffle : a.on); return `Shuffle is ${E().state().shuffle ? 'on' : 'off'}.`;
  });
  add('repeat', 'Repeat', 'Repeat off, the whole queue (all) or the current track (one).', [{ name: 'mode', type: 'enum', values: ['off', 'all', 'one'], description: 'leave out to go to the next mode' }], (a) => {
    if (a.mode) E().setRepeat(a.mode); else E().cycleRepeat();
    return `Repeat is ${E().state().repeat}.`;
  });
  add('queue_track', 'Add a track to the queue…', 'Put a track in the queue: to play next, or at the end.', TRACK.concat([{ name: 'position', type: 'enum', values: ['next', 'last'], default: 'last', description: 'next: right after this track; last: at the end' }]), async (a) => {
    const t = A().trackOf(a.id, a.title);
    await E().enqueue(t.id, a.position);
    return E().state().queue.order.length === 1 ? `Loaded ${name(t)}; it plays when you press play.` : `${name(t)} plays ${a.position === 'next' ? 'next' : 'at the end of the queue'}.`;
  }, { ask: () => { M.setView('now'); M.now.openQueue(true); } });

  /* library */
  add('find_tracks', 'Find tracks…', 'Search the library by title, artist, album, file name or tag. Gives ids, titles, artists, albums, durations (s) and tags.',
    [S('query', 'words to look for; empty lists the library'), N('limit', 1, 100, 20, 'at most this many', { integer: true })],
    (a) => A().search(a.query, a.limit).map(A().brief), { group: 'Library', ask: () => M.setView('library', { focus: true }) });
  add('tag_track', 'Tag a track…', 'Add tags to a track, remove some, or replace its tags. Tags are kept on the file in Slop Drive. The current track when no id or title is given.',
    TRACK.concat([S('tags', 'tags separated by commas', { required: true }), { name: 'mode', type: 'enum', values: ['add', 'remove', 'replace'], default: 'add' }]), async (a) => {
      const t = A().trackOf(a.id, a.title, { current: true }), given = window.SlopTags.parse(a.tags);
      const next = a.mode === 'replace' ? given : a.mode === 'remove' ? t.tags.filter((g) => !given.includes(g)) : t.tags.concat(given);
      if (!(await M.lib.setTags(t.id, next))) throw new Error(`${name(t)} is no longer in Slop Drive.`);
      return `${name(t)} is tagged ${M.lib.track(t.id).tags.join(', ') || '(no tags)'}.`;
    }, { group: 'Library', ask: () => { const t = E().current(); if (t) M.libUI.editTags(t); else M.setView('library', { focus: true }); } });

  /* playlists */
  const G = { group: 'Playlists' };
  add('create_playlist', 'New playlist…', 'Make a playlist, empty or with tracks (Slop Drive ids, separated by commas).',
    [S('name', 'the playlist name', { required: true, maxLength: 80 }), S('track_ids', 'track ids separated by commas', { maxLength: 4000 })], async (a) => {
      const ids = String(a.track_ids || '').split(/[\s,]+/).filter(Boolean), bad = ids.filter((id) => !M.lib.track(id));
      if (bad.length) throw new Error(`Not in the library: ${bad.join(', ')}.`);
      const p = await P().create(a.name, ids);
      return `Made the playlist “${p.name}” (id ${p.id}) with ${p.trackIds.length} track${p.trackIds.length === 1 ? '' : 's'}.`;
    }, Object.assign({ destructive: false, ask: () => { M.setView('playlists'); return M.plUI.create(); } }, G));
  add('rename_playlist', 'Rename playlist…', 'Give a playlist a new name.', [PLAYLIST, S('name', 'the new name', { required: true, maxLength: 80 })], async (a) => {
    const p = A().playlistOf(a.playlist), was = p.name;
    await P().rename(p.id, a.name);
    return `Renamed “${was}” to “${P().get(p.id).name}”.`;
  }, Object.assign({ ask: () => { const p = M.plUI.selected(); if (p) return M.plUI.rename(p); M.setView('playlists'); } }, G));
  add('add_to_playlist', 'Add a track to a playlist…', 'Add a track (by id or title) to the end of a playlist.', [PLAYLIST].concat(TRACK), async (a) => {
    const p = A().playlistOf(a.playlist), t = A().trackOf(a.id, a.title, { current: true });
    const n = await P().addTracks(p.id, [t.id]);
    return n ? `Added ${name(t)} to “${p.name}”.` : `${name(t)} is already in “${p.name}”.`;
  }, Object.assign({ ask: () => { const p = M.plUI.selected(); if (p) return M.plUI.addTracks(p); M.setView('playlists'); } }, G));
  add('remove_from_playlist', 'Remove a track from a playlist…', 'Take a track out of a playlist. The track stays in the library and in Slop Drive.', [PLAYLIST].concat(TRACK), async (a) => {
    const p = A().playlistOf(a.playlist), t = a.id && !M.lib.track(a.id) ? { id: a.id } : A().trackOf(a.id, a.title);
    if (!p.trackIds.includes(t.id)) throw new Error(`That track is not in “${p.name}”.`);
    await P().setTracks(p.id, p.trackIds.filter((id) => id !== t.id));
    return `Took ${t.title === undefined ? 'the track' : name(t)} out of “${p.name}”.`;
  }, Object.assign({ ask: () => M.setView('playlists', { focus: true }) }, G));
  add('delete_playlist', 'Delete playlist…', 'Delete a playlist. Its tracks stay in the library and in Slop Drive.', [Object.assign({}, PLAYLIST, { required: true })], async (a) => {
    const p = A().playlistOf(a.playlist);
    if (M.plUI.selected() && M.plUI.selected().id === p.id) M.plUI.select(null);
    await P().remove(p.id);
    return `Deleted the playlist “${p.name}”.`;
  }, Object.assign({ destructive: true, ask: () => { const p = M.plUI.selected(); if (p) return M.plUI.remove(p); M.setView('playlists'); } }, G));

  add('export_playlist', 'Export a playlist…', 'Save a playlist as a file: splaylist (opens again in Slop Music) or m3u (for other players; it lists the file names, so keep it next to the audio files). To Slop Drive, a download or both.',
    [PLAYLIST, { name: 'format', type: 'enum', values: ['splaylist', 'm3u'], default: 'splaylist' },
      { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive', description: 'Slop Drive, a download, or both' }], async (a) => {
      const p = A().playlistOf(a.playlist, { selected: true }), rows = M.plfile.rows(p);
      const blob = a.format === 'm3u' ? M.plfile.m3u(p.name, rows) : M.plfile.build(p.name, rows);
      const file = a.format === 'm3u' ? M.plfile.m3uName(p.name) : M.plfile.fileName(p.name), out = [];
      if (a.to !== 'download') out.push(`saved ${file} to Slop Drive (id ${await window.SlopHub.put(blob, { name: file, from: 'music' })})`);
      if (a.to !== 'drive') { window.SlopUI.download(blob, file); out.push(`downloaded ${file}`); }
      return `“${p.name}” (${rows.length} track${rows.length === 1 ? '' : 's'}): ${out.join(' and ')}.`;
    }, Object.assign({ ask: () => { const p = M.plUI.selected(); if (p) return M.plUI.saveToDrive(p); M.setView('playlists'); } }, G));

  M.cmds = {
    list,
    install() {
      if (!window.SlopCmd || !SlopCmd.register) return;
      // the palette's titles and groups in the current language (music/i18n/<code>/commands.js), again after a change
      const I = window.SlopI18n, tr = (k, en) => (I && I.has(k) ? I.t(k) : en);
      const shown = () => list.map((c) => Object.assign({}, c, { title: tr('music.cmd.' + c.tool, c.title), group: tr('music.cmd.group_' + c.group.toLowerCase(), c.group) }));
      SlopCmd.register(shown());
      if (I && I.on) I.on(() => SlopCmd.register(shown()));
      SlopCmd.provide({ state: () => A().state(), checkpoint: () => A().checkpoint() });
    },
  };
})();
