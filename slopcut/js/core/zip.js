/* SlopCut: a store-only ZIP writer and reader (with CRC-32) for .slopedit project files.
   SE.zip.write([{ name, data: Uint8Array|Blob }]) → Blob ; SE.zip.read(blob) → Map(name → Blob) */
(function () {
  'use strict';
  const SE = window.SE;
  const Z = SE.zip = {};
  const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  Z.crc32 = function (u8, crc = 0) {
    let c = ~crc >>> 0;
    for (let i = 0; i < u8.length; i++) c = TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return ~c >>> 0;
  };
  const enc = new TextEncoder();
  Z.write = async function (entries) {
    const parts = [], central = [];
    let off = 0;
    for (const e of entries) {
      const data = e.data instanceof Blob ? new Uint8Array(await e.data.arrayBuffer()) : e.data;
      const name = enc.encode(e.name), crc = Z.crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(h.buffer, name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(c.buffer, name);
      off += 30 + name.length + data.length;
    }
    const csize = central.reduce((s, b) => s + b.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  };
  /** Read a store-only zip (as written above; deflated entries are rejected). */
  Z.read = async function (blob) {
    const tailLen = Math.min(blob.size, 65558), tail = new DataView(await blob.slice(blob.size - tailLen).arrayBuffer());
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Not a zip file');
    const n = tail.getUint16(eocd + 10, true), cdSize = tail.getUint32(eocd + 12, true), cdOff = tail.getUint32(eocd + 16, true);
    const cd = new DataView(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer());
    const out = new Map(), dec = new TextDecoder();
    for (let i = 0, p = 0; i < n; i++) {
      if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt zip directory');
      const method = cd.getUint16(p + 10, true), size = cd.getUint32(p + 20, true), nl = cd.getUint16(p + 28, true), xl = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true), lo = cd.getUint32(p + 42, true);
      const name = dec.decode(new Uint8Array(cd.buffer, p + 46, nl));
      if (method !== 0) throw new Error('Compressed entries are not supported (' + name + ')');
      const lh = new DataView(await blob.slice(lo, lo + 30).arrayBuffer());
      const start = lo + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
      out.set(name, blob.slice(start, start + size));
      p += 46 + nl + xl + cl;
    }
    return out;
  };
})();
