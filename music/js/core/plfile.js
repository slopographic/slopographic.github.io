/* Slop Music: the .splaylist file. JSON with the Slop Drive ids of the tracks, plus title, artist and album
 * for people reading it. Saved to Slop Drive, opened from it. Also an .m3u of the same tracks for other players (it
 * lists the file names, so it plays next to the audio files). Exposes window.SlopMusic.plfile. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const MIME = 'application/x-slop-playlist', EXT = '.splaylist';
  /** A Blob of the playlist. tracks: [{ id, title, artist, album, duration }] in play order. */
  function build(name, tracks) {
    const doc = {
      format: 'slop-playlist', version: 1, name,
      tracks: tracks.map((t) => ({ drive: t.id, title: t.title || '', artist: t.artist || '', album: t.album || '', duration: t.duration ?? null })),
    };
    return new Blob([JSON.stringify(doc, null, 2)], { type: MIME });
  }
  /** The rows of a playlist for build and m3u: its tracks that are in the library, in play order. */
  function rows(p) {
    return p.trackIds.map((id) => M.lib.track(id)).filter(Boolean)
      .map((t) => ({ id: t.id, file: t.name, title: M.lib.display(t), artist: t.artist, album: t.album, duration: t.duration }));
  }
  /** A Blob of an extended M3U playlist: #EXTINF with the length and "artist - title", then the file name. */
  function m3u(name, tracks) {
    const one = (s) => String(s || '').replace(/[\r\n]+/g, ' ');
    const lines = ['#EXTM3U', '#PLAYLIST:' + one(name)];
    for (const t of tracks) {
      lines.push(`#EXTINF:${t.duration != null ? Math.round(t.duration) : -1},${one(t.artist ? t.artist + ' - ' + t.title : t.title)}`, one(t.file));
    }
    return new Blob([lines.join('\n') + '\n'], { type: 'audio/x-mpegurl' });
  }
  /** Reads a .splaylist text. Returns { name, trackIds }. Throws when it is not a Slop playlist. */
  function parse(text) {
    const doc = JSON.parse(text);
    if (!doc || doc.format !== 'slop-playlist' || !Array.isArray(doc.tracks)) throw new Error('This is not a Slop playlist.');
    return { name: String(doc.name || 'Playlist').slice(0, 80), trackIds: doc.tracks.map((t) => String(t.drive || '')).filter(Boolean) };
  }
  const base = (name) => String(name || 'Playlist').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Playlist';
  M.plfile = { build, parse, rows, m3u, MIME, EXT, fileName: (name) => base(name) + EXT, m3uName: (name) => base(name) + '.m3u' };
})();
