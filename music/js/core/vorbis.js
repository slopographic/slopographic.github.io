/* Slop Music: Vorbis comments, the tags of FLAC, Ogg Vorbis and Ogg Opus files, read by hand. No library, no network.
 * FLAC: METADATA_BLOCK_VORBIS_COMMENT (type 4) gives the text, METADATA_BLOCK_PICTURE (type 6) the cover.
 * Ogg: the second packet ("\x03vorbis" or "OpusTags") holds the same comments; a METADATA_BLOCK_PICTURE comment
 * (base64 of a FLAC picture block) gives the cover. Fields read: TITLE, ARTIST, ALBUM, TRACKNUMBER, DATE, GENRE.
 * Exposes window.SlopMusic.vorbis = { read(blob, start), comments(bytes), picture(bytes) }; id3.js calls read. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const MAX = 16 * 1024 * 1024;
  const ascii = (b, p, n) => String.fromCharCode(...b.subarray(p, p + n));
  const u32 = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  const u24 = (b, i) => (b[i] << 16) + (b[i + 1] << 8) + b[i + 2];
  const u32le = (b, i) => ((b[i + 3] << 24) >>> 0) + (b[i + 2] << 16) + (b[i + 1] << 8) + b[i];
  const utf8 = (b) => new TextDecoder('utf-8').decode(b);
  const bytesAt = async (blob, start, len) => new Uint8Array(await blob.slice(start, start + len).arrayBuffer());
  const empty = () => ({ title: '', artist: '', album: '', track: 0, year: '', genre: '', cover: null });

  /** A FLAC picture block: { type, cover Blob } or null. Big-endian lengths; type 3 is the front cover. */
  function picture(b) {
    try {
      let p = 0;
      const type = u32(b, p); p += 4;
      const ml = u32(b, p); p += 4;
      const mime = ascii(b, p, ml).toLowerCase(); p += ml;
      const dl = u32(b, p); p += 4 + dl + 16;
      const len = u32(b, p); p += 4;
      if (mime === '-->' || len < 4 || p + len > b.length) return null;
      const img = b.slice(p, p + len);
      const sniff = img[0] === 0x89 && img[1] === 0x50 ? 'image/png' : img[0] === 0x52 && img[1] === 0x49 ? 'image/webp' : img[0] === 0x47 && img[1] === 0x49 ? 'image/gif' : 'image/jpeg';
      return { type, cover: new Blob([img], { type: /^image\/(jpeg|png|webp|gif)$/.test(mime) ? mime : sniff }) };
    } catch (e) { return null; }
  }
  const base64 = (s) => { const bin = atob(s.replace(/\s+/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

  /** A Vorbis comment block (vendor, then KEY=value pairs, little-endian lengths) into the fields. Keeps the first of each. */
  function comments(b, out = empty()) {
    try {
      let p = 0;
      const vl = u32le(b, p); p += 4 + vl;
      const n = u32le(b, p); p += 4;
      let pic = null;
      for (let i = 0; i < n && p + 4 <= b.length; i++) {
        const len = u32le(b, p); p += 4;
        if (p + len > b.length) break;
        const s = utf8(b.subarray(p, p + len)); p += len;
        const eq = s.indexOf('=');
        if (eq < 1) continue;
        const key = s.slice(0, eq).toUpperCase(), v = s.slice(eq + 1).trim();
        if (key === 'METADATA_BLOCK_PICTURE') { const got = picture(base64(v)); if (got && (!pic || (got.type === 3 && pic.type !== 3))) pic = got; continue; }
        if (!v) continue;
        if (key === 'TITLE' && !out.title) out.title = v;
        else if (key === 'ARTIST' && !out.artist) out.artist = v;
        else if (key === 'ALBUM' && !out.album) out.album = v;
        else if (key === 'TRACKNUMBER' && !out.track) out.track = parseInt(v, 10) || 0;
        else if (key === 'DATE' && !out.year) out.year = (v.match(/\d{4}/) || [v])[0];
        else if (key === 'GENRE' && !out.genre) out.genre = v;
      }
      if (pic && !out.cover) out.cover = pic.cover;
    } catch (e) { /* a broken block keeps what was read */ }
    return out;
  }

  /** FLAC metadata blocks from start (just after "fLaC"): the comment block and the best picture. */
  async function readFlac(blob, p, out) {
    let pic = null;
    for (let guard = 0; guard < 128 && p + 4 <= blob.size; guard++) {
      const h = await bytesAt(blob, p, 4);
      const last = h[0] & 0x80, type = h[0] & 0x7f, len = u24(h, 1);
      if (type === 127) break;
      if ((type === 4 || type === 6) && len <= MAX) {
        const b = await bytesAt(blob, p + 4, len);
        if (type === 4) comments(b, out);
        else { const got = picture(b); if (got && (!pic || (got.type === 3 && pic.type !== 3))) pic = got; }
      }
      p += 4 + len;
      if (last) break;
    }
    if (pic && !out.cover) out.cover = pic.cover;
    return out;
  }

  /** The first two packets of an Ogg stream (packets may span pages). Stops at MAX bytes. */
  async function oggPackets(blob, p, want = 2) {
    const packets = [];
    let cur = [], total = 0;
    while (packets.length < want && p + 27 <= blob.size && total < MAX) {
      const h = await bytesAt(blob, p, 27);
      if (ascii(h, 0, 4) !== 'OggS') break;
      const segs = await bytesAt(blob, p + 27, h[26]);
      let bodyLen = 0;
      for (const s of segs) bodyLen += s;
      const body = await bytesAt(blob, p + 27 + h[26], bodyLen);
      let q = 0;
      for (const s of segs) {
        cur.push(body.subarray(q, q + s)); q += s; total += s;
        if (s < 255) { const len = cur.reduce((a, c) => a + c.length, 0), all = new Uint8Array(len); let o = 0; for (const c of cur) { all.set(c, o); o += c.length; } packets.push(all); cur = []; if (packets.length >= want) break; }
      }
      p += 27 + h[26] + bodyLen;
    }
    return packets;
  }
  async function readOgg(blob, p, out) {
    const [, tags] = await oggPackets(blob, p);
    if (!tags) return out;
    if (tags[0] === 3 && ascii(tags, 1, 6) === 'vorbis') return comments(tags.subarray(7), out);
    if (ascii(tags, 0, 8) === 'OpusTags') return comments(tags.subarray(8), out);
    return out;
  }

  /** The Vorbis comments of a FLAC or Ogg file whose stream begins at start (after any ID3 tag), or null if it is
   * neither. Never throws. */
  async function read(blob, start = 0) {
    try {
      if (!blob || blob.size < start + 8) return null;
      const magic = ascii(await bytesAt(blob, start, 4), 0, 4);
      if (magic === 'fLaC') return await readFlac(blob, start + 4, empty());
      if (magic === 'OggS') return await readOgg(blob, start, empty());
    } catch (e) { /* not readable: no tags */ }
    return null;
  }
  M.vorbis = { read, comments, picture };
})();
