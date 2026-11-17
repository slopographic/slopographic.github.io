/* Slop Press — a small ZIP writer/reader (store + deflate via CompressionStream when available). */
(function () {
  'use strict';
  var PR = window.PR;
  var Z = PR.zip = {};
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  Z.crc32 = function (u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function stream(u8, Kind, fmt) { return new Response(new Blob([u8]).stream().pipeThrough(new Kind(fmt))).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  Z.deflateRaw = function (u8) { return window.CompressionStream ? stream(u8, CompressionStream, 'deflate-raw') : Promise.resolve(null); };
  Z.inflateRaw = function (u8) { if (!window.DecompressionStream) return Promise.reject(new Error('This browser cannot unzip')); return stream(u8, DecompressionStream, 'deflate-raw'); };
  /** zlib (FlateDecode) streams for PDF. */
  Z.deflate = function (u8) { return window.CompressionStream ? stream(u8, CompressionStream, 'deflate') : Promise.resolve(null); };
  var enc = new TextEncoder();

  /** files: [{ name, data: Uint8Array | string, store?: bool }] → Promise<Blob> */
  Z.write = function (files) {
    var parts = [], central = [], off = 0;
    return files.reduce(function (p, f) {
      return p.then(function () {
        var data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = Z.crc32(data), name = enc.encode(f.name);
        return (f.store ? Promise.resolve(null) : Z.deflateRaw(data)).then(function (def) {
          var method = def && def.length < data.length ? 8 : 0, body = method ? def : data;
          var lh = new DataView(new ArrayBuffer(30));
          lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
          lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true); lh.setUint32(22, data.length, true);
          lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
          parts.push(new Uint8Array(lh.buffer), name, body);
          var ch = new DataView(new ArrayBuffer(46));
          ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
          ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true); ch.setUint32(24, data.length, true);
          ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
          central.push(new Uint8Array(ch.buffer), name);
          off += 30 + name.length + body.length;
        });
      });
    }, Promise.resolve()).then(function () {
      var csize = central.reduce(function (a, b) { return a + b.length; }, 0);
      var end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
      return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
    });
  };
  /** Reads a zip (Uint8Array) → Promise<{ name: Uint8Array }> */
  Z.read = function (u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), e = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) return Promise.reject(new Error('Not a zip file'));
    var n = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true), out = {}, jobs = [], dec = new TextDecoder();
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      var name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      var ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), body = u8.subarray(ds, ds + csz);
      (function (nm, m, b) { jobs.push((m === 8 ? Z.inflateRaw(b) : Promise.resolve(b.slice())).then(function (d) { out[nm] = d; })); })(name, method, body);
      p += 46 + nl + xl + cl;
    }
    return Promise.all(jobs).then(function () { return out; });
  };
})();
