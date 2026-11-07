/* Test helper: tiny hand-built camera RAW structures (TIFF, DNG, CR2, ORF, RW2, RAF, CR3) with JPEGs inside, for the
 * detection and preview tests. Node require()s it; test pages get window.RawBuild.
 *   jpeg(w, h, opts?) -> Uint8Array      a structurally valid JPEG (SOI, DQT, SOF, DHT, SOS, data, EOI); not decodable.
 *                                         opts.sof: 0xc0 (default) | 0xc2 | 0xc3 (lossless, the sensor data kind)
 *   tiff({ le, kind, ifd0, subs, exif, blobs }) -> Uint8Array
 *     kind: 'tiff' (default), 'cr2' (CR header), 'orf' (IIRO), 'rw2' (IIU). Entries: [tag, type, value] where value is
 *     a number, an array, a string (ASCII), { blob } (LONG offset of a blob), { len } (its length) or { bytes } (type 7)
 *   raf(jpegBytes) -> Uint8Array          a RAF header that points at the JPEG
 *   cr3(jpegs) -> Uint8Array              an ISO-BMFF file with brand "crx " and the JPEGs in an mdat box */
(function (root) {
  'use strict';
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 13: 4 };

  function jpeg(w, h, opts = {}) {
    const sof = opts.sof || 0xc0, seg = (m, body) => [0xff, m, ((body.length + 2) >> 8) & 255, (body.length + 2) & 255, ...body];
    const out = [0xff, 0xd8];
    if (opts.exif) out.push(...seg(0xe1, [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0], [...opts.exif])));
    if (sof !== 0xc3) out.push(...seg(0xdb, [0, ...new Array(64).fill(1)]));
    out.push(...seg(sof, [8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]));
    out.push(...seg(0xc4, [0, ...new Array(16).fill(0)]));
    out.push(...seg(0xda, [1, 1, 0, 0, 63, 0]));
    out.push(0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0xff, 0xd9);   // data with a stuffed FF and a restart marker
    return new Uint8Array(out);
  }

  function tiff({ le = true, kind = 'tiff', ifd0 = [], subs = [], exif = null, blobs = {} } = {}) {
    const lists = [ifd0, ...subs, ...(exif ? [exif] : [])];
    const start = kind === 'cr2' ? 16 : 8;
    const ifdSize = (l) => 2 + l.length * 12 + 4;
    const offs = [];
    let p = start;
    for (const l of lists) { offs.push(p); p += ifdSize(l); }
    // values that do not fit in 4 bytes, then the blobs
    const ext = [];
    const valBytes = (type, value) => {
      if (typeof value === 'string') return { type: 2, count: value.length + 1, bytes: [...value].map((c) => c.charCodeAt(0)).concat(0) };
      if (value && value.bytes) return { type: 7, count: value.bytes.length, bytes: [...value.bytes] };
      const arr = [].concat(value);
      return { type, count: arr.length, arr };
    };
    const enc = lists.map((l) => l.map(([tag, type, value]) => ({ tag, ...valBytes(type, value), value })));
    for (const l of enc) for (const e of l) {
      const size = (SIZE[e.type] || 1) * e.count;
      if (size > 4) { e.at = p; p += size + (size & 1); ext.push(e); }
    }
    const blobAt = {};
    for (const [k, b] of Object.entries(blobs)) { blobAt[k] = p; p += b.length; }
    const out = new Uint8Array(p), v = new DataView(out.buffer);
    out[0] = out[1] = le ? 0x49 : 0x4d;
    v.setUint16(2, kind === 'orf' ? 0x4f52 : kind === 'rw2' ? 0x55 : 42, le);
    v.setUint32(4, start, le);
    if (kind === 'cr2') { out[8] = 0x43; out[9] = 0x52; out[10] = 2; }
    const put = (at, type, x) => {
      if (x && x.blob) x = blobAt[x.blob]; else if (x && x.len) x = blobs[x.len].length;
      if (x && x.ifd != null) x = offs[x.ifd];
      if (type === 3) v.setUint16(at, x, le); else if (type === 1 || type === 7) out[at] = x; else if (type === 5) { v.setUint32(at, x * 1000, le); v.setUint32(at + 4, 1000, le); } else v.setUint32(at, x, le);
    };
    enc.forEach((l, i) => {
      let q = offs[i];
      v.setUint16(q, l.length, le); q += 2;
      for (const e of l.slice().sort((a, b) => a.tag - b.tag)) {
        v.setUint16(q, e.tag, le); v.setUint16(q + 2, e.type, le); v.setUint32(q + 4, e.count, le);
        const size = (SIZE[e.type] || 1) * e.count, at = size > 4 ? e.at : q + 8;
        if (size > 4) v.setUint32(q + 8, e.at, le);
        if (e.bytes) out.set(e.bytes, at); else e.arr.forEach((x, j) => put(at + j * (SIZE[e.type] || 1), e.type, x));
        q += 12;
      }
      v.setUint32(q, 0, le);
    });
    for (const [k, b] of Object.entries(blobs)) out.set(b, blobAt[k]);
    return out;
  }

  function raf(j) {
    const head = 160, out = new Uint8Array(head + j.length), v = new DataView(out.buffer);
    out.set([...'FUJIFILMCCD-RAW 0201FF383501'].map((c) => c.charCodeAt(0)), 0);
    v.setUint32(84, head); v.setUint32(88, j.length);
    out.set(j, head);
    return out;
  }

  function box(type, body) {
    const out = new Uint8Array(8 + body.length);
    new DataView(out.buffer).setUint32(0, out.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(body, 8);
    return out;
  }
  function cr3(jpegs, cmt1) {
    const cat = (parts) => { const n = parts.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let p = 0; for (const x of parts) { o.set(x, p); p += x.length; } return o; };
    const ftyp = box('ftyp', new Uint8Array([...'crx '].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 1], [...'crx isom'].map((c) => c.charCodeAt(0)))));
    const moov = box('moov', cmt1 ? box('CMT1', cmt1) : new Uint8Array(0));
    return cat([ftyp, moov, box('mdat', cat(jpegs))]);
  }

  const api = { jpeg, tiff, raf, cr3, box };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RawBuild = api;
})(typeof window !== 'undefined' ? window : globalThis);
