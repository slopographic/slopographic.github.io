/* SlopCut: the media library (runtime side of the bin). Each item keeps its Blob in IndexedDB so the
   project survives a reload. Runtime record: { id, blob, url, meta, status, el, bmp, audio, peaks, thumbs, poster }.
   The metadata (meta) also lives in SE.doc.media so the project knows what it uses. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, A = SE.analyze;
  const L = SE.media = { items: new Map() };

  L.get = (id) => L.items.get(id);
  L.ready = (id) => { const it = L.items.get(id); return !!it && it.status === 'ready'; };
  function notify(it) { SE.emit('media', { id: it && it.id }); }

  /** Analyse a record (fills el/bmp/audio/peaks/thumbs). Safe to call once per item. */
  async function analyse(it) {
    const m = it.meta;
    try {
      if (m.kind === 'image') {
        const r = await A.probeImage(it.blob);
        it.bmp = r.bmp; m.w = r.w; m.h = r.h; m.dur = Infinity;
        it.thumbs = A.imageThumb(r.bmp); it.poster = it.thumbs[0].c;
      } else if (m.kind === 'video') {
        const r = await A.probeVideo(it.url);
        m.dur = r.dur; m.w = r.w; m.h = r.h;
        it.status = 'analysing'; notify(it);
        it.audio = await A.decodeAudio(it.blob);
        m.hasAudio = !!it.audio;
        if (it.audio) it.peaks = A.peaks(it.audio);
        it.thumbs = await A.thumbs(r.el, m.dur, U.clamp(Math.ceil(m.dur / 3), 1, 24));
        it.poster = it.thumbs[0] ? it.thumbs[0].c : null;
        r.el.removeAttribute('src'); r.el.load();
      } else {
        const r = await A.probeAudio(it.url).catch(() => ({ dur: NaN }));
        it.audio = await A.decodeAudio(it.blob);
        if (!it.audio) throw new Error('This audio format is not supported by your browser');
        m.dur = isFinite(r.dur) ? r.dur : it.audio.duration; m.hasAudio = true;
        it.peaks = A.peaks(it.audio);
        it.poster = A.waveThumb(it.peaks);
        it.thumbs = [];
      }
      it.status = 'ready';
    } catch (e) {
      it.status = 'error'; it.error = e.message || String(e);
      console.warn('SlopCut: could not read', m.name, e);
    }
    notify(it);
    SE.emit('media-ready', { id: it.id });
    return it;
  }
  function register(id, blob, meta) {
    const it = { id, blob, url: URL.createObjectURL(blob), meta, status: 'loading', thumbs: [], poster: null };
    L.items.set(id, it);
    return it;
  }
  /** A bin record that a config named but no file came with yet (status 'missing'). Clips already point at its id. */
  L.addMissing = function (meta) {
    const it = register(meta.id, new Blob([]), meta);
    it.status = 'missing';
    it.error = U.t('slopedit.media.missing', { name: meta.name });
    notify(it);
    return it;
  };
  /** The missing record a file matches by name, or null. */
  function missingFor(name) {
    for (const it of L.items.values()) if (it.status === 'missing' && it.meta.name === name) return it;
    return null;
  }
  /** Import File/Blob objects into the bin. Returns the new metadata records (ready). A file that matches a missing
   *  record by name fills that record instead (its id stays, so the clips that name it come alive). */
  L.importFiles = async function (files, { from = 'file' } = {}) {
    const out = [];
    const jobs = [];
    for (const f of files) {
      const kind = A.kindOf(f);
      if (!kind) { SlopUI.toast(U.t('slopedit.media.skipped', { name: f.name })); continue; }
      const miss = missingFor(f.name);
      if (miss) {
        const meta = miss.meta;
        Object.assign(meta, { kind, type: f.type || '', size: f.size, from, hasAudio: kind === 'audio' });
        const it = register(meta.id, f, meta);
        U.idb.putMedia({ id: meta.id, name: meta.name, type: meta.type, blob: f }).catch(() => null);
        jobs.push(analyse(it).then(() => { if (it.status === 'ready') out.push(meta); else SlopUI.toast(meta.name + ': ' + it.error, 4000); }));
        continue;
      }
      const id = U.uid('m');
      const meta = { id, name: f.name || 'media', kind, type: f.type || '', size: f.size, dur: NaN, w: 0, h: 0, hasAudio: kind === 'audio', from };
      const it = register(id, f, meta);
      SE.doc.media.push(meta);
      notify(it);
      U.idb.putMedia({ id, name: meta.name, type: meta.type, blob: f }).catch((e) => console.warn('SlopCut: media not stored', e));
      jobs.push(analyse(it).then(() => { if (it.status === 'ready') out.push(meta); else SlopUI.toast(meta.name + ': ' + it.error, 4000); }));
    }
    await Promise.all(jobs);
    SE.emit('autosave');
    return out;
  };
  /** Bring back media for a loaded/restored project (blobs from IndexedDB or from a map). */
  L.restore = async function (metas, blobs) {
    const jobs = [];
    for (const meta of metas) {
      if (L.items.has(meta.id)) continue;
      let blob = blobs && blobs.get(meta.id);
      if (!blob) { const rec = await U.idb.getMedia(meta.id).catch(() => null); blob = rec && rec.blob; }
      else U.idb.putMedia({ id: meta.id, name: meta.name, type: meta.type, blob }).catch(() => null);
      if (!blob) { const it = register(meta.id, new Blob([]), meta); it.status = 'missing'; it.error = U.t('slopedit.media.media_file_missing'); continue; }
      jobs.push(analyse(register(meta.id, blob, meta)));
    }
    notify(null);
    await Promise.all(jobs);
  };
  /** Remove an item from the bin (and its clips, as one undoable step). */
  L.remove = function (id) {
    const it = L.items.get(id);
    SE.change(U.t('slopedit.bin.remove_media'), (p) => { p.clips = p.clips.filter((c) => c.media !== id); });
    SE.doc.media = SE.doc.media.filter((m) => m.id !== id);
    if (it) { URL.revokeObjectURL(it.url); L.items.delete(id); }
    U.idb.delMedia(id).catch(() => null);
    notify(null); SE.emit('autosave');
  };
  /** Forget everything (new project). Blobs are deleted from IndexedDB too. */
  L.clear = function () {
    for (const it of L.items.values()) URL.revokeObjectURL(it.url);
    L.items.clear();
    U.idb.clearMedia().catch(() => null);
    notify(null);
  };
  /** Delete stored blobs no longer referenced by the project. */
  L.gc = async function () {
    const keep = new Set(SE.doc.media.map((m) => m.id));
    for (const k of await U.idb.mediaKeys().catch(() => [])) if (!keep.has(k)) U.idb.delMedia(k).catch(() => null);
  };
  /** Thumbnail canvas nearest to source time t. */
  L.thumbAt = function (it, t) {
    const th = it && it.thumbs;
    if (!th || !th.length) return it && it.poster;
    let best = th[0];
    for (const x of th) if (Math.abs(x.t - t) < Math.abs(best.t - t)) best = x;
    return best.c;
  };
})();
