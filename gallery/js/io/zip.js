/* Slop Gallery: a small store-only zip writer and reader (method 0, no compression, no ZIP64).
 * Written for this app: export of several photos and the one-file backup. It does not use any library.
 *   SlopGallery.zip.write([{ name, data }])  data: Blob | ArrayBuffer | Uint8Array  -> Promise<Blob>
 *   SlopGallery.zip.read(arrayBuffer)        -> [{ name, bytes: Uint8Array }]   (checks every CRC-32)
 * Classic script, exposes window.SlopGallery.zip. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const SIG_LOCAL = 0x04034b50, SIG_CENTRAL = 0x02014b50, SIG_EOCD = 0x06054b50;
  const MAX_ENTRIES = 0xffff, MAX_SIZE = 0xffffffff;

  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  /** CRC-32 (the zip/PNG polynomial) of a Uint8Array. */
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  /** DOS date and time for a Date (zip stores local time in two 16-bit words). */
  function dosStamp(d = new Date()) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }
  async function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
    throw new Error('zip: unsupported data');
  }

  /** Builds a zip Blob from entries. Names are UTF-8 (flag bit 11). */
  async function write(entries) {
    if (entries.length > MAX_ENTRIES) throw new Error('zip: too many entries');
    const enc = new TextEncoder();
    const { time, date } = dosStamp();
    const parts = [], central = [];
    let offset = 0;
    for (const e of entries) {
      const name = enc.encode(e.name), bytes = await toBytes(e.data);
      if (bytes.length > MAX_SIZE || offset > MAX_SIZE) throw new Error('zip: archive too large (ZIP64 is not supported)');
      const crc = crc32(bytes);
      const head = new DataView(new ArrayBuffer(30));
      head.setUint32(0, SIG_LOCAL, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true);
      head.setUint16(8, 0, true); head.setUint16(10, time, true); head.setUint16(12, date, true);
      head.setUint32(14, crc, true); head.setUint32(18, bytes.length, true); head.setUint32(22, bytes.length, true);
      head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, SIG_CENTRAL, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true); cen.setUint16(12, time, true); cen.setUint16(14, date, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, bytes.length, true); cen.setUint32(24, bytes.length, true);
      cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      parts.push(new Uint8Array(head.buffer), name, bytes);
      offset += 30 + name.length + bytes.length;
    }
    const cenStart = offset;
    let cenSize = 0;
    for (const p of central) cenSize += p.length;
    if (cenStart > MAX_SIZE) throw new Error('zip: archive too large (ZIP64 is not supported)');
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, SIG_EOCD, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cenSize, true); end.setUint32(16, cenStart, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  /** Reads a store-only zip. Throws on any structural error or CRC mismatch, so callers can stop before writing anything. */
  function read(buffer) {
    const u8 = new Uint8Array(buffer), dv = new DataView(buffer), n = u8.length;
    if (n < 22) throw new Error('zip: file too small');
    let eocd = -1;
    for (let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
    if (eocd < 0) throw new Error('zip: no end record');
    const count = dv.getUint16(eocd + 10, true), cenOff = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder('utf-8', { fatal: true });
    const out = [];
    let p = cenOff;
    for (let i = 0; i < count; i++) {
      if (p + 46 > n || dv.getUint32(p, true) !== SIG_CENTRAL) throw new Error('zip: bad central directory');
      const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true);
      const size = dv.getUint32(p + 24, true), nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
      if (method !== 0) throw new Error('zip: only stored entries are supported');
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      if (local + 30 > n || dv.getUint32(local, true) !== SIG_LOCAL) throw new Error('zip: bad local header for ' + name);
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      if (start + size > n) throw new Error('zip: truncated entry ' + name);
      const bytes = u8.slice(start, start + size);
      if (crc32(bytes) !== crc) throw new Error('zip: CRC mismatch in ' + name);
      out.push({ name, bytes });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  G.zip = { write, read, crc32 };
})();
