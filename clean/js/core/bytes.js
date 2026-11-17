/* SlopClean core: byte helpers shared by the format parsers. Classic script, no dependencies.
 * Sets window.SlopClean.bytes (or globalThis.SlopClean in Node, where the tests load these files). */
(function (root) {
  'use strict';
  const C = (root.SlopClean = root.SlopClean || {});
  const utf8 = new TextDecoder('utf-8');
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();

  class CleanError extends Error {}
  const fail = (msg) => { throw new CleanError(msg); };
  const view = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  /** Throws a plain "damaged" error when [o, o+n) is not inside u8. */
  function need(u8, o, n, what) { if (o < 0 || n < 0 || o + n > u8.length) fail(`Damaged file: ${what} runs past the end`); }
  function u16(u8, o, le) { need(u8, o, 2, 'a 2-byte field'); return view(u8).getUint16(o, le); }
  function u32(u8, o, le) { need(u8, o, 4, 'a 4-byte field'); return view(u8).getUint32(o, le); }
  /** Latin-1 text of u8[s, e). */
  function ascii(u8, s, e) { let out = ''; for (let i = s; i < e && i < u8.length; i++) out += String.fromCharCode(u8[i]); return out; }
  /** UTF-8 text of u8[s, e), never throws on bad bytes. */
  function text(u8, s, e) { return utf8.decode(u8.subarray(s, Math.min(e, u8.length))); }
  /** True when the ASCII string str sits at u8[s]. */
  function startsWith(u8, s, str) { if (s + str.length > u8.length) return false; for (let i = 0; i < str.length; i++) if (u8[s + i] !== str.charCodeAt(i)) return false; return true; }
  function concat(parts) {
    let n = 0; for (const p of parts) n += p.length;
    const out = new Uint8Array(n); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function be32(n) { return Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255); }
  function trimNul(s) { return s.replace(/\0[\s\S]*$/, '').replace(/\s+$/, ''); }

  C.bytes = { CleanError, fail, view, need, u16, u32, ascii, text, startsWith, concat, crc32, be32, trimNul };
})(typeof window !== 'undefined' ? window : globalThis);
