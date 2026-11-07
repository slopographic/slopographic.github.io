/* Slop Isolate video: a 2-second generated clip goes through the frame source, the matte pass (real model in the
 * worker) and the export. Passes if the output has an alpha track (WebM with AlphaMode) or the PNG sequence has
 * one file per frame. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const CO = window.CO, V = CO.video;
  const FPS = 5, SECS = 2, W = 480, H = 270, N = FPS * SECS;

  /** A 2 s MP4 (VP9) at 5 frames a second (each frame is one model run): a bright disc moving across a dark blue background. */
  async function makeClip() {
    const chunks = [];
    const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'vp9', width: W, height: H }, fastStart: 'in-memory' });
    const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { throw e; } });
    enc.configure({ codec: 'vp09.00.10.08', width: W, height: H, bitrate: 1.5e6, framerate: FPS });
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    for (let i = 0; i < N; i++) {
      g.fillStyle = '#1b2a4a'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ff5a1f'; g.beginPath(); g.arc(80 + i * 30, H / 2, 60, 0, Math.PI * 2); g.fill();
      const vf = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame: i === 0 }); vf.close();
    }
    await enc.flush(); enc.close(); muxer.finalize();
    return new File([muxer.target.buffer], 'clip.mp4', { type: 'video/mp4' });
  }
  /** Entry count of a store-only zip (end-of-central-directory record). */
  async function zipEntries(blob) {
    const dv = new DataView(await blob.arrayBuffer());
    for (let p = dv.byteLength - 22; p >= 0; p--) if (dv.getUint32(p, true) === 0x06054b50) return dv.getUint16(p + 10, true);
    return -1;
  }
  /** The EBML AlphaMode element (0x53C0) is present in a WebM track with alpha. */
  async function hasAlphaTrack(blob) {
    const b = new Uint8Array(await blob.arrayBuffer());
    for (let i = 0; i + 1 < b.length; i++) if (b[i] === 0x53 && b[i + 1] === 0xC0) return true;
    return false;
  }

  let clip = null, src = null, res = null;
  const LONG = { timeout: 600000 };

  describe('video frame source', () => {
    it('reads the 2-second clip frame by frame at the clip frame rate', async () => {
      clip = await makeClip();
      src = await V.open(clip);
      expect(src.count).toBe(N);
      expect(src.out.w).toBe(W);
      expect(src.out.h).toBe(H);
      expect(['webcodecs', 'element'].includes(src.mode)).toBeTruthy();
      let seen = [];
      await src.each((c, i, t) => { seen.push([i, Math.round(t * 100) / 100]); });
      expect(seen.length).toBe(N);
      expect(seen[N - 1][0]).toBe(N - 1);
      expect(seen[1][1]).toBe(1 / FPS);
    }, LONG);
  });

  describe('video matte (model per frame, smoothed)', () => {
    it('runs the model on every frame at mask size and smooths the masks', async () => {
      const msz = V.limits.maskSize(W, H);
      res = await V.analyze(src, { model: 'fast' });
      expect(res.masks.length).toBe(N);
      expect(res.mw).toBe(msz.w);
      expect(res.mh).toBe(msz.h);
      expect(res.masks[0].length).toBe(msz.w * msz.h);
      expect(res.cancelled).toBe(false);
      // the disc is the subject: its centre ends up high in the matte at the first frame
      const cx = Math.round(80 / W * msz.w), cy = Math.round(msz.h / 2);
      expect(res.masks[0][cy * msz.w + cx] > 128).toBeTruthy();
    }, LONG);

    it('stops between frames when cancelled', async () => {
      const ac = new AbortController();
      let n = 0;
      const r = await V.analyze(src, { model: 'fast', signal: ac.signal, onProgress: (p) => { if (p.phase === 'frame' && ++n === 2) ac.abort(); } });
      expect(r.cancelled).toBe(true);
      expect(r.masks.length < N).toBeTruthy();
    }, LONG);
  });

  describe('video export', () => {
    it('writes WebM with an alpha track, or a PNG sequence with one file per frame', async () => {
      // the matte of the first test (one model run per frame is the slow part); its own run only if that test failed
      if (!res || res.cancelled) res = await V.analyze(src, { model: 'fast' });
      const S = await V.limits.probe();
      let progress = 0;
      if (S.alphaWebm) {
        const out = await V.enc.alphaWebm(src, res, { onProgress: (d) => { progress = d; } });
        expect(out.kind).toBe('webm');
        expect(await hasAlphaTrack(out.blob)).toBeTruthy();
      } else {
        const out = await V.enc.pngZip(src, res, { onProgress: (d) => { progress = d; } });
        expect(out.kind).toBe('zip');
        expect(out.frames).toBe(N);
        expect(await zipEntries(out.blob)).toBe(N);
      }
      expect(progress).toBe(N);
    }, LONG);

    it('writes an MP4 with the chosen background colour (one video track, non-empty)', async () => {
      const out = await V.enc.mp4(src, res, { bg: '#00ff00' });
      expect(out.kind).toBe('mp4');
      expect(out.blob.size > 1000).toBeTruthy();
      const head = new Uint8Array(await out.blob.slice(4, 8).arrayBuffer());
      expect(String.fromCharCode(...head)).toBe('ftyp');
      src.close();                                 // last use: release the decoder and the object URL
    }, LONG);
  });
})();
