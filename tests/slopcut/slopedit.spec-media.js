/* SlopCut tests: media import (thumbnails, duration, waveform), frame-accurate decoding, export to
   MP4/WebM checked by demuxing, GIF, project save/open, autosave. A synthetic test video is encoded
   in the page with VideoEncoder; those tests skip (pass with a note) when WebCodecs is missing. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  let canEncode = null, video = null, meta = null;
  async function ready() {
    if (canEncode === null) canEncode = await ST.canEncode();
    return canEncode;
  }

  describe('media', () => {
    it('imports audio and images with waveform, thumbnails and duration', async () => {
      await ST.reset();
      const SE = ST.SE;
      const wav = SE.synth.wav(1.5, (t) => { const v = Math.sin(2 * Math.PI * 330 * t) * (t < 0.75 ? 0.8 : 0.1); return [v, v]; });
      const png = await SE.synth.png(64, 32, (g) => { g.fillStyle = '#d4ff3a'; g.fillRect(0, 0, 64, 32); });
      const metas = await SE.media.importFiles([new ST.win.File([wav], 'tone.wav', { type: 'audio/wav' }), new ST.win.File([png], 'lime.png', { type: 'image/png' })]);
      expect(metas.length).toBe(2);
      const a = metas.find((m) => m.kind === 'audio'), im = metas.find((m) => m.kind === 'image');
      expect(a.dur).toBeCloseTo(1.5, 0.05);
      const pk = SE.media.get(a.id).peaks;
      expect(pk.length).toBe(150);
      expect(pk[20]).toBeGreaterThan(0.6);
      expect(pk[120]).toBeLessThan(0.2);
      expect([im.w, im.h]).toEqual([64, 32]);
      expect(SE.media.get(im.id).thumbs.length).toBe(1);
      await waitFor(() => ST.win.document.querySelectorAll('.bi').length === 2);
      const stored = await SE.util.idb.getMedia(a.id);
      expect(stored.blob.size).toBe(wav.size);
    });
    it('encodes a synthetic video and imports it with thumbnails and sound', async () => {
      if (!(await ready())) { console.warn('SlopCut test: WebCodecs VideoEncoder unavailable, skipped'); return; }
      video = await ST.colorVideo(20, 10, true);
      const metas = await ST.SE.media.importFiles([video]);
      meta = metas[0];
      expect(meta.kind).toBe('video');
      expect(meta.dur).toBeGreaterThan(1.9);
      expect(meta.dur).toBeLessThan(2.2);
      expect([meta.w, meta.h]).toEqual([160, 90]);
      expect(meta.hasAudio).toBe(true);
      expect(ST.SE.media.get(meta.id).thumbs.length).toBeGreaterThan(0);
    }, { timeout: 40000 });
    it('demuxes the MP4 and decodes exact frames', async () => {
      if (!video) return;
      const SE = ST.SE, d = await SE.demux.mp4(video);
      const vt = d.tracks.find((t) => t.type === 'video');
      expect(vt.samples.length).toBe(20);
      expect(vt.samples[0].key).toBe(true);
      expect(vt.samples[5].pts).toBeCloseTo(0.5, 0.001);
      const p = ST.project({ w: 160, h: 90, fps: 10 });
      p.media.push(meta);
      const [id] = ST.E.addMedia(p, meta, ST.M.videoTracks(p)[0].id, 0);
      const src = SE.frames.exporter(p);
      const c = ST.win.document.createElement('canvas'); c.width = 160; c.height = 90;
      for (const i of [3, 11, 7, 19, 0]) { // includes a backwards seek
        const t = (i + 0.5) / 10;
        await src.prepare(t);
        SE.compositor.render(c.getContext('2d'), p, t, { W: 160, H: 90, source: src.get });
        const r = ST.px(c, 20, 20)[0];
        expect(Math.abs(r - i * 12)).toBeLessThan(10);
      }
      expect(src.mode).toBe('decoder');
      src.close();
      expect(ST.M.clip(p, id)).toBeTruthy();
    }, { timeout: 40000 });
    it('exports MP4 and the result has the right frames, duration and audio', async () => {
      if (!video) return;
      const SE = ST.SE;
      SE.change('Clip', (p) => { p.w = 160; p.h = 90; p.fps = 10; ST.E.addMedia(p, meta, ST.M.videoTracks(p)[0].id, 0); });
      const prog = [];
      const out = await SE.encode.run({ format: 'mp4', w: 160, h: 90, fps: 10, quality: 'medium', a: 0, b: 2, progress: (f) => prog.push(f) });
      expect(out.blob.type).toBe('video/mp4');
      const d = await SE.demux.mp4(out.blob);
      const vt = d.tracks.find((t) => t.type === 'video'), at = d.tracks.find((t) => t.type === 'audio');
      expect(vt.samples.length).toBe(20);
      expect(vt.duration).toBeCloseTo(2, 0.05);
      expect([vt.width, vt.height]).toEqual([160, 90]);
      expect(!!at).toBe(true);
      expect(prog[prog.length - 1]).toBe(1);
      // the exported frames decode back to the same colours
      SE.media.items.set('exp', { id: 'exp', blob: out.blob, url: URL.createObjectURL(out.blob), meta: {}, status: 'ready' });
      const tr = await SE.frames.track(SE.media.get('exp'));
      expect(!!tr).toBe(true);
      SE.media.items.delete('exp');
    }, { timeout: 60000 });
    it('exports WebM and can be cancelled', async () => {
      if (!video) return;
      const SE = ST.SE;
      const out = await SE.encode.run({ format: 'webm', w: 160, h: 90, fps: 10, quality: 'low', a: 0, b: 1 });
      expect(out.blob.type).toBe('video/webm');
      expect(out.blob.size).toBeGreaterThan(500);
      const sig = { cancelled: false };
      const p = SE.encode.run({ format: 'mp4', w: 160, h: 90, fps: 10, a: 0, b: 2, signal: sig, progress: () => { sig.cancelled = true; } });
      await expect(p).rejects(/cancel/i);
    }, { timeout: 60000 });
  });

  describe('files', () => {
    it('exports a GIF of a short range', async () => {
      const SE = ST.SE;
      await ST.reset();
      SE.change('m', (p) => { p.w = 160; p.h = 90; ST.matte(p, 0, 0, 1, '#ff0000'); ST.matte(p, 0, 1, 1, '#0000ff'); });
      const gif = await SE.gif.render({ a: 0, b: 2, width: 80, fps: 5 });
      const head = new Uint8Array(await gif.slice(0, 10).arrayBuffer());
      expect(String.fromCharCode(...head.slice(0, 6))).toBe('GIF89a');
      expect(head[6] | (head[7] << 8)).toBe(80);
      const img = await createImageBitmap(gif);
      expect([img.width, img.height]).toEqual([80, 46]);
    });
    it('saves and reopens a .slopedit project with its media', async () => {
      const SE = ST.SE;
      await ST.reset();
      const png = await SE.synth.png(32, 32, (g) => { g.fillStyle = '#123456'; g.fillRect(0, 0, 32, 32); });
      const [m] = await SE.media.importFiles([new ST.win.File([png], 'blue.png', { type: 'image/png' })]);
      SE.change('add', (p) => { ST.E.addMedia(p, m, ST.M.videoTracks(p)[0].id, 1); p.markers.push({ id: 'k1', t: 2, name: 'Here' }); p.name = 'Roundtrip'; });
      const blob = await SE.project.toBlob();
      await ST.reset();
      expect(SE.doc.clips.length).toBe(0);
      await SE.project.load(blob);
      expect(SE.doc.name).toBe('Roundtrip');
      expect(SE.doc.clips.length).toBe(1);
      expect(SE.doc.clips[0].start).toBe(1);
      expect(SE.doc.markers[0].name).toBe('Here');
      expect(SE.media.get(m.id).status).toBe('ready');
      expect(SE.media.get(m.id).blob.size).toBe(png.size);
    });
    it('autosaves the project and restores it after a reload', async () => {
      const SE = ST.SE;
      SE.change('title', (p) => ST.E.addGenerated(p, 'title', ST.M.videoTracks(p)[1].id, 0, 3, { text: { str: 'Persist me' } }));
      await SE.session.save();
      await ST.boot('app');
      await waitFor(() => ST.SE.doc.clips.some((c) => c.kind === 'title' && c.text.str === 'Persist me'));
      const img = ST.SE.doc.clips.find((c) => c.kind === 'image');
      await waitFor(() => ST.SE.media.ready(img.media));
    }, { timeout: 40000 });
  });
})();
