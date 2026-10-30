/* Slop Clean test fixtures: builds metadata-laden files in code (no binary files are committed). Classic script,
 * sets window.CleanFixtures. Needs the core (window.SlopClean) for CRC-32 only.
 *   buildTiff({ le, entries, strip, thumb })   entries: [{ tag, type, value }] or [{ tag, child: { entries } }];
 *                                         strip / thumb: picture bytes (IFD0 strip, and an IFD1 thumbnail)
 *   exifOf(tiff)                          the APP1/eXIf payload prefix (Exif\0\0 + TIFF) for JPEG
 *   jpegWith(...) / pngChunk / webpChunk  small byte builders for hand-made files */
(function () {
  'use strict';
  const CRC = (u8) => window.SlopClean.bytes.crc32(u8);
  const ASCII = (s) => Uint8Array.from(s + '\0', (c) => c.charCodeAt(0));
  const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 };
  function encode(type, value, le) {
    if (type === 2) return ASCII(value);
    const size = SIZES[type], out = new Uint8Array(size * value.length), dv = new DataView(out.buffer);
    value.forEach((v, i) => {
      if (type === 1) out[i] = v;
      else if (type === 3) dv.setUint16(i * 2, v, le);
      else if (type === 4) dv.setUint32(i * 4, v, le);
      else if (type === 5) { dv.setUint32(i * 8, v[0], le); dv.setUint32(i * 8 + 4, v[1], le); }
    });
    return out;
  }
  /** A TIFF file. spec.entries become IFD0; a { child } entry is a pointer to a sub-IFD (EXIF, GPS). spec.strip adds one picture strip. */
  function buildTiff(spec) {
    const le = spec.le !== false;
    const nodes = [], blobs = [];
    const makeNode = (entries) => {
      const node = { entries: [], off: 0, next: null };
      nodes.push(node);
      for (const e of entries) {
        if (e.child) node.entries.push({ tag: e.tag, child: makeNode(e.child.entries), bytes: null });
        else if (e.blob) { node.entries.push({ tag: e.tag, bytes: null, blob: e.blob, count: 1, type: 4 }); }
        else node.entries.push({ tag: e.tag, bytes: encode(e.type, e.value, le), type: e.type, count: e.type === 2 ? e.value.length + 1 : e.value.length });
      }
      node.entries.sort((a, b) => a.tag - b.tag);
      return node;
    };
    const main = makeNode(spec.entries.slice());
    if (spec.strip) {
      main.entries.push({ tag: 0x111, type: 4, count: 1, bytes: null, blob: spec.strip });
      main.entries.push({ tag: 0x117, type: 4, count: 1, bytes: encode(4, [spec.strip.length], le) });
      main.entries.sort((a, b) => a.tag - b.tag);
    }
    if (spec.thumb) {
      main.next = makeNode([{ tag: 0x100, type: 3, value: [16] }, { tag: 0x101, type: 3, value: [12] }, { tag: 0x103, type: 3, value: [6] },
        { tag: 0x201, blob: spec.thumb }, { tag: 0x202, type: 4, value: [spec.thumb.length] }]);
    }
    let pos = 8;
    for (const n of nodes) { n.off = pos; pos += 2 + 12 * n.entries.length + 4; }
    for (const n of nodes) for (const e of n.entries) {
      if (e.child) continue;
      if (e.blob) { blobs.push({ e, at: 0 }); continue; }
      if (e.bytes.length > 4) { e.ext = pos; pos += e.bytes.length + (e.bytes.length & 1); }
    }
    for (const b of blobs) { b.at = pos; pos += b.e.blob.length; }
    const out = new Uint8Array(pos), dv = new DataView(out.buffer);
    out.set(le ? [0x49, 0x49, 42, 0] : [0x4d, 0x4d, 0, 42], 0);
    dv.setUint32(4, 8, le);
    for (const b of blobs) b.e.bytes = encode(4, [b.at], le);
    for (const n of nodes) {
      dv.setUint16(n.off, n.entries.length, le);
      n.entries.forEach((e, i) => {
        const eo = n.off + 2 + 12 * i;
        dv.setUint16(eo, e.tag, le);
        if (e.child) { dv.setUint16(eo + 2, 4, le); dv.setUint32(eo + 4, 1, le); dv.setUint32(eo + 8, e.child.off, le); return; }
        dv.setUint16(eo + 2, e.type, le); dv.setUint32(eo + 4, e.count, le);
        if (e.bytes.length <= 4) out.set(e.bytes, eo + 8);
        else { dv.setUint32(eo + 8, e.ext, le); out.set(e.bytes, e.ext); }
      });
      dv.setUint32(n.off + 2 + 12 * n.entries.length, n.next ? n.next.off : 0, le);
    }
    for (const b of blobs) out.set(b.e.blob, b.at);
    return out;
  }
  const cat = (...parts) => { const n = parts.reduce((s, p) => s + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
  const exifOf = (tiff) => cat(ASCII('Exif').subarray(0, 4), Uint8Array.of(0, 0), tiff);
  /** A JPEG marker segment: FF marker, length, payload. */
  const seg = (marker, payload) => cat(Uint8Array.of(0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255), payload);
  /** A tiny JPEG skeleton (headers and a short scan) around the given segments, with trailing bytes after EOI. */
  function buildJpeg({ app1 = [], middle = [], trailing = null } = {}) {
    const jfif = cat(ASCII('JFIF'), Uint8Array.of(1, 1, 0, 0, 1, 0, 1, 0, 0));
    return cat(Uint8Array.of(0xff, 0xd8), seg(0xe0, jfif), ...app1, ...middle,
      seg(0xdb, Uint8Array.of(0, 1, 2, 3)), seg(0xc0, Uint8Array.of(8, 0, 1, 0, 1, 1, 1, 0x11, 0)),
      seg(0xc4, Uint8Array.of(0, 1)), seg(0xda, Uint8Array.of(1, 1, 0, 0, 63, 0)),
      Uint8Array.of(0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0x78), Uint8Array.of(0xff, 0xd9), trailing || new Uint8Array(0));
  }
  /** A PNG chunk (length, type, data, CRC). */
  function pngChunk(type, data) {
    const t = ASCII(type).subarray(0, 4);
    const body = cat(t.subarray(0, 4), data);
    return cat(Uint8Array.of((data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255), body, Uint8Array.of((CRC(body) >>> 24) & 255, (CRC(body) >>> 16) & 255, (CRC(body) >>> 8) & 255, CRC(body) & 255));
  }
  /** A WebP RIFF chunk (fourcc, LE size, data, pad). */
  function webpChunk(fourcc, data) {
    const head = new Uint8Array(8), dv = new DataView(head.buffer);
    for (let i = 0; i < 4; i++) head[i] = fourcc.charCodeAt(i);
    dv.setUint32(4, data.length, true);
    return cat(head, data, data.length & 1 ? Uint8Array.of(0) : new Uint8Array(0));
  }
  /** A RIFF WEBP file from chunks, with the size field set correctly. */
  function riffWebp(chunks) {
    const body = cat(ASCII('WEBP').subarray(0, 4), ...chunks), head = new Uint8Array(8), dv = new DataView(head.buffer);
    head.set(ASCII('RIFF').subarray(0, 4), 0); dv.setUint32(4, body.length, true);
    return cat(head, body);
  }
  const GPS_ENTRIES = [
    { tag: 1, type: 2, value: 'N' }, { tag: 2, type: 5, value: [[51, 1], [30, 1], [2640, 100]] },
    { tag: 3, type: 2, value: 'W' }, { tag: 4, type: 5, value: [[0, 1], [7, 1], [4800, 100]] },
  ];
  /** A realistic phone-photo EXIF: make, model, serial, software, dates, author, copyright, GPS and a thumbnail IFD. */
  const SAMPLE_ENTRIES = [
    { tag: 0x010f, type: 2, value: 'Acme' }, { tag: 0x0110, type: 2, value: 'Acme Z9' },
    { tag: 0x0131, type: 2, value: 'Acme OS 3.1' }, { tag: 0x0132, type: 2, value: '2024:05:01 10:20:30' },
    { tag: 0x013b, type: 2, value: 'Ada Lovelace' }, { tag: 0x8298, type: 2, value: '(c) Ada 2024' },
    { tag: 0x8825, child: { entries: GPS_ENTRIES } },
    { tag: 0x8769, child: { entries: [
      { tag: 0x9003, type: 2, value: '2024:05:01 10:20:30' }, { tag: 0xa431, type: 2, value: 'SN-77821' },
      { tag: 0x829a, type: 5, value: [[1, 120]] }, { tag: 0x8827, type: 3, value: [200] },
    ] } },
  ];
  window.CleanFixtures = { buildTiff, exifOf, seg, buildJpeg, pngChunk, webpChunk, riffWebp, cat, ASCII, GPS_ENTRIES, SAMPLE_ENTRIES };
})();
