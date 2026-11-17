/* Slop Recorder: the WebM (Matroska, EBML) bits a recording needs. A browser's MediaRecorder writes a WebM as a live stream:
 * no Duration in its Info, so players show no length and cannot seek well. This writes it in. Pure (bytes in, bytes out),
 * Node-tested (tests/node/recorder-webm.test.mjs). Classic script: SlopRec.webm; also a CommonJS module.
 *   measure(bytes)            → ms from the first to the end of the last block (each track's last frame length added from the
 *                               average spacing of its blocks, at most 0.1 s), or 0 when no block is found
 *   readDuration(bytes)       → the Duration in ms the file says, or null
 *   setDuration(bytes, ms)    → new bytes with Info's Duration set (overwritten in place when there is one; else an 8-byte
 *                               float inserted, Info's size and a known Segment size grown, SeekHead positions after Info
 *                               moved by the same amount)
 * Elements: EBML 1A45DFA3, Segment 18538067, SeekHead 114D9B74 (SeekPosition 53AC), Info 1549A966 (TimecodeScale 2AD7B1,
 * Duration 4489), Cluster 1F43B675 (Timecode E7, SimpleBlock A3, BlockGroup A0 > Block A1), Tracks 1654AE6B. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SlopRec = root.SlopRec || {}).webm = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const ID = { EBML: 0x1A45DFA3, SEGMENT: 0x18538067, SEEKHEAD: 0x114D9B74, SEEK: 0x4DBB, SEEKPOS: 0x53AC, INFO: 0x1549A966, SCALE: 0x2AD7B1,
    DURATION: 0x4489, CLUSTER: 0x1F43B675, TIMECODE: 0xE7, SIMPLEBLOCK: 0xA3, BLOCKGROUP: 0xA0, BLOCK: 0xA1, TRACKS: 0x1654AE6B };
  const DESCEND = new Set([ID.SEGMENT, ID.CLUSTER, ID.BLOCKGROUP, ID.SEEKHEAD, ID.SEEK, ID.INFO]);

  /** An element ID at pos: { id, len } (the marker bits kept, as the IDs above are written). */
  function readId(b, pos) {
    const first = b[pos];
    let len = 1;
    while (len <= 4 && !(first & (0x80 >> (len - 1)))) len++;
    if (len > 4 || pos + len > b.length) return null;
    let id = 0;
    for (let i = 0; i < len; i++) id = id * 256 + b[pos + i];
    return { id, len };
  }
  /** A size at pos: { size, len, unknown } (all ones in the value bits: unknown, as a live stream writes them). */
  function readSize(b, pos) {
    const first = b[pos];
    let len = 1;
    while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
    if (len > 8 || pos + len > b.length) return null;
    let v = first & (0xFF >> len), ones = v === (0xFF >> len);
    for (let i = 1; i < len; i++) { v = v * 256 + b[pos + i]; if (b[pos + i] !== 0xFF) ones = false; }
    return { size: v, len, unknown: ones };
  }
  /** size written in exactly len bytes (len 1..8), or null when it does not fit. */
  function writeSize(size, len) {
    if (size >= 2 ** (7 * len) - 1) return null;
    const out = new Uint8Array(len);
    let v = size;
    for (let i = len - 1; i >= 0; i--) { out[i] = v % 256; v = Math.floor(v / 256); }
    out[0] |= 0x80 >> (len - 1);
    return out;
  }
  const uint = (b, pos, len) => { let v = 0; for (let i = 0; i < len; i++) v = v * 256 + b[pos + i]; return v; };
  function readFloat(b, pos, len) {
    const dv = new DataView(b.buffer, b.byteOffset + pos, len);
    return len === 4 ? dv.getFloat32(0) : dv.getFloat64(0);
  }

  /** Every element, flat, in file order: { id, start, data, size, unknown, depth? } (containers are entered). */
  function walk(b, visit) {
    let pos = 0;
    while (pos < b.length) {
      const id = readId(b, pos); if (!id) return;
      const sz = readSize(b, pos + id.len); if (!sz) return;
      const data = pos + id.len + sz.len, el = { id: id.id, start: pos, idLen: id.len, sizeLen: sz.len, data, size: sz.size, unknown: sz.unknown };
      if (visit(el) === false) return;
      if (DESCEND.has(el.id)) { pos = data; continue; }
      if (sz.unknown) return;   // an unknown size on a leaf: nothing after it can be read
      pos = data + sz.size;
    }
  }

  function measure(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let scale = 1e6, cluster = 0, first = Infinity, last = -Infinity;
    const times = new Map();   // track → its block times, for the last frame's length
    walk(b, (el) => {
      if (el.id === ID.SCALE) scale = uint(b, el.data, el.size) || 1e6;
      else if (el.id === ID.TIMECODE) cluster = uint(b, el.data, el.size);
      else if (el.id === ID.SIMPLEBLOCK || el.id === ID.BLOCK) {
        const tr = readSize(b, el.data); if (!tr) return;
        const at = el.data + tr.len;
        let rel = (b[at] << 8) | b[at + 1];
        if (rel & 0x8000) rel -= 0x10000;
        const t = cluster + rel;
        first = Math.min(first, t); last = Math.max(last, t);
        if (!times.has(tr.size)) times.set(tr.size, []);
        times.get(tr.size).push(t);
      }
      return true;
    });
    if (!isFinite(first)) return 0;
    let end = last;   // each track's last block plus that track's own frame length (its average spacing); the latest wins
    for (const list of times.values()) {
      if (list.length < 3) continue;
      const hi = Math.max(...list), step = Math.min(100, (hi - Math.min(...list)) / (list.length - 1));   // a frame: at most 0.1 s
      end = Math.max(end, hi + step);
    }
    return ((end - first) * scale) / 1e6;
  }

  function readDuration(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let scale = 1e6, dur = null;
    walk(b, (el) => {
      if (el.id === ID.SCALE) scale = uint(b, el.data, el.size) || 1e6;
      else if (el.id === ID.DURATION) dur = readFloat(b, el.data, el.size);
      else if (el.id === ID.CLUSTER) return false;
      return true;
    });
    return dur == null ? null : (dur * scale) / 1e6;
  }

  function setDuration(bytes, ms) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let seg = null, info = null, dur = null, scale = 1e6;
    const seeks = [];
    walk(b, (el) => {
      if (el.id === ID.SEGMENT) seg = el;
      else if (el.id === ID.INFO) info = el;
      else if (el.id === ID.SCALE) scale = uint(b, el.data, el.size) || 1e6;
      else if (el.id === ID.DURATION) dur = el;
      else if (el.id === ID.SEEKPOS) seeks.push(el);
      else if (el.id === ID.CLUSTER) return false;
      return true;
    });
    if (!seg || !info) throw new Error('This is not a WebM file the recorder can fix (no Segment Info).');
    const value = (ms * 1e6) / scale;
    if (dur) {   // overwrite in place
      const out = b.slice(), dv = new DataView(out.buffer, dur.data, dur.size);
      if (dur.size === 4) dv.setFloat32(0, value); else dv.setFloat64(0, value);
      return out;
    }
    const el = new Uint8Array(11);
    el.set([0x44, 0x89, 0x88]);
    new DataView(el.buffer).setFloat64(3, value);
    const infoSize = writeSize(info.size + el.length, info.sizeLen) || writeSize(info.size + el.length, 8);
    const grow = el.length + infoSize.length - info.sizeLen;
    const segData = seg.data, infoRel = info.start - segData;
    const head = b.slice(0, info.start + info.idLen);
    const out = new Uint8Array(b.length + grow);
    out.set(head, 0);
    out.set(infoSize, head.length);
    let at = head.length + infoSize.length;
    out.set(b.subarray(info.data, info.data + info.size), at); at += info.size;
    out.set(el, at); at += el.length;
    out.set(b.subarray(info.data + info.size), at);
    if (!seg.unknown) {   // a known Segment size grows too
      const s = writeSize(seg.size + grow, seg.sizeLen);
      if (!s) throw new Error('The WebM Segment size cannot grow in place.');
      out.set(s, seg.start + seg.idLen);
    }
    for (const sp of seeks) {   // positions are from the Segment's data: those after Info move (SeekHead comes before Info)
      if (sp.start > info.start) continue;
      const v = uint(b, sp.data, sp.size);
      if (v > infoRel) { let n = v + grow; for (let i = sp.size - 1; i >= 0; i--) { out[sp.data + i] = n % 256; n = Math.floor(n / 256); } }
    }
    return out;
  }
  return { measure, readDuration, setDuration, readId, readSize, writeSize, ID };
});
