/* SlopCut: a small ISO-BMFF (MP4/MOV) demuxer for frame-accurate decoding with WebCodecs.
   SE.demux.mp4(blob) → { duration, tracks: [{ id, type, codec, timescale, width, height, description,
   sampleRate, channels, samples: [{ offset, size, dts, pts, dur, key }] (decode order, seconds) }] }
   Only reads the moov box up front; sample data is read on demand with SE.demux.reader(blob). */
(function () {
  'use strict';
  const SE = window.SE;
  const D = SE.demux = {};
  const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'mvex']);
  const hex2 = (n) => n.toString(16).padStart(2, '0');

  function boxes(dv, start, end, out = []) {
    let p = start;
    while (p + 8 <= end) {
      let size = dv.getUint32(p), type = String.fromCharCode(dv.getUint8(p + 4), dv.getUint8(p + 5), dv.getUint8(p + 6), dv.getUint8(p + 7)), hdr = 8;
      if (size === 1) { size = Number(dv.getBigUint64(p + 8)); hdr = 16; } else if (size === 0) size = end - p;
      if (size < hdr || p + size > end) break;
      const b = { type, start: p, data: p + hdr, end: p + size, kids: null };
      if (CONTAINERS.has(type)) b.kids = boxes(dv, b.data, b.end);
      out.push(b);
      p += size;
    }
    return out;
  }
  const find = (list, type) => list && list.find((b) => b.type === type);
  const path = (b, ...types) => { let cur = b; for (const t of types) { cur = find(cur && cur.kids, t); if (!cur) return null; } return cur; };

  /** Top-level scan with small reads so huge files are not loaded whole. Returns the moov bytes. */
  async function readMoov(blob) {
    let p = 0;
    while (p + 8 <= blob.size) {
      const head = new DataView(await blob.slice(p, p + 16).arrayBuffer());
      let size = head.getUint32(0);
      const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
      if (size === 1) size = Number(head.getBigUint64(8)); else if (size === 0) size = blob.size - p;
      if (size < 8) break;
      if (type === 'moov') return new DataView(await blob.slice(p, p + size).arrayBuffer());
      p += size;
    }
    return null;
  }
  function codecOf(dv, entry, kids) {
    const fourcc = entry.type;
    const box = (t) => find(kids, t);
    const bytes = (b) => new Uint8Array(dv.buffer, dv.byteOffset + b.data, b.end - b.data);
    if (fourcc === 'avc1' || fourcc === 'avc3') {
      const c = box('avcC'); if (!c) return null;
      const u = bytes(c);
      return { codec: 'avc1.' + hex2(u[1]) + hex2(u[2]) + hex2(u[3]), description: u.slice() };
    }
    if (fourcc === 'hvc1' || fourcc === 'hev1') {
      const c = box('hvcC'); if (!c) return null;
      const u = bytes(c), ps = u[1] >> 6, tier = (u[1] >> 5) & 1, prof = u[1] & 31;
      let compat = (u[2] << 24) | (u[3] << 16) | (u[4] << 8) | u[5], rev = 0;
      for (let i = 0; i < 32; i++) { rev = (rev << 1) | (compat & 1); compat >>>= 1; }
      const cons = [u[6], u[7], u[8], u[9], u[10], u[11]];
      while (cons.length && !cons[cons.length - 1]) cons.pop();
      return { codec: fourcc + '.' + ['', 'A', 'B', 'C'][ps] + prof + '.' + (rev >>> 0).toString(16) + '.' + (tier ? 'H' : 'L') + u[12] + (cons.length ? '.' + cons.map((x) => x.toString(16)).join('.') : ''), description: u.slice() };
    }
    if (fourcc === 'vp09') {
      const c = box('vpcC'); if (!c) return { codec: 'vp09.00.10.08' };
      const u = bytes(c); // full box: 4 bytes version/flags
      return { codec: 'vp09.' + String(u[4]).padStart(2, '0') + '.' + String(u[5]).padStart(2, '0') + '.' + String(u[6] >> 4).padStart(2, '0') };
    }
    if (fourcc === 'av01') {
      const c = box('av1C'); if (!c) return null;
      const u = bytes(c), prof = u[1] >> 5, lvl = u[1] & 31, tierB = u[2] >> 7, hbd = (u[2] >> 6) & 1, twelve = (u[2] >> 5) & 1;
      return { codec: 'av01.' + prof + '.' + String(lvl).padStart(2, '0') + (tierB ? 'H' : 'M') + '.' + (hbd ? (twelve ? '12' : '10') : '08'), description: u.slice() };
    }
    if (fourcc === 'mp4a') return { codec: 'mp4a.40.2' };
    if (fourcc === 'Opus') return { codec: 'opus' }; // i18n-ignore: a codec name
    return { codec: fourcc };
  }
  function track(dv, trak) {
    const mdhd = path(trak, 'mdia', 'mdhd'), hdlr = path(trak, 'mdia', 'hdlr'), stbl = path(trak, 'mdia', 'minf', 'stbl');
    if (!mdhd || !hdlr || !stbl) return null;
    const v = dv.getUint8(mdhd.data);
    const timescale = dv.getUint32(mdhd.data + (v ? 20 : 12));
    const handler = String.fromCharCode(...[0, 1, 2, 3].map((i) => dv.getUint8(hdlr.data + 8 + i)));
    const type = handler === 'vide' ? 'video' : handler === 'soun' ? 'audio' : handler;
    const t = { id: 0, type, timescale, samples: [] };
    const tkhd = find(trak.kids, 'tkhd'); if (tkhd) t.id = dv.getUint32(tkhd.data + (dv.getUint8(tkhd.data) ? 20 : 12));
    const stsd = find(stbl.kids, 'stsd');
    if (stsd) {
      const e = boxes(dv, stsd.data + 8, stsd.end)[0];
      if (e) {
        let kidsAt = e.data + (type === 'video' ? 78 : 28);
        if (type === 'video') { t.width = dv.getUint16(e.data + 24); t.height = dv.getUint16(e.data + 26); }
        if (type === 'audio') { const ver = dv.getUint16(e.data + 8); t.channels = dv.getUint16(e.data + 16); t.sampleRate = dv.getUint32(e.data + 24) >>> 16; if (ver === 1) kidsAt += 16; else if (ver === 2) kidsAt += 36; }
        Object.assign(t, codecOf(dv, e, boxes(dv, kidsAt, e.end)) || {});
      }
    }
    const u32 = (b, i) => dv.getUint32(b.data + i);
    const stsz = find(stbl.kids, 'stsz'), stco = find(stbl.kids, 'stco'), co64 = find(stbl.kids, 'co64'), stsc = find(stbl.kids, 'stsc');
    const stts = find(stbl.kids, 'stts'), ctts = find(stbl.kids, 'ctts'), stss = find(stbl.kids, 'stss');
    if (!stsz || !(stco || co64) || !stsc || !stts) return t;
    const fixed = u32(stsz, 4), count = u32(stsz, 8);
    const sizes = new Array(count);
    for (let i = 0; i < count; i++) sizes[i] = fixed || u32(stsz, 12 + i * 4);
    const nChunks = stco ? u32(stco, 4) : u32(co64, 4), chunkOff = new Array(nChunks);
    for (let i = 0; i < nChunks; i++) chunkOff[i] = stco ? u32(stco, 8 + i * 4) : Number(dv.getBigUint64(co64.data + 8 + i * 8));
    const runs = []; for (let i = 0, n = u32(stsc, 4); i < n; i++) runs.push([u32(stsc, 8 + i * 12) - 1, u32(stsc, 12 + i * 12)]);
    let s = 0;
    for (let r = 0; r < runs.length; r++) {
      const last = r + 1 < runs.length ? runs[r + 1][0] : nChunks;
      for (let ch = runs[r][0]; ch < last && s < count; ch++) {
        let off = chunkOff[ch];
        for (let k = 0; k < runs[r][1] && s < count; k++, s++) { t.samples.push({ offset: off, size: sizes[s] }); off += sizes[s]; }
      }
    }
    let dts = 0, i = 0;
    for (let e = 0, n = u32(stts, 4); e < n; e++) { const c = u32(stts, 8 + e * 8), d = u32(stts, 12 + e * 8); for (let k = 0; k < c && i < t.samples.length; k++, i++) { t.samples[i].dts = dts; t.samples[i].dur = d; dts += d; } }
    if (ctts) { i = 0; for (let e = 0, n = u32(ctts, 4); e < n; e++) { const c = u32(ctts, 8 + e * 8), o = dv.getInt32(ctts.data + 12 + e * 8); for (let k = 0; k < c && i < t.samples.length; k++, i++) t.samples[i].cto = o; } }
    const sync = stss ? new Set(Array.from({ length: u32(stss, 4) }, (_, k) => u32(stss, 8 + k * 4) - 1)) : null;
    let shift = 0;
    const elst = path(trak, 'edts', 'elst');
    if (elst) {
      const ver = dv.getUint8(elst.data), n = u32(elst, 4);
      for (let e = 0; e < n; e++) {
        const mt = ver ? Number(dv.getBigInt64(elst.data + 8 + e * 20 + 8)) : dv.getInt32(elst.data + 8 + e * 12 + 4);
        if (mt >= 0) { shift = mt; break; }
      }
    }
    t.samples.forEach((sm, k) => { sm.key = sync ? sync.has(k) : true; sm.pts = (sm.dts + (sm.cto || 0) - shift) / timescale; sm.dts /= timescale; sm.dur /= timescale; delete sm.cto; });
    t.duration = dts / timescale;
    return t;
  }
  D.mp4 = async function (blob) {
    const dv = await readMoov(blob);
    if (!dv) return null;
    const top = boxes(dv, 0, dv.byteLength)[0];
    const tracks = (top.kids || []).filter((b) => b.type === 'trak').map((b) => track(dv, b)).filter(Boolean);
    return { tracks, duration: Math.max(0, ...tracks.map((t) => t.duration || 0)) };
  };
  /** Buffered random access to a Blob (reads 8 MB windows). */
  D.reader = function (blob, win = 8 << 20) {
    let base = -1, buf = null;
    return async function read(off, size) {
      if (!buf || off < base || off + size > base + buf.length) { base = off; buf = new Uint8Array(await blob.slice(off, Math.min(blob.size, off + Math.max(size, win))).arrayBuffer()); }
      return buf.subarray(off - base, off - base + size);
    };
  };
  /** Is this blob an MP4/MOV (ftyp box first)? */
  D.isMp4 = async function (blob) {
    const h = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    return String.fromCharCode(h[4], h[5], h[6], h[7]) === 'ftyp';
  };
})();
