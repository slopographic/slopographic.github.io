/* Slop Contacts: a small zip writer (stored entries, no compression, UTF-8 names). Used for "one .vcf per contact".
 * Written for this app; it shares no code with the other apps. Adds SlopContacts.zip.store(files) -> Uint8Array,
 * where files is [{ name, data: Uint8Array }]. */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  /** CRC-32 of a byte array (the zip checksum). */
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const u16 = (v) => [v & 255, (v >>> 8) & 255];
  const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];

  /** Make a zip. Names are unique (a clash gets " (2)" before the extension). */
  function store(files) {
    const enc = new TextEncoder(), now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [], central = [], seen = new Map();
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(uniqueName(f.name, seen)), data = f.data, crc = crc32(data);
      const local = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
      const cen = [...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(offset)];
      parts.push(Uint8Array.from(local), name, data);
      central.push(Uint8Array.from(cen), name);
      offset += local.length + name.length + data.length;
    }
    const cenSize = central.reduce((n, p) => n + p.length, 0);
    const end = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(cenSize), ...u32(offset), ...u16(0)]);
    return concat([...parts, ...central, end]);
  }
  function uniqueName(name, seen) {
    const key = name.toLowerCase();
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n === 1) return name;
    const dot = name.lastIndexOf('.');
    return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
  }
  function concat(chunks) {
    const total = chunks.reduce((n, c) => n + c.length, 0), out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
  }

  SC.zip = { store, crc32 };
})();
