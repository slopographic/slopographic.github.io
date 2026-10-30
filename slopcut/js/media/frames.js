/* SlopCut: frame-accurate video frames for export and snapshots.
   Preferred path: demux the MP4 and decode with WebCodecs VideoDecoder (exact frames, fast).
   Fallback: a private <video> element seeked to each frame (requestVideoFrameCallback when available).
   SE.frames.exporter(p) → { prepare(t), get(clip, srcT), close(), mode } */
(function () {
  'use strict';
  const SE = window.SE, M = SE.model, A = SE.analyze;
  const FR = SE.frames = {};
  const EPS = 1e-3;

  /** Demux once per media item; resolves with a decodable video track or null. */
  FR.track = function (it) {
    if (!it.demuxP) it.demuxP = (async () => {
      if (typeof VideoDecoder !== 'function' || !(await SE.demux.isMp4(it.blob))) return null;
      const d = await SE.demux.mp4(it.blob);
      const t = d && d.tracks.find((x) => x.type === 'video' && x.samples.length && x.codec);
      if (!t) return null;
      const cfg = { codec: t.codec, codedWidth: t.width, codedHeight: t.height };
      if (t.description) cfg.description = t.description;
      try { const s = await VideoDecoder.isConfigSupported(cfg); if (!s.supported) return null; } catch (e) { return null; }
      t.config = cfg;
      t.order = t.samples.map((s, i) => i).filter((i) => t.samples[i].key).sort((a, b) => t.samples[a].pts - t.samples[b].pts);
      return t;
    })().catch((e) => { console.warn('SlopCut: demux failed', e); return null; });
    return it.demuxP;
  };

  /** Sequential VideoDecoder reader for one clip. frameAt(t) → VideoFrame (owned by the reader). */
  class DecReader {
    constructor(it, track) { this.it = it; this.t = track; this.read = SE.demux.reader(it.blob); this.frames = []; this.cur = null; this.feed = 0; this.flushed = false; this.err = null; this.wake = null; this.mode = 'decoder'; this.open(); }
    open() {
      this.dec = new VideoDecoder({ output: (f) => { this.frames.push(f); if (this.wake) this.wake(); }, error: (e) => { this.err = e; if (this.wake) this.wake(); } });
      this.dec.configure(this.t.config);
    }
    drop() { for (const f of this.frames) f.close(); this.frames = []; if (this.cur) { this.cur.close(); this.cur = null; } }
    seekTo(target) {
      const S = this.t.samples;
      let k = this.t.order[0];
      for (const i of this.t.order) if (S[i].pts <= target + EPS) k = i; else break;
      this.drop();
      try { this.dec.reset(); } catch (e) { /* closed */ }
      if (this.dec.state === 'closed') this.open(); else this.dec.configure(this.t.config);
      this.feed = k; this.flushed = false;
    }
    needSeek(target) {
      if (!this.cur && this.feed === 0 && !this.frames.length) return true;
      const ts = this.cur ? this.cur.timestamp / 1e6 : this.frames.length ? this.frames[0].timestamp / 1e6 : -1;
      if (ts > target + EPS) return true;
      // far ahead: jump if a keyframe lies between the decode position and the target
      const S = this.t.samples;
      for (const i of this.t.order) if (S[i].pts <= target + EPS && i > this.feed + 30) return true;
      return false;
    }
    async frameAt(target) {
      if (this.err) throw this.err;
      if (this.needSeek(target)) this.seekTo(target);
      const S = this.t.samples;
      for (let guard = 0; guard < 100000; guard++) {
        if (this.err) throw this.err;
        while (this.frames.length && this.frames[0].timestamp / 1e6 <= target + EPS) { if (this.cur) this.cur.close(); this.cur = this.frames.shift(); }
        if (this.frames.length && this.cur) return this.cur;
        if (this.flushed && this.feed >= S.length && this.dec.decodeQueueSize === 0) return this.cur || this.frames[0] || null;
        if (this.frames.length && !this.cur) return this.frames[0];
        let fed = 0;
        while (this.feed < S.length && this.dec.decodeQueueSize < 6 && this.frames.length < 3 && fed < 8) {
          const s = S[this.feed++];
          const data = await this.read(s.offset, s.size);
          this.dec.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: Math.round(s.pts * 1e6), duration: Math.round(s.dur * 1e6), data }));
          fed++;
        }
        if (this.feed >= S.length && !this.flushed) { this.flushed = true; await this.dec.flush().catch((e) => { this.err = this.err || e; }); continue; }
        if (!fed) await new Promise((r) => { this.wake = r; setTimeout(r, 20); });
        this.wake = null;
      }
      return this.cur;
    }
    close() { this.drop(); try { this.dec.close(); } catch (e) { /* already closed */ } }
  }

  /** Seek-based fallback reader using a private <video>. */
  class SeekReader {
    constructor(it) { this.v = A.videoEl(it.url); this.mode = 'seek'; this.ready = A.waitEvent(this.v, 'loadeddata', 20000).catch(() => null); }
    async frameAt(t) {
      await this.ready;
      const v = this.v;
      if (Math.abs(v.currentTime - t) > 1e-4 || v.readyState < 2) {
        const done = A.waitEvent(v, 'seeked', 10000);
        v.currentTime = Math.min(t + 1e-4, Math.max(0, (v.duration || t) - 1e-3));
        await done.catch(() => null);
        if (v.requestVideoFrameCallback) await new Promise((r) => { const id = v.requestVideoFrameCallback(() => r()); setTimeout(() => { if (v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(id); r(); }, 120); });
      }
      return v;
    }
    close() { this.v.removeAttribute('src'); try { this.v.load(); } catch (e) { /* ignore */ } }
  }

  /** Frame provider for the compositor: prepare(t) fetches every frame needed at t. */
  FR.exporter = function (p, { forceSeek = false } = {}) {
    const readers = new Map(), ready = new Map();
    const modes = new Set();
    async function reader(c) {
      if (readers.has(c.id)) return readers.get(c.id);
      const it = SE.media.get(c.media);
      const tr = forceSeek ? null : await FR.track(it);
      let r;
      try { r = tr ? new DecReader(it, tr) : new SeekReader(it); } catch (e) { r = new SeekReader(it); }
      modes.add(r.mode);
      readers.set(c.id, r);
      return r;
    }
    return {
      get mode() { return modes.has('seek') ? (modes.has('decoder') ? 'mixed' : 'seek') : 'decoder'; },
      async prepare(t) {
        ready.clear();
        const layers = SE.compositor.layers(p, t), jobs = [];
        for (const L of layers) { jobs.push([L.clip, L.srcT]); if (L.clip.matteMedia) jobs.push([SE.matteDraw.clipOf(L.clip), L.srcT]); } // a matte pair also needs its matte frame
        const live = new Set(jobs.map((j) => j[0].id));
        for (const [c, srcT] of jobs) {
          if (c.kind !== 'video') continue;
          const it = SE.media.get(c.media);
          if (!it || it.status !== 'ready') continue;
          let r = await reader(c);
          let f = null;
          try { f = await r.frameAt(srcT); }
          catch (e) {
            console.warn('SlopCut: decoder failed, falling back to seeking', e);
            r.close(); r = new SeekReader(it); readers.set(c.id, r); modes.add('seek');
            f = await r.frameAt(srcT);
          }
          ready.set(c.id, f);
        }
        for (const [id, r] of readers) { const c = M.clip(p, id.replace(/:matte$/, '')); if (!c || (!live.has(id) && t > M.end(c) + 1)) { r.close(); readers.delete(id); } }
      },
      get(c) {
        if (c.kind === 'image') { const it = SE.media.get(c.media); return it && it.bmp; }
        return ready.get(c.id) || null;
      },
      close() { for (const r of readers.values()) r.close(); readers.clear(); ready.clear(); }
    };
  };
  /** Same provider for a single still (snapshots). */
  FR.preview = () => FR.exporter(SE.doc);
})();
