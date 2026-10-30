/* Slop Music: the library. The audio files in Slop Drive, with their analysis (tags, duration, cover) and
 * their tags. Tags are stored on each Drive record in meta.tags, so they stay with the file (shared/tags).
 * Exposes window.SlopMusic.lib. Subscribers are told when anything changes. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const H = () => window.SlopHub, T = () => window.SlopTags;
  const AUDIO = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/x-flac', 'audio/mp4', 'audio/aac', 'audio/opus'];
  const tracks = new Map();
  const subs = new Set();
  let loading = null;
  const emit = () => subs.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });

  const titleOf = (t) => t.title || M.id3.titleFromName(t.name);
  function blank(rec) {
    return { id: rec.id, name: rec.name, size: rec.size, type: M.id3.typeOf(rec.name, rec.type), tags: T().of(rec),
      title: '', artist: '', album: '', track: 0, year: '', genre: '', duration: null, cover: null, coverUrl: '', error: '', analyzed: false };
  }
  function setCover(t, blob) {
    if (t.coverUrl) URL.revokeObjectURL(t.coverUrl);
    t.cover = blob || null;
    t.coverUrl = blob ? URL.createObjectURL(blob) : '';
  }
  function applyAnalysis(t, a) {
    t.title = a.title || ''; t.artist = a.artist || ''; t.album = a.album || '';
    t.track = a.track || 0; t.year = a.year || ''; t.genre = a.genre || '';
    if (a.duration != null && t.duration == null) t.duration = a.duration;
    t.error = a.error || ''; t.analyzed = true;
    setCover(t, a.cover);
  }
  /** Re-reads the Drive audio files: adds new ones, drops removed ones, keeps analysis for the rest. */
  function load() {
    if (loading) return loading;
    loading = (async () => {
      const recs = await H().list({ accept: AUDIO }); // intake-ok: the music library, not a picker
      const seen = new Set();
      for (const rec of recs) {
        seen.add(rec.id);
        const t = tracks.get(rec.id) || blank(rec);
        Object.assign(t, { name: rec.name, size: rec.size, type: M.id3.typeOf(rec.name, rec.type), tags: T().of(rec) });
        tracks.set(rec.id, t);
      }
      for (const id of [...tracks.keys()]) if (!seen.has(id)) { const t = tracks.get(id); if (t.coverUrl) URL.revokeObjectURL(t.coverUrl); tracks.delete(id); }
      emit();
      await Promise.all(recs.map((rec) => M.analyze(rec).then((a) => {
        const t = tracks.get(rec.id);
        if (t) { applyAnalysis(t, a); emit(); }
      }).catch((e) => console.warn('Analysis failed', e))));
      return list();
    })().finally(() => { loading = null; });
    return loading;
  }
  /** All tracks as an array (no order promised). */
  const list = () => [...tracks.values()];
  const track = (id) => tracks.get(id) || null;
  /** Display title: the tag title, else the file name without its extension. */
  const display = (t) => (t ? titleOf(t) : '');
  /** Duration learned from the browser (MP3 without a decodable analysis). */
  function setDuration(id, d) {
    const t = tracks.get(id);
    if (t && t.duration == null && isFinite(d) && d > 0) { t.duration = d; emit(); }
  }
  /** Replace a track's tags on its Drive record. */
  async function setTags(id, tags) {
    const rec = await H().get(id);
    if (!rec) return false;
    const clean = [...new Set(tags.map(T().norm).filter(Boolean))];
    await H().update(id, { meta: Object.assign({}, rec.meta || {}, { tags: clean }) }, { touch: false });
    const t = tracks.get(id);
    if (t) t.tags = clean;
    emit();
    return true;
  }
  /** Adds files to Slop Drive (typed as audio) and reloads the library. Resolves with the number added. */
  async function addFiles(files) {
    let n = 0;
    for (const f of files) {
      const type = M.id3.typeOf(f.name, f.type);
      const blob = f.type === type ? f : new Blob([f], { type });
      await H().put(blob, { name: f.name, from: 'music' });
      n++;
    }
    if (n) await load();
    return n;
  }
  /** The tag list over all tracks, with counts (most used first). */
  const tagCounts = () => T().counts(list().map((t) => ({ isFolder: false, meta: { tags: t.tags } })));
  M.lib = { load, list, track, display, setDuration, setTags, addFiles, tagCounts, subscribe: (f) => { subs.add(f); return () => subs.delete(f); }, AUDIO };
})();
