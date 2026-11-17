/* SlopCut: an animated GIF encoder (global median-cut palette, ordered dithering, LZW).
   SE.gif.encode(frames: ImageData[], w, h, delayCs) → Blob. Used by File ▸ Export GIF for short ranges. */
(function () {
  'use strict';
  const SE = window.SE;
  const GIF = SE.gif = {};

  /** Median-cut palette (max 256 colours) from sampled pixels of all frames. */
  GIF.palette = function (frames, max = 256) {
    const px = [];
    const step = Math.max(1, Math.floor((frames.length * frames[0].data.length / 4) / 60000));
    for (const f of frames) for (let i = 0; i < f.data.length; i += 4 * step) px.push([f.data[i], f.data[i + 1], f.data[i + 2]]);
    let boxes = [px];
    while (boxes.length < max) {
      let bi = -1, br = -1, ch = 0;
      boxes.forEach((b, i) => {
        if (b.length < 2) return;
        for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; } if (hi - lo > br) { br = hi - lo; bi = i; ch = c; } }
      });
      if (bi < 0 || br <= 2) break;
      const b = boxes[bi].sort((x, y) => x[ch] - y[ch]), mid = b.length >> 1;
      boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
    }
    return boxes.filter((b) => b.length).map((b) => { const s = [0, 0, 0]; for (const p of b) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return s.map((v) => Math.round(v / b.length)); });
  };
  function mapper(pal) {
    const cache = new Map();
    return (r, g, b) => {
      const k = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let v = cache.get(k);
      if (v !== undefined) return v;
      let best = 0, bd = Infinity;
      for (let i = 0; i < pal.length; i++) { const p = pal[i], d = (p[0] - r) * (p[0] - r) * 2 + (p[1] - g) * (p[1] - g) * 4 + (p[2] - b) * (p[2] - b) * 3; if (d < bd) { bd = d; best = i; } }
      cache.set(k, best);
      return best;
    };
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 16 - 0.5) * 10);
  /** GIF LZW compression of colour indices. */
  function lzw(idx, minSize) {
    const out = [], clear = 1 << minSize, eoi = clear + 1;
    let size = minSize + 1, next = eoi + 1, dict = new Map(), cur = 0, bits = 0;
    const emit = (code) => { cur |= code << bits; bits += size; while (bits >= 8) { out.push(cur & 255); cur >>= 8; bits -= 8; } };
    emit(clear);
    let prefix = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const k = idx[i], key = (prefix << 8) | k, hit = dict.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      emit(prefix);
      if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; }
      else { emit(clear); dict = new Map(); size = minSize + 1; next = eoi + 1; }
      prefix = k;
    }
    emit(prefix); emit(eoi);
    if (bits > 0) out.push(cur & 255);
    return out;
  }
  GIF.encode = function (frames, w, h, delayCs = 10) {
    const pal = GIF.palette(frames, 256), map = mapper(pal);
    const bytes = [];
    const u16 = (v) => bytes.push(v & 255, (v >> 8) & 255);
    const str = (s) => { for (const c of s) bytes.push(c.charCodeAt(0)); };
    let bitsPal = 1; while ((1 << bitsPal) < pal.length) bitsPal++;
    str('GIF89a'); u16(w); u16(h);
    bytes.push(0xf0 | (bitsPal - 1), 0, 0);
    for (let i = 0; i < 1 << bitsPal; i++) { const p = pal[i] || [0, 0, 0]; bytes.push(p[0], p[1], p[2]); }
    bytes.push(0x21, 0xff, 11); str('NETSCAPE2.0'); bytes.push(3, 1, 0, 0, 0); // loop forever
    const idx = new Uint8Array(w * h);
    for (const f of frames) {
      const d = f.data;
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
        const t = BAYER[((y & 3) << 2) | (x & 3)], o = i * 4;
        idx[i] = map(Math.max(0, Math.min(255, d[o] + t)), Math.max(0, Math.min(255, d[o + 1] + t)), Math.max(0, Math.min(255, d[o + 2] + t)));
      }
      bytes.push(0x21, 0xf9, 4, 0x04); u16(delayCs); bytes.push(0, 0);
      bytes.push(0x2c); u16(0); u16(0); u16(w); u16(h); bytes.push(0);
      const minSize = Math.max(2, bitsPal);
      bytes.push(minSize);
      const data = lzw(idx, minSize);
      for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); bytes.push(n); for (let k = 0; k < n; k++) bytes.push(data[i + k]); }
      bytes.push(0);
    }
    bytes.push(0x3b);
    return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
  };
  /** Render [a, b) of the timeline into a GIF at width gw and fps. */
  GIF.render = async function ({ a, b, width = 480, fps = 12, progress, signal = {} }) {
    const p = SE.doc, w = Math.round(width / 2) * 2, h = Math.round((w * p.h) / p.w / 2) * 2;
    const n = Math.max(1, Math.round((b - a) * fps)), frames = [];
    const cv = SE.util.canvas(w, h), g = cv.getContext('2d', { willReadFrequently: true });
    const src = SE.frames.exporter(p);
    await SE.text.ready(p);
    if (SE.watermark) await SE.watermark.ready(p);
    try {
      for (let i = 0; i < n; i++) {
        if (signal.cancelled) throw new DOMException('Export cancelled', 'AbortError'); // i18n-ignore: an error for the code
        const t = a + i / fps;
        await src.prepare(t);
        SE.compositor.render(g, p, t, { W: w, H: h, source: src.get });
        frames.push(g.getImageData(0, 0, w, h));
        if (progress) progress((i + 1) / n * 0.8, SE.util.t('slopedit.io.frame_of', { n: i + 1, of: n }));
      }
    } finally { src.close(); }
    if (progress) progress(0.85, SE.util.t('slopedit.io.building_palette_and_compressing'));
    await new Promise((r) => setTimeout(r, 0));
    return GIF.encode(frames, w, h, Math.round(100 / fps));
  };
})();
