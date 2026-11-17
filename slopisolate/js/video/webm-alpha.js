/* SlopIsolate video — WebM writer for VP9 with alpha (EBML). The alpha plane is stored as BlockAdditional
 * (BlockAddID 1) next to each VP9 frame, with AlphaMode = 1 on the track, which is how Chrome and other
 * players read WebM alpha. Used only when VideoEncoder accepts alpha: 'keep' (see limits.js).
 *   const w = CO.video.webm.writer({ w, h, fps }); w.add(chunk, alphaBytes|null, tUs); const blob = w.finish();
 * chunk: EncodedVideoChunk (VP9 colour); alphaBytes: Uint8Array of the chunk's alpha side data (metadata.alphaSideData). */
(function () {
  'use strict';
  const CO = window.CO, V = CO.video || (CO.video = {});
  const WM = V.webm = {};

  const vint = (n) => { // EBML size as a variable-length integer (8 bytes for big sizes)
    const b = [];
    let len = 1;
    while (len < 8 && n >= 2 ** (7 * len) - 1) len++;
    for (let i = len - 1; i >= 0; i--) b.push(Math.floor(n / 2 ** (8 * i)) & 255);
    b[0] |= 0x80 >> (len - 1);
    return Uint8Array.from(b);
  };
  const id = (hex) => Uint8Array.from(hex.match(/../g).map((x) => parseInt(x, 16)));
  const uint = (n) => { const b = []; do { b.unshift(n & 255); n = Math.floor(n / 256); } while (n > 0); return Uint8Array.from(b); };
  const float = (x) => { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, x); return new Uint8Array(d.buffer); };
  const str = (s) => new TextEncoder().encode(s);
  function el(hex, ...kids) {
    const body = concat(kids);
    return concat([id(hex), vint(body.length), body]);
  }
  function concat(parts) {
    let n = 0;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  const unknownSize = () => Uint8Array.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

  /** Writer: add frames in order, finish() → Blob (video/webm). */
  WM.writer = function ({ w, h, fps = 30 }) {
    const frames = []; // { t (ms), keyframe, data, alpha }
    const api = {
      add(chunk, alpha, tUs) {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        frames.push({ ms: Math.round((tUs != null ? tUs : chunk.timestamp) / 1000), key: chunk.type === 'key', data, alpha: alpha ? new Uint8Array(alpha) : null });
      },
      get count() { return frames.length; },
      finish() {
        const header = el('1A45DFA3', el('4282', str('webm')), el('4287', uint(4)), el('4285', uint(2)));
        const info = el('1549A966', el('2AD7B1', uint(1000000)), el('4489', float(frames.length ? (frames[frames.length - 1].ms + 1000 / fps) : 0)), el('4D80', str('SlopIsolate')), el('5741', str('SlopIsolate')));
        const video = el('E0', el('B0', uint(w)), el('BA', uint(h)));
        const track = el('AE', el('D7', uint(1)), el('73C5', uint(1)), el('83', uint(1)), el('86', str('V_VP9')), el('53C0', uint(1)), video);
        const tracks = el('1654AE6B', track);
        const clusters = [];
        let cur = [], curMs = 0;
        const flush = () => { if (cur.length) clusters.push(el('1F43B675', el('E7', uint(curMs)), ...cur)); cur = []; };
        frames.forEach((f, i) => {
          if (cur.length && (f.key || f.ms - curMs > 30000)) flush();
          if (!cur.length) curMs = f.ms;
          const rel = f.ms - curMs;
          const head = Uint8Array.from([0x81, (rel >> 8) & 255, rel & 255, f.key ? 0x80 : 0]);
          if (f.alpha) {
            // BlockGroup: Block + BlockAdditions (BlockMore: BlockAddID 1 = alpha side data)
            cur.push(el('A0', el('A1', concat([head, f.data])), el('75A1', el('A6', concat([el('EE', uint(1)), el('A5', f.alpha)])))));
          } else cur.push(el('A3', concat([head, f.data])));
          if (i === frames.length - 1) flush();
        });
        const seg = concat([info, tracks, ...clusters]);
        const segment = concat([id('18538067'), unknownSize(), seg]);
        return new Blob([concat([header, segment])], { type: 'video/webm' });
      },
    };
    return api;
  };
})();
