/* SlopIsolate — store-only zip writer (no compression: PNG, WebP and JPG are already compressed).
 * CO.zip([{name, blob}]) → Promise<Blob>. CRC32 per entry, UTF-8 names (flag bit 11). No zip64. */
(function () {
  'use strict';
  const CO = window.CO;
  const enc = new TextEncoder();
  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  /** DOS date and time of now, as the zip format stores them. */
  function dosStamp() {
    const d = new Date();
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }

  CO.zip = async function (entries) {
    if (entries.length > 0xFFFF) throw new Error('Too many files for one zip');
    const { time, date } = dosStamp();
    const parts = [], central = [];
    let offset = 0, cdSize = 0;
    for (const e of entries) {
      const name = enc.encode(e.name);
      const data = new Uint8Array(await e.blob.arrayBuffer());
      if (data.length > 0xFFFFFFFF || offset > 0xFFFFFFFF) throw new Error('Zip is too large');
      const crc = crc32(data), len = data.length;

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);   // local file header
      lh.setUint16(4, 20, true);           // version needed
      lh.setUint16(6, 0x0800, true);       // flags: UTF-8 names
      lh.setUint16(8, 0, true);            // method: stored
      lh.setUint16(10, time, true);
      lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, len, true);
      lh.setUint32(22, len, true);
      lh.setUint16(26, name.length, true);
      parts.push(lh, name, data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);   // central directory header
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true);
      ch.setUint16(14, date, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, len, true);
      ch.setUint32(24, len, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(ch, name);
      cdSize += 46 + name.length;
      offset += 30 + name.length + len;
    }
    if (offset > 0xFFFFFFFF) throw new Error('Zip is too large');

    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);    // end of central directory
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  };
})();
