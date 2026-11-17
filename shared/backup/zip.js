/* SlopZip: a tiny, dependency-free ZIP writer and reader for Slopographic.
 * Writer: "stored" entries (no compression) with CRC-32 and UTF-8 names; blobs are streamed into the
 * result Blob, so large files are never copied into one big buffer. Reader: stored and deflated entries
 * (deflate via DecompressionStream('deflate-raw')). Classic script, exposes window.SlopZip.
 *   await SlopZip.zip([{ name: 'a/b.txt', data: Blob | Uint8Array | ArrayBuffer | string, time: Date|number }])  -> Blob
 *   await SlopZip.unzip(blobOrBytes) -> [{ name, dir, time, bytes: Uint8Array }] */
(function () {
  'use strict';
  const tr = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/backup.js
  if (window.SlopZip) return;
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes, crc = 0) { crc = ~crc >>> 0; for (let i = 0; i < bytes.length; i++) crc = CRC[(crc ^ bytes[i]) & 255] ^ (crc >>> 8); return ~crc >>> 0; }
  const enc = new TextEncoder();
  function dosTime(t) {
    const d = new Date(t || Date.now()), y = Math.max(1980, d.getFullYear());
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }
  // Duck-typed so data from another frame (another realm) works too.
  const isBlob = (d) => d && typeof d === 'object' && typeof d.arrayBuffer === 'function' && typeof d.size === 'number';
  const isAB = (d) => Object.prototype.toString.call(d) === '[object ArrayBuffer]';
  async function bytesOf(data) {
    if (data == null) return new Uint8Array(0);
    if (typeof data === 'string') return enc.encode(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (isAB(data)) return new Uint8Array(data);
    if (isBlob(data)) return new Uint8Array(await data.arrayBuffer());
    throw new Error('Unsupported zip entry data');
  }

  async function zip(entries) {
    const parts = [], central = [];
    let offset = 0;
    for (const e of entries) {
      const name = enc.encode(e.name.replace(/^\/+/, '')), isDir = e.name.endsWith('/');
      const bytes = isDir ? new Uint8Array(0) : await bytesOf(e.data);
      const crc = crc32(bytes), size = bytes.length, { time, date } = dosTime(e.time);
      if (offset + size > 0xfffffff0) throw new Error(tr('ui.backup.zip_big'));
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(h.buffer, name, isBlob(e.data) && !isDir ? e.data : bytes);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true);
      c.setUint16(28, name.length, true); c.setUint32(38, isDir ? 0x10 : 0, true); c.setUint32(42, offset, true);
      central.push(c.buffer, name);
      offset += 30 + name.length + size;
    }
    const cdSize = central.reduce((n, p) => n + (p.byteLength || p.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }

  async function inflate(bytes) {
    if (!window.DecompressionStream) throw new Error(tr('ui.backup.zip_inflate'));
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function unzip(src) {
    const buf = isBlob(src) ? new Uint8Array(await src.arrayBuffer()) : await bytesOf(src);
    const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), dec = new TextDecoder();
    let e = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error(tr('ui.backup.zip_not'));
    const count = v.getUint16(e + 10, true), out = [];
    let p = v.getUint32(e + 16, true);
    for (let n = 0; n < count; n++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error(tr('ui.backup.zip_damaged'));
      const method = v.getUint16(p + 10, true), t = v.getUint16(p + 12, true), d = v.getUint16(p + 14, true);
      const csize = v.getUint32(p + 20, true), crc = v.getUint32(p + 16, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
      const lho = v.getUint32(p + 42, true), name = dec.decode(buf.subarray(p + 46, p + 46 + nl));
      const start = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
      let bytes = buf.subarray(start, start + csize);
      if (method === 8) bytes = await inflate(bytes); else if (method !== 0) throw new Error('Unsupported ZIP compression in ' + name);
      if (method === 0 && crc32(bytes) !== crc) throw new Error('Checksum mismatch in ' + name);
      const time = new Date(1980 + (d >> 9), ((d >> 5) & 15) - 1, d & 31, t >> 11, (t >> 5) & 63, (t & 31) * 2).getTime();
      out.push({ name, dir: name.endsWith('/'), time, bytes });
      p += 46 + nl + xl + cl;
    }
    return out;
  }
  window.SlopZip = { zip, unzip, crc32 };
})();
