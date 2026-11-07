/* SlopCut: <video> elements for the live preview, one per visible clip. While playing they run at
   the clip's speed and are nudged back when they drift from the playhead; when paused they seek to
   the exact frame and ask for a redraw once it has arrived. */
(function () {
  'use strict';
  const SE = window.SE;
  const VP = SE.vpool = { els: new Map() };
  const DRIFT = 0.18;

  function make(c) {
    const it = SE.media.get(c.media);
    if (!it || !it.url) return null;
    const v = SE.analyze.videoEl(it.url);
    const rec = { el: v, media: c.media, last: performance.now(), target: null, seeking: false };
    v.addEventListener('seeked', () => {
      rec.seeking = false;
      if (rec.target != null && Math.abs(v.currentTime - rec.target) > 0.02) seek(rec, rec.target);
      else SE.emit('frame', {});
    });
    v.addEventListener('loadeddata', () => SE.emit('frame', {}));
    VP.els.set(c.id, rec);
    return rec;
  }
  function seek(rec, t) {
    rec.target = t;
    if (rec.seeking) return;
    rec.seeking = true;
    try { if (typeof rec.el.fastSeek === 'function' && SE.player.playing && SE.player.rate !== 1) rec.el.fastSeek(t); else rec.el.currentTime = t; } catch (e) { rec.seeking = false; }
  }
  /** Video element for clip at source time srcT; null until it has a frame. */
  VP.get = function (c, srcT) {
    let rec = VP.els.get(c.id);
    if (!rec || rec.media !== c.media) rec = make(c);
    if (!rec) return null;
    rec.last = performance.now();
    const v = rec.el, P = SE.player, fps = SE.doc.fps;
    if (P.playing && P.rate === 1) {
      if (v.playbackRate !== c.speed) v.playbackRate = c.speed;
      if (v.paused) { if (Math.abs(v.currentTime - srcT) > 0.05) v.currentTime = srcT; const pr = v.play(); if (pr && pr.catch) pr.catch(() => null); }
      else if (Math.abs(v.currentTime - srcT) > DRIFT * Math.max(1, c.speed)) v.currentTime = srcT;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs((rec.seeking ? rec.target : v.currentTime) - srcT) > 0.25 / fps) seek(rec, srcT);
    }
    return v.readyState >= 2 ? v : null;
  };
  /** Pre-roll clips about to start so playback doesn't stall at cuts. */
  VP.preload = function (p, t) {
    for (const c of p.clips) {
      if (c.kind !== 'video' || c.start <= t || c.start - t > 1.5) continue;
      let rec = VP.els.get(c.id);
      if (!rec) rec = make(c);
      if (rec && !SE.player.playing) continue;
      if (rec && rec.el.paused && Math.abs(rec.el.currentTime - c.in) > 0.05) { rec.el.currentTime = c.in; }
      if (rec) rec.last = performance.now();
    }
  };
  /** Pause elements not used in this frame; free the ones idle for a while. */
  VP.prune = function (activeIds) {
    const now = performance.now();
    for (const [id, rec] of VP.els) {
      if (activeIds.has(id)) continue;
      if (!rec.el.paused) rec.el.pause();
      if (now - rec.last > 8000 || !SE.model.clip(SE.doc, id)) { rec.el.removeAttribute('src'); try { rec.el.load(); } catch (e) { /* ignore */ } VP.els.delete(id); }
    }
  };
  VP.pauseAll = function () { for (const rec of VP.els.values()) if (!rec.el.paused) rec.el.pause(); };
  VP.clear = function () { for (const rec of VP.els.values()) { rec.el.removeAttribute('src'); try { rec.el.load(); } catch (e) { /* ignore */ } } VP.els.clear(); };
})();
